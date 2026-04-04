package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dev-atharva/cots/pkg/db"
	_ "github.com/lib/pq"
)

type Client struct {
	conn *db.LoggedDB
	dsn  string
}

func NewClient(dsn string) (*Client, error) {
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}

	conn.SetMaxIdleConns(2)
	conn.SetMaxOpenConns(10)

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping postgres database: %w", err)
	}

	loggedConn := db.NewLoggedDB(conn, "postgres")

	return &Client{
		conn: loggedConn,
		dsn:  dsn,
	}, nil
}

func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) Ping(ctx context.Context) error {
	return c.conn.PingContext(ctx)
}

func (c *Client) UpsertWorkflow(ctx context.Context, wf *db.Workflow) error {
	query := `
		INSERT INTO workflows (
			id, name, description, nodes_config, edges_config,
			metadata, version, created_at, updated_at,
			client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			nodes_config = EXCLUDED.nodes_config,
			edges_config = EXCLUDED.edges_config,
			metadata = EXCLUDED.metadata,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
	`

	_, err := c.conn.ExecContext(ctx, query,
		wf.ID, wf.Name, wf.Description, wf.NodesConfig, wf.EdgesConfig,
		wf.Metadata, wf.Version, wf.CreatedAt, wf.UpdatedAt,
		wf.ClientID, wf.UserID, wf.IsDeleted,
	)
	return err
}

func (c *Client) GetWorkflow(ctx context.Context, id string) (*db.Workflow, error) {
	query := `
		SELECT id, name, description, nodes_config, edges_config,
		       metadata, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM workflows
		WHERE id = $1 AND is_deleted = FALSE
	`

	var wf db.Workflow
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&wf.ID, &wf.Name, &wf.Description, &wf.NodesConfig,
		&wf.EdgesConfig, &wf.Metadata, &wf.Version,
		&wf.CreatedAt, &wf.UpdatedAt,
		&wf.ClientID, &wf.UserID, &wf.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", id)
	}
	return &wf, err
}

func (c *Client) DeleteWorkflow(ctx context.Context, id string) error {
	query := `
		UPDATE workflows
		SET is_deleted = TRUE,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`
	_, err := c.conn.ExecContext(ctx, query, id)
	return err
}

func (c *Client) ListWorkflows(ctx context.Context, projectID string) ([]*db.Workflow, error) {
	query := `
		SELECT id, name, description, nodes_config, edges_config,
		       metadata, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM workflows
		WHERE project_id = $1 AND is_deleted = FALSE
		ORDER BY updated_at DESC
	`

	rows, err := c.conn.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*db.Workflow
	for rows.Next() {
		var wf db.Workflow
		if err := rows.Scan(
			&wf.ID, &wf.Name, &wf.Description,
			&wf.NodesConfig, &wf.EdgesConfig,
			&wf.Metadata, &wf.Version,
			&wf.CreatedAt, &wf.UpdatedAt,
			&wf.ClientID, &wf.UserID, &wf.IsDeleted,
		); err != nil {
			return nil, err
		}
		out = append(out, &wf)
	}
	return out, nil
}

func (c *Client) UpsertScenario(ctx context.Context, scenario *db.Scenario) error {
	query := `
		INSERT INTO scenarios (
			id, workflow_id, name, description, tests_config, test_order,
			metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (id) DO UPDATE SET
			workflow_id = EXCLUDED.workflow_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			tests_config = EXCLUDED.tests_config,
			test_order = EXCLUDED.test_order,
			metadata = EXCLUDED.metadata,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
	`
	_, err := c.conn.ExecContext(ctx, query,
		scenario.ID, scenario.WorkflowID, scenario.Name, scenario.Description,
		scenario.TestsConfig, scenario.TestOrder, scenario.Metadata, scenario.Version,
		scenario.CreatedAt, scenario.UpdatedAt, scenario.ClientID, scenario.UserID, scenario.IsDeleted,
	)
	return err
}

func (c *Client) GetScenario(ctx context.Context, id string) (*db.Scenario, error) {
	query := `
		SELECT id, workflow_id, name, description, tests_config, test_order,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios
		WHERE id = $1 AND is_deleted = FALSE
	`
	var sc db.Scenario
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&sc.ID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.TestsConfig, &sc.TestOrder,
		&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	return &sc, err
}

func (c *Client) DeleteScenario(ctx context.Context, id string) error {
	_, err := c.conn.ExecContext(ctx, `
		UPDATE scenarios
		SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`, id)
	return err
}

func (c *Client) ListScenariosByWorkflow(ctx context.Context, workflowID string) ([]*db.Scenario, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, workflow_id, name, description, tests_config, test_order,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios
		WHERE workflow_id = $1 AND is_deleted = FALSE
		ORDER BY updated_at DESC
	`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*db.Scenario
	for rows.Next() {
		var sc db.Scenario
		if err := rows.Scan(
			&sc.ID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.TestsConfig, &sc.TestOrder,
			&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
		); err != nil {
			return nil, err
		}
		out = append(out, &sc)
	}
	return out, nil
}

func (c *Client) ListScenariosByProjectID(ctx context.Context, projectID string) ([]*db.Scenario, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, workflow_id, name, description, tests_config, test_order,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios
		WHERE project_id = $1 AND is_deleted = FALSE
		ORDER BY updated_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*db.Scenario
	for rows.Next() {
		var sc db.Scenario
		if err := rows.Scan(
			&sc.ID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.TestsConfig, &sc.TestOrder,
			&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
		); err != nil {
			return nil, err
		}
		out = append(out, &sc)
	}
	return out, nil
}

func (c *Client) UpsertWorkflowRun(ctx context.Context, workflowRun *db.WorkflowRun) error {
	query := `
		INSERT INTO workflow_runs (
			id, workflow_id, status, summary, logs, error, started_at, completed_at,
			metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		ON CONFLICT (id) DO UPDATE SET
			workflow_id = EXCLUDED.workflow_id,
			status = EXCLUDED.status,
			summary = EXCLUDED.summary,
			logs = EXCLUDED.logs,
			error = EXCLUDED.error,
			started_at = EXCLUDED.started_at,
			completed_at = EXCLUDED.completed_at,
			metadata = EXCLUDED.metadata,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
	`
	_, err := c.conn.ExecContext(ctx, query,
		workflowRun.ID, workflowRun.WorkflowID, workflowRun.Status, workflowRun.Summary,
		workflowRun.Logs, workflowRun.Error, workflowRun.StartedAt, workflowRun.CompletedAt,
		workflowRun.Metadata, workflowRun.Version, workflowRun.CreatedAt, workflowRun.UpdatedAt,
		workflowRun.ClientID, workflowRun.UserID, workflowRun.IsDeleted,
	)
	return err
}

func (c *Client) GetWorkflowRun(ctx context.Context, id string) (*db.WorkflowRun, error) {
	query := `
		SELECT id, workflow_id, status, summary, logs, error, started_at, completed_at,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs
		WHERE id = $1 AND is_deleted = FALSE
	`
	var wr db.WorkflowRun
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&wr.ID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
		&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version,
		&wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow run not found: %s", id)
	}
	return &wr, err
}

func (c *Client) DeleteWorkflowRun(ctx context.Context, id string) error {
	_, err := c.conn.ExecContext(ctx, `
		UPDATE workflow_runs
		SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`, id)
	return err
}

func (c *Client) ListWorkflowRunsByWorkflow(ctx context.Context, workflowID string) ([]*db.WorkflowRun, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, workflow_id, status, summary, logs, error, started_at, completed_at,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs
		WHERE workflow_id = $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
	`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*db.WorkflowRun
	for rows.Next() {
		var wr db.WorkflowRun
		if err := rows.Scan(
			&wr.ID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
			&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version,
			&wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
		); err != nil {
			return nil, err
		}
		out = append(out, &wr)
	}
	return out, nil
}

func (c *Client) ListWorkflowRunsByProjectID(ctx context.Context, projectID string) ([]*db.WorkflowRun, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, workflow_id, status, summary, logs, error, started_at, completed_at,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs
		WHERE project_id = $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*db.WorkflowRun
	for rows.Next() {
		var wr db.WorkflowRun
		if err := rows.Scan(
			&wr.ID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
			&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version,
			&wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
		); err != nil {
			return nil, err
		}
		out = append(out, &wr)
	}
	return out, nil
}

func (c *Client) UpsertSession(ctx context.Context, s *db.Session) error {
	query := `
		INSERT INTO sessions (
			id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id,
			status, result, container_ids, logs, error,
			started_at, completed_at, version, created_at, updated_at,
			client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		ON CONFLICT (id) DO UPDATE SET
			workflow_run_id = EXCLUDED.workflow_run_id,
			workflow_id = EXCLUDED.workflow_id,
			scenario_id = EXCLUDED.scenario_id,
			scenario_name = EXCLUDED.scenario_name,
			backend_session_id = EXCLUDED.backend_session_id,
			status = EXCLUDED.status,
			result = EXCLUDED.result,
			container_ids = EXCLUDED.container_ids,
			logs = EXCLUDED.logs,
			error = EXCLUDED.error,
			started_at = EXCLUDED.started_at,
			completed_at = EXCLUDED.completed_at,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
		WHERE sessions.version = EXCLUDED.version - 1
	`

	result, err := c.conn.ExecContext(ctx, query,
		s.ID, s.WorkflowRunID, s.WorkflowID, s.ScenarioID, s.ScenarioName, s.BackendSessionID, s.Status, s.Result,
		s.ContainerIDs, s.Logs, s.Error,
		s.StartedAt, s.CompletedAt, s.Version,
		s.CreatedAt, s.UpdatedAt,
		s.ClientID, s.UserID, s.IsDeleted,
	)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("version conflict: session was modified by another process.")
	}
	return nil
}

func (c *Client) GetSession(ctx context.Context, id string) (*db.Session, error) {
	query := `
		SELECT id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids,
		       logs, error,
		       started_at, completed_at, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM sessions
		WHERE id = $1 AND is_deleted = FALSE
	`

	var s db.Session
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&s.ID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result, &s.ContainerIDs, &s.Logs,
		&s.Error, &s.StartedAt, &s.CompletedAt, &s.Version,
		&s.CreatedAt, &s.UpdatedAt,
		&s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	return &s, err
}

func (c *Client) DeleteSession(ctx context.Context, id string) error {
	query := `
		UPDATE sessions
		SET is_deleted = TRUE,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`
	_, err := c.conn.ExecContext(ctx, query, id)
	return err
}

func (c *Client) ListSessions(ctx context.Context, workflowID string) ([]*db.Session, error) {
	query := `
		SELECT id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids,
		       logs, error,
		       started_at, completed_at, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM sessions
		WHERE workflow_id = $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
	`

	rows, err := c.conn.QueryContext(ctx, query, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*db.Session
	for rows.Next() {
		var s db.Session
		if err := rows.Scan(
			&s.ID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result,
			&s.ContainerIDs, &s.Logs, &s.Error,
			&s.StartedAt, &s.CompletedAt, &s.Version,
			&s.CreatedAt, &s.UpdatedAt,
			&s.ClientID, &s.UserID, &s.IsDeleted,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, &s)
	}
	return sessions, nil
}

func (c *Client) ListSessionsByProjectID(ctx context.Context, projectID string) ([]*db.Session, error) {
	query := `
		SELECT id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids,
		       logs, error,
		       started_at, completed_at, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM sessions
		WHERE project_id = $1 AND is_deleted = FALSE
		ORDER BY created_at DESC
	`
	rows, err := c.conn.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*db.Session
	for rows.Next() {
		var s db.Session
		if err := rows.Scan(
			&s.ID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result,
			&s.ContainerIDs, &s.Logs, &s.Error,
			&s.StartedAt, &s.CompletedAt, &s.Version,
			&s.CreatedAt, &s.UpdatedAt,
			&s.ClientID, &s.UserID, &s.IsDeleted,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, &s)
	}
	return sessions, nil
}

func (c *Client) InsertTestResult(ctx context.Context, tr *db.TestResult) error {
	query := `
	INSERT INTO test_results (
		id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
		status, result_data, duration_ms,
		executed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
	`

	_, err := c.conn.ExecContext(ctx, query,
		tr.ID, tr.SessionID, tr.WorkflowRunID, tr.WorkflowID, tr.ScenarioID, tr.ScenarioName, tr.TestName, tr.TestType,
		tr.Status, tr.ResultData, tr.DurationMs, tr.ExecutedAt,
		tr.CreatedAt, tr.UpdatedAt, tr.ClientID, tr.UserID, tr.IsDeleted,
	)
	return err
}

func (c *Client) UpsertTestResult(ctx context.Context, result *db.TestResult) error {
	query := `
		INSERT INTO test_results (
			id,
			session_id,
			workflow_run_id,
			workflow_id,
			scenario_id,
			scenario_name,
			test_name,
			test_type,
			status,
			result_data,
			duration_ms,
			executed_at,
			created_at,
			updated_at,
			client_id,
			user_id,
			is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		ON CONFLICT(id) DO UPDATE SET
			workflow_run_id = excluded.workflow_run_id,
			workflow_id = excluded.workflow_id,
			scenario_id = excluded.scenario_id,
			scenario_name = excluded.scenario_name,
			status = excluded.status,
			result_data = excluded.result_data,
			duration_ms = excluded.duration_ms,
			executed_at = excluded.executed_at,
			updated_at = CURRENT_TIMESTAMP,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
	`

	_, err := c.conn.ExecContext(ctx, query,
		result.ID,
		result.SessionID,
		result.WorkflowRunID,
		result.WorkflowID,
		result.ScenarioID,
		result.ScenarioName,
		result.TestName,
		result.TestType,
		result.Status,
		result.ResultData,
		result.DurationMs,
		result.ExecutedAt,
		result.CreatedAt,
		result.UpdatedAt,
		result.ClientID,
		result.UserID,
		result.IsDeleted,
	)
	return err
}

func (c *Client) GetTestResult(ctx context.Context, id string) (*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
		       status, result_data, duration_ms,
		       executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE id = $1 AND is_deleted = FALSE
	`

	var tr db.TestResult
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&tr.ID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
		&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
		&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("test result not found: %s", id)
	}
	return &tr, err
}

func (c *Client) ListTestResults(ctx context.Context, sessionID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
		       status, result_data, duration_ms,
		       executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE session_id = $1 AND is_deleted = FALSE
		ORDER BY executed_at DESC
	`

	rows, err := c.conn.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.TestResult
	for rows.Next() {
		var tr db.TestResult
		if err := rows.Scan(
			&tr.ID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
			&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
			&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (c *Client) ListTestResultsByProjectID(ctx context.Context, projectID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
		       status, result_data, duration_ms,
		       executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE project_id = $1 AND is_deleted = FALSE
		ORDER BY executed_at DESC
	`
	rows, err := c.conn.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.TestResult
	for rows.Next() {
		var tr db.TestResult
		if err := rows.Scan(
			&tr.ID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
			&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
			&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (c *Client) DeleteTestResult(ctx context.Context, id string) error {
	query := `
		UPDATE test_results
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := c.conn.ExecContext(ctx, query, id)
	return err
}

func (c *Client) UpsertSyncMetaData(ctx context.Context, meta *db.SyncMetadata) error {
	query := `
		INSERT INTO sync_metadata (
			user_id,
			client_id,
			last_sync_at,
			last_sync_version,
			sync_status
		)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id, client_id) DO UPDATE SET
			last_sync_at = EXCLUDED.last_sync_at,
			last_sync_version = EXCLUDED.last_sync_version,
			sync_status = EXCLUDED.sync_status
	`

	_, err := c.conn.ExecContext(ctx, query,
		meta.UserID,
		meta.ClientID,
		meta.LastSyncAt,
		meta.LastSyncVersion,
		meta.SyncStatus,
	)
	return err
}

func (c *Client) GetSyncMetaData(
	ctx context.Context,
	userID string,
	clientID string,
) (*db.SyncMetadata, error) {

	query := `
		SELECT user_id, client_id, last_sync_at, last_sync_version, sync_status
		FROM sync_metadata
		WHERE user_id = $1 AND client_id = $2
	`

	var meta db.SyncMetadata
	err := c.conn.QueryRowContext(ctx, query, userID, clientID).Scan(
		&meta.UserID,
		&meta.ClientID,
		&meta.LastSyncAt,
		&meta.LastSyncVersion,
		&meta.SyncStatus,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf(
			"sync metadata not found for user=%s client=%s",
			userID, clientID,
		)
	}
	return &meta, err
}

func (c *Client) GetConnection() *sql.DB {
	return c.conn.DB
}

func (c *Client) BeginTx(ctx context.Context) (db.Tx, error) {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelReadCommitted,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	return &PostgresTx{tx: tx}, nil
}

type PostgresTx struct {
	tx *sql.Tx
}

func (t *PostgresTx) Commit() error {
	return t.tx.Commit()
}

func (t *PostgresTx) Rollback() error {
	return t.tx.Rollback()
}

func (t *PostgresTx) UpsertWorkflow(ctx context.Context, workflow *db.Workflow) error {
	query := `
		INSERT INTO workflows (
			id, name, description, nodes_config, edges_config,
			metadata, version, created_at, updated_at,
			client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			nodes_config = EXCLUDED.nodes_config,
			edges_config = EXCLUDED.edges_config,
			metadata = EXCLUDED.metadata,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
	`
	_, err := t.tx.ExecContext(ctx, query, workflow.ID, workflow.Name, workflow.Description, workflow.NodesConfig,
		workflow.EdgesConfig, workflow.Metadata, workflow.Version, workflow.CreatedAt, workflow.UpdatedAt,
		workflow.ClientID, workflow.UserID, workflow.IsDeleted,
	)
	return err
}

func (t *PostgresTx) GetWorkflow(ctx context.Context, id string) (*db.Workflow, error) {
	query := `
		SELECT id, name, description, nodes_config, edges_config,
		       metadata, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM workflows
		WHERE id = $1 AND is_deleted = FALSE
	`
	var wf db.Workflow
	err := t.tx.QueryRowContext(ctx, query, id).Scan(&wf.ID, &wf.Name, &wf.Description, &wf.NodesConfig,
		&wf.NodesConfig, &wf.EdgesConfig, &wf.Metadata, &wf.CreatedAt, &wf.UpdatedAt, &wf.ClientID, &wf.UserID, &wf.UserID, &wf.IsDeleted)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", err)
	}
	return &wf, err
}

func (t *PostgresTx) DeleteWorkflow(ctx context.Context, id string) error {
	query := `
		UPDATE workflows
		SET is_deleted = TRUE,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *PostgresTx) UpsertScenario(ctx context.Context, scenario *db.Scenario) error {
	query := `
		INSERT INTO scenarios (
			id, workflow_id, name, description, tests_config, test_order,
			metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (id) DO UPDATE SET
			workflow_id = EXCLUDED.workflow_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			tests_config = EXCLUDED.tests_config,
			test_order = EXCLUDED.test_order,
			metadata = EXCLUDED.metadata,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
	`
	_, err := t.tx.ExecContext(ctx, query,
		scenario.ID, scenario.WorkflowID, scenario.Name, scenario.Description,
		scenario.TestsConfig, scenario.TestOrder, scenario.Metadata, scenario.Version,
		scenario.CreatedAt, scenario.UpdatedAt, scenario.ClientID, scenario.UserID, scenario.IsDeleted,
	)
	return err
}

func (t *PostgresTx) GetScenario(ctx context.Context, id string) (*db.Scenario, error) {
	query := `
		SELECT id, workflow_id, name, description, tests_config, test_order,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios
		WHERE id = $1 AND is_deleted = FALSE
	`
	var sc db.Scenario
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&sc.ID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.TestsConfig, &sc.TestOrder,
		&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	return &sc, err
}

func (t *PostgresTx) DeleteScenario(ctx context.Context, id string) error {
	_, err := t.tx.ExecContext(ctx, `
		UPDATE scenarios SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`, id)
	return err
}

func (t *PostgresTx) UpsertWorkflowRun(ctx context.Context, workflowRun *db.WorkflowRun) error {
	query := `
		INSERT INTO workflow_runs (
			id, workflow_id, status, summary, logs, error, started_at, completed_at,
			metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		ON CONFLICT (id) DO UPDATE SET
			workflow_id = EXCLUDED.workflow_id,
			status = EXCLUDED.status,
			summary = EXCLUDED.summary,
			logs = EXCLUDED.logs,
			error = EXCLUDED.error,
			started_at = EXCLUDED.started_at,
			completed_at = EXCLUDED.completed_at,
			metadata = EXCLUDED.metadata,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
	`
	_, err := t.tx.ExecContext(ctx, query,
		workflowRun.ID, workflowRun.WorkflowID, workflowRun.Status, workflowRun.Summary,
		workflowRun.Logs, workflowRun.Error, workflowRun.StartedAt, workflowRun.CompletedAt,
		workflowRun.Metadata, workflowRun.Version, workflowRun.CreatedAt, workflowRun.UpdatedAt,
		workflowRun.ClientID, workflowRun.UserID, workflowRun.IsDeleted,
	)
	return err
}

func (t *PostgresTx) GetWorkflowRun(ctx context.Context, id string) (*db.WorkflowRun, error) {
	query := `
		SELECT id, workflow_id, status, summary, logs, error, started_at, completed_at,
		       metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs
		WHERE id = $1 AND is_deleted = FALSE
	`
	var wr db.WorkflowRun
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&wr.ID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
		&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version,
		&wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow run not found: %s", id)
	}
	return &wr, err
}

func (t *PostgresTx) DeleteWorkflowRun(ctx context.Context, id string) error {
	_, err := t.tx.ExecContext(ctx, `
		UPDATE workflow_runs SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`, id)
	return err
}

func (t *PostgresTx) UpsertSession(ctx context.Context, s *db.Session) error {
	query := `
		INSERT INTO sessions (
			id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id,
			status, result, container_ids, logs, error,
			started_at, completed_at, version, created_at, updated_at,
			client_id, user_id, is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		ON CONFLICT (id) DO UPDATE SET
			workflow_run_id = EXCLUDED.workflow_run_id,
			workflow_id = EXCLUDED.workflow_id,
			scenario_id = EXCLUDED.scenario_id,
			scenario_name = EXCLUDED.scenario_name,
			backend_session_id = EXCLUDED.backend_session_id,
			status = EXCLUDED.status,
			result = EXCLUDED.result,
			container_ids = EXCLUDED.container_ids,
			logs = EXCLUDED.logs,
			error = EXCLUDED.error,
			started_at = EXCLUDED.started_at,
			completed_at = EXCLUDED.completed_at,
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			client_id = EXCLUDED.client_id,
			user_id = EXCLUDED.user_id,
			is_deleted = EXCLUDED.is_deleted
		WHERE sessions.version = EXCLUDED.version - 1
	`
	result, err := t.tx.ExecContext(ctx, query,
		s.ID, s.WorkflowRunID, s.WorkflowID, s.ScenarioID, s.ScenarioName, s.BackendSessionID, s.Status, s.Result,
		s.ContainerIDs, s.Logs, s.Error,
		s.StartedAt, s.CompletedAt, s.Version,
		s.CreatedAt, s.UpdatedAt,
		s.ClientID, s.UserID, s.IsDeleted,
	)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("version conflict: session was modified by another process")
	}
	return nil
}

func (t *PostgresTx) GetSession(ctx context.Context, id string) (*db.Session, error) {
	query := `
		SELECT id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids,
		       logs, error,
		       started_at, completed_at, version, created_at, updated_at,
		       client_id, user_id, is_deleted
		FROM sessions
		WHERE id = $1 AND is_deleted = FALSE
	`

	var s db.Session
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&s.ID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result, &s.ContainerIDs, &s.Logs,
		&s.Error, &s.StartedAt, &s.CompletedAt, &s.Version,
		&s.CreatedAt, &s.UpdatedAt,
		&s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", err)
	}
	return &s, err
}

func (t *PostgresTx) DeleteSession(ctx context.Context, id string) error {
	query := `
		UPDATE sessions
		SET is_deleted = TRUE,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND is_deleted = FALSE
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *PostgresTx) ListTestResult(ctx context.Context, sessionID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
		       status, result_data, duration_ms,
		       executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE session_id = $1 AND is_deleted = FALSE
		ORDER BY executed_at DESC
	`
	rows, err := t.tx.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.TestResult
	for rows.Next() {
		var tr db.TestResult
		if err := rows.Scan(
			&tr.ID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
			&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt, &tr.CreatedAt,
			&tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (t *PostgresTx) UpsertTestResult(ctx context.Context, result *db.TestResult) error {
	query := `
		INSERT INTO test_results (
			id,
			session_id,
			workflow_run_id,
			workflow_id,
			scenario_id,
			scenario_name,
			test_name,
			test_type,
			status,
			result_data,
			duration_ms,
			executed_at,
			created_at,
			updated_at,
			client_id,
			user_id,
			is_deleted
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		ON CONFLICT(id) DO UPDATE SET
			workflow_run_id = excluded.workflow_run_id,
			workflow_id = excluded.workflow_id,
			scenario_id = excluded.scenario_id,
			scenario_name = excluded.scenario_name,
			status = excluded.status,
			result_data = excluded.result_data,
			duration_ms = excluded.duration_ms,
			executed_at = excluded.executed_at,
			updated_at = CURRENT_TIMESTAMP,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
	`

	_, err := t.tx.ExecContext(ctx, query,
		result.ID,
		result.SessionID,
		result.WorkflowRunID,
		result.WorkflowID,
		result.ScenarioID,
		result.ScenarioName,
		result.TestName,
		result.TestType,
		result.Status,
		result.ResultData,
		result.DurationMs,
		result.ExecutedAt,
		result.CreatedAt,
		result.UpdatedAt,
		result.ClientID,
		result.UserID,
		result.IsDeleted,
	)
	return err
}

func (t *PostgresTx) GetTestResult(ctx context.Context, id string) (*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
		       status, result_data, duration_ms,
		       executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE id = $1 AND is_deleted = FALSE
	`

	var tr db.TestResult
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&tr.ID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
		&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt, &tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("test result not found: %s", err)
	}
	return &tr, err
}

func (t *PostgresTx) DeleteTestResult(ctx context.Context, id string) error {
	query := `
		UPDATE test_results
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *PostgresTx) UpsertSyncMetaData(ctx context.Context, meta *db.SyncMetadata) error {
	query := `
		INSERT INTO sync_metadata (
			user_id,
			client_id,
			last_sync_at,
			last_sync_version,
			sync_status
		)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (user_id, client_id) DO UPDATE SET
			last_sync_at = EXCLUDED.last_sync_at,
			last_sync_version = EXCLUDED.last_sync_version,
			sync_status = EXCLUDED.sync_status
	`
	_, err := t.tx.ExecContext(ctx, query, meta.UserID, meta.ClientID, meta.LastSyncAt, meta.LastSyncVersion, meta.SyncStatus)
	return err
}

func (t *PostgresTx) GetSyncMetaData(ctx context.Context, userID string, clientID string) (*db.SyncMetadata, error) {
	query := `
		SELECT user_id, client_id, last_sync_at, last_sync_version, sync_status
		FROM sync_metadata
		WHERE user_id = $1 AND client_id = $2
	`

	var meta db.SyncMetadata
	err := t.tx.QueryRowContext(ctx, query, userID, clientID).Scan(
		&meta.UserID,
		&meta.ClientID,
		&meta.LastSyncAt,
		&meta.LastSyncVersion,
		&meta.SyncStatus,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("sync metadata not found for user=%s client=%s", userID, clientID)
	}
	return &meta, err
}
