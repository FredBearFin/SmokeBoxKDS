//! Customer support. Any device joined to a kitchen can ask for help (no login: the kitchen is known from the device), see the
//! conversation and reply. SmokeBox staff answer from the staff console at /staff, which needs a password and an authenticator
//! code. Replies are emailed to the kitchen's owner; "Kitchen is stuck right now" requests are emailed to staff at once.

use crate::app::{client_ip, device_of, field, locked, no_store, note_fail, refuse, reply, same_site_json, secure, with_cookie, AppState};
use crate::{auth, totp};
use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap};
use axum::response::{Html, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};
use sqlx::Row;
use std::collections::HashMap;

const STAFF_COOKIE: &str = "sb_staff";
const STAFF_MS: i64 = 12 * 3600 * 1000;
const MAX_TEXT: usize = 5000;
const MAX_PHOTO: usize = 2_000_000;
const CATEGORIES: [&str; 4] = ["broken", "howto", "billing", "idea"];

/// The support routes, for the kitchen's devices and for the staff console.
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/support", get(kitchen_list).post(kitchen_new))
        .route("/api/support/reply", post(kitchen_reply))
        .route("/api/support/seen", post(kitchen_seen))
        .route("/staff", get(|| async { no_store(Html(crate::pages::staff_page())) }))
        .route("/staff/api/login", post(staff_login))
        .route("/staff/api/logout", post(staff_logout))
        .route("/staff/api/tickets", get(staff_list))
        .route("/staff/api/ticket", get(staff_ticket))
        .route("/staff/api/reply", post(staff_reply))
        .route("/staff/api/status", post(staff_status))
}

// The text of a message: trimmed, at most MAX_TEXT characters, or None when empty.
fn text_of(b: &Value) -> Option<String> {
    let t: String = b.get("body").and_then(Value::as_str).unwrap_or("").trim().chars().take(MAX_TEXT).collect();
    (!t.is_empty()).then_some(t)
}
// An optional picture: only an image data URL, and not too large. Err when one was sent but is not acceptable.
fn photo_of(b: &Value) -> Result<Option<String>, Response> {
    match b.get("photo").and_then(Value::as_str) {
        None | Some("") => Ok(None),
        Some(p) if p.len() <= MAX_PHOTO && p.starts_with("data:image/") => Ok(Some(p.to_string())),
        Some(_) => Err(refuse(400, "badPhoto", "That picture is too large or not a picture. Try a smaller photo.")),
    }
}
// Queues an email in the outbox (sent by the mail sender when one is set up).
async fn email(st: &AppState, to: &str, subject: &str, body: &str) {
    let _ = sqlx::query("INSERT INTO outbox_emails (to_addr, subject, body, created_at) VALUES ($1,$2,$3,$4)").bind(to).bind(subject).bind(body).bind(st.rooms.now()).execute(&st.db).await;
}

/* ---------- the kitchen's side ---------- */

// Starts a support request with its first message. A request resent after being offline (same clientId) is not made twice.
async fn kitchen_new(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let Some(text) = text_of(&b) else { return refuse(400, "empty", "Say what happened, in a few words.") };
    let photo = match photo_of(&b) { Ok(p) => p, Err(r) => return r };
    let category = field(&b, "category");
    let category = if CATEGORIES.contains(&category.as_str()) { category } else { "broken".to_string() };
    let urgent = b.get("urgent").and_then(Value::as_bool).unwrap_or(false);
    let client_id: Option<String> = b.get("clientId").and_then(Value::as_str).filter(|c| !c.is_empty() && c.len() <= 60).map(String::from);
    if let Some(c) = &client_id {
        let had: Option<(String, i64)> = sqlx::query_as("SELECT id, num FROM support_tickets WHERE kitchen_id = $1 AND client_id = $2").bind(&d.kitchen_id).bind(c).fetch_optional(&st.db).await.ok().flatten();
        if let Some((id, num)) = had {
            return reply(200, json!({ "ok": true, "id": id, "num": num, "duplicate": true }));
        }
    }
    let diagnostics = b.get("diagnostics").filter(|v| v.is_object()).map(|v| v.to_string()).filter(|s| s.len() <= 100_000);
    let subject: String = text.lines().next().unwrap_or("").chars().take(80).collect();
    let (id, now) = (auth::new_id("t"), st.rooms.now());
    let mut tx = match st.db.begin().await { Ok(t) => t, Err(_) => return refuse(500, "error", "The request could not be sent. Try again.") };
    let num: Option<i64> = sqlx::query_scalar("INSERT INTO support_tickets (id, kitchen_id, device_id, category, urgent, subject, diagnostics, created_at, updated_at, client_id, kitchen_seen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$8) RETURNING num")
        .bind(&id).bind(&d.kitchen_id).bind(&d.id).bind(&category).bind(urgent).bind(&subject).bind(&diagnostics).bind(now).bind(&client_id)
        .fetch_one(&mut *tx).await.ok();
    let msg = sqlx::query("INSERT INTO support_messages (ticket_id, from_staff, author, body, photo, created_at) VALUES ($1, FALSE, $2, $3, $4, $5)")
        .bind(&id).bind(&d.name).bind(&text).bind(&photo).bind(now).execute(&mut *tx).await;
    let Some(num) = num else { return refuse(500, "error", "The request could not be sent. Try again.") };
    if msg.is_err() || tx.commit().await.is_err() {
        return refuse(500, "error", "The request could not be sent. Try again.");
    }
    if urgent {
        if let Some(to) = st.cfg.staff_alert.clone() {
            let link = format!("{}/staff#{}", st.cfg.public_url.trim_end_matches('/'), id);
            email(&st, &to, &format!("STUCK: request {} from {}", num, d.kitchen_name), &format!("{} says their kitchen is stuck right now.\n\n{}\n\nOpen: {}", d.kitchen_name, text, link)).await;
        }
    }
    reply(200, json!({ "ok": true, "id": id, "num": num }))
}

// The kitchen's requests, newest change first, each with its conversation (staff notes left out) and whether a reply is unread.
async fn kitchen_list(State(st): State<AppState>, h: HeaderMap) -> Response {
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let tickets = sqlx::query("SELECT id, num, category, urgent, status, subject, created_at, updated_at, kitchen_seen FROM support_tickets WHERE kitchen_id = $1 ORDER BY updated_at DESC LIMIT 50")
        .bind(&d.kitchen_id).fetch_all(&st.db).await.unwrap_or_default();
    let ids: Vec<String> = tickets.iter().map(|t| t.get("id")).collect();
    let msgs = sqlx::query("SELECT ticket_id, from_staff, author, body, photo, created_at FROM support_messages WHERE ticket_id = ANY($1) AND internal = FALSE ORDER BY id")
        .bind(&ids).fetch_all(&st.db).await.unwrap_or_default();
    let mut by: HashMap<String, Vec<Value>> = HashMap::new();
    let mut last_staff: HashMap<String, i64> = HashMap::new();
    for m in &msgs {
        let tid: String = m.get("ticket_id");
        let (staff, at): (bool, i64) = (m.get("from_staff"), m.get("created_at"));
        if staff {
            last_staff.insert(tid.clone(), at);
        }
        by.entry(tid).or_default().push(json!({ "fromStaff": staff, "author": m.get::<String, _>("author"), "body": m.get::<String, _>("body"), "photo": m.get::<Option<String>, _>("photo"), "at": at }));
    }
    let list: Vec<Value> = tickets
        .iter()
        .map(|t| {
            let id: String = t.get("id");
            let seen: i64 = t.get("kitchen_seen");
            json!({ "id": id, "num": t.get::<i64, _>("num"), "category": t.get::<String, _>("category"), "urgent": t.get::<bool, _>("urgent"), "status": t.get::<String, _>("status"),
                "subject": t.get::<String, _>("subject"), "createdAt": t.get::<i64, _>("created_at"), "updatedAt": t.get::<i64, _>("updated_at"),
                "unread": last_staff.get(&id).map(|at| *at > seen).unwrap_or(false), "messages": by.remove(&id).unwrap_or_default() })
        })
        .collect();
    reply(200, json!({ "tickets": list }))
}

// The kitchen answers in a request's conversation; the request goes back to staff as open.
async fn kitchen_reply(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let Some(text) = text_of(&b) else { return refuse(400, "empty", "Type your answer first.") };
    let photo = match photo_of(&b) { Ok(p) => p, Err(r) => return r };
    let now = st.rooms.now();
    let r = sqlx::query("UPDATE support_tickets SET status = 'open', updated_at = $1, kitchen_seen = $1 WHERE id = $2 AND kitchen_id = $3").bind(now).bind(field(&b, "id")).bind(&d.kitchen_id).execute(&st.db).await;
    if !matches!(r, Ok(ref x) if x.rows_affected() == 1) {
        return refuse(404, "unknownTicket", "That request is not in this kitchen.");
    }
    let _ = sqlx::query("INSERT INTO support_messages (ticket_id, from_staff, author, body, photo, created_at) VALUES ($1, FALSE, $2, $3, $4, $5)").bind(field(&b, "id")).bind(&d.name).bind(&text).bind(&photo).bind(now).execute(&st.db).await;
    reply(200, json!({ "ok": true }))
}

// The kitchen has read a request's conversation: its "new reply" dot goes away.
async fn kitchen_seen(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let _ = sqlx::query("UPDATE support_tickets SET kitchen_seen = $1 WHERE id = $2 AND kitchen_id = $3").bind(st.rooms.now()).bind(field(&b, "id")).bind(&d.kitchen_id).execute(&st.db).await;
    reply(200, json!({ "ok": true }))
}

/* ---------- the staff console ---------- */

/// A signed-in staff member.
struct Staff {
    name: String,
}

// The staff member a request comes from, or None.
async fn staff_of(st: &AppState, h: &HeaderMap) -> Option<Staff> {
    let cookie = h.get(header::COOKIE)?.to_str().ok()?;
    let token = cookie.split(';').filter_map(|p| p.trim().split_once('=')).find(|(k, _)| *k == STAFF_COOKIE).map(|(_, v)| v.to_string())?;
    let row = sqlx::query("SELECT u.name FROM staff_sessions s JOIN staff_users u ON u.id = s.staff_id WHERE s.token_hash = $1 AND s.expires_at > $2")
        .bind(auth::token_hash(&token)).bind(st.rooms.now()).fetch_optional(&st.db).await.ok()??;
    Some(Staff { name: row.get("name") })
}

/// Adds a staff member (from the command line) and returns their authenticator secret.
pub async fn add_staff(db: &sqlx::PgPool, email: &str, name: &str, password: &str, now: i64) -> Result<String, String> {
    let secret = totp::new_secret();
    sqlx::query("INSERT INTO staff_users (id, email, name, pass, totp_secret, created_at) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(auth::new_id("s")).bind(email.to_lowercase()).bind(name).bind(auth::hash_password(password)).bind(&secret).bind(now)
        .execute(db).await.map_err(|e| e.to_string())?;
    Ok(secret)
}

// Staff sign-in: email, password and the authenticator code. Ten wrong tries lock it for 15 minutes.
async fn staff_login(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let key = format!("staff:{}", client_ip(&h));
    if locked(&st, &key).await {
        return refuse(429, "locked", "Too many tries. Wait 15 minutes.");
    }
    let email = field(&b, "email").to_lowercase();
    let pw = b.get("password").and_then(Value::as_str).unwrap_or("").to_string();
    let row = sqlx::query("SELECT id, pass, totp_secret FROM staff_users WHERE email = $1").bind(&email).fetch_optional(&st.db).await.ok().flatten();
    let now = st.rooms.now();
    let (id, stored, secret) = match row {
        Some(r) => (r.get::<String, _>("id"), r.get::<String, _>("pass"), r.get::<String, _>("totp_secret")),
        None => (String::new(), String::new(), String::new()),
    };
    let pw_ok = tokio::task::spawn_blocking(move || !stored.is_empty() && auth::check_password(&pw, &stored)).await.unwrap_or(false);
    if !pw_ok || !totp::check(&secret, &field(&b, "code"), now) {
        note_fail(&st, &key).await;
        return refuse(401, "wrong", "That did not match. Check the password and the code in your authenticator app.");
    }
    let token = auth::new_token();
    let _ = sqlx::query("INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES ($1,$2,$3)").bind(auth::token_hash(&token)).bind(&id).bind(now + STAFF_MS).execute(&st.db).await;
    let cookie = format!("{}={}; Path=/staff; HttpOnly; SameSite=Strict; Max-Age={}{}", STAFF_COOKIE, token, STAFF_MS / 1000, if secure(&h) { "; Secure" } else { "" });
    with_cookie(reply(200, json!({ "ok": true })), cookie)
}

// Signs the staff member out.
async fn staff_logout(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = same_site_json(&h, &body) {
        return r;
    }
    if let Some(c) = h.get(header::COOKIE).and_then(|v| v.to_str().ok()) {
        if let Some((_, t)) = c.split(';').filter_map(|p| p.trim().split_once('=')).find(|(k, _)| *k == STAFF_COOKIE) {
            let _ = sqlx::query("DELETE FROM staff_sessions WHERE token_hash = $1").bind(auth::token_hash(t)).execute(&st.db).await;
        }
    }
    with_cookie(reply(200, json!({ "ok": true })), format!("{}=; Path=/staff; HttpOnly; SameSite=Strict; Max-Age=0", STAFF_COOKIE))
}

// The inbox: requests with a status (open, waiting, solved, or all), stuck kitchens first, then the longest waiting.
async fn staff_list(State(st): State<AppState>, h: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    if staff_of(&st, &h).await.is_none() {
        return refuse(401, "signedOut", "Sign in.");
    }
    let status = q.get("status").map(String::as_str).unwrap_or("open");
    let rows = sqlx::query(
        "SELECT t.id, t.num, t.category, t.urgent, t.status, t.subject, t.created_at, t.updated_at, k.name AS kitchen, k.plan, k.billing_status,
           (SELECT o.email FROM owners o WHERE o.kitchen_id = k.id LIMIT 1) AS owner,
           (SELECT m.from_staff FROM support_messages m WHERE m.ticket_id = t.id AND m.internal = FALSE ORDER BY m.id DESC LIMIT 1) AS last_from_staff
         FROM support_tickets t JOIN kitchens k ON k.id = t.kitchen_id
         WHERE ($1 = 'all' OR t.status = $1) ORDER BY (t.status = 'open' AND t.urgent) DESC, t.updated_at ASC LIMIT 200",
    )
    .bind(status).fetch_all(&st.db).await.unwrap_or_default();
    let list: Vec<Value> = rows
        .iter()
        .map(|r| json!({ "id": r.get::<String, _>("id"), "num": r.get::<i64, _>("num"), "category": r.get::<String, _>("category"), "urgent": r.get::<bool, _>("urgent"),
            "status": r.get::<String, _>("status"), "subject": r.get::<String, _>("subject"), "createdAt": r.get::<i64, _>("created_at"), "updatedAt": r.get::<i64, _>("updated_at"),
            "kitchen": r.get::<String, _>("kitchen"), "plan": r.get::<String, _>("plan"), "billing": r.get::<String, _>("billing_status"), "owner": r.get::<Option<String>, _>("owner"), "lastFromStaff": r.get::<Option<bool>, _>("last_from_staff").unwrap_or(false) }))
        .collect();
    reply(200, json!({ "tickets": list }))
}

// One request in full: what the device attached, the kitchen, and every message including staff notes.
async fn staff_ticket(State(st): State<AppState>, h: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    if staff_of(&st, &h).await.is_none() {
        return refuse(401, "signedOut", "Sign in.");
    }
    let id = q.get("id").cloned().unwrap_or_default();
    let Some(t) = sqlx::query(
        "SELECT t.*, k.name AS kitchen, k.plan, k.billing_status, k.created_at AS kitchen_since, (SELECT o.email FROM owners o WHERE o.kitchen_id = k.id LIMIT 1) AS owner,
           (SELECT COUNT(*) FROM devices d WHERE d.kitchen_id = k.id AND d.removed_at IS NULL) AS devices
         FROM support_tickets t JOIN kitchens k ON k.id = t.kitchen_id WHERE t.id = $1",
    )
    .bind(&id).fetch_optional(&st.db).await.ok().flatten() else { return refuse(404, "unknownTicket", "No such request.") };
    let msgs = sqlx::query("SELECT from_staff, author, body, photo, internal, created_at FROM support_messages WHERE ticket_id = $1 ORDER BY id").bind(&id).fetch_all(&st.db).await.unwrap_or_default();
    let messages: Vec<Value> = msgs
        .iter()
        .map(|m| json!({ "fromStaff": m.get::<bool, _>("from_staff"), "author": m.get::<String, _>("author"), "body": m.get::<String, _>("body"), "photo": m.get::<Option<String>, _>("photo"), "internal": m.get::<bool, _>("internal"), "at": m.get::<i64, _>("created_at") }))
        .collect();
    let diag: Value = t.get::<Option<String>, _>("diagnostics").and_then(|d| serde_json::from_str(&d).ok()).unwrap_or(Value::Null);
    reply(200, json!({ "id": id, "num": t.get::<i64, _>("num"), "category": t.get::<String, _>("category"), "urgent": t.get::<bool, _>("urgent"), "status": t.get::<String, _>("status"),
        "subject": t.get::<String, _>("subject"), "createdAt": t.get::<i64, _>("created_at"), "diagnostics": diag, "messages": messages,
        "kitchen": { "name": t.get::<String, _>("kitchen"), "plan": t.get::<String, _>("plan"), "billing": t.get::<String, _>("billing_status"), "since": t.get::<i64, _>("kitchen_since"), "owner": t.get::<Option<String>, _>("owner"), "devices": t.get::<i64, _>("devices") } }))
}

// Staff answer (or a staff-only note). An answer marks the request as waiting on the kitchen and emails the owner a copy.
async fn staff_reply(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(s) = staff_of(&st, &h).await else { return refuse(401, "signedOut", "Sign in.") };
    let Some(text) = text_of(&b) else { return refuse(400, "empty", "Type the answer first.") };
    let internal = b.get("internal").and_then(Value::as_bool).unwrap_or(false);
    let (id, now) = (field(&b, "id"), st.rooms.now());
    let row = sqlx::query("SELECT t.num, (SELECT o.email FROM owners o WHERE o.kitchen_id = t.kitchen_id LIMIT 1) AS owner FROM support_tickets t WHERE t.id = $1").bind(&id).fetch_optional(&st.db).await.ok().flatten();
    let Some(row) = row else { return refuse(404, "unknownTicket", "No such request.") };
    let _ = sqlx::query("INSERT INTO support_messages (ticket_id, from_staff, author, body, internal, created_at) VALUES ($1, TRUE, $2, $3, $4, $5)").bind(&id).bind(&s.name).bind(&text).bind(internal).bind(now).execute(&st.db).await;
    if !internal {
        let _ = sqlx::query("UPDATE support_tickets SET status = 'waiting', updated_at = $1 WHERE id = $2").bind(now).bind(&id).execute(&st.db).await;
        if let Some(owner) = row.get::<Option<String>, _>("owner") {
            let num: i64 = row.get("num");
            email(&st, &owner, &format!("SmokeBox support: reply to request {}", num), &format!("{} from SmokeBox support wrote:\n\n{}\n\nAnswer on any of your kitchen's screens: Help, then My requests.", s.name, text)).await;
        }
    }
    reply(200, json!({ "ok": true }))
}

// Moves a request to open, waiting or solved.
async fn staff_status(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    if staff_of(&st, &h).await.is_none() {
        return refuse(401, "signedOut", "Sign in.");
    }
    let status = field(&b, "status");
    if !["open", "waiting", "solved"].contains(&status.as_str()) {
        return refuse(400, "badStatus", "Pick open, waiting or solved.");
    }
    let r = sqlx::query("UPDATE support_tickets SET status = $1, updated_at = $2 WHERE id = $3").bind(&status).bind(st.rooms.now()).bind(field(&b, "id")).execute(&st.db).await;
    match r {
        Ok(x) if x.rows_affected() == 1 => reply(200, json!({ "ok": true })),
        _ => refuse(404, "unknownTicket", "No such request."),
    }
}
