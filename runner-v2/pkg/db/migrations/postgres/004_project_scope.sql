ALTER TABLE workflows
    ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE scenarios
    ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE workflow_runs
    ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE test_results
    ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workflows_project_id
    ON workflows(project_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_project_id
    ON scenarios(project_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_id
    ON workflow_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id
    ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_test_results_project_id
    ON test_results(project_id);
