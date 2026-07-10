package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dev-atharva/cots/pkg/db"
)

func (c *Client) CreateWorkflowRevision(ctx context.Context, revision *db.WorkflowRevision) error {
	tx, err := c.conn.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Serialize revision allocation per workflow without locking unrelated workflows.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, revision.WorkflowID); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO workflow_revisions (id, project_id, workflow_id, revision_number, workflow_version, snapshot, message, created_by, created_at)
		VALUES ($1, $2, $3, (SELECT COALESCE(MAX(revision_number), 0) + 1 FROM workflow_revisions WHERE workflow_id = $3), $4, $5::jsonb, $6, $7, $8)
		RETURNING revision_number
	`, revision.ID, revision.ProjectID, revision.WorkflowID, revision.WorkflowVersion,
		revision.Snapshot, revision.Message, revision.CreatedBy, revision.CreatedAt).Scan(&revision.RevisionNumber); err != nil {
		return err
	}
	return tx.Commit()
}

func (c *Client) ListWorkflowRevisions(ctx context.Context, projectID, workflowID string) ([]*db.WorkflowRevision, error) {
	rows, err := c.conn.QueryContext(ctx, `SELECT id, project_id, workflow_id, revision_number, workflow_version, message, created_by, created_at FROM workflow_revisions WHERE project_id=$1 AND workflow_id=$2 ORDER BY revision_number DESC`, projectID, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var revisions []*db.WorkflowRevision
	for rows.Next() {
		var revision db.WorkflowRevision
		if err := rows.Scan(&revision.ID, &revision.ProjectID, &revision.WorkflowID, &revision.RevisionNumber, &revision.WorkflowVersion, &revision.Message, &revision.CreatedBy, &revision.CreatedAt); err != nil {
			return nil, err
		}
		revisions = append(revisions, &revision)
	}
	return revisions, rows.Err()
}

func (c *Client) GetWorkflowRevision(ctx context.Context, projectID, workflowID, revisionID string) (*db.WorkflowRevision, error) {
	var revision db.WorkflowRevision
	err := c.conn.QueryRowContext(ctx, `SELECT id, project_id, workflow_id, revision_number, workflow_version, snapshot::text, message, created_by, created_at FROM workflow_revisions WHERE id=$1 AND project_id=$2 AND workflow_id=$3`, revisionID, projectID, workflowID).Scan(&revision.ID, &revision.ProjectID, &revision.WorkflowID, &revision.RevisionNumber, &revision.WorkflowVersion, &revision.Snapshot, &revision.Message, &revision.CreatedBy, &revision.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("workflow revision not found: %s", revisionID)
	}
	return &revision, err
}
