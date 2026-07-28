-- ============================================================
-- RichManAssets — Razorpay & Agent System Supabase Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Agent Plans
CREATE TABLE IF NOT EXISTS agent_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  amount_paise  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR',
  validity_days INTEGER NULL, -- null = lifetime / 365 default
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plans if table is empty
INSERT INTO agent_plans (id, name, amount_paise, currency, validity_days, is_active)
SELECT 'a0000000-0000-0000-0000-000000000001'::uuid, 'Annual Agent Membership', 199900, 'INR', 365, true
WHERE NOT EXISTS (SELECT 1 FROM agent_plans WHERE id = 'a0000000-0000-0000-0000-000000000001'::uuid);

INSERT INTO agent_plans (id, name, amount_paise, currency, validity_days, is_active)
SELECT 'a0000000-0000-0000-0000-000000000002'::uuid, 'Quarterly Agent Membership', 59900, 'INR', 90, true
WHERE NOT EXISTS (SELECT 1 FROM agent_plans WHERE id = 'a0000000-0000-0000-0000-000000000002'::uuid);

-- 2. Agents (Update schema with status enum string & plan tracking)
CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rera_number   TEXT,
  company_name  TEXT,
  gst_number    TEXT,
  city          TEXT DEFAULT 'Udupi',
  kyc_status    TEXT NOT NULL DEFAULT 'not_submitted' CHECK(kyc_status IN ('not_submitted','pending','verified','rejected')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_payment','active','payment_failed','suspended','expired','deactivated')),
  plan_id       UUID REFERENCES agent_plans(id) ON DELETE SET NULL,
  activated_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  sessions_revoked_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2b. Agent Sign-In & Device Activity Logs
CREATE TABLE IF NOT EXISTS agent_login_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  ip_address  TEXT,
  user_agent  TEXT,
  device_type TEXT, -- e.g. Desktop / Mobile / Tablet
  status      TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','failed','revoked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_login_logs_agent ON agent_login_logs(agent_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
CREATE INDEX IF NOT EXISTS idx_agents_phone ON agents(phone);

-- 3. Payment Orders (one per checkout attempt window mapped to Razorpay Order)
CREATE TABLE IF NOT EXISTS payment_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  plan_id             UUID NOT NULL REFERENCES agent_plans(id) ON DELETE RESTRICT,
  razorpay_order_id   TEXT UNIQUE NOT NULL,
  amount_paise        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  purpose             TEXT NOT NULL DEFAULT 'signup' CHECK(purpose IN ('signup','renewal','upgrade')),
  status              TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','attempted','paid','failed','cancelled','expired')),
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_agent_status ON payment_orders(agent_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_rzp ON payment_orders(razorpay_order_id);

-- 4. Payments (one row per actual payment attempt from Razorpay webhook / verification)
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id    UUID NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  razorpay_payment_id TEXT UNIQUE NOT NULL,
  status              TEXT NOT NULL CHECK(status IN ('created','authorized','captured','failed','refunded','partially_refunded')),
  method              TEXT,
  amount_paise        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  error_code          TEXT,
  error_description   TEXT,
  captured_at         TIMESTAMPTZ,
  raw_payload         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_rzp ON payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(payment_order_id);

-- 5. Webhook Events (Idempotency Ledger — Source of Truth)
CREATE TABLE IF NOT EXISTS webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id TEXT UNIQUE NOT NULL,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL,
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at      TIMESTAMPTZ,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_rzp ON webhook_events(razorpay_event_id);

-- 6. Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  razorpay_refund_id  TEXT UNIQUE NOT NULL,
  amount_paise        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','failed')),
  reason              TEXT,
  initiated_by        TEXT, -- admin email or user ID
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_rzp ON refunds(razorpay_refund_id);

-- 7. Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  payment_id     UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  gst_details    JSONB,
  pdf_url        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Agent Status Audit Trail
CREATE TABLE IF NOT EXISTS agent_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  changed_by  TEXT NOT NULL DEFAULT 'system',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_status_history_agent ON agent_status_history(agent_id);

-- 9. Enquiries Table Enhancement
CREATE TABLE IF NOT EXISTS enquiries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       UUID REFERENCES agents(id) ON DELETE SET NULL,
  customer_name  TEXT,
  phone          TEXT,
  email          TEXT,
  source         TEXT DEFAULT 'website',
  budget         TEXT,
  message        TEXT,
  reference_id   TEXT,
  status         TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','converted','closed','lost')),
  assigned_at    TIMESTAMPTZ,
  converted_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_agent_status ON enquiries(agent_id, status, created_at);
