package mysql

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

func testWorkflowJob(id string, now time.Time) *db.WorkflowJob {
	return &db.WorkflowJob{
		ID: id, WorkflowRunID: "run-" + id, ProjectID: "project-1", UserID: "user-1",
		RequestHash: "hash-" + id, PayloadCiphertext: []byte("ciphertext"),
		PayloadNonce: []byte("nonce"), Status: "pending", EstimatedCost: 1, CreatedAt: now, UpdatedAt: now,
	}
}

func testAdmissionPolicy() db.WorkflowAdmissionPolicy {
	return db.WorkflowAdmissionPolicy{
		MaxQueuedGlobal: 10, MaxQueuedPerUser: 3, MaxQueuedPerProject: 10,
		SubmissionsPerMinuteUser: 10, SubmissionsPerMinuteProject: 60,
		MaxRunningPerUser: 1, MaxRunningPerProject: 2,
	}
}

func seedTestWorkflow(t *testing.T, client *Client, now time.Time) {
	t.Helper()
	if err := client.UpsertWorkflow(context.Background(), &db.Workflow{
		ID: "workflow-1", ProjectID: "project-1", Name: "Workflow",
		NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}
}

func TestWorkflowDurationEstimateUsesHistoricalPercentilesAndCost(t *testing.T) {
	estimate := workflowDurationEstimate([]float64{1, 2, 3, 4, 10}, 2)
	if estimate == nil || estimate.P50Seconds != 6 || estimate.P90Seconds != 20 || estimate.SampleSize != 5 {
		t.Fatalf("unexpected duration estimate: %+v", estimate)
	}
	if workflowDurationEstimate(nil, 2) != nil {
		t.Fatal("empty history should not produce a fabricated estimate")
	}
}

func TestCreateWorkflowJobIsIdempotentAndRejectsHashMismatch(t *testing.T) {
	client := newMySQLIntegrationClient(t)
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
	client := newMySQLIntegrationClient(t)
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
	client := newMySQLIntegrationClient(t)
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
	for index := 1; index < 205; index++ {
		message := fmt.Sprintf("log-%03d", index)
		if _, err := client.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: run.ID, EventType: "workflowlog", Payload: `{"message":"tail"}`, CreatedAt: now.Add(time.Duration(index) * time.Millisecond)}, message, session.ID); err != nil {
			t.Fatal(err)
		}
	}
	storedRun, _ = client.GetWorkflowRun(ctx, run.ID)
	var tail []string
	if err := json.Unmarshal([]byte(storedRun.Logs), &tail); err != nil || len(tail) != 200 {
		t.Fatalf("denormalized log tail was not bounded: count=%d err=%v", len(tail), err)
	}
	if tail[0] != "log-005" {
		t.Fatalf("unexpected first retained log: %q", tail[0])
	}
	page, hasMore, err := client.ListWorkflowLogEventsBefore(ctx, run.ID, 0, 50)
	if err != nil || len(page) != 50 || !hasMore {
		t.Fatalf("unexpected first log page: count=%d hasMore=%v err=%v", len(page), hasMore, err)
	}
	next, _, err := client.ListWorkflowLogEventsBefore(ctx, run.ID, page[len(page)-1].ID, 50)
	if err != nil || len(next) != 50 || next[0].ID >= page[len(page)-1].ID {
		t.Fatalf("unexpected second log page: events=%+v err=%v", next, err)
	}
}

func TestEnqueueWorkflowJobRejectsExistingRunOwnershipCollision(t *testing.T) {
	client := newMySQLIntegrationClient(t)
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
	client := newMySQLIntegrationClient(t)
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

func TestAdmissionBurstNeverExceedsDurableProjectCapacity(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	if err := client.UpsertWorkflow(ctx, &db.Workflow{ID: "workflow-burst", ProjectID: "project-burst", Name: "Burst", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	policy := testAdmissionPolicy()
	policy.MaxQueuedGlobal = 7
	policy.MaxQueuedPerProject = 7
	policy.MaxQueuedPerUser = 7
	policy.SubmissionsPerMinuteUser = 100
	policy.SubmissionsPerMinuteProject = 100
	var wg sync.WaitGroup
	results := make(chan bool, 50)
	errorsFound := make(chan error, 50)
	for index := 0; index < 50; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			job := testWorkflowJob(fmt.Sprintf("burst-%02d", index), now.Add(time.Duration(index)*time.Microsecond))
			job.ProjectID = "project-burst"
			job.UserID = fmt.Sprintf("user-%02d", index)
			run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-burst", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: job.CreatedAt, UpdatedAt: job.CreatedAt}
			_, created, err := client.AdmitWorkflowJob(ctx, job, run, nil, policy)
			if err != nil {
				var admissionErr *db.WorkflowAdmissionError
				if !errors.As(err, &admissionErr) {
					errorsFound <- err
				}
			}
			results <- created
		}()
	}
	wg.Wait()
	close(results)
	close(errorsFound)
	for err := range errorsFound {
		t.Fatalf("unexpected burst admission error: %v", err)
	}
	created := 0
	for accepted := range results {
		if accepted {
			created++
		}
	}
	if created != policy.MaxQueuedPerProject {
		t.Fatalf("expected exactly %d admitted jobs, got %d", policy.MaxQueuedPerProject, created)
	}
}

func TestWorkflowJobRecoveryLimitAndPayloadErasure(t *testing.T) {
	client := newMySQLIntegrationClient(t)
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
	client := newMySQLIntegrationClient(t)
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
	client := newMySQLIntegrationClient(t)
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

func TestWorkflowAdmissionEnforcesUserLimitButKeepsRetriesIdempotent(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	policy := testAdmissionPolicy()
	policy.MaxQueuedPerUser = 1

	seed := func(job *db.WorkflowJob) (*db.WorkflowJob, bool, error) {
		run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: now, UpdatedAt: now}
		return client.AdmitWorkflowJob(ctx, job, run, nil, policy)
	}
	if err := client.UpsertWorkflow(ctx, &db.Workflow{ID: "workflow-1", ProjectID: "project-1", Name: "Workflow", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}

	first := testWorkflowJob("admitted", now)
	if _, created, err := seed(first); err != nil || !created {
		t.Fatalf("first admission failed: created=%v err=%v", created, err)
	}
	if _, created, err := seed(first); err != nil || created {
		t.Fatalf("idempotent retry should bypass quota: created=%v err=%v", created, err)
	}

	second := testWorkflowJob("rejected", now.Add(time.Second))
	_, _, err := seed(second)
	var admissionErr *db.WorkflowAdmissionError
	if !errors.As(err, &admissionErr) || admissionErr.Scope != "user" {
		t.Fatalf("expected user admission error, got %v", err)
	}
}

func TestWorkflowAdmissionEnforcesProjectQueueLimit(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	policy := testAdmissionPolicy()
	policy.MaxQueuedPerProject = 1
	if err := client.UpsertWorkflow(ctx, &db.Workflow{ID: "workflow-1", ProjectID: "project-1", Name: "Workflow", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	admit := func(job *db.WorkflowJob) error {
		run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: now, UpdatedAt: now}
		_, _, err := client.AdmitWorkflowJob(ctx, job, run, nil, policy)
		return err
	}
	if err := admit(testWorkflowJob("project-first", now)); err != nil {
		t.Fatal(err)
	}
	second := testWorkflowJob("project-second", now.Add(time.Second))
	second.UserID = "user-2"
	err := admit(second)
	var admissionErr *db.WorkflowAdmissionError
	if !errors.As(err, &admissionErr) || admissionErr.Scope != "project" {
		t.Fatalf("expected project admission error, got %v", err)
	}
}

func TestWorkflowAdmissionPersistsUserRateLimitAcrossRequests(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	policy := testAdmissionPolicy()
	policy.SubmissionsPerMinuteUser = 1
	if err := client.UpsertWorkflow(ctx, &db.Workflow{ID: "workflow-1", ProjectID: "project-1", Name: "Workflow", NodesConfig: `[]`, EdgesConfig: `[]`, Version: 1, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	admit := func(job *db.WorkflowJob) (*db.WorkflowJob, bool, error) {
		run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: job.CreatedAt, UpdatedAt: job.CreatedAt}
		return client.AdmitWorkflowJob(ctx, job, run, nil, policy)
	}
	first := testWorkflowJob("rate-first", now)
	if _, created, err := admit(first); err != nil || !created {
		t.Fatalf("first request should be admitted: created=%v err=%v", created, err)
	}
	if _, created, err := admit(first); err != nil || created {
		t.Fatalf("idempotent retry should not consume rate capacity: created=%v err=%v", created, err)
	}
	_, _, err := admit(testWorkflowJob("rate-second", now.Add(time.Second)))
	var admissionErr *db.WorkflowAdmissionError
	if !errors.As(err, &admissionErr) || admissionErr.Scope != "user_rate" || admissionErr.RetryAfter <= 0 {
		t.Fatalf("expected durable user rate limit, got %v", err)
	}
}

func TestFairClaimDoesNotGiveOneUserEveryWorker(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	policy := testAdmissionPolicy()

	jobs := []*db.WorkflowJob{
		testWorkflowJob("user-one-first", now),
		testWorkflowJob("user-one-second", now.Add(time.Second)),
		testWorkflowJob("user-two", now.Add(2*time.Second)),
	}
	jobs[2].UserID = "user-2"
	for _, job := range jobs {
		if _, _, err := client.CreateWorkflowJob(ctx, job); err != nil {
			t.Fatal(err)
		}
	}

	first, err := client.ClaimWorkflowJobFair(ctx, "worker-a", now.Add(3*time.Second), time.Minute, 3, policy)
	if err != nil || first.UserID != "user-1" {
		t.Fatalf("unexpected first claim: job=%+v err=%v", first, err)
	}
	second, err := client.ClaimWorkflowJobFair(ctx, "worker-b", now.Add(4*time.Second), time.Minute, 3, policy)
	if err != nil || second.UserID != "user-2" {
		t.Fatalf("second worker should serve another user: job=%+v err=%v", second, err)
	}
}

func TestWorkflowQueueInfoReportsPendingPosition(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	for _, job := range []*db.WorkflowJob{
		testWorkflowJob("position-one", now),
		testWorkflowJob("position-two", now.Add(time.Second)),
	} {
		if _, _, err := client.CreateWorkflowJob(ctx, job); err != nil {
			t.Fatal(err)
		}
	}

	info, err := client.GetWorkflowJobQueueInfo(ctx, "run-position-two")
	if err != nil || info.Position != 2 || info.Status != "pending" {
		t.Fatalf("unexpected queue info: info=%+v err=%v", info, err)
	}
}

func TestPendingWorkflowCancellationIsImmediateAndDurable(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	seedTestWorkflow(t, client, now)
	job := testWorkflowJob("cancel-pending", now)
	run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: now, UpdatedAt: now}
	session := &db.Session{ID: "cancel-pending-session", ProjectID: job.ProjectID, WorkflowRunID: job.WorkflowRunID, WorkflowID: "workflow-1", ScenarioID: "scenario-1", Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}
	if _, _, err := client.AdmitWorkflowJob(ctx, job, run, []*db.Session{session}, testAdmissionPolicy()); err != nil {
		t.Fatal(err)
	}
	cancelled, changed, err := client.RequestWorkflowJobCancellation(ctx, job.WorkflowRunID, job.ProjectID, "user requested cancellation", now.Add(time.Second))
	if err != nil || !changed || cancelled.Status != "cancelled" || cancelled.CancelledAt == nil {
		t.Fatalf("unexpected cancellation: job=%+v changed=%v err=%v", cancelled, changed, err)
	}
	storedRun, _ := client.GetWorkflowRun(ctx, job.WorkflowRunID)
	storedSession, _ := client.GetSession(ctx, session.ID)
	if storedRun.Status != "cancelled" || storedSession.Status != "cancelled" {
		t.Fatalf("cancellation was not reconciled: run=%+v session=%+v", storedRun, storedSession)
	}
}

func TestPendingWorkflowCancellationWhileProjectIsAtRunningCapacity(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	seedTestWorkflow(t, client, now)
	policy := testAdmissionPolicy()
	policy.MaxRunningPerProject = 1

	blocker := testWorkflowJob("cancel-capacity-blocker", now)
	blockerRun := &db.WorkflowRun{ID: blocker.WorkflowRunID, ProjectID: blocker.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: blocker.UserID, Version: 1, CreatedAt: now, UpdatedAt: now}
	if _, _, err := client.AdmitWorkflowJob(ctx, blocker, blockerRun, nil, policy); err != nil {
		t.Fatal(err)
	}
	if _, err := client.ClaimWorkflowJobFair(ctx, "capacity-worker", now.Add(time.Second), time.Minute, 3, policy); err != nil {
		t.Fatal(err)
	}

	pending := testWorkflowJob("cancel-at-capacity", now.Add(2*time.Second))
	pending.UserID = "another-user"
	pendingRun := &db.WorkflowRun{ID: pending.WorkflowRunID, ProjectID: pending.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: pending.UserID, Version: 1, CreatedAt: pending.CreatedAt, UpdatedAt: pending.UpdatedAt}
	pendingSession := &db.Session{ID: "cancel-at-capacity-session", ProjectID: pending.ProjectID, WorkflowRunID: pending.WorkflowRunID, WorkflowID: "workflow-1", ScenarioID: "scenario-1", Status: "pending", Version: 1, CreatedAt: pending.CreatedAt, UpdatedAt: pending.UpdatedAt}
	if _, _, err := client.AdmitWorkflowJob(ctx, pending, pendingRun, []*db.Session{pendingSession}, policy); err != nil {
		t.Fatal(err)
	}

	cancelled, changed, err := client.RequestWorkflowJobCancellation(ctx, pending.WorkflowRunID, pending.ProjectID, "release queued capacity", now.Add(3*time.Second))
	if err != nil || !changed || cancelled.Status != "cancelled" {
		t.Fatalf("unexpected queued cancellation at running capacity: job=%+v changed=%v err=%v", cancelled, changed, err)
	}
}

func TestRunningWorkflowCancellationStopsHeartbeatAndFinalizes(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	seedTestWorkflow(t, client, now)
	job := testWorkflowJob("cancel-running", now)
	run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: now, UpdatedAt: now}
	if _, _, err := client.AdmitWorkflowJob(ctx, job, run, nil, testAdmissionPolicy()); err != nil {
		t.Fatal(err)
	}
	claimed, err := client.ClaimWorkflowJobFair(ctx, "worker-cancel", now.Add(time.Second), time.Minute, 3, testAdmissionPolicy())
	if err != nil {
		t.Fatal(err)
	}
	requested, changed, err := client.RequestWorkflowJobCancellation(ctx, job.WorkflowRunID, job.ProjectID, "stop", now.Add(2*time.Second))
	if err != nil || !changed || requested.Status != "cancelling" {
		t.Fatalf("unexpected cancellation request: job=%+v changed=%v err=%v", requested, changed, err)
	}
	if err := client.HeartbeatWorkflowJob(ctx, claimed.ID, "worker-cancel", now.Add(3*time.Second), time.Minute); !errors.Is(err, db.ErrWorkflowCancellationRequested) {
		t.Fatalf("heartbeat should observe cancellation, got %v", err)
	}
	if err := client.CancelWorkflowJob(ctx, claimed.ID, "worker-cancel", now.Add(4*time.Second)); err != nil {
		t.Fatal(err)
	}
	stored, _ := client.GetWorkflowJob(ctx, job.WorkflowRunID)
	if stored.Status != "cancelled" || stored.PayloadCiphertext != nil || stored.LeaseOwner != "" {
		t.Fatalf("unexpected final cancellation state: %+v", stored)
	}
}

func TestCancellationSurvivesWorkerCrashAndLeaseRecovery(t *testing.T) {
	client := newMySQLIntegrationClient(t)
	ctx := context.Background()
	now := time.Now().UTC()
	seedTestWorkflow(t, client, now)
	job := testWorkflowJob("cancel-recovery", now)
	run := &db.WorkflowRun{ID: job.WorkflowRunID, ProjectID: job.ProjectID, WorkflowID: "workflow-1", Status: "pending", UserID: job.UserID, Version: 1, CreatedAt: now, UpdatedAt: now}
	if _, _, err := client.AdmitWorkflowJob(ctx, job, run, nil, testAdmissionPolicy()); err != nil {
		t.Fatal(err)
	}
	if _, err := client.ClaimWorkflowJobFair(ctx, "crashed-worker", now, time.Minute, 3, testAdmissionPolicy()); err != nil {
		t.Fatal(err)
	}
	if _, _, err := client.RequestWorkflowJobCancellation(ctx, job.WorkflowRunID, job.ProjectID, "stop after crash", now.Add(10*time.Second)); err != nil {
		t.Fatal(err)
	}
	recovered, err := client.ClaimWorkflowJobFair(ctx, "recovery-worker", now.Add(2*time.Minute), time.Minute, 3, testAdmissionPolicy())
	if err != nil || recovered == nil || recovered.CancelRequestedAt == nil {
		t.Fatalf("cancellation was not recovered: job=%+v err=%v", recovered, err)
	}
	if err := client.CancelWorkflowJob(ctx, recovered.ID, "recovery-worker", now.Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	stored, _ := client.GetWorkflowJob(ctx, job.WorkflowRunID)
	if stored.Status != "cancelled" {
		t.Fatalf("recovered cancellation was not finalized: %+v", stored)
	}
}
