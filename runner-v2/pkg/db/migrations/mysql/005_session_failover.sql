ALTER TABLE sessions ADD COLUMN owner_id VARCHAR(255);
ALTER TABLE sessions ADD COLUMN lease_expires_at DATETIME(3);
ALTER TABLE sessions ADD COLUMN heartbeat_at DATETIME(3);
ALTER TABLE sessions ADD COLUMN phase VARCHAR(64) NOT NULL DEFAULT 'created';
ALTER TABLE sessions ADD COLUMN checkpoint_index INT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN service_graph LONGTEXT;
ALTER TABLE sessions ADD COLUMN test_plan LONGTEXT;
ALTER TABLE sessions ADD COLUMN runtime_snapshot LONGTEXT;

CREATE INDEX idx_sessions_backend_session_id ON sessions(backend_session_id);
CREATE INDEX idx_sessions_execution_lookup ON sessions(workflow_run_id, scenario_id, is_deleted);
CREATE INDEX idx_sessions_lease_expires_at ON sessions(lease_expires_at);
