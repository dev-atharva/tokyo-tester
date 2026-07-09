package mysql

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

func TestWorkflowRevisionsAreImmutableAndNumbered(t *testing.T) {
	client := newMySQLIntegrationClient(t)
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

func TestWorkflowRevisionConcurrentAllocation(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	if err := client.UpsertWorkflow(ctx, &db.Workflow{
		ID: "wf-concurrent", ProjectID: "project-1", Name: "Workflow", NodesConfig: "[]", EdgesConfig: "[]",
		Metadata: "{}", Version: 1, CreatedAt: now, UpdatedAt: now, ClientID: "client", UserID: "user",
	}); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 5)
	for index := 0; index < 5; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- client.CreateWorkflowRevision(ctx, &db.WorkflowRevision{
				ID:              "rev-concurrent-" + string(rune('a'+index)),
				ProjectID:       "project-1",
				WorkflowID:      "wf-concurrent",
				WorkflowVersion: index + 1,
				Snapshot:        `{"workflow":{"id":"wf-concurrent"},"scenarios":[]}`,
				Message:         "Concurrent",
				CreatedBy:       "user",
				CreatedAt:       now.Add(time.Duration(index) * time.Second),
			})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	revisions, err := client.ListWorkflowRevisions(ctx, "project-1", "wf-concurrent")
	if err != nil {
		t.Fatal(err)
	}
	if len(revisions) != 5 {
		t.Fatalf("expected five revisions, got %+v", revisions)
	}
	seen := map[int]bool{}
	for _, revision := range revisions {
		seen[revision.RevisionNumber] = true
	}
	for number := 1; number <= 5; number++ {
		if !seen[number] {
			t.Fatalf("missing revision number %d in %+v", number, revisions)
		}
	}
}
