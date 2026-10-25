//! The server program. Settings come from the environment:
//! DATABASE_URL (Postgres), PORT (default 8790), HOST (default 127.0.0.1), SMOKEBOX_HTML (the app page, default
//! ../dist/smokebox.html), PUBLIC_URL (the address in email links), SMOKEBOX_TZ (the kitchen time zone).

use smokebox_server::app;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    // The engine's service day (4 am rollover) uses local time, so the time zone is set before anything runs.
    if let Ok(tz) = std::env::var("SMOKEBOX_TZ") {
        std::env::set_var("TZ", tz);
    }
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL is needed, like postgres://smokebox:pw@127.0.0.1/smokebox");
    let db = sqlx::postgres::PgPoolOptions::new().max_connections(10).connect(&url).await.expect("the database answers");
    // smokebox-server owner-reset EMAIL: prints a one-hour link that sets a new owner password (no email needed while there is no mail sender).
    let args0: Vec<String> = std::env::args().collect();
    if args0.get(1).map(String::as_str) == Some("owner-reset") {
        let Some(email) = args0.get(2) else { eprintln!("usage: smokebox-server owner-reset EMAIL"); std::process::exit(2) };
        sqlx::migrate!("./migrations").run(&db).await.expect("migrations");
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
        let owner: Option<String> = sqlx::query_scalar("SELECT id FROM owners WHERE email = $1").bind(email.to_lowercase()).fetch_optional(&db).await.expect("database");
        let Some(owner) = owner else { eprintln!("No kitchen has the owner email {}", email); std::process::exit(1) };
        let token = smokebox_server::auth::new_token();
        sqlx::query("INSERT INTO reset_tokens (token_hash, owner_id, expires_at) VALUES ($1,$2,$3)").bind(smokebox_server::auth::token_hash(&token)).bind(&owner).bind(now + 3600 * 1000).execute(&db).await.expect("database");
        let base = std::env::var("PUBLIC_URL").unwrap_or_else(|_| "http://127.0.0.1:8790".into());
        println!("Open this within one hour to set a new password:\n{}/reset?t={}", base.trim_end_matches('/'), token);
        return;
    }
    // smokebox-server staff-add EMAIL "NAME": adds a support staff member and prints their password and authenticator secret once.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("staff-add") {
        let (Some(email), Some(name)) = (args.get(2), args.get(3)) else { eprintln!("usage: smokebox-server staff-add EMAIL \"NAME\""); std::process::exit(2) };
        sqlx::migrate!("./migrations").run(&db).await.expect("migrations");
        let password = smokebox_server::auth::new_token()[..16].to_string();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
        match smokebox_server::support::add_staff(&db, email, name, &password, now).await {
            Ok(secret) => println!("Staff added: {}
Password: {}
Authenticator secret: {}
Or scan: {}", email, password, secret, smokebox_server::totp::uri(&secret, email)),
            Err(e) => { eprintln!("Not added: {}", e); std::process::exit(1) }
        }
        return;
    }
    let cfg = app::Config {
        html_file: std::env::var("SMOKEBOX_HTML").unwrap_or_else(|_| "../dist/smokebox.html".into()).into(),
        public_url: std::env::var("PUBLIC_URL").unwrap_or_else(|_| "http://127.0.0.1:8790".into()),
        snapshot_every: 200,
        staff_alert: std::env::var("STAFF_ALERT_EMAIL").ok(),
    };
    let clock: Arc<dyn Fn() -> i64 + Send + Sync> = Arc::new(|| std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0));
    let (router, st) = app::build(db, cfg, clock).await.expect("the server starts");
    app::spawn_timers(&st);
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8790u16);
    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await.expect("the port is free");
    println!("[server] Smokebox on http://{}:{}", host, port);
    let rooms = st.rooms.clone();
    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let _ = tokio::signal::ctrl_c().await;
            // Every open kitchen is saved before the server stops.
            rooms.save_all().await;
        })
        .await
        .expect("the server runs");
}
