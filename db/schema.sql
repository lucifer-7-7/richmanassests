-- ============================================================
-- RichManAssets — Complete Supabase Schema
-- Run this ONCE in Supabase SQL Editor:
-- https://app.supabase.com/project/odgvwtwjpircuxcfxleb/sql/new
-- ============================================================

-- Enable needed extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── EXISTING TABLES (migrated from SQLite) ────────────────────────

CREATE TABLE IF NOT EXISTS properties (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  loc             TEXT NOT NULL,
  area            TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL,
  listing         TEXT NOT NULL CHECK(listing IN ('sale','rent','lease')),
  price           TEXT NOT NULL,
  price_val       DOUBLE PRECISION NOT NULL DEFAULT 0,
  price_note      TEXT,
  beds            TEXT,
  baths           TEXT,
  sqft            TEXT,
  subtype         TEXT,
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  badge_txt       TEXT,
  has_img         BOOLEAN NOT NULL DEFAULT FALSE,
  img_card        TEXT,
  img_hero        TEXT,
  gallery         TEXT,
  story_kicker    TEXT,
  story_heading   TEXT,
  story_body      TEXT,
  amenities       TEXT,
  setting_heading TEXT,
  setting_body    TEXT,
  setting_pills   TEXT,
  emi_label       TEXT,
  emi_val         TEXT,
  next_id         TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enquiries (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT,
  phone        TEXT,
  email        TEXT,
  service      TEXT,
  budget       TEXT,
  time_pref    TEXT,
  message      TEXT,
  property_ref TEXT,
  page         TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testimonials (
  id       BIGSERIAL PRIMARY KEY,
  initials TEXT,
  name     TEXT,
  role     TEXT,
  quote    TEXT,
  active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── AGENT SYSTEM TABLES ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rera_number   TEXT,
  company_name  TEXT,
  gst_number    TEXT,
  city          TEXT,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
CREATE INDEX IF NOT EXISTS idx_agents_phone ON agents(phone);

CREATE TABLE IF NOT EXISTS listing_fee_config (
  id            BIGSERIAL PRIMARY KEY,
  amount_paise  INTEGER NOT NULL DEFAULT 99900,
  currency      TEXT NOT NULL DEFAULT 'INR',
  label         TEXT NOT NULL DEFAULT 'Property Listing Fee',
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until   TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);
-- Seed default fee ₹999 (99900 paise)
INSERT INTO listing_fee_config (amount_paise, label)
SELECT 99900, 'Property Listing Fee'
WHERE NOT EXISTS (SELECT 1 FROM listing_fee_config LIMIT 1);

CREATE TABLE IF NOT EXISTS agent_properties (
  id              TEXT PRIMARY KEY,
  agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  loc             TEXT NOT NULL,
  area            TEXT,
  type            TEXT NOT NULL,
  listing         TEXT NOT NULL CHECK(listing IN ('sale','rent','lease')),
  price           TEXT NOT NULL,
  price_val       DOUBLE PRECISION NOT NULL DEFAULT 0,
  price_note      TEXT,
  beds            TEXT,
  baths           TEXT,
  sqft            TEXT,
  subtype         TEXT,
  description     TEXT,
  amenities       TEXT,
  img_card        TEXT,
  img_hero        TEXT,
  gallery         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK(status IN (
                    'draft','payment_pending','payment_processing',
                    'payment_failed','published','expired','archived','deleted','refunded'
                  )),
  expires_at      TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  paid_order_id   TEXT,
  fee_paid_paise  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agprop_agent   ON agent_properties(agent_id);
CREATE INDEX IF NOT EXISTS idx_agprop_status  ON agent_properties(status);
CREATE INDEX IF NOT EXISTS idx_agprop_created ON agent_properties(created_at DESC);

CREATE TABLE IF NOT EXISTS payment_orders (
  id                  BIGSERIAL PRIMARY KEY,
  internal_order_id   TEXT NOT NULL UNIQUE,
  cashfree_order_id   TEXT,
  agent_id            BIGINT NOT NULL REFERENCES agents(id),
  property_id         TEXT NOT NULL REFERENCES agent_properties(id),
  amount_paise        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created'
                      CHECK(status IN (
                        'created','processing','paid','failed',
                        'cancelled','expired','refund_initiated','refunded'
                      )),
  payment_method      TEXT,
  cashfree_payment_id TEXT,
  payment_session_id  TEXT,
  session_expires_at  TIMESTAMPTZ,
  idempotency_key     TEXT NOT NULL UNIQUE,
  refund_id           TEXT,
  refund_amount_paise INTEGER,
  refund_status       TEXT,
  metadata            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payord_agent    ON payment_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_payord_property ON payment_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_payord_status   ON payment_orders(status);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id                BIGSERIAL PRIMARY KEY,
  source            TEXT NOT NULL DEFAULT 'cashfree',
  event_type        TEXT,
  cashfree_order_id TEXT,
  payload           TEXT NOT NULL,
  signature         TEXT,
  sig_valid         BOOLEAN,
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error  TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_order  ON webhook_logs(cashfree_order_id);
CREATE INDEX IF NOT EXISTS idx_wh_event  ON webhook_logs(event_type);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_verifications (
  id         BIGSERIAL PRIMARY KEY,
  agent_id   BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  purpose    TEXT NOT NULL CHECK(purpose IN ('email_verify','password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
