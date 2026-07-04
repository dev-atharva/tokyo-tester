package sqlite

import (
	"context"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

func newWorkflowJobTestClient(t *testing.T) *Client {
	t.Helper()
	client, err := NewClient(filepath.Join(t.TempDir(), "worker.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	if err := db.NewMigrator(client, "sqlite").RunMigrations(); err != nil {
		t.Fatal(err)
	}
	return client
}

func testWorkflowJob(id string, now time.Time) *db.WorkflowJob {
	return &db.WorkflowJob{
		ID: id, WorkflowRunID: "run-" + id, ProjectID: "project-1",
		RequestHash: "hash-" + id, PayloadCiphertext: []byte("ciphertext"),
		PayloadNonce: []byte("nonce"), Status: "pending", CreatedAt: now, UpdatedAt: now,
	}
}

func TestCreateWorkflowJobIsIdempotentAndRejectsHashMismatch(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	job := testWorkflowJob("one", now)

	created, wasCreated, err := client.CreateWorkflowJob(ctx, job)
	if err != nil || !wasCreated || created.WorkflowRunID != job.WorkflowRunID {
		t.Fatalf("unexpected create result: job=%+v created=%v err=%v", created, wasCreated, err)
	}
	_, wasCreated, err = client.CreateWorkflowJob(ctx, job)
	if err != nil || wasCreated {
		t.Fatalf("same input should be idempotent: created=%v err=%v", wasCreated, err)
	}

	conflict := testWorkflowJob("conflict", now)
	conflict.WorkflowRunID = job.WorkflowRunID
	_, _, err = client.CreateWorkflowJob(ctx, conflict)
	if err == nil || !strings.Contains(err.Error(), "different payload") {
		t.Fatalf("expected payload conflict, got %v", err)
	}
}

func TestEnqueueWorkflowJobAtomicallyCreatesHistoryAndRollsBack(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if err := client.UpsertWorkflow(ctx, &db.Workflow{ID: "workflow-1", ProjectID: "project-1", Name: "Workflow", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	job := testWorkflowJob("atomic", now)
	run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}
	session := &db.Session{ID: "scenario-run-1", ProjectID: job.ProjectID, WorkflowRunID: job.WorkflowRunID, WorkflowID: run.WorkflowID, ScenarioID: "scenario-1", ScenarioName: "Scenario", Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}

	stored, created, err := client.EnqueueWorkflowJob(ctx, job, run, []*db.Session{session})
	if err != nil || !created || stored.WorkflowRunID != run.ID {
		t.Fatalf("unexpected enqueue result: job=%+v created=%v err=%v", stored, created, err)
	}
	if _, err := client.GetWorkflowRun(ctx, run.ID); err != nil {
		t.Fatalf("workflow history was not created atomically: %v", err)
	}
	if _, err := client.GetSession(ctx, session.ID); err != nil {
		t.Fatalf("scenario history was not created atomically: %v", err)
	}

	badJob := testWorkflowJob("rollback", now)
	badRun := *run
	badRun.ID = badJob.WorkflowRunID
	if _, _, err := client.EnqueueWorkflowJob(ctx, badJob, &badRun, []*db.Session{nil}); err == nil {
		t.Fatal("expected invalid scenario record to fail")
	}
	if _, err := client.GetWorkflowJob(ctx, badJob.WorkflowRunID); err == nil {
		t.Fatal("failed enqueue left an orphan workflow job")
	}
}

func TestAppendWorkflowLogEventPersistsHistoryAndEventTogether(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if err := client.UpsertWorkflow(ctx, &db.Workflow{ID: "workflow-1", ProjectID: "project-1", Name: "Workflow", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	run := &db.WorkflowRun{ID: "run-logs", ProjectID: "project-1", WorkflowID: "workflow-1", Status: "running", Logs: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}
	session := &db.Session{ID: "scenario-run-logs", ProjectID: run.ProjectID, WorkflowRunID: run.ID, WorkflowID: run.WorkflowID, Status: "running", Logs: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}
	if err := client.UpsertWorkflowRun(ctx, run); err != nil {
		t.Fatal(err)
	}
	if err := client.UpsertSession(ctx, session); err != nil {
		t.Fatal(err)
	}
	event, err := client.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: run.ID, EventType: "workflowlog", Payload: `{"message":"hello"}`, CreatedAt: now}, "hello", session.ID)
	if err != nil {
		t.Fatal(err)
	}
	storedRun, _ := client.GetWorkflowRun(ctx, run.ID)
	storedSession, _ := client.GetSession(ctx, session.ID)
	if storedRun.Logs != `["hello"]` || storedSession.Logs != `["hello"]` {
		t.Fatalf("logs were not persisted: run=%s session=%s", storedRun.Logs, storedSession.Logs)
	}
	events, err := client.ListWorkflowRunEvents(ctx, run.ID, 0, 10)
	if err != nil || len(events) != 1 || events[0].ID != event.ID {
		t.Fatalf("event was not persisted with logs: events=%+v err=%v", events, err)
	}
}

func TestEnqueueWorkflowJobRejectsExistingRunOwnershipCollision(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	for _, workflow := range []db.Workflow{
		{ID: "workflow-1", ProjectID: "project-1", Name: "One", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now},
		{ID: "workflow-2", ProjectID: "project-2", Name: "Two", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now},
	} {
		workflow := workflow
		if err := client.UpsertWorkflow(ctx, &workflow); err != nil {
			t.Fatal(err)
		}
	}
	job := testWorkflowJob("collision", now)
	job.ProjectID = "project-1"
	if err := client.UpsertWorkflowRun(ctx, &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: "project-2", WorkflowID: "workflow-2", Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	requested := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: "project-1", WorkflowID: "workflow-1", Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}
	if _, _, err := client.EnqueueWorkflowJob(ctx, job, requested, nil); err == nil || !strings.Contains(err.Error(), "different workflow or project") {
		t.Fatalf("expected ownership collision, got %v", err)
	}
	if _, err := client.GetWorkflowJob(ctx, job.WorkflowRunID); err == nil {
		t.Fatal("ownership collision left a runnable job")
	}
}

func TestClaimWorkflowJobHasSingleWinner(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if _, _, err := client.CreateWorkflowJob(ctx, testWorkflowJob("one", now)); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	claimed := make(chan *db.WorkflowJob, 2)
	errs := make(chan error, 2)
	for _, owner := range []string{"worker-a", "worker-b"} {
		owner := owner
		wg.Add(1)
		go func() {
			defer wg.Done()
			job, err := client.ClaimWorkflowJob(ctx, owner, now, time.Minute, 3)
			claimed <- job
			errs <- err
		}()
	}
	wg.Wait()
	close(claimed)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	winners := 0
	for job := range claimed {
		if job != nil {
			winners++
		}
	}
	if winners != 1 {
		t.Fatalf("expected one claim winner, got %d", winners)
	}
}

func TestWorkflowJobRecoveryLimitAndPayloadErasure(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if _, _, err := client.CreateWorkflowJob(ctx, testWorkflowJob("recover", now)); err != nil {
		t.Fatal(err)
	}

	job, err := client.ClaimWorkflowJob(ctx, "owner-0", now, time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	for recovery := 1; recovery <= 3; recovery++ {
		at := now.Add(time.Duration(recovery) * (time.Minute + time.Second))
		job, err = client.ClaimWorkflowJob(ctx, "owner-recovery", at, time.Minute, 3)
		if err != nil {
			t.Fatal(err)
		}
		if job.RecoveryCount != recovery {
			t.Fatalf("expected recovery count %d, got %d", recovery, job.RecoveryCount)
		}
	}
	exhaustedAt := now.Add(4 * (time.Minute + time.Second))
	job, err = client.ClaimWorkflowJob(ctx, "owner-exhausted", exhaustedAt, time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}

	if job.Status != "failed" || job.LastError == "" {
		t.Fatalf("expected exhausted job to fail, got %+v", job)
	}
	if len(job.PayloadCiphertext) != 0 || len(job.PayloadNonce) != 0 {
		t.Fatal("terminal job retained encrypted payload")
	}

	complete := testWorkflowJob("complete", now)
	if _, _, err := client.CreateWorkflowJob(ctx, complete); err != nil {
		t.Fatal(err)
	}
	claimed, err := client.ClaimWorkflowJob(ctx, "owner", now, time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	if err := client.CompleteWorkflowJob(ctx, claimed.ID, "owner", now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	stored, err := client.GetWorkflowJob(ctx, complete.WorkflowRunID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored.PayloadCiphertext) != 0 || len(stored.PayloadNonce) != 0 {
		t.Fatal("completed job retained encrypted payload")
	}
}

func TestGracefulReleaseDoesNotConsumeCrashRecovery(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if _, _, err := client.CreateWorkflowJob(ctx, testWorkflowJob("graceful", now)); err != nil {
		t.Fatal(err)
	}
	job, err := client.ClaimWorkflowJob(ctx, "owner-1", now, time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	if err := client.ReleaseWorkflowJob(ctx, job.ID, job.LeaseOwner, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	job, err = client.ClaimWorkflowJob(ctx, "owner-2", now.Add(2*time.Second), time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	if job.RecoveryCount != 0 {
		t.Fatalf("graceful release consumed a crash recovery: %d", job.RecoveryCount)
	}
}

func TestWorkflowRunEventReplayAndPruning(t *testing.T) {
	client := newWorkflowJobTestClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	var firstID int64
	for index := 0; index < 3; index++ {
		event, err := client.AppendWorkflowRunEvent(ctx, &db.WorkflowRunEvent{
			WorkflowRunID: "run-events", EventType: "workflowlog",
			Payload: `{"message":"event"}`, CreatedAt: now.Add(time.Duration(index) * time.Minute),
		})
		if err != nil {
			t.Fatal(err)
		}
		if index == 0 {
			firstID = event.ID
		}
	}

	events, err := client.ListWorkflowRunEvents(ctx, "run-events", firstID, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 || events[0].ID <= firstID {
		t.Fatalf("unexpected replay: %+v", events)
	}
	if err := client.DeleteWorkflowRunEventsBefore(ctx, now.Add(30*time.Second)); err != nil {
		t.Fatal(err)
	}
	events, err = client.ListWorkflowRunEvents(ctx, "run-events", 0, 100)
	if err != nil || len(events) != 2 {
		t.Fatalf("unexpected events after prune: events=%+v err=%v", events, err)
	}
}
