//! Passwords, tokens, cookies and codes. Owner passwords are kept as Argon2id hashes. Device tokens, pairing codes and reset
//! links are kept only as SHA-256 hashes, so a copied database cannot be used to sign in or join a kitchen.

use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::Argon2;
use base64::Engine as _;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// The name of the cookie that keeps a device joined to its kitchen.
pub const COOKIE: &str = "sb_device";
/// How long a device stays joined without being used: a year (every use moves it out again).
pub const DEVICE_MS: i64 = 365 * 24 * 3600 * 1000;
/// How long an eight-digit join code works.
pub const CODE_MS: i64 = 10 * 60 * 1000;

/// Hashes an owner password with Argon2id and a fresh random salt.
pub fn hash_password(pw: &str) -> String {
    let mut salt = [0u8; 16];
    rand::rng().fill_bytes(&mut salt);
    let h: PasswordHash = Argon2::default().hash_password_with_salt(pw.as_bytes(), &salt).expect("argon2 hashing");
    h.to_string()
}

/// True when the password matches the stored hash. Anything malformed is a plain "no".
pub fn check_password(pw: &str, stored: &str) -> bool {
    match PasswordHash::new(stored) {
        Ok(h) => Argon2::default().verify_password(pw.as_bytes(), &h).is_ok(),
        Err(_) => false,
    }
}

/// The SHA-256 of a token or code, as hex. This is what the database keeps.
pub fn token_hash(t: &str) -> String {
    hex::encode(Sha256::digest(t.as_bytes()))
}

/// A new random token for a device cookie or a reset link (32 bytes, URL-safe text).
pub fn new_token() -> String {
    let mut b = [0u8; 32];
    rand::rng().fill_bytes(&mut b);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}

/// A new random id with a short readable prefix, like "k_3f9a…".
pub fn new_id(prefix: &str) -> String {
    let mut b = [0u8; 12];
    rand::rng().fill_bytes(&mut b);
    format!("{}_{}", prefix, hex::encode(b))
}

/// A new eight-digit join code, like "04821377". Every code is equally likely (100 million of them, so guessing one is hopeless
/// within the lockouts).
pub fn new_code() -> String {
    format!("{:08}", rand::rng().next_u32() % 100_000_000)
}

/// The Set-Cookie value that joins this device. `secure` is true behind HTTPS.
pub fn device_cookie(token: &str, secure: bool) -> String {
    format!("{}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{}", COOKIE, token, DEVICE_MS / 1000, if secure { "; Secure" } else { "" })
}

/// The Set-Cookie value that removes the device cookie.
pub fn clear_cookie(secure: bool) -> String {
    format!("{}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{}", COOKIE, if secure { "; Secure" } else { "" })
}

/// True for an email that looks complete (something@something.tld), within sensible lengths.
pub fn email_ok(e: &str) -> bool {
    let Some((user, host)) = e.split_once('@') else { return false };
    let Some((_, tld)) = host.rsplit_once('.') else { return false };
    !user.is_empty() && user.len() <= 64 && host.len() <= 190 && (2..=24).contains(&tld.len()) && !e.chars().any(char::is_whitespace) && !host.contains('@')
}
