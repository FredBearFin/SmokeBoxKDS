-- Customer support: requests from a kitchen's devices, the conversation with SmokeBox staff, and the staff who answer.

CREATE TABLE support_tickets (
  id            TEXT PRIMARY KEY,
  num           BIGSERIAL UNIQUE,                 -- the short number people say, like "request 12"
  kitchen_id    TEXT NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  device_id     TEXT REFERENCES devices(id) ON DELETE SET NULL,
  category      TEXT NOT NULL,                    -- broken, howto, billing, idea
  urgent        BOOLEAN NOT NULL,                 -- "Kitchen is stuck right now"
  status        TEXT NOT NULL DEFAULT 'open',     -- open, waiting (on the customer), solved
  subject       TEXT NOT NULL,
  diagnostics   TEXT,                             -- JSON the device attached (build, screen, recent errors), when allowed
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,
  client_id     TEXT,                             -- the device's own id for the request, so a resend after being offline is not a second request
  kitchen_seen  BIGINT NOT NULL DEFAULT 0         -- when the kitchen last read the conversation (for the "new reply" dot)
);
CREATE INDEX support_tickets_kitchen ON support_tickets (kitchen_id, updated_at DESC);
CREATE INDEX support_tickets_inbox ON support_tickets (status, urgent DESC, updated_at);
CREATE UNIQUE INDEX support_tickets_client ON support_tickets (kitchen_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE support_messages (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  from_staff    BOOLEAN NOT NULL,
  author        TEXT NOT NULL,                    -- the device name, or the staff member's name
  body          TEXT NOT NULL,
  photo         TEXT,                             -- an optional picture (data URL), at most about 1.5 MB
  internal      BOOLEAN NOT NULL DEFAULT FALSE,   -- a staff-only note, never shown to the kitchen
  created_at    BIGINT NOT NULL
);
CREATE INDEX support_messages_ticket ON support_messages (ticket_id, id);

-- SmokeBox's own support people. Separate from kitchens. Every sign-in needs the password and a 6-digit authenticator code.
CREATE TABLE staff_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  pass          TEXT NOT NULL,
  totp_secret   TEXT NOT NULL,                    -- base32
  created_at    BIGINT NOT NULL
);
CREATE TABLE staff_sessions (
  token_hash    TEXT PRIMARY KEY,
  staff_id      TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at    BIGINT NOT NULL
);
