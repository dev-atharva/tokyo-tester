ALTER TABLE sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_sessions_version ON sessions(id, version);
