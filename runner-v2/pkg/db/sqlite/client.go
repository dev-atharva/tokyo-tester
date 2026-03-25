package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dev-atharva/cots/pkg/db"
	_ "github.com/mattn/go-sqlite3"
)

type Client struct {
	conn *sql.DB
	path string
}

func NewClient(path string) (*Client, error) {
	conn, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection to sqlite database: %w ", err)
	}

	conn.SetMaxIdleConns(1)
	conn.SetMaxOpenConns(1)

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping sqlite database: %w", err)
	}

	_, err = conn.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	return &Client{
		conn: conn,
		path: path,
	}, nil
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
		INSERT INTO workflows (id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			nodes_config = excluded.nodes_config,
			edges_config = excluded.edges_config,
			metadata = excluded.metadata,
			version = excluded.version,
			updated_at = excluded.updated_at,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
	`
	_, err := c.conn.ExecContext(ctx, query,
		workflow.ID,
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
		SELECT id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflows
		WHERE id = ? AND is_deleted = 0
	`
	var wf db.Workflow
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&wf.ID,
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

func (c *Client) ListWorkflows(ctx context.Context, userID string) ([]*db.Workflow, error) {
	query := `
		SELECT id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflows
		WHERE user_id = ? AND is_deleted = 0
		ORDER BY updated_at DESC
	`
	rows, err := c.conn.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workflows []*db.Workflow
	for rows.Next() {
		var wf db.Workflow
		if err := rows.Scan(
			&wf.ID,
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

func (c *Client) UpsertSession(ctx context.Context, session *db.Session) error {
	query := `
		INSERT INTO sessions (
			id, workflow_id, status, result, container_ids, logs, error,
			started_at, completed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			workflow_id = excluded.workflow_id,
			status = excluded.status,
			result = excluded.result,
			container_ids = excluded.container_ids,
			logs = excluded.logs,
			error = excluded.error,
			started_at = excluded.started_at,
			completed_at = excluded.completed_at,
			updated_at = excluded.updated_at,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
	`
	_, err := c.conn.ExecContext(ctx, query,
		session.ID,
		session.WorkflowID,
		session.Status,
		session.Result,
		session.ContainerIDs,
		session.Logs,
		session.Error,
		session.StartedAt,
		session.CompletedAt,
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
		SELECT id, workflow_id, status, result, container_ids, logs, error,
			started_at, completed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE id = ? AND is_deleted = 0
	`
	var s db.Session
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&s.ID,
		&s.WorkflowID,
		&s.Status,
		&s.Result,
		&s.ContainerIDs,
		&s.Logs,
		&s.Error,
		&s.StartedAt,
		&s.CompletedAt,
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
		SELECT id, workflow_id, status, result, container_ids, logs, error,
			started_at, completed_at, created_at, updated_at, client_id, user_id, is_deleted
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
			&s.WorkflowID,
			&s.Status,
			&s.Result,
			&s.ContainerIDs,
			&s.Logs,
			&s.Error,
			&s.StartedAt,
			&s.CompletedAt,
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

func (c *Client) ListSessionsByUserId(ctx context.Context, userID string) ([]*db.Session, error) {
	query := `
		SELECT id, workflow_id, status, result, container_ids, logs, error,
			started_at, completed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM sessions
		WHERE user_id = ? AND is_deleted = 0
		ORDER BY created_at DESC
	`
	rows, err := c.conn.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*db.Session
	for rows.Next() {
		var s db.Session
		if err := rows.Scan(
			&s.ID,
			&s.WorkflowID,
			&s.Status,
			&s.Result,
			&s.ContainerIDs,
			&s.Logs,
			&s.Error,
			&s.StartedAt,
			&s.CompletedAt,
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
			id, session_id, workflow_id, test_name, test_type,
			status, result_data, duration_ms,
			executed_at, created_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
	`
	_, err := c.conn.ExecContext(ctx, query,
		tr.ID, tr.SessionID, tr.WorkflowID, tr.TestName, tr.TestType,
		tr.Status, tr.ResultData, tr.DurationMs, tr.ExecutedAt,
		tr.CreatedAt, tr.ClientID, tr.UserID, tr.IsDeleted,
	)
	return err
}

func (c *Client) UpsertTestResult(ctx context.Context, result *db.TestResult) error {
	query := `
		INSERT INTO test_results (
			id, session_id, workflow_id, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			status = excluded.status,
			result_data = excluded.result_data,
			duration_ms = excluded.duration_ms,
			executed_at = excluded.executed_at,
			updated_at = excluded.updated_at,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
	`
	_, err := c.conn.ExecContext(ctx, query,
		result.ID,
		result.SessionID,
		result.WorkflowID,
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
		SELECT id, session_id, workflow_id, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE id = ? AND is_deleted = 0
	`
	var tr db.TestResult
	err := c.conn.QueryRowContext(ctx, query, id).Scan(
		&tr.ID,
		&tr.SessionID,
		&tr.WorkflowID,
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
		SELECT id, session_id, workflow_id, test_name, test_type, status, result_data,
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
			&tr.SessionID,
			&tr.WorkflowID,
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

func (c *Client) ListTestResultsByUserId(ctx context.Context, userID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_id, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE user_id = ? AND is_deleted = 0
		ORDER BY executed_at DESC
	`
	rows, err := c.conn.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*db.TestResult
	for rows.Next() {
		var tr db.TestResult
		if err := rows.Scan(
			&tr.ID,
			&tr.SessionID,
			&tr.WorkflowID,
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
		ON CONFLICT(user_id, client_id) DO UPDATE SET
			last_sync_at = excluded.last_sync_at,
			last_sync_version = excluded.last_sync_version,
			sync_status = excluded.sync_status
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
	return c.conn
}

func (c *Client) BeginTx(ctx context.Context) (db.Tx, error) {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelSerializable,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	return &SQLiteTx{tx: tx}, nil
}

// SQLiteTx wraps a sql.Tx and implements db.Tx for SQLite.
// Note: SQLite uses SERIALIZABLE isolation (its only supported level).
type SQLiteTx struct {
	tx *sql.Tx
}

func (t *SQLiteTx) Commit() error {
	return t.tx.Commit()
}

func (t *SQLiteTx) Rollback() error {
	return t.tx.Rollback()
}

func (t *SQLiteTx) UpsertWorkflow(ctx context.Context, workflow *db.Workflow) error {
	query := `
		INSERT INTO workflows (id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			nodes_config = excluded.nodes_config,
			edges_config = excluded.edges_config,
			metadata = excluded.metadata,
			version = excluded.version,
			updated_at = excluded.updated_at,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
	`
	_, err := t.tx.ExecContext(ctx, query,
		workflow.ID, workflow.Name, workflow.Description, workflow.NodesConfig,
		workflow.EdgesConfig, workflow.Metadata, workflow.Version, workflow.CreatedAt,
		workflow.UpdatedAt, workflow.ClientID, workflow.UserID, workflow.IsDeleted,
	)
	return err
}

func (t *SQLiteTx) GetWorkflow(ctx context.Context, id string) (*db.Workflow, error) {
	query := `
		SELECT id, name, description, nodes_config, edges_config, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		FROM workflows
		WHERE id = ? AND is_deleted = 0
	`
	var wf db.Workflow
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&wf.ID, &wf.Name, &wf.Description, &wf.NodesConfig, &wf.EdgesConfig,
		&wf.Metadata, &wf.Version, &wf.CreatedAt, &wf.UpdatedAt,
		&wf.ClientID, &wf.UserID, &wf.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow not found: %s", id)
	}
	return &wf, err
}

func (t *SQLiteTx) DeleteWorkflow(ctx context.Context, id string) error {
	query := `
		UPDATE workflows
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *SQLiteTx) UpsertSession(ctx context.Context, s *db.Session) error {
	query := `
		INSERT INTO sessions (
			id, workflow_id, status, result, container_ids, logs, error,
			started_at, completed_at, version, created_at, updated_at,
			client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			workflow_id = excluded.workflow_id,
			status = excluded.status,
			result = excluded.result,
			container_ids = excluded.container_ids,
			logs = excluded.logs,
			error = excluded.error,
			started_at = excluded.started_at,
			completed_at = excluded.completed_at,
			version = excluded.version,
			updated_at = excluded.updated_at,
			client_id = excluded.client_id,
			user_id = excluded.user_id,
			is_deleted = excluded.is_deleted
		WHERE sessions.version = excluded.version - 1
	`
	result, err := t.tx.ExecContext(ctx, query,
		s.ID, s.WorkflowID, s.Status, s.Result,
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

func (t *SQLiteTx) GetSession(ctx context.Context, id string) (*db.Session, error) {
	query := `
		SELECT id, workflow_id, status, result, container_ids, logs, error,
			started_at, completed_at, version, created_at, updated_at,
			client_id, user_id, is_deleted
		FROM sessions
		WHERE id = ? AND is_deleted = 0
	`
	var s db.Session
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&s.ID, &s.WorkflowID, &s.Status, &s.Result, &s.ContainerIDs, &s.Logs,
		&s.Error, &s.StartedAt, &s.CompletedAt, &s.Version,
		&s.CreatedAt, &s.UpdatedAt,
		&s.ClientID, &s.UserID, &s.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	return &s, err
}

func (t *SQLiteTx) DeleteSession(ctx context.Context, id string) error {
	query := `
		UPDATE sessions
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *SQLiteTx) ListTestResult(ctx context.Context, sessionID string) ([]*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_id, test_name, test_type, status, result_data,
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
			&tr.ID, &tr.SessionID, &tr.WorkflowID, &tr.TestName, &tr.TestType,
			&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
			&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
		); err != nil {
			return nil, err
		}
		results = append(results, &tr)
	}
	return results, nil
}

func (t *SQLiteTx) UpsertTestResult(ctx context.Context, result *db.TestResult) error {
	query := `
		INSERT INTO test_results (
			id, session_id, workflow_id, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
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
		result.ID, result.SessionID, result.WorkflowID, result.TestName, result.TestType,
		result.Status, result.ResultData, result.DurationMs, result.ExecutedAt,
		result.CreatedAt, result.UpdatedAt, result.ClientID, result.UserID, result.IsDeleted,
	)
	return err
}

func (t *SQLiteTx) GetTestResult(ctx context.Context, id string) (*db.TestResult, error) {
	query := `
		SELECT id, session_id, workflow_id, test_name, test_type, status, result_data,
			duration_ms, executed_at, created_at, updated_at, client_id, user_id, is_deleted
		FROM test_results
		WHERE id = ? AND is_deleted = 0
	`
	var tr db.TestResult
	err := t.tx.QueryRowContext(ctx, query, id).Scan(
		&tr.ID, &tr.SessionID, &tr.WorkflowID, &tr.TestName, &tr.TestType,
		&tr.Status, &tr.ResultData, &tr.DurationMs, &tr.ExecutedAt,
		&tr.CreatedAt, &tr.UpdatedAt, &tr.ClientID, &tr.UserID, &tr.IsDeleted,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("test result not found: %s", id)
	}
	return &tr, err
}

func (t *SQLiteTx) DeleteTestResult(ctx context.Context, id string) error {
	query := `
		UPDATE test_results
		SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND is_deleted = 0
	`
	_, err := t.tx.ExecContext(ctx, query, id)
	return err
}

func (t *SQLiteTx) UpsertSyncMetaData(ctx context.Context, meta *db.SyncMetadata) error {
	query := `
		INSERT INTO sync_metadata (
			user_id, client_id, last_sync_at, last_sync_version, sync_status
		)
		VALUES (?,?,?,?,?)
		ON CONFLICT(user_id, client_id) DO UPDATE SET
			last_sync_at = excluded.last_sync_at,
			last_sync_version = excluded.last_sync_version,
			sync_status = excluded.sync_status
	`
	_, err := t.tx.ExecContext(ctx, query,
		meta.UserID, meta.ClientID, meta.LastSyncAt, meta.LastSyncVersion, meta.SyncStatus,
	)
	return err
}

func (t *SQLiteTx) GetSyncMetaData(ctx context.Context, userID string, clientID string) (*db.SyncMetadata, error) {
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
