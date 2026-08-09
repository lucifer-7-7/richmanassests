-- Migration 005: Persistent session store for admin/agent logins.
-- Supabase-backed store survives serverless cold restarts.

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup: expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Optional: cron job to purge old sessions (Supabase pg_cron required)
-- SELECT cron.schedule('purge-old-sessions', '0 */6 * * *', 'DELETE FROM sessions WHERE expires_at < NOW()');
