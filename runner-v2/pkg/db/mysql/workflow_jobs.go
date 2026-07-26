package mysql

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

// EnqueueWorkflowJob creates the queue entry and its UI reconciliation records
// in one transaction. Retried submissions only repair missing records and never
// overwrite progress made by an already-running job.
func (c *Client) EnqueueWorkflowJob(ctx context.Context, job *db.WorkflowJob, run *db.WorkflowRun, sessions []*db.Session) (*db.WorkflowJob, bool, error) {
	return c.AdmitWorkflowJob(ctx, job, run, sessions, db.WorkflowAdmissionPolicy{})
}

func (c *Client) AdmitWorkflowJob(ctx context.Context, job *db.WorkflowJob, run *db.WorkflowRun, sessions []*db.Session, policy db.WorkflowAdmissionPolicy) (*db.WorkflowJob, bool, error) {
	if job == nil || run == nil {
		return nil, false, fmt.Errorf("workflow job and run are required")
	}
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE workflow_scheduler_lock SET updated_at = updated_at WHERE id = 1`); err != nil {
		return nil, false, err
	}

	existing, existingErr := scanWorkflowJob(tx.QueryRowContext(ctx, workflowJobSelect+` WHERE workflow_run_id = ?`, job.WorkflowRunID))
	created := false
	if existingErr == nil {
		if existing.RequestHash != job.RequestHash {
			return existing, false, fmt.Errorf("workflow run id already exists with a different payload")
		}
	} else if !errors.Is(existingErr, sql.ErrNoRows) {
		return nil, false, existingErr
	} else {
		if err := enforceWorkflowRateLimits(ctx, tx, job, policy); err != nil {
			return nil, false, err
		}
		if err := enforceWorkflowAdmission(ctx, tx, job, policy); err != nil {
			return nil, false, err
		}

		result, err := tx.ExecContext(ctx, `
		INSERT IGNORE INTO workflow_jobs (
			id, workflow_run_id, project_id, user_id, request_hash, payload_ciphertext,
			payload_nonce, status, priority, estimated_cost, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
	`, job.ID, job.WorkflowRunID, job.ProjectID, job.UserID, job.RequestHash,
			job.PayloadCiphertext, job.PayloadNonce, job.Priority, maxInt(job.EstimatedCost, 1), job.CreatedAt, job.UpdatedAt)
		if err != nil {
			return nil, false, err
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return nil, false, err
		}
		created = rows == 1
		existing, err = scanWorkflowJob(tx.QueryRowContext(ctx, workflowJobSelect+` WHERE workflow_run_id = ?`, job.WorkflowRunID))
		if err != nil {
			return nil, false, err
		}
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT IGNORE INTO workflow_runs (
			id, project_id, workflow_id, status, summary, logs, error, started_at,
			completed_at, metadata, version, created_at, updated_at, client_id, user_id, is_deleted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
			INSERT IGNORE INTO sessions (
				id, project_id, workflow_run_id, workflow_id, scenario_id, scenario_name,
				backend_session_id, status, result, container_ids, logs, error, started_at,
				completed_at, owner_id, lease_expires_at, heartbeat_at, phase, checkpoint_index,
				service_graph, test_plan, runtime_snapshot, version, created_at, updated_at,
				client_id, user_id, is_deleted
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

func enforceWorkflowRateLimits(ctx context.Context, tx *sql.Tx, job *db.WorkflowJob, policy db.WorkflowAdmissionPolicy) error {
	checks := []struct {
		scope     string
		subjectID string
		limit     int
	}{
		{scope: "user_rate", subjectID: job.UserID, limit: policy.SubmissionsPerMinuteUser},
		{scope: "project_rate", subjectID: job.ProjectID, limit: policy.SubmissionsPerMinuteProject},
	}
	now := job.CreatedAt.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
	}
	for _, check := range checks {
		if check.limit <= 0 {
			continue
		}
		var windowStarted time.Time
		var count int
		err := tx.QueryRowContext(ctx, `
			SELECT window_started_at, request_count
			FROM workflow_submission_rate_limits
			WHERE scope = ? AND subject_id = ? FOR UPDATE
		`, check.scope, check.subjectID).Scan(&windowStarted, &count)
		if errors.Is(err, sql.ErrNoRows) {
			_, err = tx.ExecContext(ctx, `
				INSERT INTO workflow_submission_rate_limits
					(scope, subject_id, window_started_at, request_count, updated_at)
				VALUES (?, ?, ?, 1, ?)
			`, check.scope, check.subjectID, now, now)
			if err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		windowEnds := windowStarted.Add(time.Minute)
		if !now.Before(windowEnds) {
			_, err = tx.ExecContext(ctx, `
				UPDATE workflow_submission_rate_limits
				SET window_started_at = ?, request_count = 1, updated_at = ?
				WHERE scope = ? AND subject_id = ?
			`, now, now, check.scope, check.subjectID)
			if err != nil {
				return err
			}
			continue
		}
		if count >= check.limit {
			retryAfter := windowEnds.Sub(now)
			return &db.WorkflowAdmissionError{Scope: check.scope, Limit: check.limit, RetryAfter: retryAfter}
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE workflow_submission_rate_limits
			SET request_count = request_count + 1, updated_at = ?
			WHERE scope = ? AND subject_id = ?
		`, now, check.scope, check.subjectID); err != nil {
			return err
		}
	}
	return nil
}

func enforceWorkflowAdmission(ctx context.Context, tx *sql.Tx, job *db.WorkflowJob, policy db.WorkflowAdmissionPolicy) error {
	count := func(query string, args ...any) (int, error) {
		var value int
		err := tx.QueryRowContext(ctx, query, args...).Scan(&value)
		return value, err
	}
	if policy.MaxQueuedGlobal > 0 {
		queued, err := count(`SELECT COUNT(*) FROM workflow_jobs WHERE status = 'pending'`)
		if err != nil {
			return err
		}
		if queued >= policy.MaxQueuedGlobal {
			return &db.WorkflowAdmissionError{Scope: "server", Limit: policy.MaxQueuedGlobal, RetryAfter: time.Minute}
		}
	}
	if policy.MaxQueuedPerUser > 0 {
		queued, err := count(`SELECT COUNT(*) FROM workflow_jobs WHERE status = 'pending' AND user_id = ?`, job.UserID)
		if err != nil {
			return err
		}
		if queued >= policy.MaxQueuedPerUser {
			return &db.WorkflowAdmissionError{Scope: "user", Limit: policy.MaxQueuedPerUser, RetryAfter: time.Minute}
		}
	}
	if policy.MaxQueuedPerProject > 0 {
		queued, err := count(`SELECT COUNT(*) FROM workflow_jobs WHERE status = 'pending' AND project_id = ?`, job.ProjectID)
		if err != nil {
			return err
		}
		if queued >= policy.MaxQueuedPerProject {
			return &db.WorkflowAdmissionError{Scope: "project", Limit: policy.MaxQueuedPerProject, RetryAfter: time.Minute}
		}
	}
	return nil
}

func (c *Client) CreateWorkflowJob(ctx context.Context, job *db.WorkflowJob) (*db.WorkflowJob, bool, error) {
	if job == nil {
		return nil, false, fmt.Errorf("workflow job is nil")
	}
	_, err := c.conn.ExecContext(ctx, `
		INSERT INTO workflow_jobs (
			id, workflow_run_id, project_id, user_id, request_hash, payload_ciphertext,
			payload_nonce, status, priority, estimated_cost, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
	`, job.ID, job.WorkflowRunID, job.ProjectID, job.UserID, job.RequestHash,
		job.PayloadCiphertext, job.PayloadNonce, job.Priority, maxInt(job.EstimatedCost, 1), job.CreatedAt, job.UpdatedAt)
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
		SELECT id, workflow_run_id, project_id, user_id, request_hash, payload_ciphertext,
			payload_nonce, status, priority, estimated_cost, COALESCE(lease_owner, ''), lease_expires_at,
			heartbeat_at, cancel_requested_at, cancelled_at, COALESCE(cancel_reason, ''), recovery_count, COALESCE(last_error, ''), created_at,
			updated_at, started_at, completed_at
		FROM workflow_jobs WHERE workflow_run_id = ?
	`, workflowRunID)
	return scanWorkflowJob(row)
}

func (c *Client) GetWorkflowJobQueueInfo(ctx context.Context, workflowRunID string) (*db.WorkflowQueueInfo, error) {
	job, err := c.GetWorkflowJob(ctx, workflowRunID)
	if err != nil {
		return nil, err
	}
	info := &db.WorkflowQueueInfo{Status: job.Status, QueuedAt: job.CreatedAt, StartedAt: job.StartedAt}
	estimate, err := c.estimateWorkflowDuration(ctx, job)
	if err != nil {
		return nil, err
	}
	info.EstimatedRun = estimate
	if job.Status != "pending" {
		return info, nil
	}
	if err := c.conn.QueryRowContext(ctx, `
		SELECT COUNT(*) + 1 FROM workflow_jobs
		WHERE status = 'pending' AND (
			priority > ? OR (priority = ? AND created_at < ?) OR
			(priority = ? AND created_at = ? AND id < ?)
		)
	`, job.Priority, job.Priority, job.CreatedAt, job.Priority, job.CreatedAt, job.ID).Scan(&info.Position); err != nil {
		return nil, err
	}
	return info, nil
}

func (c *Client) estimateWorkflowDuration(ctx context.Context, job *db.WorkflowJob) (*db.WorkflowTimeEstimate, error) {
	load := func(projectID string) ([]float64, error) {
		query := `
			SELECT TIMESTAMPDIFF(MICROSECOND, started_at, completed_at) / 1000000.0 / GREATEST(estimated_cost, 1)
			FROM workflow_jobs
			WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at > started_at`
		args := make([]any, 0, 2)
		if projectID != "" {
			query += ` AND project_id = ?`
			args = append(args, projectID)
		}
		query += ` ORDER BY completed_at DESC LIMIT 200`
		rows, err := c.conn.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		values := make([]float64, 0, 200)
		for rows.Next() {
			var secondsPerCost float64
			if err := rows.Scan(&secondsPerCost); err != nil {
				return nil, err
			}
			if secondsPerCost > 0 {
				values = append(values, secondsPerCost)
			}
		}
		return values, rows.Err()
	}
	values, err := load(job.ProjectID)
	if err != nil {
		return nil, err
	}
	if len(values) < 5 {
		values, err = load("")
		if err != nil {
			return nil, err
		}
	}
	return workflowDurationEstimate(values, maxInt(job.EstimatedCost, 1)), nil
}

func workflowDurationEstimate(secondsPerCost []float64, estimatedCost int) *db.WorkflowTimeEstimate {
	if len(secondsPerCost) == 0 {
		return nil
	}
	sort.Float64s(secondsPerCost)
	percentile := func(value float64) int {
		index := int(math.Ceil(value*float64(len(secondsPerCost)))) - 1
		if index < 0 {
			index = 0
		}
		seconds := int(math.Ceil(secondsPerCost[index] * float64(maxInt(estimatedCost, 1))))
		return maxInt(seconds, 1)
	}
	return &db.WorkflowTimeEstimate{
		P50Seconds: percentile(0.50),
		P90Seconds: percentile(0.90),
		SampleSize: len(secondsPerCost),
	}
}

func (c *Client) ClaimWorkflowJob(ctx context.Context, ownerID string, now time.Time, leaseDuration time.Duration, maxRecoveries int) (*db.WorkflowJob, error) {
	return c.claimWorkflowJob(ctx, ownerID, now, leaseDuration, maxRecoveries, db.WorkflowAdmissionPolicy{}, false)
}

func (c *Client) ClaimWorkflowJobFair(ctx context.Context, ownerID string, now time.Time, leaseDuration time.Duration, maxRecoveries int, policy db.WorkflowAdmissionPolicy) (*db.WorkflowJob, error) {
	return c.claimWorkflowJob(ctx, ownerID, now, leaseDuration, maxRecoveries, policy, true)
}

func (c *Client) claimWorkflowJob(ctx context.Context, ownerID string, now time.Time, leaseDuration time.Duration, maxRecoveries int, policy db.WorkflowAdmissionPolicy, fair bool) (*db.WorkflowJob, error) {
	tx, err := c.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if fair {
		if _, err := tx.ExecContext(ctx, `UPDATE workflow_scheduler_lock SET updated_at = updated_at WHERE id = 1`); err != nil {
			return nil, err
		}
	}

	var id string
	var wasRunning bool
	if fair {
		maxUser := maxInt(policy.MaxRunningPerUser, 1)
		maxProject := maxInt(policy.MaxRunningPerProject, 1)
		err = tx.QueryRowContext(ctx, `
			SELECT j.id, j.status IN ('running', 'cancelling')
			FROM workflow_jobs j
			WHERE (j.status IN ('running', 'cancelling') AND j.lease_expires_at < ?)
				OR (j.status = 'pending'
					AND (SELECT COUNT(*) FROM workflow_jobs running_user WHERE running_user.status IN ('running', 'cancelling') AND running_user.user_id = j.user_id) < ?
					AND (SELECT COUNT(*) FROM workflow_jobs running_project WHERE running_project.status IN ('running', 'cancelling') AND running_project.project_id = j.project_id) < ?)
			ORDER BY (j.status IN ('running', 'cancelling')) DESC, j.priority DESC, j.created_at ASC
			LIMIT 1 FOR UPDATE SKIP LOCKED
		`, now, maxUser, maxProject).Scan(&id, &wasRunning)
	} else {
		err = tx.QueryRowContext(ctx, `
		SELECT id, status IN ('running', 'cancelling')
		FROM workflow_jobs
		WHERE (status = 'pending' OR (status IN ('running', 'cancelling') AND lease_expires_at < ?))
		ORDER BY created_at ASC LIMIT 1
		FOR UPDATE SKIP LOCKED
	`, now).Scan(&id, &wasRunning)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if wasRunning {
		var recoveryCount int
		var cancelRequestedAt *time.Time
		if err := tx.QueryRowContext(ctx, `SELECT recovery_count, cancel_requested_at FROM workflow_jobs WHERE id = ?`, id).Scan(&recoveryCount, &cancelRequestedAt); err != nil {
			return nil, err
		}
		if cancelRequestedAt == nil && recoveryCount >= maxRecoveries {
			result, err := tx.ExecContext(ctx, `
				UPDATE workflow_jobs SET status = 'failed', lease_owner = NULL,
					lease_expires_at = NULL, heartbeat_at = ?, completed_at = ?, updated_at = ?,
					last_error = 'maximum crash recovery attempts exceeded',
					payload_ciphertext = NULL, payload_nonce = NULL
				WHERE id = ? AND status IN ('running', 'cancelling') AND lease_expires_at < ?
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
		WHERE id = ? AND (status = 'pending' OR (status IN ('running', 'cancelling') AND lease_expires_at < ?))
	`, ownerID, leaseUntil, now, boolInt(wasRunning), now, now, id, now)
	if err != nil {
		return nil, err
	}
	rows, _ := result.RowsAffected()
	if rows != 1 {
		return nil, nil
	}

	job, err := scanWorkflowJob(tx.QueryRowContext(ctx, `
		SELECT id, workflow_run_id, project_id, user_id, request_hash, payload_ciphertext,
			payload_nonce, status, priority, estimated_cost, COALESCE(lease_owner, ''), lease_expires_at,
			heartbeat_at, cancel_requested_at, cancelled_at, COALESCE(cancel_reason, ''), recovery_count, COALESCE(last_error, ''), created_at,
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
		WHERE id = ? AND lease_owner = ? AND status = 'running' AND cancel_requested_at IS NULL
	`, now, now.Add(leaseDuration), now, jobID, ownerID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 1 {
		return nil
	}
	var status string
	var cancelRequestedAt *time.Time
	if err := c.conn.QueryRowContext(ctx, `SELECT status, cancel_requested_at FROM workflow_jobs WHERE id = ? AND lease_owner = ?`, jobID, ownerID).Scan(&status, &cancelRequestedAt); err == nil && (status == "cancelling" || cancelRequestedAt != nil) {
		return db.ErrWorkflowCancellationRequested
	}
	return fmt.Errorf("workflow job heartbeat did not update an owned running job")
}

func (c *Client) RequestWorkflowJobCancellation(ctx context.Context, workflowRunID, projectID, reason string, now time.Time) (*db.WorkflowJob, bool, error) {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE workflow_scheduler_lock SET updated_at = updated_at WHERE id = 1`); err != nil {
		return nil, false, fmt.Errorf("lock workflow scheduler for cancellation: %w", err)
	}
	job, err := scanWorkflowJob(tx.QueryRowContext(ctx, workflowJobSelect+` WHERE workflow_run_id = ? FOR UPDATE`, workflowRunID))
	if err != nil {
		return nil, false, fmt.Errorf("load workflow job for cancellation: %w", err)
	}
	if job.ProjectID != projectID {
		return nil, false, sql.ErrNoRows
	}
	if job.Status == "completed" || job.Status == "failed" || job.Status == "cancelled" {
		return job, false, nil
	}
	if job.Status == "cancelling" {
		return job, false, nil
	}
	if reason == "" {
		reason = "cancelled by user"
	}
	status := "cancelling"
	var completedAt any
	if job.Status == "pending" {
		status = "cancelled"
		completedAt = now
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE workflow_jobs SET status = ?, cancel_requested_at = ?, cancelled_at = ?,
			cancel_reason = ?, completed_at = COALESCE(completed_at, ?), updated_at = ?,
			payload_ciphertext = IF(? = 'cancelled', NULL, payload_ciphertext),
			payload_nonce = IF(? = 'cancelled', NULL, payload_nonce)
		WHERE id = ?
	`, status, now, completedAt, reason, completedAt, now, status, status, job.ID); err != nil {
		return nil, false, fmt.Errorf("update workflow job cancellation: %w", err)
	}
	if err := updateCancelledWorkflowRecords(ctx, tx, workflowRunID, status, reason, now, status == "cancelled"); err != nil {
		return nil, false, fmt.Errorf("reconcile workflow cancellation: %w", err)
	}
	updated, err := scanWorkflowJob(tx.QueryRowContext(ctx, workflowJobSelect+` WHERE id = ?`, job.ID))
	if err != nil {
		return nil, false, fmt.Errorf("reload cancelled workflow job: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, false, fmt.Errorf("commit workflow cancellation: %w", err)
	}
	return updated, true, nil
}

func (c *Client) CancelWorkflowJob(ctx context.Context, jobID, ownerID string, now time.Time) error {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var workflowRunID, reason string
	if err := tx.QueryRowContext(ctx, `
		SELECT workflow_run_id, COALESCE(cancel_reason, 'cancelled by user')
		FROM workflow_jobs WHERE id = ? AND lease_owner = ? AND status IN ('running', 'cancelling') FOR UPDATE
	`, jobID, ownerID).Scan(&workflowRunID, &reason); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
		UPDATE workflow_jobs SET status = 'cancelled', lease_owner = NULL,
			lease_expires_at = NULL, heartbeat_at = ?, cancelled_at = ?, completed_at = ?,
			updated_at = ?, payload_ciphertext = NULL, payload_nonce = NULL
		WHERE id = ? AND lease_owner = ? AND status IN ('running', 'cancelling')
	`, now, now, now, now, jobID, ownerID)
	if err := requireOneRow(result, err, "cancel workflow job"); err != nil {
		return err
	}
	if err := updateCancelledWorkflowRecords(ctx, tx, workflowRunID, "cancelled", reason, now, true); err != nil {
		return err
	}
	return tx.Commit()
}

func updateCancelledWorkflowRecords(ctx context.Context, tx *sql.Tx, workflowRunID, status, reason string, now time.Time, terminal bool) error {
	var completedAt any
	if terminal {
		completedAt = now
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE workflow_runs SET status = ?, error = ?, completed_at = COALESCE(completed_at, ?),
			updated_at = ?, version = version + 1
		WHERE id = ? AND is_deleted = 0
	`, status, reason, completedAt, now, workflowRunID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE sessions SET status = ?, error = ?, completed_at = COALESCE(completed_at, ?),
			updated_at = ?, version = version + 1
		WHERE workflow_run_id = ? AND status NOT IN ('completed', 'failed', 'cleanup_failed', 'cancelled') AND is_deleted = 0
	`, status, reason, completedAt, now, workflowRunID); err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]any{
		"workflowRunId": workflowRunID,
		"status":        status,
		"message":       reason,
		"timestamp":     now.UnixMilli(),
	})
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO workflow_run_events (workflow_run_id, event_type, payload, created_at)
		VALUES (?, 'workflowlog', ?, ?)
	`, workflowRunID, string(payload), now)
	return err
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
		const denormalizedLogTail = 200
		if len(logs) > denormalizedLogTail {
			logs = logs[len(logs)-denormalizedLogTail:]
		}
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

func (c *Client) ListWorkflowLogEventsBefore(ctx context.Context, workflowRunID string, beforeID int64, limit int) ([]db.WorkflowRunEvent, bool, error) {
	if limit <= 0 || limit > 250 {
		limit = 100
	}
	query := `
		SELECT id, workflow_run_id, event_type, payload, created_at
		FROM workflow_run_events
		WHERE workflow_run_id = ? AND event_type = 'workflowlog'`
	args := []any{workflowRunID}
	if beforeID > 0 {
		query += ` AND id < ?`
		args = append(args, beforeID)
	}
	query += ` ORDER BY id DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := c.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	events := make([]db.WorkflowRunEvent, 0, limit+1)
	for rows.Next() {
		var event db.WorkflowRunEvent
		if err := rows.Scan(&event.ID, &event.WorkflowRunID, &event.EventType, &event.Payload, &event.CreatedAt); err != nil {
			return nil, false, err
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(events) > limit
	if hasMore {
		events = events[:limit]
	}
	return events, hasMore, nil
}

func (c *Client) DeleteWorkflowRunEventsBefore(ctx context.Context, cutoff time.Time) error {
	_, err := c.conn.ExecContext(ctx, `DELETE FROM workflow_run_events WHERE created_at < ?`, cutoff)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

const workflowJobSelect = `
	SELECT id, workflow_run_id, project_id, user_id, request_hash, payload_ciphertext,
		payload_nonce, status, priority, estimated_cost, COALESCE(lease_owner, ''), lease_expires_at,
		heartbeat_at, cancel_requested_at, cancelled_at, COALESCE(cancel_reason, ''), recovery_count, COALESCE(last_error, ''), created_at,
		updated_at, started_at, completed_at
	FROM workflow_jobs`

func scanWorkflowJob(row rowScanner) (*db.WorkflowJob, error) {
	var job db.WorkflowJob
	if err := row.Scan(
		&job.ID, &job.WorkflowRunID, &job.ProjectID, &job.UserID, &job.RequestHash,
		&job.PayloadCiphertext, &job.PayloadNonce, &job.Status, &job.Priority, &job.EstimatedCost, &job.LeaseOwner,
		&job.LeaseExpiresAt, &job.HeartbeatAt, &job.CancelRequestedAt, &job.CancelledAt, &job.CancelReason, &job.RecoveryCount, &job.LastError,
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

func maxInt(value, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}
