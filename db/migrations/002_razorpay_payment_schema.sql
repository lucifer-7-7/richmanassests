-- Migration: Fix payment_orders schema for Razorpay + create missing payments/webhook_events tables
-- Context: payment_orders was left over from the old Cashfree integration.
-- Razorpay code (services/agentPaymentService.js) has been silently failing every
-- insert/lookup against this table since the migration to Razorpay, because the
-- columns it reads/writes (razorpay_order_id, razorpay_payment_id, purpose) never
-- existed, and property_id/internal_order_id/idempotency_key were NOT NULL with
-- no way for agent-membership orders (which have no property) to satisfy them.
-- The `payments` and `webhook_events` tables referenced by the same code never
-- existed at all. Run this once in the Supabase SQL Editor.

-- ── payment_orders: add Razorpay columns, relax constraints that don't apply
--    to agent-membership orders (which have no property) ─────────────────────
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id   TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS purpose             TEXT DEFAULT 'property_listing',
  ADD COLUMN IF NOT EXISTS plan_id             TEXT;

ALTER TABLE payment_orders ALTER COLUMN property_id       DROP NOT NULL;
ALTER TABLE payment_orders ALTER COLUMN internal_order_id DROP NOT NULL;
ALTER TABLE payment_orders ALTER COLUMN idempotency_key   DROP NOT NULL;

-- Lookups/idempotency keyed on razorpay_order_id (NULLs don't collide, so this
-- is safe even though old Cashfree rows, if any exist, have no value here)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payord_razorpay_order
  ON payment_orders(razorpay_order_id);

-- ── payments: actual charge/capture records (created by client-side verify
--    and by the webhook handler) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  BIGSERIAL PRIMARY KEY,
  payment_order_id    BIGINT REFERENCES payment_orders(id),
  razorpay_payment_id TEXT UNIQUE,
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
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_agent ON payments(agent_id);

-- ── webhook_events: idempotency ledger so a Razorpay webhook is never
--    processed twice, and idempotency survives server restarts/cold starts
--    (the in-memory Set in code does not) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id                  BIGSERIAL PRIMARY KEY,
  razorpay_event_id   TEXT NOT NULL UNIQUE,
  event_type          TEXT,
  payload             JSONB,
  processed           BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at        TIMESTAMPTZ,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
