CREATE TABLE workflow_submission_rate_limits (
    scope VARCHAR(32) NOT NULL,
    subject_id VARCHAR(255) NOT NULL,
    window_started_at DATETIME(3) NOT NULL,
    request_count INT NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (scope, subject_id)
);

ALTER TABLE workflow_jobs DROP CHECK chk_workflow_jobs_status;
ALTER TABLE workflow_jobs ADD CONSTRAINT chk_workflow_jobs_status
    CHECK (status IN ('pending', 'running', 'cancelling', 'cancelled', 'completed', 'failed'));

ALTER TABLE workflow_jobs ADD COLUMN cancel_requested_at DATETIME(3) NULL AFTER heartbeat_at;
ALTER TABLE workflow_jobs ADD COLUMN cancelled_at DATETIME(3) NULL AFTER cancel_requested_at;
ALTER TABLE workflow_jobs ADD COLUMN cancel_reason VARCHAR(500) NULL AFTER cancelled_at;

CREATE INDEX idx_workflow_run_events_run_type_id
    ON workflow_run_events(workflow_run_id, event_type, id);

CREATE INDEX idx_workflow_jobs_project_history
    ON workflow_jobs(project_id, status, completed_at);

CREATE INDEX idx_workflow_jobs_history
    ON workflow_jobs(status, completed_at);
