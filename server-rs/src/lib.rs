//! WHAT THIS CRATE IS: the SmokeBox hosted server. Kitchens, the devices joined to them, live sync of every kitchen action,
//! and customer support. It runs the same kitchen engine as the tablets (see `kitchen`), so every device and the server agree.

pub mod app;
pub mod auth;
pub mod engine;
pub mod kitchen;
pub mod pages;
pub mod rooms;
pub mod support;
pub mod totp;
