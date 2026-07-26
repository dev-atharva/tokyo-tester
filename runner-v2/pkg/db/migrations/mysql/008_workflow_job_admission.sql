ALTER TABLE workflow_jobs ADD COLUMN user_id VARCHAR(255) NOT NULL DEFAULT '' AFTER project_id;
ALTER TABLE workflow_jobs ADD COLUMN priority INT NOT NULL DEFAULT 0 AFTER status;
ALTER TABLE workflow_jobs ADD COLUMN estimated_cost INT NOT NULL DEFAULT 1 AFTER priority;

CREATE INDEX idx_workflow_jobs_user_state
    ON workflow_jobs(user_id, status, created_at);

CREATE INDEX idx_workflow_jobs_project_state
    ON workflow_jobs(project_id, status, created_at);

CREATE TABLE workflow_scheduler_lock (
    id TINYINT PRIMARY KEY,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

INSERT INTO workflow_scheduler_lock (id) VALUES (1);
