CREATE TABLE scenarios (
    id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tests_config LONGTEXT NOT NULL,
    test_order LONGTEXT NOT NULL,
    metadata LONGTEXT,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    client_id VARCHAR(255),
    user_id VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_scenarios_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE workflow_runs (
    id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL,
    summary LONGTEXT,
    logs LONGTEXT,
    error TEXT,
    started_at DATETIME(3),
    completed_at DATETIME(3),
    metadata LONGTEXT,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    client_id VARCHAR(255),
    user_id VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_workflow_runs_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

ALTER TABLE sessions ADD COLUMN workflow_run_id VARCHAR(255);
ALTER TABLE sessions ADD COLUMN scenario_id VARCHAR(255);
ALTER TABLE sessions ADD COLUMN scenario_name VARCHAR(255);
ALTER TABLE sessions ADD COLUMN backend_session_id VARCHAR(255);

ALTER TABLE test_results ADD COLUMN workflow_run_id VARCHAR(255);
ALTER TABLE test_results ADD COLUMN scenario_id VARCHAR(255);
ALTER TABLE test_results ADD COLUMN scenario_name VARCHAR(255);

CREATE INDEX idx_scenarios_workflow ON scenarios(workflow_id, is_deleted);
CREATE INDEX idx_scenarios_user_id ON scenarios(user_id);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id, is_deleted);
CREATE INDEX idx_workflow_runs_user_id ON workflow_runs(user_id);
CREATE INDEX idx_sessions_workflow_run ON sessions(workflow_run_id, is_deleted);
CREATE INDEX idx_sessions_scenario ON sessions(scenario_id, is_deleted);
CREATE INDEX idx_test_results_workflow_run ON test_results(workflow_run_id, is_deleted);
CREATE INDEX idx_test_results_scenario ON test_results(scenario_id, is_deleted);
