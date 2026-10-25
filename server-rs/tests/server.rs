//! End-to-end checks of the server against a real Postgres: starting a kitchen, joining devices with a code, live sync between
//! devices, removing a device, owner sign-in and lockout, password reset, crash recovery, repeated actions and the cross-site
//! guard. Each test gets its own new database. SMOKEBOX_TEST_PG points at a Postgres the tests may create databases in
//! (default postgres://smokebox:dev@127.0.0.1/postgres).

use futures_util::StreamExt;
use serde_json::{json, Value};
use smokebox_server::app;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

const T0: i64 = 1_792_854_000_000;

/// A running server on a free port, with its own database and a clock the test moves by hand.
struct Srv {
    base: String,
    clock: Arc<AtomicI64>,
    st: app::AppState,
}

// Starts a server with a brand-new database.
async fn server() -> Srv {
    let admin = std::env::var("SMOKEBOX_TEST_PG").unwrap_or_else(|_| "postgres://smokebox:dev@127.0.0.1/postgres".into());
    let name = format!("sbtest_{}", smokebox_server::auth::new_id("x").replace("x_", ""));
    let pool = sqlx::PgPool::connect(&admin).await.expect("test Postgres answers");
    sqlx::query(sqlx::AssertSqlSafe(format!("CREATE DATABASE {}", name))).execute(&pool).await.unwrap();
    let url = format!("{}/{}", admin.rsplit_once('/').unwrap().0, name);
    let db = sqlx::PgPool::connect(&url).await.unwrap();
    let clock = Arc::new(AtomicI64::new(T0));
    let c2 = clock.clone();
    let html = std::env::temp_dir().join(format!("{}.html", name));
    std::fs::write(&html, "<!doctype html><html><head><title>t</title></head><body>app</body></html>").unwrap();
    let cfg = app::Config { html_file: html, public_url: "https://app.example".into(), snapshot_every: 5 };
    let (router, st) = app::build(db, cfg, Arc::new(move || c2.load(Ordering::SeqCst))).await.unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    Srv { base, clock, st }
}

// A browser-like client that keeps cookies, as one device would.
fn device() -> reqwest::Client {
    reqwest::Client::builder().cookie_store(true).redirect(reqwest::redirect::Policy::none()).build().unwrap()
}

// Posts JSON and returns the status and the JSON answer.
async fn post(c: &reqwest::Client, s: &Srv, path: &str, body: Value) -> (u16, Value) {
    let r = c.post(format!("{}{}", s.base, path)).json(&body).send().await.unwrap();
    let st = r.status().as_u16();
    (st, r.json().await.unwrap_or(json!({})))
}
// Gets JSON and returns the status and the answer.
async fn get(c: &reqwest::Client, s: &Srv, path: &str) -> (u16, Value) {
    let r = c.get(format!("{}{}", s.base, path)).send().await.unwrap();
    let st = r.status().as_u16();
    (st, r.json().await.unwrap_or(json!({})))
}
// Starts a kitchen on a new device and returns that device.
async fn started(s: &Srv) -> reqwest::Client {
    let a = device();
    let (st, b) = post(&a, s, "/api/start", json!({ "kitchen": "Freddy's Franks", "email": "Owner@Example.com", "password": "grill-master-1", "device": "Mozilla (iPad)" })).await;
    assert_eq!((st, b["go"].as_str()), (200, Some("/")), "{}", b);
    a
}
// A dish to put on tickets.
fn fries() -> Value {
    json!({ "type": "addMenuItem", "payload": { "name": "Fries", "zone": "fry", "cat": "fried", "price": 4, "prepSec": 420, "track": "two" } })
}

#[tokio::test]
async fn start_a_kitchen_and_join_a_second_device_with_a_code() {
    let s = server().await;
    let a = started(&s).await;
    let (st, me) = get(&a, &s, "/api/me").await;
    assert_eq!(st, 200);
    assert_eq!(me["kitchen"]["name"], "Freddy's Franks");
    assert_eq!(me["device"]["name"], "Tablet");
    // The app page has the kitchen written in; a device that is not joined goes to the start page.
    let page = a.get(format!("{}/", s.base)).send().await.unwrap().text().await.unwrap();
    assert!(page.contains("window.SB_CLOUD=") && page.contains("Freddy's Franks"));
    let r = device().get(format!("{}/", s.base)).send().await.unwrap();
    assert_eq!((r.status().as_u16(), r.headers()["location"].to_str().unwrap()), (303, "/start"));

    // A second device joins with a code made on the first; the code works once.
    let (_, c) = post(&a, &s, "/api/devices/code", json!({})).await;
    let code = c["code"].as_str().unwrap().to_string();
    assert_eq!(code.len(), 6);
    let b = device();
    assert_eq!(post(&b, &s, "/api/join", json!({ "code": code, "device": "Mozilla (iPhone; Mobile)" })).await.0, 200);
    assert_eq!(get(&b, &s, "/api/me").await.1["kitchen"]["name"], "Freddy's Franks");
    assert_eq!(post(&device(), &s, "/api/join", json!({ "code": code })).await.0, 400, "a code works once");
    let (_, list) = get(&a, &s, "/api/devices").await;
    assert_eq!(list["devices"].as_array().unwrap().len(), 2);

    // An old code stops working after 10 minutes.
    let (_, c2) = post(&a, &s, "/api/devices/code", json!({})).await;
    s.clock.fetch_add(11 * 60 * 1000, Ordering::SeqCst);
    assert_eq!(post(&device(), &s, "/api/join", json!({ "code": c2["code"] })).await.0, 400);
}

#[tokio::test]
async fn an_action_on_one_device_reaches_the_other_live() {
    let s = server().await;
    let a = started(&s).await;
    let (_, c) = post(&a, &s, "/api/devices/code", json!({})).await;
    let b = device();
    post(&b, &s, "/api/join", json!({ "code": c["code"] })).await;
    // Device B listens; its first message is the whole kitchen.
    let r = b.get(format!("{}/api/events", s.base)).send().await.unwrap();
    assert_eq!(r.status().as_u16(), 200);
    let mut stream = r.bytes_stream();
    let mut buf = String::new();
    // Reads the stream until `want` shows up (or gives up after a few seconds).
    async fn until(stream: &mut (impl futures_util::Stream<Item = reqwest::Result<bytes::Bytes>> + Unpin), buf: &mut String, want: &str) -> bool {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
        while !buf.contains(want) {
            match tokio::time::timeout_at(deadline, stream.next()).await {
                Ok(Some(Ok(chunk))) => buf.push_str(&String::from_utf8_lossy(&chunk)),
                _ => return false,
            }
        }
        true
    }
    assert!(until(&mut stream, &mut buf, "event: snapshot").await);
    // Device A adds a dish; device B hears the new state.
    let (st, rep) = post(&a, &s, "/api/action", fries()).await;
    assert_eq!((st, rep["report"].as_str()), (200, Some("ok")));
    assert!(until(&mut stream, &mut buf, "\"name\":\"Fries\"").await, "B heard the new dish");
    assert!(buf.contains("event: state"));
}

#[tokio::test]
async fn a_removed_device_is_signed_out_at_once() {
    let s = server().await;
    let a = started(&s).await;
    let (_, c) = post(&a, &s, "/api/devices/code", json!({})).await;
    let b = device();
    post(&b, &s, "/api/join", json!({ "code": c["code"] })).await;
    let (_, list) = get(&a, &s, "/api/devices").await;
    let bid = list["devices"].as_array().unwrap().iter().find(|d| d["me"] == false).unwrap()["id"].clone();
    assert_eq!(post(&a, &s, "/api/devices/rename", json!({ "id": bid, "name": "Line tablet" })).await.0, 200);
    assert_eq!(get(&b, &s, "/api/me").await.1["device"]["name"], "Line tablet");
    assert_eq!(post(&a, &s, "/api/devices/remove", json!({ "id": bid })).await.0, 200);
    assert_eq!(get(&b, &s, "/api/me").await.0, 401);
    assert_eq!(post(&b, &s, "/api/action", fries()).await.0, 401);
}

#[tokio::test]
async fn owner_sign_in_lockout_and_password_reset() {
    let s = server().await;
    started(&s).await;
    // A new device with no other way in: owner sign-in (email is not case sensitive).
    let c = device();
    assert_eq!(post(&c, &s, "/api/login", json!({ "email": "owner@example.com", "password": "grill-master-1" })).await.0, 200);
    assert_eq!(get(&c, &s, "/api/me").await.0, 200);
    // The same email cannot start a second kitchen.
    assert_eq!(post(&device(), &s, "/api/start", json!({ "kitchen": "Again", "email": "owner@example.com", "password": "12345678" })).await.0, 409);
    // Ten wrong passwords lock the email for 15 minutes, even with the right password.
    let d = device();
    for _ in 0..10 {
        assert_eq!(post(&d, &s, "/api/login", json!({ "email": "owner@example.com", "password": "nope-nope" })).await.0, 401);
    }
    assert_eq!(post(&d, &s, "/api/login", json!({ "email": "owner@example.com", "password": "grill-master-1" })).await.0, 429);
    s.clock.fetch_add(16 * 60 * 1000, Ordering::SeqCst);
    // Forgot password: the email goes to the outbox with a one-hour link; the link sets a new password once.
    let (st, f) = post(&d, &s, "/api/forgot", json!({ "email": "owner@example.com" })).await;
    assert_eq!(st, 200, "{}", f);
    assert_eq!(post(&d, &s, "/api/forgot", json!({ "email": "nobody@example.com" })).await.1["words"], f["words"], "same answer for an unknown email");
    let body: String = sqlx::query_scalar("SELECT body FROM outbox_emails WHERE to_addr = 'owner@example.com'").fetch_one(&s.st.db).await.unwrap();
    let token = body.split("reset?t=").nth(1).unwrap().split_whitespace().next().unwrap().to_string();
    assert_eq!(post(&d, &s, "/api/reset", json!({ "token": token, "password": "brand-new-pw" })).await.0, 200);
    assert_eq!(post(&d, &s, "/api/reset", json!({ "token": token, "password": "again-again" })).await.0, 400, "the link works once");
    assert_eq!(post(&d, &s, "/api/login", json!({ "email": "owner@example.com", "password": "brand-new-pw" })).await.0, 200);
}

#[tokio::test]
async fn a_kitchen_comes_back_exactly_after_a_crash_and_repeats_are_answered_once() {
    let s = server().await;
    let a = started(&s).await;
    let (_, rep) = post(&a, &s, "/api/action", fries()).await;
    let menu_id = rep["info"]["id"].as_str().unwrap().to_string();
    for i in 0..8 {
        s.clock.fetch_add(1000, Ordering::SeqCst);
        let (st, r) = post(&a, &s, "/api/action", json!({ "type": "createTicket", "opId": format!("op{}", i), "payload": { "customer": format!("G{}", i), "items": [{ "menuId": menu_id }] } })).await;
        assert_eq!((st, r["report"].as_str()), (200, Some("ok")), "{}", r);
    }
    // The same action id again gets the first answer back, marked as a repeat, and changes nothing.
    let (_, again) = post(&a, &s, "/api/action", json!({ "type": "createTicket", "opId": "op3", "payload": { "customer": "G3", "items": [{ "menuId": menu_id }] } })).await;
    assert_eq!(again["duplicate"], true);
    let kid = get(&a, &s, "/api/me").await.1["kitchen"]["id"].as_str().unwrap().to_string();
    let before = s.st.rooms.get(&kid).await.unwrap().unwrap();
    let before = { let r = before.lock().await; s.st.rooms.view(&r).await.unwrap() };
    // A crash: the kitchen is dropped from memory without saving. Loading it again replays the snapshot and the actions after it.
    s.st.rooms.forget(&kid).await;
    let after = s.st.rooms.get(&kid).await.unwrap().unwrap();
    let after = { let r = after.lock().await; s.st.rooms.view(&r).await.unwrap() };
    let state = |v: &str| serde_json::from_str::<Value>(v).unwrap()["state"].clone();
    assert_eq!(state(&before)["tickets"].as_array().unwrap().len(), 8);
    assert_eq!(state(&before), state(&after));
    let n: i64 = sqlx::query_scalar("SELECT snapshot_n FROM kitchens WHERE id = $1").bind(&kid).fetch_one(&s.st.db).await.unwrap();
    assert!(n > 0, "a snapshot was saved along the way");
}

#[tokio::test]
async fn requests_from_another_site_or_not_json_are_refused() {
    let s = server().await;
    let a = started(&s).await;
    let r = a.post(format!("{}/api/action", s.base)).header("origin", "https://evil.example").json(&fries()).send().await.unwrap();
    assert_eq!(r.status().as_u16(), 403);
    let r = a.post(format!("{}/api/action", s.base)).header("content-type", "text/plain").body(fries().to_string()).send().await.unwrap();
    assert_eq!(r.status().as_u16(), 415);
    let r = a.post(format!("{}/api/devices/code", s.base)).header("content-type", "application/x-www-form-urlencoded").body("x=1").send().await.unwrap();
    assert_eq!(r.status().as_u16(), 415);
}
