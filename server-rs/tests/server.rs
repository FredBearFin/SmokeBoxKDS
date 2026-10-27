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

// Starts a server with a brand-new database (billing off).
async fn server() -> Srv {
    server_with(Default::default()).await
}
// Starts a server with a brand-new database and these Stripe settings.
async fn server_with(stripe: smokebox_server::billing::Stripe) -> Srv {
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
    let cfg = app::Config { html_file: html, public_url: "https://app.example".into(), snapshot_every: 5, staff_alert: Some("help@smokebox.example".into()), stripe };
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
    assert_eq!(code.len(), 8);
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

#[tokio::test]
async fn a_support_request_goes_to_staff_and_the_answer_comes_back() {
    let s = server().await;
    let a = started(&s).await;
    // The kitchen asks for help, with what the device attached; a resend after being offline is not a second request.
    let req = json!({ "clientId": "c1", "category": "broken", "urgent": true, "body": "The fryer screen froze\nIt shows nothing", "diagnostics": { "build": "abc123", "errors": ["x"] } });
    let (st, r) = post(&a, &s, "/api/support", req.clone()).await;
    assert_eq!(st, 200, "{}", r);
    let (_, again) = post(&a, &s, "/api/support", req).await;
    assert_eq!((again["id"].clone(), again["duplicate"].clone()), (r["id"].clone(), json!(true)));
    assert_eq!(post(&a, &s, "/api/support", json!({ "body": "   " })).await.0, 400);
    assert_eq!(post(&a, &s, "/api/support", json!({ "body": "x", "photo": "javascript:alert(1)" })).await.0, 400);
    // A stuck kitchen alerts staff by email at once.
    let alert: String = sqlx::query_scalar("SELECT subject FROM outbox_emails WHERE to_addr = 'help@smokebox.example'").fetch_one(&s.st.db).await.unwrap();
    assert!(alert.starts_with("STUCK: request"), "{}", alert);

    // Staff: password and authenticator code are both needed.
    let secret = smokebox_server::support::add_staff(&s.st.db, "freddy@smokebox.example", "Freddy", "staff-pass-123", T0).await.unwrap();
    let staff = device();
    let code = smokebox_server::totp::code_at(&secret, (T0 / 30_000) as u64).unwrap();
    assert_eq!(post(&staff, &s, "/staff/api/login", json!({ "email": "freddy@smokebox.example", "password": "staff-pass-123", "code": "000000" })).await.0, 401);
    assert_eq!(get(&staff, &s, "/staff/api/tickets").await.0, 401);
    assert_eq!(post(&staff, &s, "/staff/api/login", json!({ "email": "freddy@smokebox.example", "password": "staff-pass-123", "code": code })).await.0, 200);
    // A kitchen device is not staff.
    assert_eq!(get(&a, &s, "/staff/api/tickets").await.0, 401);
    let (_, inbox) = get(&staff, &s, "/staff/api/tickets").await;
    let t = &inbox["tickets"][0];
    assert_eq!((t["urgent"].clone(), t["subject"].clone(), t["kitchen"].clone()), (json!(true), json!("The fryer screen froze"), json!("Freddy's Franks")));
    let id = t["id"].as_str().unwrap().to_string();
    let (_, full) = get(&staff, &s, &format!("/staff/api/ticket?id={}", id)).await;
    assert_eq!(full["diagnostics"]["build"], "abc123");
    // A staff-only note stays hidden from the kitchen; the answer shows, with the "new reply" dot, and is emailed to the owner.
    post(&staff, &s, "/staff/api/reply", json!({ "id": id, "body": "Owner seems new", "internal": true })).await;
    s.clock.fetch_add(1000, Ordering::SeqCst);
    assert_eq!(post(&staff, &s, "/staff/api/reply", json!({ "id": id, "body": "Reload the page with the round arrow." })).await.0, 200);
    let (_, mine) = get(&a, &s, "/api/support").await;
    let k = &mine["tickets"][0];
    let bodies: Vec<&str> = k["messages"].as_array().unwrap().iter().map(|m| m["body"].as_str().unwrap()).collect();
    assert_eq!(bodies, vec!["The fryer screen froze\nIt shows nothing", "Reload the page with the round arrow."]);
    assert_eq!((k["status"].clone(), k["unread"].clone()), (json!("waiting"), json!(true)));
    let copy: String = sqlx::query_scalar("SELECT body FROM outbox_emails WHERE to_addr = 'owner@example.com'").fetch_one(&s.st.db).await.unwrap();
    assert!(copy.contains("Reload the page with the round arrow."));
    s.clock.fetch_add(1000, Ordering::SeqCst);
    post(&a, &s, "/api/support/seen", json!({ "id": id })).await;
    assert_eq!(get(&a, &s, "/api/support").await.1["tickets"][0]["unread"], false);
    // The kitchen answers: back to open for staff. Staff mark it solved.
    assert_eq!(post(&a, &s, "/api/support/reply", json!({ "id": id, "body": "That fixed it, thanks" })).await.0, 200);
    assert_eq!(get(&staff, &s, &format!("/staff/api/ticket?id={}", id)).await.1["status"], "open");
    assert_eq!(post(&staff, &s, "/staff/api/status", json!({ "id": id, "status": "solved" })).await.0, 200);
    // Another kitchen cannot read or answer this request.
    let other = device();
    post(&other, &s, "/api/start", json!({ "kitchen": "Other", "email": "other@example.com", "password": "12345678" })).await;
    assert_eq!(get(&other, &s, "/api/support").await.1["tickets"].as_array().unwrap().len(), 0);
    assert_eq!(post(&other, &s, "/api/support/reply", json!({ "id": id, "body": "hi" })).await.0, 404);
}

// A fake Stripe on a free port: answers Checkout and portal requests with made-up page addresses.
async fn fake_stripe() -> String {
    use axum::routing::post;
    let app = axum::Router::new()
        .route("/v1/checkout/sessions", post(|| async { axum::Json(json!({ "id": "cs_test_1", "url": "https://checkout.stripe.test/c/cs_test_1" })) }))
        .route("/v1/billing_portal/sessions", post(|| async { axum::Json(json!({ "id": "bps_1", "url": "https://billing.stripe.test/p/bps_1" })) }));
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", l.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
    base
}

// Sends one Stripe event to the server, signed with the webhook secret at the server's clock.
async fn stripe_event(s: &Srv, id: &str, kind: &str, object: Value, secret: &str) -> (u16, Value) {
    let body = json!({ "id": id, "type": kind, "data": { "object": object } }).to_string();
    let sig = smokebox_server::billing::sign(secret, s.clock.load(Ordering::SeqCst) / 1000, body.as_bytes());
    let r = reqwest::Client::new().post(format!("{}/api/stripe/webhook", s.base)).header("stripe-signature", sig).header("content-type", "application/json").body(body).send().await.unwrap();
    let st = r.status().as_u16();
    (st, r.json().await.unwrap_or(json!({})))
}

#[tokio::test]
async fn billing_trial_failed_payment_countdown_pause_at_4am_and_unlock() {
    let stripe_base = fake_stripe().await;
    let secret = "whsec_test_123";
    let s = server_with(smokebox_server::billing::Stripe { secret_key: "sk_test_x".into(), webhook_secret: secret.into(), price_id: "price_test".into(), api_base: stripe_base }).await;
    // Starting a kitchen sends the owner to Stripe's page to add a card; until then the board counts down 3 days.
    let a = device();
    let (_, b) = post(&a, &s, "/api/start", json!({ "kitchen": "Pay Kitchen", "email": "pay@example.com", "password": "grill-master-1" })).await;
    assert!(b["go"].as_str().unwrap().starts_with("https://checkout.stripe.test/"), "{}", b);
    let (_, me) = get(&a, &s, "/api/me").await;
    let kid = me["kitchen"]["id"].as_str().unwrap().to_string();
    assert_eq!(me["billing"]["status"], "setup");
    assert_eq!(me["billing"]["graceEndsAt"].as_i64(), Some(T0 + smokebox_server::billing::GRACE_MS));
    assert_eq!(me["billing"]["paused"], false);

    // The card is added: the 3 free weeks start and the countdown goes away. The same event again changes nothing.
    let done = json!({ "client_reference_id": kid, "customer": "cus_1", "subscription": "sub_1" });
    assert_eq!(stripe_event(&s, "evt_1", "checkout.session.completed", done.clone(), secret).await.0, 200);
    let (_, again) = stripe_event(&s, "evt_1", "checkout.session.completed", done, secret).await;
    assert_eq!(again["duplicate"], true);
    let bill = get(&a, &s, "/api/billing").await.1;
    assert_eq!((bill["status"].clone(), bill["graceEndsAt"].clone(), bill["hasCard"].clone()), (json!("trialing"), Value::Null, json!(true)));
    assert_eq!(bill["trialEndsAt"].as_i64(), Some(T0 + 21 * 24 * 3600 * 1000));
    // A message not signed with the secret is refused.
    assert_eq!(stripe_event(&s, "evt_x", "invoice.paid", json!({ "customer": "cus_1" }), "wrong").await.0, 400);

    // A payment fails: 72 hours of countdown, then new orders stop at the next 4 am, never in the middle of service.
    let (_, rep) = post(&a, &s, "/api/action", fries()).await;
    let menu_id = rep["info"]["id"].as_str().unwrap().to_string();
    let order = |n: u32| json!({ "type": "createTicket", "payload": { "customer": format!("G{}", n), "items": [{ "menuId": menu_id }] } });
    assert_eq!(stripe_event(&s, "evt_2", "invoice.payment_failed", json!({ "customer": "cus_1" }), secret).await.0, 200);
    let bill = get(&a, &s, "/api/billing").await.1;
    let pause_at = bill["pauseAt"].as_i64().unwrap();
    assert_eq!(bill["status"], "past_due");
    assert_eq!(pause_at, smokebox_server::billing::next_pause_at(bill["graceEndsAt"].as_i64().unwrap()));
    assert!(pause_at >= bill["graceEndsAt"].as_i64().unwrap() && pause_at - bill["graceEndsAt"].as_i64().unwrap() <= 24 * 3600 * 1000);
    // A retry that fails again does not restart the countdown.
    stripe_event(&s, "evt_3", "invoice.payment_failed", json!({ "customer": "cus_1" }), secret).await;
    assert_eq!(get(&a, &s, "/api/billing").await.1["pauseAt"].as_i64(), Some(pause_at));
    s.clock.store(pause_at - 60_000, Ordering::SeqCst);
    let (_, r1) = post(&a, &s, "/api/action", order(1)).await;
    assert_eq!(r1["report"], "ok", "orders still work during the countdown");
    s.clock.store(pause_at + 1000, Ordering::SeqCst);
    let (_, r2) = post(&a, &s, "/api/action", order(2)).await;
    assert_eq!(r2["report"], "billingPaused", "new orders stop once the 4 am pause has come");
    assert_eq!(get(&a, &s, "/api/billing").await.1["paused"], true);
    // Finishing the order already on the board still works.
    let tid = r1["info"]["ticketId"].as_str().unwrap().to_string();
    let (_, bump) = post(&a, &s, "/api/action", json!({ "type": "voidTicket", "payload": { "ticketId": tid, "reason": "Test" } })).await;
    assert_eq!(bump["report"], "ok", "work on open tickets is never blocked");

    // The owner pays: new orders work again at once. The portal opens for card changes.
    s.clock.fetch_add(1000, Ordering::SeqCst);
    assert_eq!(stripe_event(&s, "evt_4", "invoice.paid", json!({ "customer": "cus_1", "lines": { "data": [{ "period": { "end": 1_900_000_000 } }] } }), secret).await.0, 200);
    let bill = get(&a, &s, "/api/billing").await.1;
    assert_eq!((bill["status"].clone(), bill["paused"].clone(), bill["paidThrough"].as_i64()), (json!("active"), json!(false), Some(1_900_000_000_000)));
    assert_eq!(post(&a, &s, "/api/action", order(3)).await.1["report"], "ok");
    let (_, portal) = post(&a, &s, "/api/billing/portal", json!({})).await;
    assert!(portal["url"].as_str().unwrap().starts_with("https://billing.stripe.test/"));
    // A cancelled plan starts the countdown again.
    stripe_event(&s, "evt_5", "customer.subscription.deleted", json!({ "id": "sub_1", "customer": "cus_1", "status": "canceled" }), secret).await;
    let bill = get(&a, &s, "/api/billing").await.1;
    assert_eq!(bill["status"], "canceled");
    assert!(bill["graceEndsAt"].as_i64().is_some());
}

#[tokio::test]
async fn with_billing_off_every_kitchen_is_free() {
    let s = server().await;
    let a = started(&s).await;
    assert_eq!(get(&a, &s, "/api/me").await.1["billing"]["status"], "off");
    let r = reqwest::Client::new().post(format!("{}/api/stripe/webhook", s.base)).body("{}").send().await.unwrap();
    assert_eq!(r.status().as_u16(), 404);
}

#[tokio::test]
async fn limits_health_voice_gate_and_error_log() {
    let s = server().await;
    // Health: the database answers and the engine thread is alive.
    let (st, h) = get(&device(), &s, "/healthz").await;
    assert_eq!((st, h["database"].clone(), h["engine"].clone()), (200, json!(true), json!(true)), "{}", h);

    // Starting kitchens: 5 from one address, then a wait (with Retry-After), and the address Caddy added is the one counted.
    let start = |n: u32, ip: &'static str| {
        let s = &s;
        async move {
            device().post(format!("{}/api/start", s.base)).header("x-forwarded-for", ip)
                .json(&json!({ "kitchen": format!("K{}", n), "email": format!("k{}@example.com", n), "password": "grill-master-1" })).send().await.unwrap()
        }
    };
    for n in 0..5 {
        assert_eq!(start(n, "9.9.9.9").await.status().as_u16(), 200);
    }
    let sixth = start(5, "1.2.3.4, 9.9.9.9").await;
    assert_eq!(sixth.status().as_u16(), 429, "typing a fake first address does not dodge the limit");
    assert!(sixth.headers().get("retry-after").is_some());
    let b: Value = sixth.json().await.unwrap();
    assert!(b["words"].as_str().unwrap().contains("Wait"), "{}", b);
    assert_eq!(start(6, "8.8.8.8").await.status().as_u16(), 200, "another address has its own limit");

    // Join codes: 10 from one device, then a wait.
    let a = started(&s).await;
    for _ in 0..10 {
        assert_eq!(post(&a, &s, "/api/devices/code", json!({})).await.0, 200);
    }
    assert_eq!(post(&a, &s, "/api/devices/code", json!({})).await.0, 429);
    s.clock.fetch_add(60_000, Ordering::SeqCst);
    assert_eq!(post(&a, &s, "/api/devices/code", json!({})).await.0, 200, "one more a minute later");

    // Kitchen actions: a burst of 300 goes through; past that the tablet is told to wait (and keeps the action).
    for _ in 0..300 {
        assert_ne!(post(&a, &s, "/api/action", json!({ "type": "noSuchAction", "payload": {} })).await.0, 429);
    }
    assert_eq!(post(&a, &s, "/api/action", fries()).await.0, 429);
    s.clock.fetch_add(1000, Ordering::SeqCst);
    assert_eq!(post(&a, &s, "/api/action", fries()).await.0, 200);

    // Join codes are 8 digits; wrong codes from many addresses together are capped, and one IPv6 /64 counts as one address.
    s.clock.fetch_add(60_000, Ordering::SeqCst);
    let (_, c) = post(&a, &s, "/api/devices/code", json!({})).await;
    assert!(c["code"].as_str().map(|x| x.len() == 8 && x.chars().all(|d| d.is_ascii_digit())).unwrap_or(false), "{}", c);
    let join = |code: &'static str, ip: String| {
        let s = &s;
        async move { device().post(format!("{}/api/join", s.base)).header("x-forwarded-for", ip).json(&json!({ "code": code })).send().await.unwrap().status().as_u16() }
    };
    for i in 0..10 {
        assert_eq!(join("00000000", format!("2001:db8:1:2::{:x}", i + 1)).await, 400);
    }
    assert_eq!(join("00000000", "2001:db8:1:2::ffff".into()).await, 429, "a new address in the same /64 is still locked out");
    for i in 0..60 {
        join("00000000", format!("10.0.{}.{}", i / 200, i % 200 + 1)).await;
    }
    assert_eq!(join("00000000", "10.9.9.9".into()).await, 429, "60 wrong codes a minute from anywhere: everyone waits");

    // A refused action keeps no payload, and one too big to be real is refused as an answer (so the tablet drops it).
    let junk = "x".repeat(60_000);
    let (st, r) = post(&a, &s, "/api/action", json!({ "type": "noSuchAction", "payload": { "junk": junk }, "opId": "junk-1" })).await;
    assert_eq!(st, 200, "{}", r);
    let kept: String = sqlx::query_scalar("SELECT payload FROM kitchen_actions WHERE op_id = 'junk-1'").fetch_one(&s.st.db).await.unwrap();
    assert_eq!(kept, "{}");
    let (st, r) = post(&a, &s, "/api/action", json!({ "type": "addMenuItem", "payload": { "name": "x".repeat(70_000) } })).await;
    assert_eq!((st, r["report"].clone()), (200, json!("badPatch")), "{}", r);

    // The live stream: a device reconnecting in a loop is told to wait.
    let mut last = 0;
    for _ in 0..21 {
        last = a.get(format!("{}/api/events", s.base)).send().await.unwrap().status().as_u16();
    }
    assert_eq!(last, 429);

    // The voice helper answers only joined devices (Caddy asks /api/voice-ok first).
    assert_eq!(get(&device(), &s, "/api/voice-ok").await.0, 401);
    assert_eq!(get(&a, &s, "/api/voice-ok").await.0, 200);

    // Page errors from a tablet are kept for staff, and show on the staff console with the latest backup.
    assert_eq!(post(&a, &s, "/api/client-error", json!({ "message": "TypeError: x is undefined", "detail": "0.2.0 abc\nboard.js:10" })).await.0, 200);
    sqlx::query("INSERT INTO backup_runs (at, kind, ok, size_bytes, offsite) VALUES ($1, 'backup', TRUE, 4096, TRUE)").bind(T0).execute(&s.st.db).await.unwrap();
    let secret = smokebox_server::support::add_staff(&s.st.db, "freddy@smokebox.example", "Freddy", "staff-pass-123", T0).await.unwrap();
    let staff = device();
    assert_eq!(get(&a, &s, "/staff/api/health").await.0, 401, "a kitchen device is not staff");
    let code = smokebox_server::totp::code_at(&secret, (s.clock.load(Ordering::SeqCst) / 30_000) as u64).unwrap();
    assert_eq!(post(&staff, &s, "/staff/api/login", json!({ "email": "freddy@smokebox.example", "password": "staff-pass-123", "code": code })).await.0, 200);
    let (st, h) = get(&staff, &s, "/staff/api/health").await;
    assert_eq!(st, 200, "{}", h);
    assert_eq!((h["errors24h"].clone(), h["recent"][0]["kitchen"].clone(), h["backup"]["size"].clone()), (json!(1), json!("Freddy's Franks"), json!(4096)), "{}", h);
    assert_eq!(h["restoreCheck"], Value::Null);
}
