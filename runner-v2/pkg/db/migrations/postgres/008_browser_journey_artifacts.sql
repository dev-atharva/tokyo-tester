CREATE TABLE IF NOT EXISTS browser_journey_artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workflow_run_id TEXT NOT NULL,
    scenario_run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_browser_artifact_scope ON browser_journey_artifacts(project_id, workflow_run_id, id);
CREATE INDEX IF NOT EXISTS idx_browser_artifact_expiry ON browser_journey_artifacts(expires_at);
