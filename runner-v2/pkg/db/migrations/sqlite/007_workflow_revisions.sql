CREATE TABLE IF NOT EXISTS workflow_revisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    revision_number INTEGER NOT NULL,
    workflow_version INTEGER NOT NULL,
    snapshot TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workflow_id, revision_number),
    FOREIGN KEY(workflow_id) REFERENCES workflows(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_revisions_workflow
    ON workflow_revisions(workflow_id, revision_number DESC);
