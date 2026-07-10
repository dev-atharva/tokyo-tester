CREATE TABLE workflow_jobs (
    id VARCHAR(255) PRIMARY KEY,
    workflow_run_id VARCHAR(255) NOT NULL UNIQUE,
    project_id VARCHAR(255) NOT NULL,
    request_hash VARCHAR(255) NOT NULL,
    payload_ciphertext BLOB,
    payload_nonce BLOB,
    status VARCHAR(64) NOT NULL DEFAULT 'pending',
    lease_owner VARCHAR(255),
    lease_expires_at DATETIME(3),
    heartbeat_at DATETIME(3),
    recovery_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    started_at DATETIME(3),
    completed_at DATETIME(3),
    CONSTRAINT chk_workflow_jobs_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX idx_workflow_jobs_claim
    ON workflow_jobs(status, lease_expires_at, created_at);

CREATE TABLE workflow_run_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_run_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload LONGTEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_workflow_run_events_type CHECK (event_type IN ('workflowlog', 'testresult'))
);

CREATE INDEX idx_workflow_run_events_replay
    ON workflow_run_events(workflow_run_id, id);

CREATE INDEX idx_workflow_run_events_created
    ON workflow_run_events(created_at);
