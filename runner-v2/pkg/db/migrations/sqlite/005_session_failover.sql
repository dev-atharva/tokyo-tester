ALTER TABLE sessions ADD COLUMN owner_id TEXT;
ALTER TABLE sessions ADD COLUMN lease_expires_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN heartbeat_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN phase TEXT NOT NULL DEFAULT 'created';
ALTER TABLE sessions ADD COLUMN checkpoint_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN service_graph TEXT;
ALTER TABLE sessions ADD COLUMN test_plan TEXT;
ALTER TABLE sessions ADD COLUMN runtime_snapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_backend_session_id ON sessions(backend_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_execution_lookup ON sessions(workflow_run_id, scenario_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sessions_lease_expires_at ON sessions(lease_expires_at);
