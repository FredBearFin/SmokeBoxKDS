//! The kitchen engine inside the server. The tablets run the engine as JavaScript (src/js/20-engine.js) with the Rust planner
//! compiled to WebAssembly. The server runs the very same JavaScript files in an embedded JavaScript runtime (QuickJS) and calls
//! the same Rust planner natively, so a kitchen replayed on the server ends byte for byte where it ended on the tablet.
//!
//! One `Kitchens` value holds many kitchens ("rooms"), each a state kept inside the runtime. Every call goes in and out as JSON
//! text, so nothing JavaScript-shaped leaks into the rest of the server.

use rquickjs::{Context, Function, Runtime};

// The engine files, built into the server binary so it always runs the engine it was built with.
const ENGINE_FILES: [(&str, &str); 3] = [
    ("00-util.js", include_str!("../../src/js/00-util.js")),
    ("10-config.js", include_str!("../../src/js/10-config.js")),
    ("20-engine.js", include_str!("../../src/js/20-engine.js")),
];

// The planner the engine expects (SB.planner), backed by the native Rust planner instead of WebAssembly. It must be in place
// before 20-engine.js loads. Then the rooms: a small table of kitchen states and the calls the server makes on them.
const GLUE_BEFORE: &str = r#"
globalThis.SB = globalThis.SB || {};
SB.planner = {
  ready: () => true,
  startSync: () => true,
  start: () => Promise.resolve(true),
  plan(input) {
    try { const out = JSON.parse(__sbPlan(JSON.stringify(input))); return out && Array.isArray(out.items) ? out : null; } catch (e) { return null; }
  },
};
"#;
const GLUE_AFTER: &str = r#"
(function () {
  const E = SB.engine, rooms = new Map(), pending = new Map();
  globalThis.__rooms = {
    create(id, opts) { rooms.set(id, E.newState(JSON.parse(opts))); },
    load(id, saved) { const v = E.validateBackup(saved); if (!v.ok) return JSON.stringify({ ok: false, error: String(v.error) }); rooms.set(id, v.state); return '{"ok":true}'; },
    apply(id, type, payload, now) {
      const r = E.apply(rooms.get(id), type, JSON.parse(payload), now);
      rooms.set(id, r.state);
      let info = null; try { info = JSON.parse(JSON.stringify(r.info === undefined ? null : r.info)); } catch (e) { info = null; }
      return JSON.stringify({ report: r.report, info });
    },
    // An action tried but not yet kept: the server stores it first, then keeps (commit) or drops (discard) the new state.
    tryApply(id, type, payload, now) {
      const r = E.apply(rooms.get(id), type, JSON.parse(payload), now);
      pending.set(id, r.state);
      let info = null; try { info = JSON.parse(JSON.stringify(r.info === undefined ? null : r.info)); } catch (e) { info = null; }
      return JSON.stringify({ report: r.report, info });
    },
    commit(id) { if (pending.has(id)) { rooms.set(id, pending.get(id)); pending.delete(id); } },
    discard(id) { pending.delete(id); },
    tick(id, now) { const before = rooms.get(id), t = E.tick(before, now); rooms.set(id, t.state); return t.state !== before; },
    view(id) { return JSON.stringify(rooms.get(id)); },
    serialize(id) { return E.serialize(rooms.get(id)); },
    has(id) { return rooms.has(id); },
    drop(id) { rooms.delete(id); },
  };
})();
"#;

/// What the engine answered to one action: its report code ("ok" or a refusal) and its info, as JSON.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct Answer {
    pub report: String,
    pub info: serde_json::Value,
}

/// Many kitchens, each run by the shared engine inside one JavaScript runtime.
pub struct Kitchens {
    _rt: Runtime,
    ctx: Context,
}

/// Plans with the native Rust planner for the JavaScript engine: JSON text in, JSON text out (an error object on bad input).
fn plan_json(input: String) -> String {
    match serde_json::from_str::<smokebox_engine::PlanInput>(&input) {
        Ok(p) => serde_json::to_string(&smokebox_engine::plan(&p)).unwrap_or_else(|e| format!("{{\"error\":{:?}}}", e.to_string())),
        Err(e) => format!("{{\"error\":{:?}}}", e.to_string()),
    }
}

impl Kitchens {
    /// Starts the runtime and loads the engine. Fails only if the engine files themselves do not run.
    pub fn new() -> Result<Self, String> {
        let rt = Runtime::new().map_err(|e| e.to_string())?;
        let ctx = Context::full(&rt).map_err(|e| e.to_string())?;
        ctx.with(|ctx| -> Result<(), String> {
            let f = Function::new(ctx.clone(), plan_json).map_err(|e| e.to_string())?;
            ctx.globals().set("__sbPlan", f).map_err(|e| e.to_string())?;
            let run = |name: &str, src: &str| -> Result<(), String> {
                ctx.eval::<(), _>(src).map_err(|e| format!("{}: {}", name, describe(&ctx, e)))
            };
            run("planner glue", GLUE_BEFORE)?;
            for (name, src) in ENGINE_FILES {
                run(name, src)?;
            }
            run("rooms glue", GLUE_AFTER)
        })?;
        Ok(Kitchens { _rt: rt, ctx })
    }

    // Calls one of the rooms functions with the given arguments and returns its result.
    fn call<A, R>(&self, name: &str, args: A) -> Result<R, String>
    where
        A: for<'js> rquickjs::function::IntoArgs<'js>,
        R: for<'js> rquickjs::FromJs<'js>,
    {
        self.ctx.with(|ctx| {
            let rooms: rquickjs::Object = ctx.globals().get("__rooms").map_err(|e| e.to_string())?;
            let f: Function = rooms.get(name).map_err(|e| e.to_string())?;
            f.call(args).map_err(|e| describe(&ctx, e))
        })
    }

    /// Makes a new kitchen from start options (for example {"now":..., "blank":true}).
    pub fn create(&self, id: &str, opts: &serde_json::Value) -> Result<(), String> {
        self.call("create", (id.to_string(), opts.to_string()))
    }
    /// Loads a kitchen from its saved state (a snapshot). Refuses a save the engine cannot read.
    pub fn load(&self, id: &str, saved: &str) -> Result<(), String> {
        let r: String = self.call("load", (id.to_string(), saved.to_string()))?;
        let v: serde_json::Value = serde_json::from_str(&r).map_err(|e| e.to_string())?;
        if v["ok"] == true { Ok(()) } else { Err(v["error"].as_str().unwrap_or("unreadable").to_string()) }
    }
    /// Applies one action at kitchen time `now` (ms) and returns the engine's answer.
    pub fn apply(&self, id: &str, kind: &str, payload: &serde_json::Value, now: i64) -> Result<Answer, String> {
        let r: String = self.call("apply", (id.to_string(), kind.to_string(), payload.to_string(), now as f64))?;
        serde_json::from_str(&r).map_err(|e| e.to_string())
    }
    /// Tries one action without keeping it yet: the answer comes back, and `commit` keeps the new state or `discard` drops it.
    /// The server stores the action on disk between the two, so a kitchen never changes unless its action was saved.
    pub fn try_apply(&self, id: &str, kind: &str, payload: &serde_json::Value, now: i64) -> Result<Answer, String> {
        let r: String = self.call("tryApply", (id.to_string(), kind.to_string(), payload.to_string(), now as f64))?;
        serde_json::from_str(&r).map_err(|e| e.to_string())
    }
    /// Keeps the state from the last `try_apply`.
    pub fn commit(&self, id: &str) -> Result<(), String> {
        self.call("commit", (id.to_string(),))
    }
    /// Drops the state from the last `try_apply`; the kitchen stays as it was.
    pub fn discard(&self, id: &str) -> Result<(), String> {
        self.call("discard", (id.to_string(),))
    }
    /// Moves the kitchen's clock to `now` (ms): timers, due dishes and warnings catch up. True when anything changed.
    pub fn tick(&self, id: &str, now: i64) -> Result<bool, String> {
        self.call("tick", (id.to_string(), now as f64))
    }
    /// The kitchen's whole state as JSON, as the screens receive it on the live stream.
    pub fn view(&self, id: &str) -> Result<String, String> {
        self.call("view", (id.to_string(),))
    }
    /// True when the kitchen is loaded in the runtime.
    pub fn has(&self, id: &str) -> Result<bool, String> {
        self.call("has", (id.to_string(),))
    }
    /// The kitchen's saved state as text, exactly as a tablet would save it.
    pub fn serialize(&self, id: &str) -> Result<String, String> {
        self.call("serialize", (id.to_string(),))
    }
    /// Forgets a kitchen (it is reloaded from the database when needed again).
    pub fn drop_kitchen(&self, id: &str) -> Result<(), String> {
        self.call("drop", (id.to_string(),))
    }
}

// Turns a JavaScript error into readable text, with the thrown message and stack when there is one.
fn describe(ctx: &rquickjs::Ctx<'_>, e: rquickjs::Error) -> String {
    if let rquickjs::Error::Exception = e {
        let v = ctx.catch();
        if let Some(ex) = v.as_exception() {
            return format!("{} {}", ex.message().unwrap_or_default(), ex.stack().unwrap_or_default());
        }
        return format!("{:?}", v);
    }
    e.to_string()
}
