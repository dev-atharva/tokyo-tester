CREATE TABLE IF NOT EXISTS workflow_jobs (
    id TEXT PRIMARY KEY,
    workflow_run_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    payload_ciphertext BLOB,
    payload_nonce BLOB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    lease_owner TEXT,
    lease_expires_at TIMESTAMP,
    heartbeat_at TIMESTAMP,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_claim
    ON workflow_jobs(status, lease_expires_at, created_at);

CREATE TABLE IF NOT EXISTS workflow_run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_run_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('workflowlog', 'testresult')),
    payload TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_events_replay
    ON workflow_run_events(workflow_run_id, id);

CREATE INDEX IF NOT EXISTS idx_workflow_run_events_created
    ON workflow_run_events(created_at);
