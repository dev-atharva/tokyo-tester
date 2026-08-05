package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/browserjourney"
	"github.com/dev-atharva/cots/pkg/db"
	mysqldriver "github.com/go-sql-driver/mysql"
)

type Client struct {
	conn *db.LoggedDB
	dsn  string
}

func (c *Client) CreateJourneyArtifact(ctx context.Context, record browserjourney.ArtifactRecord) error {
	_, err := c.conn.ExecContext(ctx, `INSERT INTO browser_journey_artifacts (id, project_id, workflow_run_id, scenario_run_id, kind, content_type, size_bytes, sha256, storage_key, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		record.ArtifactID, record.ProjectID, record.WorkflowRunID, record.ScenarioRunID, record.Kind, record.ContentType, record.SizeBytes, record.SHA256, record.StorageKey, record.CreatedAt, record.ExpiresAt)
	return err
}

func (c *Client) GetJourneyArtifact(ctx context.Context, id, projectID, workflowRunID string) (browserjourney.ArtifactRecord, error) {
	var record browserjourney.ArtifactRecord
	err := c.conn.QueryRowContext(ctx, `SELECT id, project_id, workflow_run_id, scenario_run_id, kind, content_type, size_bytes, sha256, storage_key, created_at, expires_at FROM browser_journey_artifacts WHERE id = ? AND project_id = ? AND workflow_run_id = ?`, id, projectID, workflowRunID).Scan(
		&record.ArtifactID, &record.ProjectID, &record.WorkflowRunID, &record.ScenarioRunID, &record.Kind, &record.ContentType, &record.SizeBytes, &record.SHA256, &record.StorageKey, &record.CreatedAt, &record.ExpiresAt)
	return record, err
}

func (c *Client) DeleteExpiredJourneyArtifacts(ctx context.Context, cutoff time.Time) ([]browserjourney.ArtifactRecord, error) {
	tx, err := c.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id, project_id, workflow_run_id, scenario_run_id, kind, content_type, size_bytes, sha256, storage_key, created_at, expires_at FROM browser_journey_artifacts WHERE expires_at <= ? FOR UPDATE`, cutoff)
	if err != nil {
		return nil, err
	}
	records := []browserjourney.ArtifactRecord{}
	for rows.Next() {
		var record browserjourney.ArtifactRecord
		if err := rows.Scan(&record.ArtifactID, &record.ProjectID, &record.WorkflowRunID, &record.ScenarioRunID, &record.Kind, &record.ContentType, &record.SizeBytes, &record.SHA256, &record.StorageKey, &record.CreatedAt, &record.ExpiresAt); err != nil {
			rows.Close()
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM browser_journey_artifacts WHERE expires_at <= ?`, cutoff); err != nil {
		return nil, err
	}
	return records, tx.Commit()
}

func NewClient(dsn string) (*Client, error) {
	normalizedDSN, err := NormalizeDSN(dsn)
	if err != nil {
		return nil, err
	}

	conn, err := sql.Open("mysql", normalizedDSN)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection to mysql database: %w ", err)
	}

	conn.SetMaxIdleConns(2)
	conn.SetMaxOpenConns(10)

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping mysql database: %w", err)
	}

	loggedConn := db.NewLoggedDB(conn, "mysql")

	return &Client{
		conn: loggedConn,
		dsn:  normalizedDSN,
	}, nil
}

func NormalizeDSN(input string) (string, error) {
	if strings.TrimSpace(input) == "" {
		return "", fmt.Errorf("DATABASE_URL must be set for mysql")
	}
	if strings.HasPrefix(input, "mysql://") {
		parsed, err := url.Parse(input)
		if err != nil {
			return "", fmt.Errorf("failed to parse mysql DATABASE_URL: %w", err)
		}
		if parsed.User == nil || parsed.Host == "" {
			return "", fmt.Errorf("mysql DATABASE_URL must include user and host")
		}
		username := parsed.User.Username()
		password, _ := parsed.User.Password()
		database := strings.TrimPrefix(parsed.Path, "/")
		if database == "" {
			return "", fmt.Errorf("mysql DATABASE_URL must include a database name")
		}
		host := parsed.Host
		if parsed.Port() == "" {
			host = net.JoinHostPort(parsed.Hostname(), "3306")
		}
		cfg := mysqldriver.NewConfig()
		cfg.User = username
		cfg.Passwd = password
		cfg.Net = "tcp"
		cfg.Addr = host
		cfg.DBName = database
		cfg.ParseTime = true
		cfg.MultiStatements = true
		cfg.Params = queryToMap(parsed.Query())
		return cfg.FormatDSN(), nil
	}
	cfg, err := mysqldriver.ParseDSN(input)
	if err != nil {
		return "", fmt.Errorf("failed to parse mysql DSN: %w", err)
	}
	cfg.ParseTime = true
	cfg.MultiStatements = true
	return cfg.FormatDSN(), nil
}

func queryToMap(values url.Values) map[string]string {
	params := map[string]string{}
	for key, value := range values {
		if strings.EqualFold(key, "parseTime") || strings.EqualFold(key, "multiStatements") {
			continue
		}
		if len(value) > 0 {
			params[key] = value[len(value)-1]
		}
	}
	return params
}

func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

func (c *Client) Ping(ctx context.Context) error {
	return c.conn.PingContext(ctx)
}

func (c *Client) UpsertWorkflow(ctx context.Context, workflow *db.Workflow) error {
	query := `
		INSERT INTO workflows (id, project_id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			name = VALUES(name),
			description = VALUES(description),
			nodes_config = VALUES(nodes_config),
			edges_config = VALUES(edges_config),
			metadata = VALUES(metadata),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := c.conn.ExecContext(ctx, query,
		workflow.ID,
		workflow.ProjectID,
		workflow.Name,
		workflow.Description,
		workflow.NodesConfig,
		workflow.EdgesConfig,
		workflow.Metadata,
		workflow.Version,
		workflow.CreatedAt,
		workflow.UpdatedAt,
		workflow.ClientID,
		workflow.UserID,
		workflow.IsDeleted,
	)
	return err
}

func (c *Client) GetWorkflow(ctx context.Context, id string) (*db.Workflow, error) {
	query := `
		SELECT id, project_id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflows
		WHERE id = ? AND is_deleted = 0
	`
	var wf db.Workflow
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&wf.ID,
		&wf.ProjectID,
		&wf.Name,
		&wf.Description,
		&wf.NodesConfig,
		&wf.EdgesConfig,
		&wf.Metadata,
		&wf.Version,
		&wf.CreatedAt,
		&wf.UpdatedAt,
		&wf.ClientID,
		&wf.UserID,
		&wf.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	return &wf, nil
}

func (c *Client) DeleteWorkflow(ctx context.Context, id string) error {
	query := `
		UPDATE workflows
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := c.conn.ExecContext(ctx, query, id)
	return err
}

func (c *Client) ListWorkflows(ctx context.Context, projectID string) ([]*db.Workflow, error) {
	query := `
		SELECT id, project_id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflows
		WHERE project_id = ? AND is_deleted = 0
		ORDER BY updated_at DESC
	`
	rows, err := c.conn.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workflows []*db.Workflow
	for rows.Next() {
		var wf db.Workflow
		if err := rows.Scan(
			&wf.ID,
			&wf.ProjectID,
			&wf.Name,
			&wf.Description,
			&wf.NodesConfig,
			&wf.EdgesConfig,
			&wf.Metadata,
			&wf.Version,
			&wf.CreatedAt,
			&wf.UpdatedAt,
			&wf.ClientID,
			&wf.UserID,
			&wf.IsDeleted,
		); err != nil {
			return nil, err
		}
		workflows = append(workflows, &wf)
	}
	return workflows, nil
}

func (c *Client) UpsertScenario(ctx context.Context, scenario *db.Scenario) error {
	query := `
		INSERT INTO scenarios (id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_id = VALUES(workflow_id),
			name = VALUES(name),
			description = VALUES(description),
			execution_model = VALUES(execution_model),
			tests_config = VALUES(tests_config),
			test_order = VALUES(test_order),
			environment_config = VALUES(environment_config),
			steps_config = VALUES(steps_config),
			step_order = VALUES(step_order),
			metadata = VALUES(metadata),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := c.conn.ExecContext(ctx, query,
		scenario.ID, scenario.ProjectID, scenario.WorkflowID, scenario.Name, scenario.Description,
		scenario.ExecutionModel, scenario.TestsConfig, scenario.TestOrder, scenario.EnvironmentConfig, scenario.StepsConfig, scenario.StepOrder, scenario.Metadata, scenario.Version,
		scenario.CreatedAt, scenario.UpdatedAt, scenario.ClientID, scenario.UserID, scenario.IsDeleted,
	)
	return err
}

func (c *Client) GetScenario(ctx context.Context, id string) (*db.Scenario, error) {
	query := `
		SELECT id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios WHERE id = ? AND is_deleted = 0
	`
	var sc db.Scenario
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&sc.ID, &sc.ProjectID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.ExecutionModel, &sc.TestsConfig, &sc.TestOrder, &sc.EnvironmentConfig, &sc.StepsConfig, &sc.StepOrder,
		&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	return &sc, err
}

func (c *Client) DeleteScenario(ctx context.Context, id string) error {
	_, err := c.conn.ExecContext(ctx, `UPDATE scenarios SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`, id)
	return err
}

func (c *Client) ListScenariosByWorkflow(ctx context.Context, workflowID string) ([]*db.Scenario, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios WHERE workflow_id = ? AND is_deleted = 0 ORDER BY updated_at DESC
	`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var scenarios []*db.Scenario
	for rows.Next() {
		var sc db.Scenario
		if err := rows.Scan(
			&sc.ID, &sc.ProjectID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.ExecutionModel, &sc.TestsConfig, &sc.TestOrder, &sc.EnvironmentConfig, &sc.StepsConfig, &sc.StepOrder,
			&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
		); err != nil {
			return nil, err
		}
		scenarios = append(scenarios, &sc)
	}
	return scenarios, nil
}

func (c *Client) ListScenariosByProjectID(ctx context.Context, projectID string) ([]*db.Scenario, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios WHERE project_id = ? AND is_deleted = 0 ORDER BY updated_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var scenarios []*db.Scenario
	for rows.Next() {
		var sc db.Scenario
		if err := rows.Scan(
			&sc.ID, &sc.ProjectID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.ExecutionModel, &sc.TestsConfig, &sc.TestOrder, &sc.EnvironmentConfig, &sc.StepsConfig, &sc.StepOrder,
			&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
		); err != nil {
			return nil, err
		}
		scenarios = append(scenarios, &sc)
	}
	return scenarios, nil
}

func (c *Client) UpsertWorkflowRun(ctx context.Context, workflowRun *db.WorkflowRun) error {
	query := `
		INSERT INTO workflow_runs (id, project_id, workflow_id, status, summary, logs, error, started_at, completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_id = VALUES(workflow_id),
			status = VALUES(status),
			summary = VALUES(summary),
			logs = VALUES(logs),
			error = VALUES(error),
			started_at = VALUES(started_at),
			completed_at = VALUES(completed_at),
			metadata = VALUES(metadata),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := c.conn.ExecContext(ctx, query,
		workflowRun.ID, workflowRun.ProjectID, workflowRun.WorkflowID, workflowRun.Status, workflowRun.Summary, workflowRun.Logs,
		workflowRun.Error, workflowRun.StartedAt, workflowRun.CompletedAt, workflowRun.Metadata, workflowRun.Version,
		workflowRun.CreatedAt, workflowRun.UpdatedAt, workflowRun.ClientID, workflowRun.UserID, workflowRun.IsDeleted,
	)
	return err
}

func (c *Client) GetWorkflowRun(ctx context.Context, id string) (*db.WorkflowRun, error) {
	query := `
		SELECT id, project_id, workflow_id, status, summary, logs, error, started_at, completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs WHERE id = ? AND is_deleted = 0
	`
	var wr db.WorkflowRun
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&wr.ID, &wr.ProjectID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
		&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version, &wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow run not found: %s", id)
	}
	return &wr, err
}

func (c *Client) DeleteWorkflowRun(ctx context.Context, id string) error {
	_, err := c.conn.ExecContext(ctx, `UPDATE workflow_runs SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`, id)
	return err
}

func (c *Client) ListWorkflowRunsByWorkflow(ctx context.Context, workflowID string) ([]*db.WorkflowRun, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, project_id, workflow_id, status, summary, logs, error, started_at, completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs WHERE workflow_id = ? AND is_deleted = 0 ORDER BY created_at DESC
	`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var runs []*db.WorkflowRun
	for rows.Next() {
		var wr db.WorkflowRun
		if err := rows.Scan(
			&wr.ID, &wr.ProjectID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
			&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version, &wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
		); err != nil {
			return nil, err
		}
		runs = append(runs, &wr)
	}
	return runs, nil
}

func (c *Client) ListWorkflowRunsByProjectID(ctx context.Context, projectID string) ([]*db.WorkflowRun, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, project_id, workflow_id, status, summary, logs, error, started_at, completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var runs []*db.WorkflowRun
	for rows.Next() {
		var wr db.WorkflowRun
		if err := rows.Scan(
			&wr.ID, &wr.ProjectID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
			&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version, &wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
		); err != nil {
			return nil, err
		}
		runs = append(runs, &wr)
	}
	return runs, nil
}

func (c *Client) UpsertSession(ctx context.Context, session *db.Session) error {
	query := `
		INSERT INTO sessions (
			id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_run_id = VALUES(workflow_run_id),
			workflow_id = VALUES(workflow_id),
			scenario_id = VALUES(scenario_id),
			scenario_name = VALUES(scenario_name),
			backend_session_id = VALUES(backend_session_id),
			status = VALUES(status),
			result = VALUES(result),
			container_ids = VALUES(container_ids),
			logs = VALUES(logs),
			error = VALUES(error),
			started_at = VALUES(started_at),
			completed_at = VALUES(completed_at),
			owner_id = VALUES(owner_id),
			lease_expires_at = VALUES(lease_expires_at),
			heartbeat_at = VALUES(heartbeat_at),
			phase = VALUES(phase),
			checkpoint_index = VALUES(checkpoint_index),
			service_graph = VALUES(service_graph),
			test_plan = VALUES(test_plan),
			runtime_snapshot = VALUES(runtime_snapshot),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := c.conn.ExecContext(ctx, query,
		session.ID,
		session.ProjectID,
		session.WorkflowRunID,
		session.WorkflowID,
		session.ScenarioID,
		session.ScenarioName,
		session.BackendSessionID,
		session.Status,
		session.Result,
		session.ContainerIDs,
		session.Logs,
		session.Error,
		session.StartedAt,
		session.CompletedAt,
		session.OwnerID,
		session.LeaseExpiresAt,
		session.HeartbeatAt,
		session.Phase,
		session.CheckpointIndex,
		session.ServiceGraph,
		session.TestPlan,
		session.RuntimeSnapshot,
		session.CreatedAt,
		session.UpdatedAt,
		session.ClientID,
		session.UserID,
		session.IsDeleted,
	)
	return err
}

func (c *Client) GetSession(ctx context.Context, id string) (*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE id = ? AND is_deleted = 0
	`
	var s db.Session
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&s.ID,
		&s.ProjectID,
		&s.WorkflowRunID,
		&s.WorkflowID,
		&s.ScenarioID,
		&s.ScenarioName,
		&s.BackendSessionID,
		&s.Status,
		&s.Result,
		&s.ContainerIDs,
		&s.Logs,
		&s.Error,
		&s.StartedAt,
		&s.CompletedAt,
		&s.OwnerID,
		&s.LeaseExpiresAt,
		&s.HeartbeatAt,
		&s.Phase,
		&s.CheckpointIndex,
		&s.ServiceGraph,
		&s.TestPlan,
		&s.RuntimeSnapshot,
		&s.CreatedAt,
		&s.UpdatedAt,
		&s.ClientID,
		&s.UserID,
		&s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	return &s, err
}

func (c *Client) GetSessionByBackendSessionID(ctx context.Context, backendSessionID string) (*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE backend_session_id = ? AND is_deleted = 0
		ORDER BY updated_at DESC
		LIMIT 1
	`
	var s db.Session
	err := c.conn.QueryRowContext(ctx, query, backendSessionID).Scan(
		&s.ID, &s.ProjectID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID,
		&s.Status, &s.Result, &s.ContainerIDs, &s.Logs, &s.Error,
		&s.StartedAt, &s.CompletedAt, &s.OwnerID, &s.LeaseExpiresAt, &s.HeartbeatAt, &s.Phase, &s.CheckpointIndex,
		&s.ServiceGraph, &s.TestPlan, &s.RuntimeSnapshot,
		&s.CreatedAt, &s.UpdatedAt, &s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found for backend_session_id: %s", backendSessionID)
	}
	return &s, err
}

func (c *Client) FindSessionByExecution(ctx context.Context, workflowRunID string, scenarioID string) (*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE workflow_run_id = ? AND scenario_id = ? AND is_deleted = 0
		ORDER BY updated_at DESC
		LIMIT 1
	`
	var s db.Session
	err := c.conn.QueryRowContext(ctx, query, workflowRunID, scenarioID).Scan(
		&s.ID, &s.ProjectID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID,
		&s.Status, &s.Result, &s.ContainerIDs, &s.Logs, &s.Error,
		&s.StartedAt, &s.CompletedAt, &s.OwnerID, &s.LeaseExpiresAt, &s.HeartbeatAt, &s.Phase, &s.CheckpointIndex,
		&s.ServiceGraph, &s.TestPlan, &s.RuntimeSnapshot,
		&s.CreatedAt, &s.UpdatedAt, &s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found for workflow_run_id=%s scenario_id=%s", workflowRunID, scenarioID)
	}
	return &s, err
}

func (c *Client) DeleteSession(ctx context.Context, id string) error {
	query := `
		UPDATE sessions
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := c.conn.ExecContext(ctx, query, id)
	return err
}

func (c *Client) ListSessions(ctx context.Context, workflowID string) ([]*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE workflow_id = ? AND is_deleted = 0
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
			&s.ID,
			&s.ProjectID,
			&s.WorkflowRunID,
			&s.WorkflowID,
			&s.ScenarioID,
			&s.ScenarioName,
			&s.BackendSessionID,
			&s.Status,
			&s.Result,
			&s.ContainerIDs,
			&s.Logs,
			&s.Error,
			&s.StartedAt,
			&s.CompletedAt,
			&s.OwnerID,
			&s.LeaseExpiresAt,
			&s.HeartbeatAt,
			&s.Phase,
			&s.CheckpointIndex,
			&s.ServiceGraph,
			&s.TestPlan,
			&s.RuntimeSnapshot,
			&s.CreatedAt,
			&s.UpdatedAt,
			&s.ClientID,
			&s.UserID,
			&s.IsDeleted,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, &s)
	}
	return sessions, nil
}

func (c *Client) ListSessionsByProjectID(ctx context.Context, projectID string) ([]*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE project_id = ? AND is_deleted = 0
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
			&s.ID,
			&s.ProjectID,
			&s.WorkflowRunID,
			&s.WorkflowID,
			&s.ScenarioID,
			&s.ScenarioName,
			&s.BackendSessionID,
			&s.Status,
			&s.Result,
			&s.ContainerIDs,
			&s.Logs,
			&s.Error,
			&s.StartedAt,
			&s.CompletedAt,
			&s.OwnerID,
			&s.LeaseExpiresAt,
			&s.HeartbeatAt,
			&s.Phase,
			&s.CheckpointIndex,
			&s.ServiceGraph,
			&s.TestPlan,
			&s.RuntimeSnapshot,
			&s.CreatedAt,
			&s.UpdatedAt,
			&s.ClientID,
			&s.UserID,
			&s.IsDeleted,
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
			id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type,
			status, result_data, duration_ms,
			executed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
	`
	_, err := c.conn.ExecContext(ctx, query,
		tr.ID, tr.ProjectID, tr.SessionID, tr.WorkflowRunID, tr.WorkflowID, tr.ScenarioID, tr.ScenarioName, tr.TestName, tr.TestType,
		tr.Status, tr.ResultData, tr.DurationMs, tr.ExecutedAt,
		tr.CreatedAt, tr.UpdatedAt, tr.ClientID, tr.UserID, tr.IsDeleted,
	)
	return err
}

func (c *Client) UpsertTestResult(ctx context.Context, result *db.TestResult) error {
	query := `
		INSERT INTO test_results (
			id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_run_id = VALUES(workflow_run_id),
			workflow_id = VALUES(workflow_id),
			scenario_id = VALUES(scenario_id),
			scenario_name = VALUES(scenario_name),
			status = VALUES(status),
			result_data = VALUES(result_data),
			duration_ms = VALUES(duration_ms),
			executed_at = VALUES(executed_at),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := c.conn.ExecContext(ctx, query,
		result.ID,
		result.ProjectID,
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
		SELECT id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE id = ? AND is_deleted = 0
	`
	var tr db.TestResult
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&tr.ID,
		&tr.ProjectID,
		&tr.SessionID,
		&tr.WorkflowRunID,
		&tr.WorkflowID,
		&tr.ScenarioID,
		&tr.ScenarioName,
		&tr.TestName,
		&tr.TestType,
		&tr.Status,
		&tr.ResultData,
		&tr.DurationMs,
		&tr.ExecutedAt,
		&tr.CreatedAt,
		&tr.UpdatedAt,
		&tr.ClientID,
		&tr.UserID,
		&tr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("test result not found: %s", id)
	}
	return &tr, err
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

func (c *Client) ListTestResults(ctx context.Context, sessionID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE session_id = ? AND is_deleted = 0
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
			&tr.ID,
			&tr.ProjectID,
			&tr.SessionID,
			&tr.WorkflowRunID,
			&tr.WorkflowID,
			&tr.ScenarioID,
			&tr.ScenarioName,
			&tr.TestName,
			&tr.TestType,
			&tr.Status,
			&tr.ResultData,
			&tr.DurationMs,
			&tr.ExecutedAt,
			&tr.CreatedAt,
			&tr.UpdatedAt,
			&tr.ClientID,
			&tr.UserID,
			&tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (c *Client) ListTestResultsByProjectID(ctx context.Context, projectID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE project_id = ? AND is_deleted = 0
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
			&tr.ID,
			&tr.ProjectID,
			&tr.SessionID,
			&tr.WorkflowRunID,
			&tr.WorkflowID,
			&tr.ScenarioID,
			&tr.ScenarioName,
			&tr.TestName,
			&tr.TestType,
			&tr.Status,
			&tr.ResultData,
			&tr.DurationMs,
			&tr.ExecutedAt,
			&tr.CreatedAt,
			&tr.UpdatedAt,
			&tr.ClientID,
			&tr.UserID,
			&tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (c *Client) UpsertSyncMetaData(ctx context.Context, meta *db.SyncMetadata) error {
	query := `
		INSERT INTO sync_metadata (
			user_id, client_id, last_sync_at, last_sync_version, sync_status
		)
		VALUES (?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			last_sync_at = VALUES(last_sync_at),
			last_sync_version = VALUES(last_sync_version),
			sync_status = VALUES(sync_status)
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
		WHERE user_id = ? AND client_id = ?
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
			userID,
			clientID,
		)
	}
	return &meta, err
}

func (c *Client) GetConnection() *sql.DB {
	return c.conn.DB
}

func (c *Client) BeginTx(ctx context.Context) (db.Tx, error) {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelSerializable,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	return &MySQLTx{tx: tx}, nil
}

// MySQLTx wraps a sql.Tx and implements db.Tx for MySQL.
type MySQLTx struct {
	tx *sql.Tx
}

func (t *MySQLTx) Commit() error {
	return t.tx.Commit()
}

func (t *MySQLTx) Rollback() error {
	return t.tx.Rollback()
}

func (t *MySQLTx) UpsertWorkflow(ctx context.Context, workflow *db.Workflow) error {
	query := `
		INSERT INTO workflows (id, project_id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			name = VALUES(name),
			description = VALUES(description),
			nodes_config = VALUES(nodes_config),
			edges_config = VALUES(edges_config),
			metadata = VALUES(metadata),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := t.tx.ExecContext(ctx, query,
		workflow.ID, workflow.ProjectID, workflow.Name, workflow.Description, workflow.NodesConfig,
		workflow.EdgesConfig, workflow.Metadata, workflow.Version, workflow.CreatedAt,
		workflow.UpdatedAt, workflow.ClientID, workflow.UserID, workflow.IsDeleted,
	)
	return err
}

func (t *MySQLTx) UpdateWorkflowIfVersion(ctx context.Context, workflow *db.Workflow, baseVersion int) (bool, error) {
	result, err := t.tx.ExecContext(ctx, `
		UPDATE workflows SET project_id = ?, name = ?, description = ?, nodes_config = ?, edges_config = ?,
			metadata = ?, version = ?, updated_at = ?, client_id = ?, user_id = ?, is_deleted = ?
		WHERE id = ? AND version = ? AND is_deleted = 0
	`, workflow.ProjectID, workflow.Name, workflow.Description, workflow.NodesConfig, workflow.EdgesConfig,
		workflow.Metadata, workflow.Version, workflow.UpdatedAt, workflow.ClientID, workflow.UserID,
		workflow.IsDeleted, workflow.ID, baseVersion)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows == 1, err
}

func (t *MySQLTx) GetWorkflow(ctx context.Context, id string) (*db.Workflow, error) {
	query := `
		SELECT id, project_id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflows
		WHERE id = ? AND is_deleted = 0
	`
	var wf db.Workflow
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&wf.ID, &wf.ProjectID, &wf.Name, &wf.Description, &wf.NodesConfig, &wf.EdgesConfig,
		&wf.Metadata, &wf.Version, &wf.CreatedAt, &wf.UpdatedAt,
		&wf.ClientID, &wf.UserID, &wf.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", id)
	}
	return &wf, err
}

func (t *MySQLTx) DeleteWorkflow(ctx context.Context, id string) error {
	query := `
		UPDATE workflows
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *MySQLTx) DeleteWorkflowIfVersion(ctx context.Context, id string, baseVersion int) (bool, error) {
	result, err := t.tx.ExecContext(ctx, `UPDATE workflows SET is_deleted = 1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND is_deleted = 0`, id, baseVersion)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows == 1, err
}

func (t *MySQLTx) UpsertScenario(ctx context.Context, scenario *db.Scenario) error {
	query := `
		INSERT INTO scenarios (id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_id = VALUES(workflow_id),
			name = VALUES(name),
			description = VALUES(description),
			execution_model = VALUES(execution_model),
			tests_config = VALUES(tests_config),
			test_order = VALUES(test_order),
			environment_config = VALUES(environment_config),
			steps_config = VALUES(steps_config),
			step_order = VALUES(step_order),
			metadata = VALUES(metadata),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := t.tx.ExecContext(ctx, query,
		scenario.ID, scenario.ProjectID, scenario.WorkflowID, scenario.Name, scenario.Description,
		scenario.ExecutionModel, scenario.TestsConfig, scenario.TestOrder, scenario.EnvironmentConfig, scenario.StepsConfig, scenario.StepOrder, scenario.Metadata, scenario.Version,
		scenario.CreatedAt, scenario.UpdatedAt, scenario.ClientID, scenario.UserID, scenario.IsDeleted,
	)
	return err
}

func (t *MySQLTx) UpdateScenarioIfVersion(ctx context.Context, scenario *db.Scenario, baseVersion int) (bool, error) {
	result, err := t.tx.ExecContext(ctx, `
		UPDATE scenarios SET project_id = ?, workflow_id = ?, name = ?, description = ?, execution_model = ?, tests_config = ?,
			test_order = ?, environment_config = ?, steps_config = ?, step_order = ?, metadata = ?, version = ?, updated_at = ?, client_id = ?, user_id = ?, is_deleted = ?
		WHERE id = ? AND version = ? AND is_deleted = 0
	`, scenario.ProjectID, scenario.WorkflowID, scenario.Name, scenario.Description, scenario.ExecutionModel, scenario.TestsConfig,
		scenario.TestOrder, scenario.EnvironmentConfig, scenario.StepsConfig, scenario.StepOrder, scenario.Metadata, scenario.Version, scenario.UpdatedAt, scenario.ClientID,
		scenario.UserID, scenario.IsDeleted, scenario.ID, baseVersion)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows == 1, err
}

func (t *MySQLTx) GetScenario(ctx context.Context, id string) (*db.Scenario, error) {
	var sc db.Scenario
	err := t.tx.QueryRowContext(ctx, `
		SELECT id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios WHERE id = ? AND is_deleted = 0
	`, id).Scan(
		&sc.ID, &sc.ProjectID, &sc.WorkflowID, &sc.Name, &sc.Description, &sc.ExecutionModel, &sc.TestsConfig, &sc.TestOrder, &sc.EnvironmentConfig, &sc.StepsConfig, &sc.StepOrder,
		&sc.Metadata, &sc.Version, &sc.CreatedAt, &sc.UpdatedAt, &sc.ClientID, &sc.UserID, &sc.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	return &sc, err
}

func (t *MySQLTx) ListScenariosByWorkflow(ctx context.Context, workflowID string) ([]*db.Scenario, error) {
	rows, err := t.tx.QueryContext(ctx, `
		SELECT id, project_id, workflow_id, name, description, execution_model, tests_config, test_order, environment_config, steps_config, step_order, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM scenarios WHERE workflow_id = ? AND is_deleted = 0 ORDER BY updated_at DESC
	`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var scenarios []*db.Scenario
	for rows.Next() {
		var scenario db.Scenario
		if err := rows.Scan(&scenario.ID, &scenario.ProjectID, &scenario.WorkflowID, &scenario.Name, &scenario.Description,
			&scenario.ExecutionModel, &scenario.TestsConfig, &scenario.TestOrder, &scenario.EnvironmentConfig, &scenario.StepsConfig, &scenario.StepOrder, &scenario.Metadata, &scenario.Version, &scenario.CreatedAt,
			&scenario.UpdatedAt, &scenario.ClientID, &scenario.UserID, &scenario.IsDeleted); err != nil {
			return nil, err
		}
		scenarios = append(scenarios, &scenario)
	}
	return scenarios, rows.Err()
}

func (t *MySQLTx) DeleteScenario(ctx context.Context, id string) error {
	_, err := t.tx.ExecContext(ctx, `UPDATE scenarios SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`, id)
	return err
}

func (t *MySQLTx) DeleteScenarioIfVersion(ctx context.Context, id string, baseVersion int) (bool, error) {
	result, err := t.tx.ExecContext(ctx, `UPDATE scenarios SET is_deleted = 1, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND is_deleted = 0`, id, baseVersion)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows == 1, err
}

func (t *MySQLTx) UpsertWorkflowRun(ctx context.Context, workflowRun *db.WorkflowRun) error {
	query := `
		INSERT INTO workflow_runs (id, project_id, workflow_id, status, summary, logs, error, started_at, completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_id = VALUES(workflow_id),
			status = VALUES(status),
			summary = VALUES(summary),
			logs = VALUES(logs),
			error = VALUES(error),
			started_at = VALUES(started_at),
			completed_at = VALUES(completed_at),
			metadata = VALUES(metadata),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := t.tx.ExecContext(ctx, query,
		workflowRun.ID, workflowRun.ProjectID, workflowRun.WorkflowID, workflowRun.Status, workflowRun.Summary, workflowRun.Logs,
		workflowRun.Error, workflowRun.StartedAt, workflowRun.CompletedAt, workflowRun.Metadata, workflowRun.Version,
		workflowRun.CreatedAt, workflowRun.UpdatedAt, workflowRun.ClientID, workflowRun.UserID, workflowRun.IsDeleted,
	)
	return err
}

func (t *MySQLTx) GetWorkflowRun(ctx context.Context, id string) (*db.WorkflowRun, error) {
	var wr db.WorkflowRun
	err := t.tx.QueryRowContext(ctx, `
		SELECT id, project_id, workflow_id, status, summary, logs, error, started_at, completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflow_runs WHERE id = ? AND is_deleted = 0
	`, id).Scan(
		&wr.ID, &wr.ProjectID, &wr.WorkflowID, &wr.Status, &wr.Summary, &wr.Logs, &wr.Error,
		&wr.StartedAt, &wr.CompletedAt, &wr.Metadata, &wr.Version, &wr.CreatedAt, &wr.UpdatedAt, &wr.ClientID, &wr.UserID, &wr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow run not found: %s", id)
	}
	return &wr, err
}

func (t *MySQLTx) DeleteWorkflowRun(ctx context.Context, id string) error {
	_, err := t.tx.ExecContext(ctx, `UPDATE workflow_runs SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`, id)
	return err
}

func (t *MySQLTx) UpsertSession(ctx context.Context, s *db.Session) error {
	query := `
		INSERT INTO sessions (
			id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot,
			version, created_at, updated_at,
			client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_run_id = VALUES(workflow_run_id),
			workflow_id = VALUES(workflow_id),
			scenario_id = VALUES(scenario_id),
			scenario_name = VALUES(scenario_name),
			backend_session_id = VALUES(backend_session_id),
			status = VALUES(status),
			result = VALUES(result),
			container_ids = VALUES(container_ids),
			logs = VALUES(logs),
			error = VALUES(error),
			started_at = VALUES(started_at),
			completed_at = VALUES(completed_at),
			owner_id = VALUES(owner_id),
			lease_expires_at = VALUES(lease_expires_at),
			heartbeat_at = VALUES(heartbeat_at),
			phase = VALUES(phase),
			checkpoint_index = VALUES(checkpoint_index),
			service_graph = VALUES(service_graph),
			test_plan = VALUES(test_plan),
			runtime_snapshot = VALUES(runtime_snapshot),
			version = VALUES(version),
			updated_at = VALUES(updated_at),
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	result, err := t.tx.ExecContext(ctx, query,
		s.ID, s.ProjectID, s.WorkflowRunID, s.WorkflowID, s.ScenarioID, s.ScenarioName, s.BackendSessionID, s.Status, s.Result,
		s.ContainerIDs, s.Logs, s.Error,
		s.StartedAt, s.CompletedAt, s.OwnerID, s.LeaseExpiresAt, s.HeartbeatAt, s.Phase, s.CheckpointIndex, s.ServiceGraph, s.TestPlan, s.RuntimeSnapshot, s.Version,
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

func (t *MySQLTx) GetSession(ctx context.Context, id string) (*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot, version, created_at, updated_at,
			client_id, user_id, is_deleted
		FROM sessions
		WHERE id = ? AND is_deleted = 0
	`
	var s db.Session
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&s.ID, &s.ProjectID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result, &s.ContainerIDs, &s.Logs,
		&s.Error, &s.StartedAt, &s.CompletedAt, &s.OwnerID, &s.LeaseExpiresAt, &s.HeartbeatAt, &s.Phase, &s.CheckpointIndex, &s.ServiceGraph, &s.TestPlan, &s.RuntimeSnapshot, &s.Version,
		&s.CreatedAt, &s.UpdatedAt,
		&s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	return &s, err
}

func (t *MySQLTx) GetSessionByBackendSessionID(ctx context.Context, backendSessionID string) (*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot, version, created_at, updated_at,
			client_id, user_id, is_deleted
		FROM sessions
		WHERE backend_session_id = ? AND is_deleted = 0
		ORDER BY updated_at DESC
		LIMIT 1
	`
	var s db.Session
	err := t.tx.QueryRowContext(ctx, query, backendSessionID).Scan(
		&s.ID, &s.ProjectID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result, &s.ContainerIDs, &s.Logs,
		&s.Error, &s.StartedAt, &s.CompletedAt, &s.OwnerID, &s.LeaseExpiresAt, &s.HeartbeatAt, &s.Phase, &s.CheckpointIndex, &s.ServiceGraph, &s.TestPlan, &s.RuntimeSnapshot, &s.Version,
		&s.CreatedAt, &s.UpdatedAt, &s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found for backend_session_id: %s", backendSessionID)
	}
	return &s, err
}

func (t *MySQLTx) FindSessionByExecution(ctx context.Context, workflowRunID string, scenarioID string) (*db.Session, error) {
	query := `
		SELECT id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name, backend_session_id, status, result, container_ids, logs, error,
			started_at, completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index, service_graph, test_plan, runtime_snapshot, version, created_at, updated_at,
			client_id, user_id, is_deleted
		FROM sessions
		WHERE workflow_run_id = ? AND scenario_id = ? AND is_deleted = 0
		ORDER BY updated_at DESC
		LIMIT 1
	`
	var s db.Session
	err := t.tx.QueryRowContext(ctx, query, workflowRunID, scenarioID).Scan(
		&s.ID, &s.ProjectID, &s.WorkflowRunID, &s.WorkflowID, &s.ScenarioID, &s.ScenarioName, &s.BackendSessionID, &s.Status, &s.Result, &s.ContainerIDs, &s.Logs,
		&s.Error, &s.StartedAt, &s.CompletedAt, &s.OwnerID, &s.LeaseExpiresAt, &s.HeartbeatAt, &s.Phase, &s.CheckpointIndex, &s.ServiceGraph, &s.TestPlan, &s.RuntimeSnapshot, &s.Version,
		&s.CreatedAt, &s.UpdatedAt, &s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found for workflow_run_id=%s scenario_id=%s", workflowRunID, scenarioID)
	}
	return &s, err
}

func (t *MySQLTx) DeleteSession(ctx context.Context, id string) error {
	query := `
		UPDATE sessions
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *MySQLTx) ListTestResult(ctx context.Context, sessionID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE session_id = ? AND is_deleted = 0
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
			&tr.ID, &tr.ProjectID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
			&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
			&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (t *MySQLTx) UpsertTestResult(ctx context.Context, result *db.TestResult) error {
	query := `
		INSERT INTO test_results (
			id, project_id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			project_id = VALUES(project_id),
			workflow_run_id = VALUES(workflow_run_id),
			workflow_id = VALUES(workflow_id),
			scenario_id = VALUES(scenario_id),
			scenario_name = VALUES(scenario_name),
			status = VALUES(status),
			result_data = VALUES(result_data),
			duration_ms = VALUES(duration_ms),
			executed_at = VALUES(executed_at),
			updated_at = CURRENT_TIMESTAMP,
			client_id = VALUES(client_id),
			user_id = VALUES(user_id),
			is_deleted = VALUES(is_deleted)
	`
	_, err := t.tx.ExecContext(ctx, query,
		result.ID, result.ProjectID, result.SessionID, result.WorkflowRunID, result.WorkflowID, result.ScenarioID, result.ScenarioName, result.TestName, result.TestType,
		result.Status, result.ResultData, result.DurationMs, result.ExecutedAt,
		result.CreatedAt, result.UpdatedAt, result.ClientID, result.UserID, result.IsDeleted,
	)
	return err
}

func (t *MySQLTx) GetTestResult(ctx context.Context, id string) (*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_run_id, workflow_id, scenario_id, scenario_name, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE id = ? AND is_deleted = 0
	`
	var tr db.TestResult
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&tr.ID, &tr.SessionID, &tr.WorkflowRunID, &tr.WorkflowID, &tr.ScenarioID, &tr.ScenarioName, &tr.TestName, &tr.TestType,
		&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
		&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("test result not found: %s", id)
	}
	return &tr, err
}

func (t *MySQLTx) DeleteTestResult(ctx context.Context, id string) error {
	query := `
		UPDATE test_results
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *MySQLTx) UpsertSyncMetaData(ctx context.Context, meta *db.SyncMetadata) error {
	query := `
		INSERT INTO sync_metadata (
			user_id, client_id, last_sync_at, last_sync_version, sync_status
		)
		VALUES (?,?,?,?,?)
		ON DUPLICATE KEY UPDATE
			last_sync_at = VALUES(last_sync_at),
			last_sync_version = VALUES(last_sync_version),
			sync_status = VALUES(sync_status)
	`
	_, err := t.tx.ExecContext(ctx, query,
		meta.UserID, meta.ClientID, meta.LastSyncAt, meta.LastSyncVersion, meta.SyncStatus,
	)
	return err
}

func (t *MySQLTx) GetSyncMetaData(ctx context.Context, userID string, clientID string) (*db.SyncMetadata, error) {
	query := `
		SELECT user_id, client_id, last_sync_at, last_sync_version, sync_status
		FROM sync_metadata
		WHERE user_id = ? AND client_id = ?
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
