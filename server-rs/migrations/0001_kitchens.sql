-- Kitchens, the owner who pays, the devices joined to each kitchen, and every kitchen action in one order.
-- Staff never have accounts: cooks use whichever device is joined to the kitchen.

CREATE TABLE kitchens (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'trial',
  created_at    BIGINT NOT NULL,
  seq           BIGINT NOT NULL DEFAULT 0,      -- the change counter the screens see
  snapshot      TEXT,                            -- the saved kitchen at action number snapshot_n
  snapshot_n    BIGINT NOT NULL DEFAULT 0,
  snapshot_at   BIGINT
);

-- One owner login per kitchen (a second owner email can be added later). Email is stored lower case.
CREATE TABLE owners (
  id            TEXT PRIMARY KEY,
  kitchen_id    TEXT NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  pass          TEXT NOT NULL,                   -- Argon2id hash
  email_ok      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    BIGINT NOT NULL
);

-- A tablet, phone or computer joined to a kitchen. It stays joined until removed. The session token is stored only as a hash.
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  kitchen_id    TEXT NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  joined_by     TEXT NOT NULL,                   -- 'start', 'code' or 'owner'
  created_at    BIGINT NOT NULL,
  last_seen     BIGINT NOT NULL,
  removed_at    BIGINT
);
CREATE INDEX devices_kitchen ON devices (kitchen_id);

-- Six-digit codes that join a new device. One use, ten minutes. Only a hash of the code is kept.
CREATE TABLE pair_codes (
  code_hash     TEXT PRIMARY KEY,
  kitchen_id    TEXT NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  made_by       TEXT REFERENCES devices(id) ON DELETE SET NULL,
  expires_at    BIGINT NOT NULL,
  used_at       BIGINT
);

-- Every action a screen sent, stored before anyone is told "ok". n is the kitchen's own action number.
CREATE TABLE kitchen_actions (
  kitchen_id    TEXT NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  n             BIGINT NOT NULL,
  seq           BIGINT NOT NULL,
  op_id         TEXT,
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL,
  at            BIGINT NOT NULL,
  device_id     TEXT,
  applied       BOOLEAN NOT NULL,
  reply         TEXT NOT NULL,
  PRIMARY KEY (kitchen_id, n)
);
CREATE UNIQUE INDEX kitchen_actions_op ON kitchen_actions (kitchen_id, op_id) WHERE op_id IS NOT NULL;

-- Password reset links for owners. One use, one hour. Only a hash of the token is kept.
CREATE TABLE reset_tokens (
  token_hash    TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  expires_at    BIGINT NOT NULL,
  used_at       BIGINT
);

-- Failed sign-ins and code tries, per email or per address, for lockouts.
CREATE TABLE login_fails (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL,
  first_at      BIGINT NOT NULL
);

-- Emails the server sends (password resets, support replies). Kept so a sender outage loses nothing and tests can read them.
CREATE TABLE outbox_emails (
  id            BIGSERIAL PRIMARY KEY,
  to_addr       TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at    BIGINT NOT NULL,
  sent_at       BIGINT
);
