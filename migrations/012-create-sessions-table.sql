-- Sign-ins (express-session), kept in the database so restarts and deploys don't sign everyone out.
-- data is the session as JSON. Expired rows are cleared out by lib/session-store.js.
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_ms INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_ms);
