//! Six-digit authenticator codes (RFC 6238, the kind Google Authenticator and 1Password show): a code from a shared secret and
//! the time, changing every 30 seconds. Staff sign-in needs one, so a stolen staff password alone opens nothing.

use hmac::{Hmac, KeyInit, Mac};
use rand::RngCore;
use sha1::Sha1;

const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// A new random secret, as base32 text to type or scan into an authenticator app.
pub fn new_secret() -> String {
    let mut b = [0u8; 20];
    rand::rng().fill_bytes(&mut b);
    base32(&b)
}

/// The link an authenticator app scans (as a QR code) to add the secret.
pub fn uri(secret: &str, email: &str) -> String {
    format!("otpauth://totp/SmokeBox%20staff:{}?secret={}&issuer=SmokeBox", email.replace('@', "%40"), secret)
}

// Encodes bytes as base32 (no padding).
fn base32(b: &[u8]) -> String {
    let (mut out, mut buf, mut bits) = (String::new(), 0u32, 0u32);
    for &x in b {
        buf = (buf << 8) | x as u32;
        bits += 8;
        while bits >= 5 {
            out.push(ALPHABET[((buf >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((buf << (5 - bits)) & 31) as usize] as char);
    }
    out
}

// Decodes base32 text (spaces and case ignored). None for anything that is not base32.
fn unbase32(s: &str) -> Option<Vec<u8>> {
    let (mut out, mut buf, mut bits) = (Vec::new(), 0u32, 0u32);
    for c in s.chars().filter(|c| !c.is_whitespace() && *c != '=') {
        let v = ALPHABET.iter().position(|&a| a as char == c.to_ascii_uppercase())? as u32;
        buf = (buf << 5) | v;
        bits += 5;
        if bits >= 8 {
            out.push((buf >> (bits - 8)) as u8);
            bits -= 8;
        }
    }
    Some(out)
}

/// The code for a secret at a time step (time in ms / 30 s).
pub fn code_at(secret: &str, step: u64) -> Option<String> {
    let key = unbase32(secret)?;
    let mut mac = <Hmac<Sha1> as KeyInit>::new_from_slice(&key).ok()?;
    mac.update(&step.to_be_bytes());
    let h = mac.finalize().into_bytes();
    let off = (h[h.len() - 1] & 0x0f) as usize;
    let n = ((h[off] as u32 & 0x7f) << 24) | ((h[off + 1] as u32) << 16) | ((h[off + 2] as u32) << 8) | h[off + 3] as u32;
    Some(format!("{:06}", n % 1_000_000))
}

/// True when the code matches the secret now, or 30 seconds either side (clocks drift a little).
pub fn check(secret: &str, code: &str, now_ms: i64) -> bool {
    let code: String = code.chars().filter(char::is_ascii_digit).collect();
    if code.len() != 6 || now_ms < 0 {
        return false;
    }
    let step = (now_ms / 30_000) as u64;
    [step.saturating_sub(1), step, step + 1].iter().any(|s| code_at(secret, *s).as_deref() == Some(code.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;
    // The RFC 6238 test vector: secret "12345678901234567890" at 59 s gives 287082 (the last 6 digits of 94287082).
    #[test]
    fn matches_the_published_test_vector() {
        let secret = base32(b"12345678901234567890");
        assert_eq!(code_at(&secret, 59 / 30).unwrap(), "287082");
        assert!(check(&secret, "287 082", 59_000));
        assert!(!check(&secret, "287083", 59_000));
        assert_eq!(unbase32(&secret).unwrap(), b"12345678901234567890");
    }
}
