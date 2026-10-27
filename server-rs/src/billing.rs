//! Billing through Stripe. Card details never touch SmokeBox: the owner adds a card on Stripe's own Checkout page and changes or
//! cancels it on Stripe's own customer portal; Stripe tells this server what happened through signed webhooks.
//!
//! The rules (from the owner of SmokeBox): 3 free weeks with a card at sign-up, the first charge at the start of week 4; a failed
//! payment (or no card yet, or a cancelled plan) gives 3 days with a countdown on every screen; after that, new orders stop at the
//! next 4 am, so a kitchen is never cut off in the middle of service. Finishing open tickets, reports and exports always work.
//! With no Stripe keys set, billing is off and every kitchen is free (development and the test server).

use hmac::{Hmac, KeyInit, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::{PgPool, Row};

/// The free trial, in days.
pub const TRIAL_DAYS: i64 = 21;
/// The countdown before new orders stop, in milliseconds (3 days).
pub const GRACE_MS: i64 = 72 * 3600 * 1000;
/// The hour of the day (server time) when a pause can begin: between service days.
pub const PAUSE_HOUR: u32 = 4;
// How old a webhook may be before it is refused (a replayed old message), in seconds.
const TOLERANCE_S: i64 = 300;

/// Stripe settings. Billing is on only when all three are set.
#[derive(Clone, Default)]
pub struct Stripe {
    pub secret_key: String,
    pub webhook_secret: String,
    pub price_id: String,
    /// Stripe's address; tests point it at a fake Stripe.
    pub api_base: String,
}

impl Stripe {
    /// Reads the settings from STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID (and STRIPE_API_BASE for tests).
    pub fn from_env() -> Stripe {
        let v = |k: &str| std::env::var(k).unwrap_or_default();
        Stripe { secret_key: v("STRIPE_SECRET_KEY"), webhook_secret: v("STRIPE_WEBHOOK_SECRET"), price_id: v("STRIPE_PRICE_ID"), api_base: std::env::var("STRIPE_API_BASE").unwrap_or_else(|_| "https://api.stripe.com".into()) }
    }
    /// True when billing is switched on.
    pub fn on(&self) -> bool {
        !self.secret_key.is_empty() && !self.webhook_secret.is_empty() && !self.price_id.is_empty()
    }

    // Calls one Stripe API endpoint with form fields and returns the JSON answer.
    async fn post(&self, path: &str, form: &[(&str, String)]) -> Result<Value, String> {
        let r = reqwest::Client::new()
            .post(format!("{}{}", self.api_base.trim_end_matches('/'), path))
            .basic_auth(&self.secret_key, Some(""))
            .form(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let ok = r.status().is_success();
        let v: Value = r.json().await.map_err(|e| e.to_string())?;
        if ok { Ok(v) } else { Err(v["error"]["message"].as_str().unwrap_or("Stripe refused the request").to_string()) }
    }

    /// A Stripe Checkout page where the owner adds a card and starts the 3 free weeks. Returns its address.
    pub async fn checkout(&self, kitchen_id: &str, email: &str, base: &str) -> Result<String, String> {
        let base = base.trim_end_matches('/');
        let v = self
            .post("/v1/checkout/sessions", &[
                ("mode", "subscription".into()),
                ("line_items[0][price]", self.price_id.clone()),
                ("line_items[0][quantity]", "1".into()),
                ("subscription_data[trial_period_days]", TRIAL_DAYS.to_string()),
                ("payment_method_collection", "always".into()),
                ("client_reference_id", kitchen_id.to_string()),
                ("customer_email", email.to_string()),
                ("success_url", format!("{}/?billing=done", base)),
                ("cancel_url", format!("{}/?billing=later", base)),
            ])
            .await?;
        v["url"].as_str().map(String::from).ok_or_else(|| "Stripe gave no page".to_string())
    }

    /// Stripe's customer portal, where the owner changes the card, sees receipts or cancels. Returns its address.
    pub async fn portal(&self, customer: &str, base: &str) -> Result<String, String> {
        let v = self.post("/v1/billing_portal/sessions", &[("customer", customer.to_string()), ("return_url", format!("{}/", base.trim_end_matches('/')))]).await?;
        v["url"].as_str().map(String::from).ok_or_else(|| "Stripe gave no page".to_string())
    }

    /// Checks a webhook's Stripe-Signature header ("t=TIME,v1=HEX,...") against the raw body, and that it is recent.
    pub fn verify(&self, header: &str, body: &[u8], now_s: i64) -> bool {
        let mut t: Option<i64> = None;
        let mut sigs: Vec<Vec<u8>> = Vec::new();
        for part in header.split(',') {
            match part.trim().split_once('=') {
                Some(("t", v)) => t = v.parse().ok(),
                Some(("v1", v)) => {
                    if let Ok(b) = hex::decode(v) {
                        sigs.push(b)
                    }
                }
                _ => {}
            }
        }
        let Some(t) = t else { return false };
        if (now_s - t).abs() > TOLERANCE_S {
            return false;
        }
        sigs.iter().any(|s| {
            let Ok(mut mac) = <Hmac<Sha256> as KeyInit>::new_from_slice(self.webhook_secret.as_bytes()) else { return false };
            mac.update(t.to_string().as_bytes());
            mac.update(b".");
            mac.update(body);
            mac.verify_slice(s).is_ok()
        })
    }
}

/// Signs a webhook body the way Stripe does (tests and the fake Stripe use it).
pub fn sign(secret: &str, t: i64, body: &[u8]) -> String {
    let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(secret.as_bytes()).expect("any key");
    mac.update(t.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    format!("t={},v1={}", t, hex::encode(mac.finalize().into_bytes()))
}

/// The first 4 am (server time) at or after `ms`: when a pause may begin, between two service days.
pub fn next_pause_at(ms: i64) -> i64 {
    use chrono::{Local, TimeZone};
    let Some(t) = Local.timestamp_millis_opt(ms).single() else { return ms };
    // 4 am on a given day, in server time (the earliest one if a clock change makes it twice).
    let four = |d: chrono::NaiveDate| d.and_hms_opt(PAUSE_HOUR, 0, 0).and_then(|x| Local.from_local_datetime(&x).earliest()).map(|x| x.timestamp_millis());
    let today = t.date_naive();
    match four(today) {
        Some(at) if at >= ms => at,
        _ => today.succ_opt().and_then(four).unwrap_or(ms),
    }
}

/// A kitchen's billing as the screens see it.
pub struct State {
    /// off (billing switched off), setup (no card yet), trialing, active, past_due, canceled.
    pub status: String,
    pub trial_ends_at: Option<i64>,
    pub paid_through: Option<i64>,
    /// When the 3-day countdown ends, if one is running.
    pub grace_ends_at: Option<i64>,
    /// When new orders stop (the first 4 am after the countdown), if one is running.
    pub pause_at: Option<i64>,
    /// True once new orders have stopped.
    pub paused: bool,
    pub has_card: bool,
}

impl State {
    /// The billing as JSON for /api/me and the Billing screen.
    pub fn json(&self) -> Value {
        json!({ "status": self.status, "trialEndsAt": self.trial_ends_at, "paidThrough": self.paid_through, "graceEndsAt": self.grace_ends_at, "pauseAt": self.pause_at, "paused": self.paused, "hasCard": self.has_card })
    }
}

/// A kitchen's billing state now. A kitchen with no card yet gets its 3 days from the moment it was started.
pub async fn state(db: &PgPool, stripe: &Stripe, kitchen_id: &str, now: i64) -> State {
    let off = State { status: "off".into(), trial_ends_at: None, paid_through: None, grace_ends_at: None, pause_at: None, paused: false, has_card: false };
    if !stripe.on() {
        return off;
    }
    let row = sqlx::query("SELECT created_at, billing_status, trial_ends_at, paid_through, grace_ends_at, stripe_customer FROM kitchens WHERE id = $1")
        .bind(kitchen_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten();
    let Some(r) = row else { return off };
    let status: String = r.get("billing_status");
    let created: i64 = r.get("created_at");
    let mut grace: Option<i64> = r.get("grace_ends_at");
    if status == "setup" && grace.is_none() {
        grace = Some(created + GRACE_MS);
    }
    let counting = matches!(status.as_str(), "setup" | "past_due" | "canceled");
    let grace = if counting { grace } else { None };
    let pause_at = grace.map(next_pause_at);
    State {
        paused: pause_at.map(|p| now >= p).unwrap_or(false),
        status,
        trial_ends_at: r.get("trial_ends_at"),
        paid_through: r.get("paid_through"),
        grace_ends_at: grace,
        pause_at,
        has_card: r.get::<Option<String>, _>("stripe_customer").is_some(),
    }
}

// Seconds or milliseconds from a Stripe time (Stripe sends whole seconds).
fn ms(v: &Value) -> Option<i64> {
    v.as_i64().map(|s| s * 1000)
}

/// Handles one verified Stripe event. Returns false when it was already handled (Stripe repeats deliveries).
pub async fn handle(db: &PgPool, ev: &Value, now: i64) -> Result<bool, String> {
    let id = ev["id"].as_str().ok_or("no event id")?;
    let kind = ev["type"].as_str().unwrap_or("");
    let fresh = sqlx::query("INSERT INTO stripe_events (id, type, received_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING")
        .bind(id)
        .bind(kind)
        .bind(now)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected()
        == 1;
    if !fresh {
        return Ok(false);
    }
    let o = &ev["data"]["object"];
    let q = |sql: &'static str| sqlx::query(sql);
    match kind {
        // The owner finished Checkout: the kitchen now has a card and a subscription in its 3 free weeks.
        "checkout.session.completed" => {
            let kitchen = o["client_reference_id"].as_str().unwrap_or("");
            q("UPDATE kitchens SET stripe_customer = $1, stripe_subscription = $2, billing_status = 'trialing', trial_ends_at = COALESCE(trial_ends_at, $3), grace_ends_at = NULL WHERE id = $4")
                .bind(o["customer"].as_str())
                .bind(o["subscription"].as_str())
                .bind(now + TRIAL_DAYS * 24 * 3600 * 1000)
                .bind(kitchen)
                .execute(db)
                .await
                .map_err(|e| e.to_string())?;
        }
        // The subscription changed (trial, paid, unpaid, cancelled): its status and dates are copied.
        "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted" => {
            let st = match o["status"].as_str().unwrap_or("") {
                "trialing" => "trialing",
                "active" => "active",
                "past_due" | "unpaid" | "incomplete" => "past_due",
                _ => "canceled",
            };
            let st = if kind.ends_with("deleted") { "canceled" } else { st };
            let fine = st == "trialing" || st == "active";
            q("UPDATE kitchens SET stripe_subscription = $1, billing_status = $2, trial_ends_at = COALESCE($3, trial_ends_at), paid_through = COALESCE($4, paid_through),
                 grace_ends_at = CASE WHEN $5 THEN NULL ELSE COALESCE(grace_ends_at, $6) END WHERE stripe_customer = $7")
                .bind(o["id"].as_str())
                .bind(st)
                .bind(ms(&o["trial_end"]))
                .bind(ms(&o["current_period_end"]))
                .bind(fine)
                .bind(now + GRACE_MS)
                .bind(o["customer"].as_str())
                .execute(db)
                .await
                .map_err(|e| e.to_string())?;
        }
        // A payment went through: the countdown stops and new orders work again at once.
        "invoice.paid" => {
            q("UPDATE kitchens SET billing_status = 'active', grace_ends_at = NULL, paid_through = COALESCE($1, paid_through) WHERE stripe_customer = $2")
                .bind(ms(&o["lines"]["data"][0]["period"]["end"]))
                .bind(o["customer"].as_str())
                .execute(db)
                .await
                .map_err(|e| e.to_string())?;
        }
        // A payment failed: the 3-day countdown starts (once; Stripe's retries do not restart it).
        "invoice.payment_failed" => {
            q("UPDATE kitchens SET billing_status = 'past_due', grace_ends_at = COALESCE(grace_ends_at, $1) WHERE stripe_customer = $2")
                .bind(now + GRACE_MS)
                .bind(o["customer"].as_str())
                .execute(db)
                .await
                .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signatures_check_the_body_the_secret_and_the_time() {
        let s = Stripe { secret_key: "sk".into(), webhook_secret: "whsec_test".into(), price_id: "price".into(), api_base: String::new() };
        let body = br#"{"id":"evt_1"}"#;
        let h = sign("whsec_test", 1000, body);
        assert!(s.verify(&h, body, 1000));
        assert!(s.verify(&h, body, 1200), "within 5 minutes");
        assert!(!s.verify(&h, body, 1400), "too old");
        assert!(!s.verify(&h, br#"{"id":"evt_2"}"#, 1000), "another body");
        assert!(!s.verify(&sign("other", 1000, body), body, 1000), "another secret");
        assert!(!s.verify("garbage", body, 1000));
    }
    #[test]
    fn a_pause_starts_at_the_next_4_am() {
        use chrono::{Local, TimeZone};
        let at = |d: u32, h: u32, m: u32| Local.with_ymd_and_hms(2026, 11, d, h, m, 0).earliest().unwrap().timestamp_millis();
        assert_eq!(next_pause_at(at(3, 19, 30)), at(4, 4, 0), "evening: the next morning at 4");
        assert_eq!(next_pause_at(at(3, 2, 0)), at(3, 4, 0), "after midnight: the same morning at 4");
        assert_eq!(next_pause_at(at(3, 4, 0)), at(3, 4, 0), "exactly 4 am");
        assert_eq!(next_pause_at(at(3, 4, 1)), at(4, 4, 0));
    }
}
