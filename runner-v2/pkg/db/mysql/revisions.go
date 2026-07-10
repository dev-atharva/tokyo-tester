package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dev-atharva/cots/pkg/db"
	mysqldriver "github.com/go-sql-driver/mysql"
)

func (c *Client) CreateWorkflowRevision(ctx context.Context, revision *db.WorkflowRevision) error {
	for attempt := 0; attempt < 10; attempt++ {
		tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
		if err != nil {
			return err
		}
		var nextRevision int
		if err := tx.QueryRowContext(ctx, `
			SELECT COALESCE(MAX(revision_number), 0) + 1
			FROM workflow_revisions
			WHERE workflow_id = ?
		`, revision.WorkflowID).Scan(&nextRevision); err != nil {
			tx.Rollback()
			return err
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO workflow_revisions (
				id, project_id, workflow_id, revision_number, workflow_version,
				snapshot, message, created_by, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, revision.ID, revision.ProjectID, revision.WorkflowID, nextRevision,
			revision.WorkflowVersion, revision.Snapshot, revision.Message,
			revision.CreatedBy, revision.CreatedAt)
		if err != nil {
			tx.Rollback()
			if isRetryableRevisionAllocationError(err) {
				continue
			}
			return err
		}
		if err := tx.Commit(); err != nil {
			if isRetryableRevisionAllocationError(err) {
				continue
			}
			return err
		}
		revision.RevisionNumber = nextRevision
		return nil
	}
	return fmt.Errorf("failed to allocate workflow revision after retries")
}

func isDuplicateKey(err error) bool {
	mysqlErr, ok := err.(*mysqldriver.MySQLError)
	return ok && mysqlErr.Number == 1062
}

func isRetryableRevisionAllocationError(err error) bool {
	mysqlErr, ok := err.(*mysqldriver.MySQLError)
	if !ok {
		return false
	}
	return mysqlErr.Number == 1062 || mysqlErr.Number == 1213 || mysqlErr.Number == 1205
}

func (c *Client) ListWorkflowRevisions(ctx context.Context, projectID, workflowID string) ([]*db.WorkflowRevision, error) {
	rows, err := c.conn.QueryContext(ctx, `
		SELECT id, project_id, workflow_id, revision_number, workflow_version, message, created_by, created_at
		FROM workflow_revisions WHERE project_id = ? AND workflow_id = ? ORDER BY revision_number DESC
	`, projectID, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var revisions []*db.WorkflowRevision
	for rows.Next() {
		var revision db.WorkflowRevision
		if err := rows.Scan(&revision.ID, &revision.ProjectID, &revision.WorkflowID, &revision.RevisionNumber,
			&revision.WorkflowVersion, &revision.Message, &revision.CreatedBy, &revision.CreatedAt); err != nil {
			return nil, err
		}
		revisions = append(revisions, &revision)
	}
	return revisions, rows.Err()
}

func (c *Client) GetWorkflowRevision(ctx context.Context, projectID, workflowID, revisionID string) (*db.WorkflowRevision, error) {
	var revision db.WorkflowRevision
	err := c.conn.QueryRowContext(ctx, `
		SELECT id, project_id, workflow_id, revision_number, workflow_version, snapshot, message, created_by, created_at
		FROM workflow_revisions WHERE id = ? AND project_id = ? AND workflow_id = ?
	`, revisionID, projectID, workflowID).Scan(&revision.ID, &revision.ProjectID, &revision.WorkflowID,
		&revision.RevisionNumber, &revision.WorkflowVersion, &revision.Snapshot, &revision.Message,
		&revision.CreatedBy, &revision.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow revision not found: %s", revisionID)
	}
	return &revision, err
}
