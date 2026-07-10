CREATE TABLE workflow_revisions (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    revision_number INT NOT NULL,
    workflow_version INT NOT NULL,
    snapshot JSON NOT NULL,
    message TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_workflow_revisions_workflow_number (workflow_id, revision_number),
    CONSTRAINT fk_workflow_revisions_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE INDEX idx_workflow_revisions_workflow
    ON workflow_revisions(workflow_id, revision_number);
