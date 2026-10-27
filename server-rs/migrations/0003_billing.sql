-- Billing through Stripe: each kitchen's subscription state. With no Stripe keys set the server ignores all of it (billing off).

ALTER TABLE kitchens ADD COLUMN stripe_customer     TEXT;
ALTER TABLE kitchens ADD COLUMN stripe_subscription TEXT;
ALTER TABLE kitchens ADD COLUMN billing_status      TEXT NOT NULL DEFAULT 'setup';  -- setup (no card yet), trialing, active, past_due, canceled
ALTER TABLE kitchens ADD COLUMN trial_ends_at       BIGINT;
ALTER TABLE kitchens ADD COLUMN paid_through        BIGINT;
ALTER TABLE kitchens ADD COLUMN grace_ends_at       BIGINT;                         -- when set and passed, new orders stop at the next 4 am
CREATE INDEX kitchens_stripe_customer ON kitchens (stripe_customer);

-- Every Stripe event handled, so a delivery Stripe repeats is handled only once.
CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  received_at BIGINT NOT NULL
);
