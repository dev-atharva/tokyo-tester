ALTER TABLE sessions ADD COLUMN version INT NOT NULL DEFAULT 1;
CREATE INDEX idx_sessions_version ON sessions(id, version);
