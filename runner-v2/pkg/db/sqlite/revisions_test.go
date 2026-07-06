package sqlite

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

func TestWorkflowRevisionsAreImmutableAndNumbered(t *testing.T) {
	client, err := NewClient(filepath.Join(t.TempDir(), "revisions.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := db.NewMigrator(client, "sqlite").RunMigrations(); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	if err := client.UpsertWorkflow(context.Background(), &db.Workflow{
		ID: "wf-1", ProjectID: "project-1", Name: "Workflow", NodesConfig: "[]", EdgesConfig: "[]",
		Metadata: "{}", Version: 1, CreatedAt: now, UpdatedAt: now, ClientID: "client", UserID: "user",
	}); err != nil {
		t.Fatal(err)
	}

	for _, revision := range []*db.WorkflowRevision{
		{ID: "rev-1", ProjectID: "project-1", WorkflowID: "wf-1", WorkflowVersion: 1, Snapshot: `{"workflow":{"id":"wf-1"},"scenarios":[]}`, Message: "First", CreatedBy: "user", CreatedAt: now},
		{ID: "rev-2", ProjectID: "project-1", WorkflowID: "wf-1", WorkflowVersion: 2, Snapshot: `{"workflow":{"id":"wf-1"},"scenarios":[]}`, Message: "Second", CreatedBy: "user", CreatedAt: now.Add(time.Second)},
	} {
		if err := client.CreateWorkflowRevision(context.Background(), revision); err != nil {
			t.Fatal(err)
		}
	}
	revisions, err := client.ListWorkflowRevisions(context.Background(), "project-1", "wf-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(revisions) != 2 || revisions[0].RevisionNumber != 2 || revisions[1].RevisionNumber != 1 {
		t.Fatalf("unexpected revision order: %+v", revisions)
	}
	stored, err := client.GetWorkflowRevision(context.Background(), "project-1", "wf-1", "rev-1")
	if err != nil {
		t.Fatal(err)
	}
	if stored.Message != "First" || stored.Snapshot == "" {
		t.Fatalf("unexpected revision: %+v", stored)
	}
}
