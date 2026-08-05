CREATE TABLE IF NOT EXISTS browser_journey_artifacts (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    workflow_run_id VARCHAR(255) NOT NULL,
    scenario_run_id VARCHAR(255) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    content_type VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    storage_key VARCHAR(1024) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    INDEX idx_browser_artifact_scope (project_id, workflow_run_id, id),
    INDEX idx_browser_artifact_expiry (expires_at),
    CONSTRAINT fk_browser_artifact_run FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);

ALTER TABLE workflow_run_events DROP CHECK chk_workflow_run_events_type;
ALTER TABLE workflow_run_events ADD CONSTRAINT chk_workflow_run_events_type CHECK (event_type IN ('workflowlog', 'testresult', 'journeyresult'));
