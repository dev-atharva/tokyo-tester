package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

// EnqueueWorkflowJob creates the queue entry and its UI reconciliation records
// in one transaction. Retried submissions only repair missing records and never
// overwrite progress made by an already-running job.
func (c *Client) EnqueueWorkflowJob(ctx context.Context, job *db.WorkflowJob, run *db.WorkflowRun, sessions []*db.Session) (*db.WorkflowJob, bool, error) {
	if job == nil || run == nil {
		return nil, false, fmt.Errorf("workflow job and run are required")
	}
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO workflow_jobs (
			id, workflow_run_id, project_id, request_hash, payload_ciphertext,
			payload_nonce, status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
		ON CONFLICT(workflow_run_id) DO NOTHING
	`, job.ID, job.WorkflowRunID, job.ProjectID, job.RequestHash,
		job.PayloadCiphertext, job.PayloadNonce, job.CreatedAt, job.UpdatedAt)
	if err != nil {
		return nil, false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return nil, false, err
	}
	created := rows == 1
	existing, err := scanWorkflowJob(tx.QueryRowContext(ctx, workflowJobSelect+` WHERE workflow_run_id = ?`, job.WorkflowRunID))
	if err != nil {
		return nil, false, err
	}
	if existing.RequestHash != job.RequestHash {
		return existing, false, fmt.Errorf("workflow run id already exists with a different payload")
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO workflow_runs (
			id, project_id, workflow_id, status, summary, logs, error, started_at,
			completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO NOTHING
	`, run.ID, run.ProjectID, run.WorkflowID, run.Status, run.Summary, run.Logs, run.Error,
		run.StartedAt, run.CompletedAt, run.Metadata, run.Version, run.CreatedAt, run.UpdatedAt,
		run.ClientID, run.UserID, run.IsDeleted); err != nil {
		return nil, false, err
	}
	var storedRunProjectID, storedWorkflowID string
	if err := tx.QueryRowContext(ctx, `SELECT project_id, workflow_id FROM workflow_runs WHERE id = ? AND is_deleted = 0`, run.ID).Scan(&storedRunProjectID, &storedWorkflowID); err != nil {
		return nil, false, err
	}
	if storedRunProjectID != run.ProjectID || storedWorkflowID != run.WorkflowID {
		return nil, false, fmt.Errorf("workflow run id belongs to a different workflow or project")
	}
	for _, session := range sessions {
		if session == nil {
			return nil, false, fmt.Errorf("workflow session is nil")
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sessions (
				id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name,
				backend_session_id, status, result, container_ids, logs, error, started_at,
				completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index,
				service_graph, test_plan, runtime_snapshot, version, created_at, updated_at,
				client_id, user_id, is_deleted
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO NOTHING
		`, session.ID, session.ProjectID, session.WorkflowRunID, session.WorkflowID,
			session.ScenarioID, session.ScenarioName, session.BackendSessionID, session.Status,
			session.Result, session.ContainerIDs, session.Logs, session.Error, session.StartedAt,
			session.CompletedAt, session.OwnerID, session.LeaseExpiresAt, session.HeartbeatAt,
			session.Phase, session.CheckpointIndex, session.ServiceGraph, session.TestPlan,
			session.RuntimeSnapshot, session.Version, session.CreatedAt, session.UpdatedAt,
			session.ClientID, session.UserID, session.IsDeleted); err != nil {
			return nil, false, err
		}
		var storedProjectID, storedRunID, storedWorkflowID, storedScenarioID string
		if err := tx.QueryRowContext(ctx, `SELECT project_id, workflow_run_id, workflow_id, scenario_id FROM sessions WHERE id = ? AND is_deleted = 0`, session.ID).Scan(&storedProjectID, &storedRunID, &storedWorkflowID, &storedScenarioID); err != nil {
			return nil, false, err
		}
		if storedProjectID != session.ProjectID || storedRunID != session.WorkflowRunID || storedWorkflowID != session.WorkflowID || storedScenarioID != session.ScenarioID {
			return nil, false, fmt.Errorf("scenario run id belongs to a different workflow or project")
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return existing, created, nil
}

func (c *Client) CreateWorkflowJob(ctx context.Context, job *db.WorkflowJob) (*db.WorkflowJob, bool, error) {
	if job == nil {
		return nil, false, fmt.Errorf("workflow job is nil")
	}
	_, err := c.conn.ExecContext(ctx, `
		INSERT INTO workflow_jobs (
			id, workflow_run_id, project_id, request_hash, payload_ciphertext,
			payload_nonce, status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
	`, job.ID, job.WorkflowRunID, job.ProjectID, job.RequestHash,
		job.PayloadCiphertext, job.PayloadNonce, job.CreatedAt, job.UpdatedAt)
	if err == nil {
		created, getErr := c.GetWorkflowJob(ctx, job.WorkflowRunID)
		return created, true, getErr
	}

	existing, getErr := c.GetWorkflowJob(ctx, job.WorkflowRunID)
	if getErr != nil {
		return nil, false, err
	}
	if existing.RequestHash != job.RequestHash {
		return existing, false, fmt.Errorf("workflow run id already exists with a different payload")
	}
	return existing, false, nil
}

func (c *Client) GetWorkflowJob(ctx context.Context, workflowRunID string) (*db.WorkflowJob, error) {
	row := c.conn.QueryRowContext(ctx, `
		SELECT id, workflow_run_id, project_id, request_hash, payload_ciphertext,
			payload_nonce, status, COALESCE(lease_owner, ''), lease_expires_at,
			heartbeat_at, recovery_count, COALESCE(last_error, ''), created_at,
			updated_at, started_at, completed_at
		FROM workflow_jobs WHERE workflow_run_id = ?
	`, workflowRunID)
	return scanWorkflowJob(row)
}

func (c *Client) ClaimWorkflowJob(ctx context.Context, ownerID string, now time.Time, leaseDuration time.Duration, maxRecoveries int) (*db.WorkflowJob, error) {
	tx, err := c.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var id string
	var wasRunning bool
	err = tx.QueryRowContext(ctx, `
		SELECT id, status = 'running'
		FROM workflow_jobs
		WHERE (status = 'pending' OR (status = 'running' AND lease_expires_at < ?))
		ORDER BY created_at ASC LIMIT 1
	`, now).Scan(&id, &wasRunning)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if wasRunning {
		var recoveryCount int
		if err := tx.QueryRowContext(ctx, `SELECT recovery_count FROM workflow_jobs WHERE id = ?`, id).Scan(&recoveryCount); err != nil {
			return nil, err
		}
		if recoveryCount >= maxRecoveries {
			result, err := tx.ExecContext(ctx, `
				UPDATE workflow_jobs SET status = 'failed', lease_owner = NULL,
					lease_expires_at = NULL, heartbeat_at = ?, completed_at = ?, updated_at = ?,
					last_error = 'maximum crash recovery attempts exceeded',
					payload_ciphertext = NULL, payload_nonce = NULL
				WHERE id = ? AND status = 'running' AND lease_expires_at < ?
			`, now, now, now, id, now)
			if err != nil {
				return nil, err
			}
			rows, _ := result.RowsAffected()
			if rows != 1 {
				return nil, nil
			}
			job, err := scanWorkflowJob(tx.QueryRowContext(ctx, workflowJobSelect+` WHERE id = ?`, id))
			if err != nil {
				return nil, err
			}
			if err := tx.Commit(); err != nil {
				return nil, err
			}
			return job, nil
		}
	}

	leaseUntil := now.Add(leaseDuration)
	result, err := tx.ExecContext(ctx, `
		UPDATE workflow_jobs SET
			status = 'running', lease_owner = ?, lease_expires_at = ?,
			heartbeat_at = ?, recovery_count = recovery_count + ?,
			started_at = COALESCE(started_at, ?), updated_at = ?
		WHERE id = ? AND (status = 'pending' OR lease_expires_at < ?)
	`, ownerID, leaseUntil, now, boolInt(wasRunning), now, now, id, now)
	if err != nil {
		return nil, err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return nil, nil
	}

	job, err := scanWorkflowJob(tx.QueryRowContext(ctx, `
		SELECT id, workflow_run_id, project_id, request_hash, payload_ciphertext,
			payload_nonce, status, COALESCE(lease_owner, ''), lease_expires_at,
			heartbeat_at, recovery_count, COALESCE(last_error, ''), created_at,
			updated_at, started_at, completed_at
		FROM workflow_jobs WHERE id = ?
	`, id))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return job, nil
}

func (c *Client) HeartbeatWorkflowJob(ctx context.Context, jobID, ownerID string, now time.Time, leaseDuration time.Duration) error {
	result, err := c.conn.ExecContext(ctx, `
		UPDATE workflow_jobs SET heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
		WHERE id = ? AND lease_owner = ? AND status = 'running'
	`, now, now.Add(leaseDuration), now, jobID, ownerID)
	return requireOneRow(result, err, "workflow job heartbeat")
}

func (c *Client) ReleaseWorkflowJob(ctx context.Context, jobID, ownerID string, now time.Time) error {
	result, err := c.conn.ExecContext(ctx, `
		UPDATE workflow_jobs SET status = 'pending', lease_owner = NULL,
			lease_expires_at = NULL, heartbeat_at = ?, updated_at = ?
		WHERE id = ? AND lease_owner = ? AND status = 'running'
	`, now, now, jobID, ownerID)
	return requireOneRow(result, err, "release workflow job")
}

func (c *Client) CompleteWorkflowJob(ctx context.Context, jobID, ownerID string, now time.Time) error {
	result, err := c.conn.ExecContext(ctx, `
		UPDATE workflow_jobs SET status = 'completed', lease_owner = NULL,
			lease_expires_at = NULL, heartbeat_at = ?, completed_at = ?, updated_at = ?,
			payload_ciphertext = NULL, payload_nonce = NULL
		WHERE id = ? AND lease_owner = ? AND status = 'running'
	`, now, now, now, jobID, ownerID)
	return requireOneRow(result, err, "complete workflow job")
}

func (c *Client) FailWorkflowJob(ctx context.Context, jobID, ownerID, message string, now time.Time) error {
	result, err := c.conn.ExecContext(ctx, `
		UPDATE workflow_jobs SET status = 'failed', lease_owner = NULL,
			lease_expires_at = NULL, heartbeat_at = ?, completed_at = ?, updated_at = ?,
			last_error = ?, payload_ciphertext = NULL, payload_nonce = NULL
		WHERE id = ? AND lease_owner = ? AND status = 'running'
	`, now, now, now, message, jobID, ownerID)
	return requireOneRow(result, err, "fail workflow job")
}

func (c *Client) AppendWorkflowRunEvent(ctx context.Context, event *db.WorkflowRunEvent) (*db.WorkflowRunEvent, error) {
	result, err := c.conn.ExecContext(ctx, `
		INSERT INTO workflow_run_events (workflow_run_id, event_type, payload, created_at)
		VALUES (?, ?, ?, ?)
	`, event.WorkflowRunID, event.EventType, event.Payload, event.CreatedAt)
	if err != nil {
		return nil, err
	}
	event.ID, err = result.LastInsertId()
	return event, err
}

// AppendWorkflowLogEvent durably appends both workflow/scenario history and the
// replay event. A crash can therefore never expose one without the other.
func (c *Client) AppendWorkflowLogEvent(ctx context.Context, event *db.WorkflowRunEvent, message, scenarioRunID string) (*db.WorkflowRunEvent, error) {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	appendLog := func(table, id string) error {
		var encoded string
		if err := tx.QueryRowContext(ctx, `SELECT logs FROM `+table+` WHERE id = ? AND is_deleted = 0`, id).Scan(&encoded); err != nil {
			return err
		}
		logs := make([]string, 0)
		if encoded != "" && encoded != "null" {
			if err := json.Unmarshal([]byte(encoded), &logs); err != nil {
				return fmt.Errorf("decode %s logs: %w", table, err)
			}
		}
		logs = append(logs, message)
		payload, err := json.Marshal(logs)
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `UPDATE `+table+` SET logs = ?, updated_at = ?, version = version + 1 WHERE id = ? AND is_deleted = 0`, string(payload), event.CreatedAt, id)
		return requireOneRow(result, err, "append "+table+" log")
	}
	if err := appendLog("workflow_runs", event.WorkflowRunID); err != nil {
		return nil, err
	}
	if scenarioRunID != "" {
		if err := appendLog("sessions", scenarioRunID); err != nil {
			return nil, err
		}
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO workflow_run_events (workflow_run_id, event_type, payload, created_at)
		VALUES (?, ?, ?, ?)
	`, event.WorkflowRunID, event.EventType, event.Payload, event.CreatedAt)
	if err != nil {
		return nil, err
	}
	event.ID, err = result.LastInsertId()
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return event, nil
}

func (c *Client) ListWorkflowRunEvents(ctx context.Context, workflowRunID string, afterID int64, limit int) ([]db.WorkflowRunEvent, error) {
	if limit <= 0 || limit > 1000 {
		limit = 250
	}
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, workflow_run_id, event_type, payload, created_at
		FROM workflow_run_events
		WHERE workflow_run_id = ? AND id > ? ORDER BY id ASC LIMIT ?
	`, workflowRunID, afterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]db.WorkflowRunEvent, 0)
	for rows.Next() {
		var event db.WorkflowRunEvent
		if err := rows.Scan(&event.ID, &event.WorkflowRunID, &event.EventType, &event.Payload, &event.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (c *Client) DeleteWorkflowRunEventsBefore(ctx context.Context, cutoff time.Time) error {
	_, err := c.conn.ExecContext(ctx, `DELETE FROM workflow_run_events WHERE created_at < ?`, cutoff)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

const workflowJobSelect = `
	SELECT id, workflow_run_id, project_id, request_hash, payload_ciphertext,
		payload_nonce, status, COALESCE(lease_owner, ''), lease_expires_at,
		heartbeat_at, recovery_count, COALESCE(last_error, ''), created_at,
		updated_at, started_at, completed_at
	FROM workflow_jobs`

func scanWorkflowJob(row rowScanner) (*db.WorkflowJob, error) {
	var job db.WorkflowJob
	if err := row.Scan(
		&job.ID, &job.WorkflowRunID, &job.ProjectID, &job.RequestHash,
		&job.PayloadCiphertext, &job.PayloadNonce, &job.Status, &job.LeaseOwner,
		&job.LeaseExpiresAt, &job.HeartbeatAt, &job.RecoveryCount, &job.LastError,
		&job.CreatedAt, &job.UpdatedAt, &job.StartedAt, &job.CompletedAt,
	); err != nil {
		return nil, err
	}
	return &job, nil
}

func requireOneRow(result sql.Result, err error, operation string) error {
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return fmt.Errorf("%s did not update an owned running job", operation)
	}
	return nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
