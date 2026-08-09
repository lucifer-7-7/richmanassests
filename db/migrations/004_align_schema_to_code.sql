-- Migration 004: Align the production schema with what the Razorpay code actually reads/writes.
--
-- Context: migration 002 was authored but never applied. Verified against the live database:
--   * payment_orders is still the old Cashfree schema — no razorpay_order_id / razorpay_payment_id
--     / purpose column exists, so every insert from agentPaymentService has failed since the
--     Razorpay migration. The table has 0 rows, which confirms it.
--   * payments and refunds do not exist at all. Refunds are therefore impossible:
--     paymentService.initiateRefund looks up `payments` for a razorpay_payment_id and always
--     throws "No captured payment found".
--   * agents.status does not exist, so the account-state machine has been running off an
--     in-memory cache that empties on every restart.
-- Every one of those writes is swallowed by a surrounding try/catch, so the app looked healthy
-- while recording nothing.
--
-- Supersedes 002 (which is deleted in the same change). 003 is already applied.
--
-- ID types verified against production: agents.id = bigint, payment_orders.id = bigint,
-- agent_properties.id = text. (db/schema_razorpay.sql models these as UUID and is wrong.)

-- ── payment_orders: add the Razorpay columns, relax Cashfree-era NOT NULLs ─────────────────
-- property_id is null for any non-listing order; internal_order_id and idempotency_key were
-- Cashfree concepts with no Razorpay equivalent.
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id   TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS purpose             TEXT DEFAULT 'property_listing';

ALTER TABLE payment_orders ALTER COLUMN property_id       DROP NOT NULL;
ALTER TABLE payment_orders ALTER COLUMN internal_order_id DROP NOT NULL;
ALTER TABLE payment_orders ALTER COLUMN idempotency_key   DROP NOT NULL;

-- Primary lookup key for both the checkout-verify path and the webhook handler.
-- NULLs don't collide, so pre-existing Cashfree rows (if any) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payord_razorpay_order
  ON payment_orders(razorpay_order_id);

-- Reconciliation scans open orders by status + age.
CREATE INDEX IF NOT EXISTS idx_payord_status_created
  ON payment_orders(status, created_at);

-- ── payments: capture records, written by the webhook and the checkout-verify path ────────
CREATE TABLE IF NOT EXISTS payments (
  id                  BIGSERIAL PRIMARY KEY,
  payment_order_id    BIGINT REFERENCES payment_orders(id),
  razorpay_payment_id TEXT UNIQUE,
  -- Joined on by paymentService.getAllOrders/getAgentOrders. Migration 002 omitted this
  -- column even though the code has always queried it.
  razorpay_order_id   TEXT,
  agent_id            BIGINT REFERENCES agents(id),
  property_id         TEXT,
  status              TEXT NOT NULL DEFAULT 'authorized'
                      CHECK (status IN ('authorized','captured','failed','refunded')),
  method              TEXT,
  amount_paise        INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'INR',
  error_code          TEXT,
  error_description   TEXT,
  raw_payload         JSONB,
  captured_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order       ON payments(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_agent       ON payments(agent_id);
CREATE INDEX IF NOT EXISTS idx_payments_rzp_order   ON payments(razorpay_order_id);

-- ── refunds: written by the admin refund action, updated by the refund.processed webhook ──
CREATE TABLE IF NOT EXISTS refunds (
  id                 BIGSERIAL PRIMARY KEY,
  payment_id         BIGINT REFERENCES payments(id) ON DELETE CASCADE,
  razorpay_refund_id TEXT UNIQUE NOT NULL,
  amount_paise       INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processed','failed')),
  reason             TEXT,
  initiated_by       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);

-- ── agents.status: the account state machine, previously in-memory only ───────────────────
-- Defaults to 'active' because onboarding is free — the ₹999 fee is charged per listing at
-- publish time, not for the account. There is deliberately no plan_id / activated_at /
-- expires_at: the paid-membership model is removed in this same change.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Existing accounts predate the column and were never gated in a durable way.
UPDATE agents SET status = 'active' WHERE status IS NULL OR status = '';

-- ── settings: exists in production but was never in version control ───────────────────────
-- Declared here so the repo and the database stop drifting. Backs the promo banner,
-- dummy-data toggle, and hero picker (lib/settings.js).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS: match the existing tables. All app access uses the service key, which bypasses
--    RLS; enabling it with no policies denies anon/authenticated clients by default. ───────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds  ENABLE ROW LEVEL SECURITY;
