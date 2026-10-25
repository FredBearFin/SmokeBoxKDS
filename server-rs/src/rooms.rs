//! Kitchen rooms: one live kitchen in memory per kitchen that has screens open or was used recently. A room is loaded from its
//! last snapshot plus every stored action after it, replayed at the time each was first applied, so a restart or a crash comes
//! back exactly where the screens were told it was. Every action is stored before the kitchen changes or any screen hears of it.

use crate::engine::Engine;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

/// One message on a kitchen's live stream: its event name ("snapshot", "state", "hb") and its JSON data.
#[derive(Clone, Debug)]
pub struct Event {
    pub name: &'static str,
    pub data: Arc<String>,
}

/// One live kitchen.
pub struct Room {
    pub id: String,
    pub seq: i64,
    n: i64,
    last_at: i64,
    op_ids: VecDeque<String>,
    since_snap: i64,
    idle_since: i64,
    pub tx: broadcast::Sender<Event>,
}

/// What an action got back, and the HTTP status to send with it.
pub struct Outcome {
    pub status: u16,
    pub body: Value,
}

/// Every live kitchen, the engine that runs them and the database they are kept in.
#[derive(Clone)]
pub struct Rooms {
    map: Arc<Mutex<HashMap<String, Arc<Mutex<Room>>>>>,
    engine: Engine,
    db: PgPool,
    now: Arc<dyn Fn() -> i64 + Send + Sync>,
    snapshot_every: i64,
}

const KEEP_OP_IDS: usize = 2000;

impl Rooms {
    /// Makes the room table. `now` is the server clock in milliseconds (tests pass their own).
    pub fn new(engine: Engine, db: PgPool, now: Arc<dyn Fn() -> i64 + Send + Sync>, snapshot_every: i64) -> Rooms {
        Rooms { map: Arc::new(Mutex::new(HashMap::new())), engine, db, now, snapshot_every }
    }

    /// The server clock now.
    pub fn now(&self) -> i64 {
        (self.now)()
    }

    /// How many kitchens are in memory.
    pub async fn open_count(&self) -> usize {
        self.map.lock().await.len()
    }

    /// The live room for a kitchen, loading it from the database first when needed. None when the kitchen does not exist.
    pub async fn get(&self, kitchen_id: &str) -> Result<Option<Arc<Mutex<Room>>>, String> {
        let mut map = self.map.lock().await;
        if let Some(r) = map.get(kitchen_id) {
            return Ok(Some(r.clone()));
        }
        let Some(room) = self.load(kitchen_id).await? else { return Ok(None) };
        let room = Arc::new(Mutex::new(room));
        map.insert(kitchen_id.to_string(), room.clone());
        Ok(Some(room))
    }

    // Loads a kitchen: its snapshot (or a new empty kitchen), then every stored action after it, then the clock moves to now.
    async fn load(&self, kitchen_id: &str) -> Result<Option<Room>, String> {
        let row = sqlx::query("SELECT created_at, seq, snapshot, snapshot_n FROM kitchens WHERE id = $1")
            .bind(kitchen_id)
            .fetch_optional(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        let Some(row) = row else { return Ok(None) };
        let created_at: i64 = row.get("created_at");
        let seq: i64 = row.get("seq");
        let snapshot: Option<String> = row.get("snapshot");
        let snapshot_n: i64 = row.get("snapshot_n");
        let actions = sqlx::query("SELECT n, seq, op_id, type, payload, at, applied FROM kitchen_actions WHERE kitchen_id = $1 AND n > $2 ORDER BY n")
            .bind(kitchen_id)
            .bind(if snapshot.is_some() { snapshot_n } else { 0 })
            .fetch_all(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        let list: Vec<(i64, i64, Option<String>, String, String, i64, bool)> = actions
            .iter()
            .map(|a| (a.get("n"), a.get("seq"), a.get("op_id"), a.get("type"), a.get("payload"), a.get("at"), a.get("applied")))
            .collect();
        let id = kitchen_id.to_string();
        let now = self.now();
        // Rebuilding happens in one go on the engine thread.
        let (from_n, last_at, seq, op_ids, since) = self
            .engine
            .run(move |k| -> Result<(i64, i64, i64, VecDeque<String>, i64), String> {
                let mut from_n = 0;
                let mut loaded = false;
                if let Some(s) = snapshot.as_deref() {
                    match k.load(&id, s) {
                        Ok(()) => {
                            loaded = true;
                            from_n = snapshot_n;
                        }
                        Err(e) => eprintln!("[server] kitchen {} snapshot unreadable ({}); rebuilding from its actions", id, e),
                    }
                }
                if !loaded {
                    k.create(&id, &json!({ "now": created_at, "blank": true }))?;
                }
                let (mut last_at, mut seq, mut op_ids, mut since, mut n) = (0i64, seq, VecDeque::new(), 0i64, from_n);
                for (an, aseq, op, kind, payload, at, applied) in list {
                    if an <= from_n {
                        continue;
                    }
                    n = an;
                    if let Some(op) = op {
                        op_ids.push_back(op);
                        if op_ids.len() > KEEP_OP_IDS {
                            op_ids.pop_front();
                        }
                    }
                    if !applied {
                        continue;
                    }
                    let p: Value = serde_json::from_str(&payload).unwrap_or(Value::Null);
                    let r = k.apply(&id, &kind, &p, at)?;
                    if r.report == "ok" {
                        last_at = last_at.max(at);
                        seq = seq.max(aseq);
                        since += 1;
                    }
                }
                k.tick(&id, now)?;
                Ok((n, last_at, seq, op_ids, since))
            })
            .await?;
        let max_n: Option<i64> = sqlx::query_scalar("SELECT MAX(n) FROM kitchen_actions WHERE kitchen_id = $1")
            .bind(kitchen_id)
            .fetch_one(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        let (tx, _) = broadcast::channel(64);
        Ok(Some(Room {
            id: kitchen_id.to_string(),
            seq,
            n: from_n.max(max_n.unwrap_or(0)),
            last_at,
            op_ids,
            since_snap: since,
            idle_since: now,
            tx,
        }))
    }

    /// What every screen gets: the whole kitchen, the server clock, the change counter and the recent action ids.
    pub async fn view(&self, room: &Room) -> Result<String, String> {
        let id = room.id.clone();
        let state = self.engine.run(move |k| k.view(&id)).await?;
        let ops = serde_json::to_string(&room.op_ids).unwrap_or_else(|_| "[]".into());
        Ok(format!(r#"{{"state":{},"serverNow":{},"seq":{},"opIds":{}}}"#, state, self.now(), room.seq, ops))
    }

    // Tells every screen of the kitchen about the new state.
    async fn broadcast(&self, room: &Room) {
        if room.tx.receiver_count() == 0 {
            return;
        }
        if let Ok(v) = self.view(room).await {
            let _ = room.tx.send(Event { name: "state", data: Arc::new(v) });
        }
    }

    /// Saves a snapshot of the kitchen, so a later load replays only the actions after it.
    pub async fn snapshot(&self, room: &mut Room) {
        let id = room.id.clone();
        let saved = match self.engine.run(move |k| k.serialize(&id)).await {
            Ok(s) => s,
            Err(e) => return eprintln!("[server] snapshot failed for {}: {}", room.id, e),
        };
        let r = sqlx::query("UPDATE kitchens SET snapshot = $1, snapshot_n = $2, snapshot_at = $3, seq = $4 WHERE id = $5")
            .bind(saved)
            .bind(room.n)
            .bind(self.now())
            .bind(room.seq)
            .bind(&room.id)
            .execute(&self.db)
            .await;
        match r {
            Ok(_) => room.since_snap = 0,
            Err(e) => eprintln!("[server] snapshot failed for {}: {}", room.id, e),
        }
    }

    /// Runs one action from a screen with the server clock. The action row is stored BEFORE the kitchen changes or any screen
    /// hears of it; if the database refuses it, nothing changes and the sender gets 503 (sending it again later works).
    pub async fn act(&self, room: &mut Room, body: &Value, device_id: &str) -> Outcome {
        let Some(kind) = body.get("type").and_then(Value::as_str).filter(|t| !t.is_empty()) else {
            return Outcome { status: 400, body: json!({ "report": "unknownAction", "info": {}, "seq": room.seq }) };
        };
        let payload = body.get("payload").cloned().unwrap_or(json!({}));
        let op = body.get("opId").and_then(Value::as_str).filter(|o| o.len() <= 80).map(String::from);
        if let Some(op) = &op {
            let prev: Option<String> = sqlx::query_scalar("SELECT reply FROM kitchen_actions WHERE kitchen_id = $1 AND op_id = $2")
                .bind(&room.id)
                .bind(op)
                .fetch_optional(&self.db)
                .await
                .ok()
                .flatten();
            if let Some(prev) = prev {
                let mut v: Value = serde_json::from_str(&prev).unwrap_or(json!({}));
                v["duplicate"] = json!(true);
                return Outcome { status: 200, body: v };
            }
        }
        // A queued action replayed after being offline may say when it happened; that time is trusted only between the last
        // applied action and the server clock, so time never runs backwards or into the future.
        let now = self.now();
        let t = match body.get("at").and_then(Value::as_f64).filter(|x| x.is_finite()) {
            Some(at) => (at as i64).max(room.last_at).min(now),
            None => room.last_at.max(now),
        };
        let (id, k2, p2) = (room.id.clone(), kind.to_string(), payload.clone());
        let ans = match self.engine.run(move |k| k.try_apply(&id, &k2, &p2, t)).await {
            Ok(a) => a,
            Err(e) => {
                eprintln!("[server] action failed: {}", e);
                return Outcome { status: 500, body: json!({ "report": "badPatch", "info": { "error": "action failed" }, "seq": room.seq }) };
            }
        };
        let ok = ans.report == "ok";
        let reply = if ok {
            json!({ "report": "ok", "info": ans.info, "seq": room.seq + 1 })
        } else {
            json!({ "report": ans.report, "info": ans.info, "seq": room.seq })
        };
        let stored = sqlx::query("INSERT INTO kitchen_actions (kitchen_id, n, seq, op_id, type, payload, at, device_id, applied, reply) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(&room.id)
            .bind(room.n + 1)
            .bind(if ok { room.seq + 1 } else { room.seq })
            .bind(&op)
            .bind(kind)
            .bind(payload.to_string())
            .bind(t)
            .bind(device_id)
            .bind(ok)
            .bind(reply.to_string())
            .execute(&self.db)
            .await;
        let id = room.id.clone();
        if let Err(e) = stored {
            eprintln!("[server] could not store an action: {}", e);
            let _ = self.engine.run(move |k| k.discard(&id)).await;
            return Outcome { status: 503, body: json!({ "report": "badPatch", "info": { "error": "the server could not save this action; nothing was changed" }, "seq": room.seq }) };
        }
        room.n += 1;
        if let Some(op) = op {
            room.op_ids.push_back(op);
            if room.op_ids.len() > KEEP_OP_IDS {
                room.op_ids.pop_front();
            }
        }
        if ok {
            let _ = self.engine.run(move |k| k.commit(&id)).await;
            room.last_at = t;
            room.seq += 1;
            room.since_snap += 1;
            self.broadcast(room).await;
            if room.since_snap >= self.snapshot_every {
                self.snapshot(room).await;
            } else {
                let _ = sqlx::query("UPDATE kitchens SET seq = $1 WHERE id = $2").bind(room.seq).bind(&room.id).execute(&self.db).await;
            }
        } else {
            let _ = self.engine.run(move |k| k.discard(&id)).await;
        }
        Outcome { status: 200, body: reply }
    }

    /// One tick of the clock for every live kitchen: timers move on and screens hear only real changes. Kitchens with no screens
    /// for `idle_ms` are saved and let go of.
    pub async fn tick_all(&self, idle_ms: i64) {
        let rooms: Vec<Arc<Mutex<Room>>> = self.map.lock().await.values().cloned().collect();
        let now = self.now();
        for r in rooms {
            let mut room = r.lock().await;
            let id = room.id.clone();
            if let Ok(true) = self.engine.run(move |k| k.tick(&id, now)).await {
                room.seq += 1;
                self.broadcast(&room).await;
            }
            if room.tx.receiver_count() > 0 {
                room.idle_since = now;
            } else if now - room.idle_since > idle_ms {
                self.snapshot(&mut room).await;
                let id = room.id.clone();
                let _ = self.engine.run(move |k| k.drop_kitchen(&id)).await;
                self.map.lock().await.remove(&room.id);
            }
        }
    }

    /// Sends a heartbeat to every screen, so a screen can tell a quiet kitchen from a dead link.
    pub async fn heartbeat(&self) {
        let rooms: Vec<Arc<Mutex<Room>>> = self.map.lock().await.values().cloned().collect();
        for r in rooms {
            let room = r.lock().await;
            let _ = room.tx.send(Event { name: "hb", data: Arc::new(format!(r#"{{"serverNow":{},"seq":{}}}"#, self.now(), room.seq)) });
        }
    }

    /// Saves every live kitchen (on shutdown).
    pub async fn save_all(&self) {
        let rooms: Vec<Arc<Mutex<Room>>> = self.map.lock().await.values().cloned().collect();
        for r in rooms {
            let mut room = r.lock().await;
            self.snapshot(&mut room).await;
        }
    }

    /// Forgets a kitchen without saving (tests use this to act out a crash).
    pub async fn forget(&self, kitchen_id: &str) {
        self.map.lock().await.remove(kitchen_id);
        let id = kitchen_id.to_string();
        let _ = self.engine.run(move |k| k.drop_kitchen(&id)).await;
    }
}
