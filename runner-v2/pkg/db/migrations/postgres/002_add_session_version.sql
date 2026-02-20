BEGIN;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
UPDATE sessions SET version = 1 WHERE version IS NULL OR version = 0;
CREATE INDEX IF NOT EXISTS idx_sessions_version ON sessions(id, version);

COMMIT;
