CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    tests_config TEXT NOT NULL,
    test_order TEXT NOT NULL,
    metadata TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id TEXT NOT NULL,
    is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0,1)),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    logs TEXT,
    error TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    metadata TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id TEXT NOT NULL,
    is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0,1)),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

ALTER TABLE sessions ADD COLUMN workflow_run_id TEXT;
ALTER TABLE sessions ADD COLUMN scenario_id TEXT;
ALTER TABLE sessions ADD COLUMN scenario_name TEXT;
ALTER TABLE sessions ADD COLUMN backend_session_id TEXT;

ALTER TABLE test_results ADD COLUMN workflow_run_id TEXT;
ALTER TABLE test_results ADD COLUMN scenario_id TEXT;
ALTER TABLE test_results ADD COLUMN scenario_name TEXT;

CREATE INDEX IF NOT EXISTS idx_scenarios_workflow ON scenarios(workflow_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_scenarios_user_id ON scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id ON workflow_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workflow_run ON sessions(workflow_run_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sessions_scenario ON sessions(scenario_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_test_results_workflow_run ON test_results(workflow_run_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_test_results_scenario ON test_results(scenario_id, is_deleted);
