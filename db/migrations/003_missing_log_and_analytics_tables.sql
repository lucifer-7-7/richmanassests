-- Migration: Create the agent-log and traffic-analytics tables the app already writes to.
--
-- Context: same class of bug as 002 — the application code for all three of these
-- was fully written and wired up, but the tables were never created, so every
-- insert has been silently swallowed by its surrounding try/catch:
--   * middleware/trackVisit.js  → page_views           (mounted globally in server.js:92)
--   * agentAuthService.recordLoginLog → agent_login_logs
--   * agentAuthService.logStatusChange → agent_status_history
-- Net effect: the admin traffic dashboard always reads zero, and the agent
-- profile "logs" view falls back to a per-process in-memory cache that empties
-- on every restart. Run once in the Supabase SQL Editor.

-- ── page_views: one row per public GET (see middleware/trackVisit.js) ──────
CREATE TABLE IF NOT EXISTS page_views (
  id          BIGSERIAL PRIMARY KEY,
  path        TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  device_type TEXT,
  browser     TEXT,
  os          TEXT,
  ip          TEXT,
  country     TEXT,
  city        TEXT,
  region      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- created_at drives every dashboard aggregate (today/week/month + recent-2000 scan)
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path    ON page_views(path);

-- ── agent_login_logs: agent sign-in audit trail ───────────────────────────
CREATE TABLE IF NOT EXISTS agent_login_logs (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    BIGINT REFERENCES agents(id) ON DELETE CASCADE,
  ip_address  TEXT,
  user_agent  TEXT,
  device_type TEXT,
  status      TEXT NOT NULL DEFAULT 'success',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_logs_agent ON agent_login_logs(agent_id, created_at DESC);

-- ── agent_status_history: account status transition ledger ────────────────
CREATE TABLE IF NOT EXISTS agent_status_history (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    BIGINT REFERENCES agents(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT,
  reason      TEXT,
  changed_by  TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_hist_agent ON agent_status_history(agent_id, changed_at DESC);
