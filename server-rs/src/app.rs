//! The HTTP side of the server: the start page, starting and joining a kitchen, owner sign-in and password reset, the device
//! list and join codes, the app page, the live stream and kitchen actions. The tablet app speaks the same /api/me, /api/events
//! and /api/action it always has.

use crate::auth;
use crate::engine::Engine;
use crate::pages;
use crate::rooms::{Event, Rooms};
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::stream::{self, Stream, StreamExt};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;

/// How the server is set up.
#[derive(Clone)]
pub struct Config {
    /// The app page (dist/smokebox.html).
    pub html_file: std::path::PathBuf,
    /// The address people use, for links in emails, like "https://app.smokebox.example".
    pub public_url: String,
    /// Actions between saved snapshots of a kitchen.
    pub snapshot_every: i64,
    /// Where "Kitchen is stuck right now" support requests are emailed at once (SmokeBox staff), if anywhere.
    pub staff_alert: Option<String>,
    /// Stripe billing; off when its keys are not set.
    pub stripe: crate::billing::Stripe,
}

/// Everything a request handler needs.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub rooms: Rooms,
    pub cfg: Arc<Config>,
    /// Rate limits against floods and guessing (in memory).
    pub limits: Arc<crate::limits::Limits>,
}

const MAX_BODY: usize = 256 * 1024;
const MAX_SCREENS: usize = 50;
const MAX_FAILS: i32 = 10;
const FAIL_WINDOW_MS: i64 = 15 * 60 * 1000;
const RESET_MS: i64 = 3600 * 1000;

/// Connects to the database, applies the migrations and starts the engine. `now` is the clock (tests pass their own).
pub async fn build(db: PgPool, cfg: Config, now: Arc<dyn Fn() -> i64 + Send + Sync>) -> Result<(Router, AppState), String> {
    sqlx::migrate!("./migrations").run(&db).await.map_err(|e| e.to_string())?;
    let engine = Engine::start()?;
    let rooms = Rooms::new(engine, db.clone(), now, cfg.snapshot_every);
    let st = AppState { db, rooms, cfg: Arc::new(cfg), limits: Arc::default() };
    let router = Router::new()
        .route("/health", get(health))
        .route("/healthz", get(health))
        .route("/api/voice-ok", get(voice_ok))
        .route("/api/client-error", post(client_error))
        .route("/", get(app_page))
        .route("/smokebox.html", get(app_page))
        .route("/start", get(|| async { no_store(Html(pages::start_page())) }))
        .route("/login", get(|| async { Redirect::to("/start") }))
        .route("/reset", get(|| async { no_store(Html(pages::reset_page())) }))
        .route("/api/start", post(start_kitchen))
        .route("/api/join", post(join_kitchen))
        .route("/api/login", post(owner_login))
        .route("/api/logout", post(logout))
        .route("/api/forgot", post(forgot))
        .route("/api/reset", post(reset))
        .route("/api/me", get(me))
        .route("/api/devices", get(devices))
        .route("/api/devices/code", post(make_code))
        .route("/api/devices/remove", post(remove_device))
        .route("/api/devices/rename", post(rename_device))
        .route("/api/events", get(events))
        .route("/api/action", post(action))
        .merge(crate::support::routes())
        .route("/api/billing", get(billing_get))
        .route("/api/billing/checkout", post(billing_checkout))
        .route("/api/billing/portal", post(billing_portal))
        .route("/api/stripe/webhook", post(stripe_webhook))
        .layer(axum::middleware::from_fn_with_state(st.clone(), log_errors))
        .with_state(st.clone());
    Ok((router, st))
}

/// Runs the clock for every live kitchen (once a second) and the heartbeat (every 15 s) until the server stops.
pub fn spawn_timers(st: &AppState) {
    let rooms = st.rooms.clone();
    tokio::spawn(async move {
        let mut i = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            i.tick().await;
            rooms.tick_all(30 * 60 * 1000).await;
        }
    });
    let rooms = st.rooms.clone();
    tokio::spawn(async move {
        let mut i = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            i.tick().await;
            rooms.heartbeat().await;
        }
    });
}

/* ---------- small helpers ---------- */

// A JSON answer with the usual safety headers.
pub(crate) fn reply(status: u16, body: Value) -> Response {
    let mut r = (StatusCode::from_u16(status).unwrap_or(StatusCode::OK), axum::Json(body)).into_response();
    let h = r.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    r
}
// A plain-words refusal: a code for the app and words for the person.
pub(crate) fn refuse(status: u16, report: &str, words: &str) -> Response {
    reply(status, json!({ "report": report, "words": words }))
}
// Adds a Set-Cookie header to an answer.
pub(crate) fn with_cookie(mut r: Response, cookie: String) -> Response {
    if let Ok(v) = HeaderValue::from_str(&cookie) {
        r.headers_mut().append(header::SET_COOKIE, v);
    }
    r
}
// Marks a page as never cached and never framed.
pub(crate) fn no_store(h: Html<String>) -> Response {
    let mut r = h.into_response();
    let hs = r.headers_mut();
    hs.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    hs.insert("x-frame-options", HeaderValue::from_static("DENY"));
    hs.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    r
}
// True when the request came over HTTPS (through the web server in front, which says so in X-Forwarded-Proto).
pub(crate) fn secure(h: &HeaderMap) -> bool {
    h.get("x-forwarded-proto").and_then(|v| v.to_str().ok()).map(|v| v.split(',').next().unwrap_or("").trim() == "https").unwrap_or(false)
}
// The client's address as the web server in front saw it, for lockouts and limits. The last address in X-Forwarded-For is the one
// Caddy itself added; earlier ones could be typed by the client to dodge a lockout.
pub(crate) fn client_ip(h: &HeaderMap) -> String {
    h.get("x-forwarded-for").and_then(|v| v.to_str().ok()).and_then(|v| v.rsplit(',').next()).map(str::trim).filter(|v| !v.is_empty()).unwrap_or("local").to_string()
}
// Takes one try from a rate-limit bucket; None when allowed, else the "wait" answer (429 with Retry-After).
pub(crate) fn limit(st: &AppState, key: &str, rule: crate::limits::Rule) -> Option<Response> {
    let wait = st.limits.take(key, rule, st.rooms.now()).err()?;
    let mut r = refuse(429, "slowDown", &format!("Too many tries. Wait {} and try again.", crate::limits::wait_words(wait)));
    if let Ok(v) = HeaderValue::from_str(&((wait + 999) / 1000).to_string()) {
        r.headers_mut().insert(header::RETRY_AFTER, v);
    }
    Some(r)
}
// Cross-site request forgery guard for every POST: the body must be JSON (another site cannot send that without a permission check
// this server never grants), and a request that names another origin is refused. Returns the parsed object, or the refusal.
pub(crate) fn same_site_json(h: &HeaderMap, body: &Bytes) -> Result<Value, Response> {
    let ct = h.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    let host = h.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("");
    let same = match h.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(o) => o.split("://").nth(1).map(|x| x.trim_end_matches('/') == host).unwrap_or(false),
        None => true,
    };
    if !same {
        return Err(refuse(403, "badPatch", "Refused: request from another site."));
    }
    if !ct.starts_with("application/json") {
        return Err(refuse(415, "badPatch", "Send JSON."));
    }
    if body.len() > MAX_BODY {
        return Err(refuse(413, "badPatch", "Too large."));
    }
    match serde_json::from_slice::<Value>(body) {
        Ok(v) if v.is_object() => Ok(v),
        _ => Err(refuse(400, "badPatch", "Bad request.")),
    }
}
// One text field from a request body, trimmed, or "".
pub(crate) fn field(b: &Value, k: &str) -> String {
    b.get(k).and_then(Value::as_str).unwrap_or("").trim().to_string()
}
// A short readable device name from what the browser says about itself.
fn device_name(b: &Value) -> String {
    let ua = field(b, "device").to_ascii_lowercase();
    let kind = if ua.contains("ipad") || ua.contains("tablet") || (ua.contains("android") && !ua.contains("mobile")) {
        "Tablet"
    } else if ua.contains("iphone") || ua.contains("mobile") {
        "Phone"
    } else if ua.is_empty() {
        "Device"
    } else {
        "Computer"
    };
    kind.to_string()
}

/// A joined device, found from its cookie.
pub(crate) struct Device {
    pub id: String,
    pub name: String,
    pub kitchen_id: String,
    pub kitchen_name: String,
}

// The device a request comes from, or None when it is not joined (or was removed). A device in use is kept alive: its last-seen
// time moves at most once an hour.
pub(crate) async fn device_of(st: &AppState, h: &HeaderMap) -> Option<Device> {
    let cookie = h.get(header::COOKIE)?.to_str().ok()?;
    let token = cookie.split(';').filter_map(|p| p.trim().split_once('=')).find(|(k, _)| *k == auth::COOKIE).map(|(_, v)| v.to_string())?;
    let row = sqlx::query("SELECT d.id, d.name, d.last_seen, k.id AS kid, k.name AS kname FROM devices d JOIN kitchens k ON k.id = d.kitchen_id WHERE d.token_hash = $1 AND d.removed_at IS NULL")
        .bind(auth::token_hash(&token))
        .fetch_optional(&st.db)
        .await
        .ok()??;
    let now = st.rooms.now();
    let last: i64 = row.get("last_seen");
    if now - last > auth::DEVICE_MS {
        return None;
    }
    let id: String = row.get("id");
    if now - last > 3600 * 1000 {
        let _ = sqlx::query("UPDATE devices SET last_seen = $1 WHERE id = $2").bind(now).bind(&id).execute(&st.db).await;
    }
    Some(Device { id, name: row.get("name"), kitchen_id: row.get("kid"), kitchen_name: row.get("kname") })
}

// Joins this device to a kitchen and returns the cookie that keeps it joined.
async fn join_device(st: &AppState, kitchen_id: &str, name: &str, how: &str, secure: bool) -> Result<String, sqlx::Error> {
    let token = auth::new_token();
    let now = st.rooms.now();
    sqlx::query("INSERT INTO devices (id, kitchen_id, name, token_hash, joined_by, created_at, last_seen) VALUES ($1,$2,$3,$4,$5,$6,$6)")
        .bind(auth::new_id("d"))
        .bind(kitchen_id)
        .bind(name)
        .bind(auth::token_hash(&token))
        .bind(how)
        .bind(now)
        .execute(&st.db)
        .await?;
    Ok(auth::device_cookie(&token, secure))
}

// Counts a failed try for a key (an email, an address). Lockouts last for the rest of the 15-minute window.
pub(crate) async fn note_fail(st: &AppState, key: &str) {
    let now = st.rooms.now();
    let _ = sqlx::query(
        "INSERT INTO login_fails (key, count, first_at) VALUES ($1, 1, $2) ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN $2 - login_fails.first_at < $3 THEN login_fails.count + 1 ELSE 1 END,
         first_at = CASE WHEN $2 - login_fails.first_at < $3 THEN login_fails.first_at ELSE $2 END",
    )
    .bind(key)
    .bind(now)
    .bind(FAIL_WINDOW_MS)
    .execute(&st.db)
    .await;
}
// True while a key has had too many failed tries in the window.
pub(crate) async fn locked(st: &AppState, key: &str) -> bool {
    let now = st.rooms.now();
    let r = sqlx::query("SELECT count, first_at FROM login_fails WHERE key = $1").bind(key).fetch_optional(&st.db).await.ok().flatten();
    match r {
        Some(r) => now - r.get::<i64, _>("first_at") < FAIL_WINDOW_MS && r.get::<i32, _>("count") >= MAX_FAILS,
        None => false,
    }
}

/* ---------- pages ---------- */

// Health check for the web server in front and for the uptime monitor: the database answers and the engine thread is alive.
// Anything wrong answers 503, which is what sets off the alert.
async fn health(State(st): State<AppState>) -> Response {
    let db = tokio::time::timeout(std::time::Duration::from_secs(3), sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&st.db)).await.map(|r| r.is_ok()).unwrap_or(false);
    let engine = st.rooms.engine_ok().await;
    let ok = db && engine;
    reply(if ok { 200 } else { 503 }, json!({ "ok": ok, "database": db, "engine": engine, "kitchensOpen": st.rooms.open_count().await }))
}

// Caddy asks this before passing a request to the voice helper: only a joined device, and at most a line a second after a burst
// of 60, so nobody outside a kitchen can keep the server's voice busy.
async fn voice_ok(State(st): State<AppState>, h: HeaderMap) -> Response {
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    if let Some(r) = limit(&st, &format!("voice:{}", d.id), crate::limits::VOICE) {
        return r;
    }
    reply(200, json!({ "ok": true }))
}

// A page error from a tablet, kept for SmokeBox staff (the staff console counts them). At most 20 then one a minute per device.
async fn client_error(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    if let Some(r) = limit(&st, &format!("report:{}", d.id), crate::limits::REPORT) {
        return r;
    }
    let text: String = field(&b, "message").chars().take(500).collect();
    let detail: String = field(&b, "detail").chars().take(4000).collect();
    let _ = sqlx::query("INSERT INTO server_errors (at, source, kitchen_id, what, detail) VALUES ($1, 'tablet', $2, $3, $4)").bind(st.rooms.now()).bind(&d.kitchen_id).bind(&text).bind(&detail).execute(&st.db).await;
    reply(200, json!({ "ok": true }))
}

// Every answer that went wrong on the server's side (500 and up, except a voice or Stripe outage it reports itself) is written
// down for SmokeBox staff, with the method and path but never the body.
async fn log_errors(State(st): State<AppState>, req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let what = format!("{} {}", req.method(), req.uri().path());
    let r = next.run(req).await;
    let code = r.status().as_u16();
    if code >= 500 && code != 502 && code != 503 {
        eprintln!("[server] {} answered {}", what, code);
        let _ = sqlx::query("INSERT INTO server_errors (at, source, what, detail) VALUES ($1, 'server', $2, $3)").bind(st.rooms.now()).bind(&what).bind(code.to_string()).execute(&st.db).await;
    }
    r
}

// The app itself, with the kitchen and device written in so the page talks to this server. A device that is not joined goes to
// the start page.
async fn app_page(State(st): State<AppState>, h: HeaderMap) -> Response {
    let Some(d) = device_of(&st, &h).await else { return Redirect::to("/start").into_response() };
    let html = match tokio::fs::read_to_string(&st.cfg.html_file).await {
        Ok(s) => s,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "The app page is not built (dist/smokebox.html).").into_response(),
    };
    let bill = crate::billing::state(&st.db, &st.cfg.stripe, &d.kitchen_id, st.rooms.now()).await;
    let cfg = json!({ "kitchen": { "id": d.kitchen_id, "name": d.kitchen_name }, "device": { "id": d.id, "name": d.name }, "billing": bill.json() }).to_string().replace('<', "\\u003c");
    let html = html.replacen("<head>", &format!("<head><script>window.SB_CLOUD={};</script>", cfg), 1);
    let mut r = no_store(Html(html));
    r.headers_mut().insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    r
}

/* ---------- starting, joining, signing in ---------- */

// Starts a new kitchen with its owner, and joins this device to it.
async fn start_kitchen(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    if let Some(r) = limit(&st, &format!("start:{}", client_ip(&h)), crate::limits::START) {
        return r;
    }
    let email = field(&b, "email").to_lowercase();
    let pw = b.get("password").and_then(Value::as_str).unwrap_or("").to_string();
    let name = field(&b, "kitchen").split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.chars().count() > 60 {
        return refuse(400, "badName", "Type your kitchen's name (up to 60 characters).");
    }
    if !auth::email_ok(&email) {
        return refuse(400, "badEmail", "Type a full email address, like you@example.com.");
    }
    if pw.chars().count() < 8 || pw.len() > 200 {
        return refuse(400, "badPassword", "Use a password of at least 8 characters.");
    }
    let taken: Option<String> = sqlx::query_scalar("SELECT id FROM owners WHERE email = $1").bind(&email).fetch_optional(&st.db).await.ok().flatten();
    if taken.is_some() {
        return refuse(409, "taken", "There is already a kitchen for that email. Use Owner sign in.");
    }
    let (kid, oid, now) = (auth::new_id("k"), auth::new_id("o"), st.rooms.now());
    let hash = tokio::task::spawn_blocking(move || auth::hash_password(&pw)).await.unwrap_or_default();
    let mut tx = match st.db.begin().await { Ok(t) => t, Err(_) => return refuse(500, "error", "The kitchen could not be started. Try again.") };
    let ok = sqlx::query("INSERT INTO kitchens (id, name, created_at) VALUES ($1,$2,$3)").bind(&kid).bind(&name).bind(now).execute(&mut *tx).await.is_ok()
        && sqlx::query("INSERT INTO owners (id, kitchen_id, email, pass, created_at) VALUES ($1,$2,$3,$4,$5)").bind(&oid).bind(&kid).bind(&email).bind(&hash).bind(now).execute(&mut *tx).await.is_ok();
    if !ok || tx.commit().await.is_err() {
        return refuse(500, "error", "The kitchen could not be started. Try again.");
    }
    match join_device(&st, &kid, &device_name(&b), "start", secure(&h)).await {
        Ok(c) => {
            // With billing on, the owner goes straight to Stripe to add a card and start the 3 free weeks; if Stripe cannot be
            // reached the kitchen opens anyway and the board asks for the card (3 days).
            let mut go = "/".to_string();
            if st.cfg.stripe.on() {
                if let Ok(url) = st.cfg.stripe.checkout(&kid, &email, &st.cfg.public_url).await {
                    go = url;
                }
            }
            with_cookie(reply(200, json!({ "ok": true, "go": go, "kitchen": { "id": kid, "name": name } })), c)
        }
        Err(_) => refuse(500, "error", "The kitchen was started, but this device could not join. Use Owner sign in."),
    }
}

// Joins this device with a six-digit code from another screen of the kitchen. Ten wrong codes from one address lock it out for 15 minutes.
async fn join_kitchen(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let ip_key = format!("code:{}", client_ip(&h));
    if locked(&st, &ip_key).await {
        return refuse(429, "locked", "Too many wrong codes. Wait 15 minutes and try again.");
    }
    let code: String = field(&b, "code").chars().filter(char::is_ascii_digit).collect();
    let now = st.rooms.now();
    // Uses the code once: only an unused, unexpired code is marked used, so two devices can never both join with one code.
    let kitchen: Option<String> = if code.len() == 6 {
        sqlx::query_scalar("UPDATE pair_codes SET used_at = $1 WHERE code_hash = $2 AND used_at IS NULL AND expires_at > $1 RETURNING kitchen_id")
            .bind(now)
            .bind(auth::token_hash(&code))
            .fetch_optional(&st.db)
            .await
            .ok()
            .flatten()
    } else {
        None
    };
    let Some(kid) = kitchen else {
        note_fail(&st, &ip_key).await;
        return refuse(400, "badCode", "That code did not work. Codes work once, for 10 minutes. Make a new one on the other screen.");
    };
    match join_device(&st, &kid, &device_name(&b), "code", secure(&h)).await {
        Ok(c) => with_cookie(reply(200, json!({ "ok": true, "go": "/" })), c),
        Err(_) => refuse(500, "error", "This device could not join. Try again."),
    }
}

// Owner sign-in on a device that has no other way in. Ten wrong tries for one email, or from one address, lock it for 15 minutes;
// the answer never says which part was wrong.
async fn owner_login(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let email = field(&b, "email").to_lowercase();
    let pw = b.get("password").and_then(Value::as_str).unwrap_or("").to_string();
    let (ip_key, em_key) = (format!("ip:{}", client_ip(&h)), format!("em:{}", email));
    if locked(&st, &ip_key).await || locked(&st, &em_key).await {
        return refuse(429, "locked", "Too many tries. Wait 15 minutes and try again.");
    }
    let row = sqlx::query("SELECT kitchen_id, pass FROM owners WHERE email = $1").bind(&email).fetch_optional(&st.db).await.ok().flatten();
    let (kid, stored) = match row {
        Some(r) => (r.get::<String, _>("kitchen_id"), r.get::<String, _>("pass")),
        None => (String::new(), String::new()),
    };
    let good = tokio::task::spawn_blocking(move || !stored.is_empty() && auth::check_password(&pw, &stored)).await.unwrap_or(false);
    if !good {
        note_fail(&st, &ip_key).await;
        note_fail(&st, &em_key).await;
        return refuse(401, "wrong", "That email and password do not match.");
    }
    let _ = sqlx::query("DELETE FROM login_fails WHERE key = $1").bind(&em_key).execute(&st.db).await;
    match join_device(&st, &kid, &device_name(&b), "owner", secure(&h)).await {
        Ok(c) => with_cookie(reply(200, json!({ "ok": true, "go": "/" })), c),
        Err(_) => refuse(500, "error", "This device could not join. Try again."),
    }
}

// Takes this device out of its kitchen.
async fn logout(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = same_site_json(&h, &body) {
        return r;
    }
    if let Some(d) = device_of(&st, &h).await {
        let _ = sqlx::query("UPDATE devices SET removed_at = $1 WHERE id = $2").bind(st.rooms.now()).bind(&d.id).execute(&st.db).await;
    }
    with_cookie(reply(200, json!({ "ok": true })), auth::clear_cookie(secure(&h)))
}

// Emails the owner a one-hour link to set a new password. The answer is the same whether or not the email has a kitchen.
async fn forgot(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let email = field(&b, "email").to_lowercase();
    let ip_key = format!("forgot:{}", client_ip(&h));
    if locked(&st, &ip_key).await {
        return refuse(429, "locked", "Too many tries. Wait 15 minutes and try again.");
    }
    note_fail(&st, &ip_key).await;
    let owner: Option<String> = sqlx::query_scalar("SELECT id FROM owners WHERE email = $1").bind(&email).fetch_optional(&st.db).await.ok().flatten();
    if let Some(oid) = owner {
        let (token, now) = (auth::new_token(), st.rooms.now());
        let _ = sqlx::query("INSERT INTO reset_tokens (token_hash, owner_id, expires_at) VALUES ($1,$2,$3)").bind(auth::token_hash(&token)).bind(&oid).bind(now + RESET_MS).execute(&st.db).await;
        let link = format!("{}/reset?t={}", st.cfg.public_url.trim_end_matches('/'), token);
        let text = format!("Someone asked to set a new password for your Smokebox kitchen.\n\nSet a new password (the link works for one hour):\n{}\n\nIf it was not you, ignore this email. Your password has not changed.", link);
        let _ = sqlx::query("INSERT INTO outbox_emails (to_addr, subject, body, created_at) VALUES ($1,$2,$3,$4)").bind(&email).bind("Set a new Smokebox password").bind(text).bind(now).execute(&st.db).await;
    }
    reply(200, json!({ "ok": true, "words": "If that email has a kitchen, a link is on its way. Check the inbox." }))
}

// Sets a new owner password from a reset link. The link works once.
async fn reset(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let pw = b.get("password").and_then(Value::as_str).unwrap_or("").to_string();
    if pw.chars().count() < 8 || pw.len() > 200 {
        return refuse(400, "badPassword", "Use a password of at least 8 characters.");
    }
    let now = st.rooms.now();
    let owner: Option<String> = sqlx::query_scalar("UPDATE reset_tokens SET used_at = $1 WHERE token_hash = $2 AND used_at IS NULL AND expires_at > $1 RETURNING owner_id")
        .bind(now)
        .bind(auth::token_hash(&field(&b, "token")))
        .fetch_optional(&st.db)
        .await
        .ok()
        .flatten();
    let Some(oid) = owner else { return refuse(400, "badLink", "This link has expired or was already used. Ask for a new one.") };
    let hash = tokio::task::spawn_blocking(move || auth::hash_password(&pw)).await.unwrap_or_default();
    let _ = sqlx::query("UPDATE owners SET pass = $1, email_ok = TRUE WHERE id = $2").bind(hash).bind(&oid).execute(&st.db).await;
    reply(200, json!({ "ok": true, "words": "Password saved. Use Owner sign in with the new password." }))
}

/* ---------- the joined device ---------- */

// Which kitchen and device this is.
async fn me(State(st): State<AppState>, h: HeaderMap) -> Response {
    match device_of(&st, &h).await {
        Some(d) => {
            let b = crate::billing::state(&st.db, &st.cfg.stripe, &d.kitchen_id, st.rooms.now()).await;
            reply(200, json!({ "kitchen": { "id": d.kitchen_id, "name": d.kitchen_name }, "device": { "id": d.id, "name": d.name }, "billing": b.json() }))
        }
        None => refuse(401, "signedOut", "This device is not joined to a kitchen. Join it again."),
    }
}

// Every device joined to this kitchen, newest use first.
async fn devices(State(st): State<AppState>, h: HeaderMap) -> Response {
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let rows = sqlx::query("SELECT id, name, joined_by, created_at, last_seen FROM devices WHERE kitchen_id = $1 AND removed_at IS NULL ORDER BY last_seen DESC")
        .bind(&d.kitchen_id)
        .fetch_all(&st.db)
        .await
        .unwrap_or_default();
    let list: Vec<Value> = rows
        .iter()
        .map(|r| {
            let id: String = r.get("id");
            json!({ "id": id, "name": r.get::<String, _>("name"), "joinedBy": r.get::<String, _>("joined_by"), "joinedAt": r.get::<i64, _>("created_at"), "lastSeen": r.get::<i64, _>("last_seen"), "me": id == d.id })
        })
        .collect();
    reply(200, json!({ "devices": list }))
}

// A new six-digit code that joins one more device to this kitchen, for 10 minutes.
async fn make_code(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = same_site_json(&h, &body) {
        return r;
    }
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    if let Some(r) = limit(&st, &format!("code:{}", d.id), crate::limits::CODE) {
        return r;
    }
    let now = st.rooms.now();
    let _ = sqlx::query("DELETE FROM pair_codes WHERE expires_at < $1").bind(now).execute(&st.db).await;
    // A fresh code that is not already waiting (a clash among a million codes is rare, but it is checked).
    for _ in 0..8 {
        let code = auth::new_code();
        let r = sqlx::query("INSERT INTO pair_codes (code_hash, kitchen_id, made_by, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (code_hash) DO NOTHING")
            .bind(auth::token_hash(&code))
            .bind(&d.kitchen_id)
            .bind(&d.id)
            .bind(now + auth::CODE_MS)
            .execute(&st.db)
            .await;
        if matches!(r, Ok(ref x) if x.rows_affected() == 1) {
            return reply(200, json!({ "code": code, "expiresAt": now + auth::CODE_MS }));
        }
    }
    refuse(503, "busy", "No code could be made. Try again.")
}

// Removes a device from this kitchen at once (a lost or stolen tablet). Its next request finds it signed out.
async fn remove_device(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let r = sqlx::query("UPDATE devices SET removed_at = $1 WHERE id = $2 AND kitchen_id = $3 AND removed_at IS NULL")
        .bind(st.rooms.now())
        .bind(field(&b, "id"))
        .bind(&d.kitchen_id)
        .execute(&st.db)
        .await;
    match r {
        Ok(x) if x.rows_affected() == 1 => reply(200, json!({ "ok": true, "self": field(&b, "id") == d.id })),
        _ => refuse(404, "unknownDevice", "That device is not in this kitchen."),
    }
}

// Gives a device a name people recognize, like "Line tablet".
async fn rename_device(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let name = field(&b, "name");
    if name.is_empty() || name.chars().count() > 40 {
        return refuse(400, "badName", "Type a name of up to 40 characters.");
    }
    let r = sqlx::query("UPDATE devices SET name = $1 WHERE id = $2 AND kitchen_id = $3 AND removed_at IS NULL").bind(&name).bind(field(&b, "id")).bind(&d.kitchen_id).execute(&st.db).await;
    match r {
        Ok(x) if x.rows_affected() == 1 => reply(200, json!({ "ok": true })),
        _ => refuse(404, "unknownDevice", "That device is not in this kitchen."),
    }
}

/* ---------- live kitchen ---------- */

// The live stream: the whole kitchen now, then every change and a heartbeat, for as long as the screen stays connected.
async fn events(State(st): State<AppState>, h: HeaderMap) -> Response {
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let room = match st.rooms.get(&d.kitchen_id).await {
        Ok(Some(r)) => r,
        _ => return refuse(404, "noKitchen", "Kitchen not found."),
    };
    let (first, rx) = {
        let r = room.lock().await;
        if r.tx.receiver_count() >= MAX_SCREENS {
            return refuse(503, "full", "Too many screens are connected to this kitchen.");
        }
        let rx = r.tx.subscribe();
        match st.rooms.view(&r).await {
            Ok(v) => (v, rx),
            Err(_) => return refuse(500, "error", "The kitchen could not be read."),
        }
    };
    let head = stream::once(async move { Ok::<_, Infallible>(SseEvent::default().event("snapshot").data(first)) });
    // A screen that falls far behind (missed messages) is cut off; it reconnects and gets the whole kitchen again.
    let rest = BroadcastStream::new(rx).take_while(|m| futures_util::future::ready(m.is_ok())).filter_map(|m| async move {
        m.ok().map(|e: Event| Ok::<_, Infallible>(SseEvent::default().event(e.name).data(e.data.as_str())))
    });
    let s: std::pin::Pin<Box<dyn Stream<Item = Result<SseEvent, Infallible>> + Send>> = Box::pin(head.chain(rest));
    let mut resp = Sse::new(s).keep_alive(KeepAlive::default()).into_response();
    resp.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    resp
}

// One action from a screen, applied in the kitchen's one order and answered with the engine's report.
async fn action(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    let b = match same_site_json(&h, &body) { Ok(b) => b, Err(r) => return r };
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen. Join it again.") };
    // A tablet told to slow down keeps the action and sends it again later, so nothing is lost.
    if let Some(r) = limit(&st, &format!("act:{}", d.id), crate::limits::ACTION) {
        return r;
    }
    let room = match st.rooms.get(&d.kitchen_id).await {
        Ok(Some(r)) => r,
        _ => return refuse(404, "noKitchen", "Kitchen not found."),
    };
    // A kitchen whose billing countdown ran out takes no new orders (from the first 4 am after it ended); everything else works.
    if b.get("type").and_then(Value::as_str) == Some("createTicket") && st.cfg.stripe.on() {
        let bill = crate::billing::state(&st.db, &st.cfg.stripe, &d.kitchen_id, st.rooms.now()).await;
        if bill.paused {
            let seq = room.lock().await.seq;
            return reply(200, json!({ "report": "billingPaused", "info": {}, "seq": seq }));
        }
    }
    let mut r = room.lock().await;
    let out = st.rooms.act(&mut r, &b, &d.id).await;
    reply(out.status, out.body)
}

/* ---------- billing ---------- */

// The kitchen's billing: plan status, trial, the countdown and whether new orders have stopped.
async fn billing_get(State(st): State<AppState>, h: HeaderMap) -> Response {
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    reply(200, crate::billing::state(&st.db, &st.cfg.stripe, &d.kitchen_id, st.rooms.now()).await.json())
}

// A Stripe Checkout page to add a card (a kitchen with no card yet, or after a cancel). Answers its address.
async fn billing_checkout(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = same_site_json(&h, &body) {
        return r;
    }
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    if !st.cfg.stripe.on() {
        return refuse(400, "billingOff", "Billing is not switched on for this server.");
    }
    let email: Option<String> = sqlx::query_scalar("SELECT email FROM owners WHERE kitchen_id = $1 LIMIT 1").bind(&d.kitchen_id).fetch_optional(&st.db).await.ok().flatten();
    match st.cfg.stripe.checkout(&d.kitchen_id, &email.unwrap_or_default(), &st.cfg.public_url).await {
        Ok(url) => reply(200, json!({ "url": url })),
        Err(_) => refuse(502, "stripeDown", "The payment page could not be opened. Try again in a minute."),
    }
}

// Stripe's customer portal for this kitchen: change the card, see receipts or cancel. Answers its address.
async fn billing_portal(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = same_site_json(&h, &body) {
        return r;
    }
    let Some(d) = device_of(&st, &h).await else { return refuse(401, "signedOut", "This device is not joined to a kitchen.") };
    let customer: Option<String> = sqlx::query_scalar("SELECT stripe_customer FROM kitchens WHERE id = $1").bind(&d.kitchen_id).fetch_optional(&st.db).await.ok().flatten().flatten();
    let Some(customer) = customer else { return refuse(400, "noCard", "There is no card yet. Add one first.") };
    match st.cfg.stripe.portal(&customer, &st.cfg.public_url).await {
        Ok(url) => reply(200, json!({ "url": url })),
        Err(_) => refuse(502, "stripeDown", "The billing page could not be opened. Try again in a minute."),
    }
}

// Stripe's messages about payments. Not a browser request: it is trusted only when its signature checks out.
async fn stripe_webhook(State(st): State<AppState>, h: HeaderMap, body: Bytes) -> Response {
    if !st.cfg.stripe.on() {
        return refuse(404, "billingOff", "Billing is off.");
    }
    let sig = h.get("stripe-signature").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !st.cfg.stripe.verify(sig, &body, st.rooms.now() / 1000) {
        return refuse(400, "badSignature", "Signature does not match.");
    }
    let Ok(ev) = serde_json::from_slice::<Value>(&body) else { return refuse(400, "badPatch", "Not JSON.") };
    match crate::billing::handle(&st.db, &ev, st.rooms.now()).await {
        Ok(fresh) => reply(200, json!({ "ok": true, "duplicate": !fresh })),
        Err(e) => {
            eprintln!("[server] stripe event failed: {}", e);
            refuse(500, "error", "Not handled; Stripe will send it again.")
        }
    }
}
