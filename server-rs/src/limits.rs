//! Rate limits kept in memory: each key (an address, a device) has a bucket of tries that refills at a steady rate. A burst up to
//! the bucket size goes through; after that the request is refused with how long to wait. A restart empties every bucket, which is
//! fine: the limits are against floods and guessing, and wrong passwords and codes are also counted in the database (login_fails).

use std::collections::HashMap;
use std::sync::Mutex;

/// How fast one kind of request may come: `burst` at once, then one more every `every_ms`.
#[derive(Clone, Copy)]
pub struct Rule {
    pub burst: f64,
    pub every_ms: f64,
}

/// Starting a kitchen: 5 from one address, then one more an hour.
pub const START: Rule = Rule { burst: 5.0, every_ms: 3600e3 / 5.0 };
/// Kitchen actions from one device: a reconnecting tablet may send a few hundred queued taps at once, then 20 a second.
pub const ACTION: Rule = Rule { burst: 300.0, every_ms: 50.0 };
/// Join codes made on one device: 10, then one a minute.
pub const CODE: Rule = Rule { burst: 10.0, every_ms: 60e3 };
/// Spoken lines from the server voice for one device: 60, then one a second.
pub const VOICE: Rule = Rule { burst: 60.0, every_ms: 1000.0 };
/// Wrong join codes from everywhere together: 60 a minute. A real kitchen almost never types a wrong code; a guesser spread over
/// many addresses is stopped here.
pub const JOIN_FAILS_ALL: Rule = Rule { burst: 60.0, every_ms: 1000.0 };
/// Live-stream connections from one device: 20, then one every 3 seconds (a tablet reconnects after a drop, not in a loop).
pub const STREAM: Rule = Rule { burst: 20.0, every_ms: 3000.0 };
/// Support messages and page-error reports from one device: 20, then one a minute.
pub const REPORT: Rule = Rule { burst: 20.0, every_ms: 60e3 };

/// The table of buckets, shared by every request.
#[derive(Default)]
pub struct Limits {
    buckets: Mutex<HashMap<String, (f64, i64, Rule)>>,
}

impl Limits {
    /// Like `take`, but only looks: Ok when a try would be allowed now, without using it up.
    pub fn peek(&self, key: &str, rule: Rule, now: i64) -> Result<(), i64> {
        let map = self.buckets.lock().unwrap_or_else(|e| e.into_inner());
        let (tokens, at, _) = map.get(key).copied().unwrap_or((rule.burst, now, rule));
        let tokens = (tokens + (now - at).max(0) as f64 / rule.every_ms).min(rule.burst);
        if tokens >= 1.0 { Ok(()) } else { Err(((1.0 - tokens) * rule.every_ms).ceil() as i64) }
    }

    /// Takes one try for `key` at time `now` (ms). Ok when allowed, else how many ms until the next try is allowed.
    pub fn take(&self, key: &str, rule: Rule, now: i64) -> Result<(), i64> {
        let mut map = self.buckets.lock().unwrap_or_else(|e| e.into_inner());
        // A big table drops its full buckets (keys not seen lately, each judged by its own rule), so it cannot grow without end.
        if map.len() > 50_000 {
            map.retain(|_, (tokens, at, r)| *tokens + (now - *at) as f64 / r.every_ms < r.burst);
        }
        let (tokens, at, _) = map.get(key).copied().unwrap_or((rule.burst, now, rule));
        let tokens = (tokens + (now - at).max(0) as f64 / rule.every_ms).min(rule.burst);
        if tokens >= 1.0 {
            map.insert(key.to_string(), (tokens - 1.0, now, rule));
            Ok(())
        } else {
            map.insert(key.to_string(), (tokens, now, rule));
            Err(((1.0 - tokens) * rule.every_ms).ceil() as i64)
        }
    }
}

/// Plain words for a wait, like "2 minutes" or "1 hour".
pub fn wait_words(ms: i64) -> String {
    let m = ((ms as f64) / 60e3).ceil().max(1.0) as i64;
    if m >= 60 {
        let h = (m + 59) / 60;
        format!("{} {}", h, if h == 1 { "hour" } else { "hours" })
    } else {
        format!("{} {}", m, if m == 1 { "minute" } else { "minutes" })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_burst_goes_through_then_it_waits_and_refills() {
        let l = Limits::default();
        let r = Rule { burst: 3.0, every_ms: 1000.0 };
        assert!((0..3).all(|_| l.take("a", r, 0).is_ok()));
        assert_eq!(l.take("a", r, 0), Err(1000));
        assert!(l.take("b", r, 0).is_ok(), "another key has its own bucket");
        assert_eq!(l.take("a", r, 400), Err(600));
        assert!(l.take("a", r, 1000).is_ok(), "one try back after a second");
        assert!(l.take("a", r, 1000).is_err());
    }
    #[test]
    fn waits_are_said_in_minutes_or_hours() {
        assert_eq!(wait_words(1), "1 minute");
        assert_eq!(wait_words(150e3 as i64), "3 minutes");
        assert_eq!(wait_words(720e3 as i64 * 5), "1 hour");
        assert_eq!(wait_words(7200e3 as i64 + 1), "3 hours");
    }
}
