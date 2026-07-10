ALTER TABLE workflows ADD COLUMN project_id VARCHAR(255);
ALTER TABLE scenarios ADD COLUMN project_id VARCHAR(255);
ALTER TABLE workflow_runs ADD COLUMN project_id VARCHAR(255);
ALTER TABLE sessions ADD COLUMN project_id VARCHAR(255);
ALTER TABLE test_results ADD COLUMN project_id VARCHAR(255);

CREATE INDEX idx_workflows_project_id ON workflows(project_id);
CREATE INDEX idx_scenarios_project_id ON scenarios(project_id);
CREATE INDEX idx_workflow_runs_project_id ON workflow_runs(project_id);
CREATE INDEX idx_sessions_project_id ON sessions(project_id);
CREATE INDEX idx_test_results_project_id ON test_results(project_id);
