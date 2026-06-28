package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/db/sqlite"
	"github.com/dev-atharva/cots/pkg/workflowrun"
)

func newWorkflowAPIHarness(t *testing.T) (*Handler, *WorkflowService, *sqlite.Client, []byte) {
	t.Helper()
	client, err := sqlite.NewClient(filepath.Join(t.TempDir(), "workflow-api.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	if err := db.NewMigrator(client, "sqlite").RunMigrations(); err != nil {
		t.Fatal(err)
	}

	fixturePath := filepath.Join("..", "..", "..", "contracts", "workflow-run-input.json")
	payload, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	var request workflowrun.Request
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := client.UpsertWorkflow(context.Background(), &db.Workflow{
		ID: request.WorkflowID, ProjectID: request.ProjectID, Name: request.WorkflowName,
		NodesConfig: "[]", EdgesConfig: "[]", Version: 1, CreatedAt: now, UpdatedAt: now,
		ClientID: request.ClientID, UserID: request.UserID,
	}); err != nil {
		t.Fatal(err)
	}
	for _, scenario := range request.Scenarios {
		if err := client.UpsertScenario(context.Background(), &db.Scenario{
			ID: scenario.ID, ProjectID: request.ProjectID, WorkflowID: request.WorkflowID,
			Name: scenario.Name, TestsConfig: "[]", TestOrder: "[]", Version: 1,
			CreatedAt: now, UpdatedAt: now, ClientID: request.ClientID, UserID: request.UserID,
		}); err != nil {
			t.Fatal(err)
		}
	}

	appConfig := config.AppConfig{
		ProvisionTimeoutSec: 30, TestRunTimeoutSec: 30, CleanupTimeoutSec: 30,
		OperationQueueTimeoutSec: 5, MaxConcurrentProvision: 1,
		MaxConcurrentTestRuns: 1, MaxConcurrentCleanup: 1,
	}
	handler := NewHandler(client, appConfig)
	service, err := NewWorkflowService(handler, client, client, config.WorkflowWorkerConfig{
		Concurrency: 1, ScenarioConcurrency: 1, LeaseSeconds: 60,
		HeartbeatSeconds: 15, MaxRecoveries: 3, EventRetentionDays: 30,
		EncryptionKey: base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{9}, 32)),
	})
	if err != nil {
		t.Fatal(err)
	}
	handler.SetWorkflowService(service)
	return handler, service, client, payload
}

func TestWorkflowRunSubmissionIsIdempotent(t *testing.T) {
	handler, _, _, payload := newWorkflowAPIHarness(t)
	router := NewRouter(handler, nil, false)

	post := func(body []byte) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(body)))
		return recorder
	}

	first := post(payload)
	if first.Code != http.StatusAccepted || !strings.Contains(first.Body.String(), `"created":true`) {
		t.Fatalf("unexpected first submission: status=%d body=%s", first.Code, first.Body.String())
	}
	second := post(payload)
	if second.Code != http.StatusAccepted || !strings.Contains(second.Body.String(), `"created":false`) {
		t.Fatalf("unexpected idempotent submission: status=%d body=%s", second.Code, second.Body.String())
	}

	var changed map[string]any
	if err := json.Unmarshal(payload, &changed); err != nil {
		t.Fatal(err)
	}
	changed["workflowName"] = "Different workflow input"
	changedPayload, _ := json.Marshal(changed)
	conflict := post(changedPayload)
	if conflict.Code != http.StatusConflict {
		t.Fatalf("expected conflict, got status=%d body=%s", conflict.Code, conflict.Body.String())
	}

	snapshot := httptest.NewRecorder()
	router.ServeHTTP(snapshot, httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/run-contract-1", nil))
	if snapshot.Code != http.StatusOK || !strings.Contains(snapshot.Body.String(), `"scenarioRuns"`) || !strings.Contains(snapshot.Body.String(), `"status":"pending"`) {
		t.Fatalf("unexpected workflow snapshot: status=%d body=%s", snapshot.Code, snapshot.Body.String())
	}

	wrongProject := httptest.NewRecorder()
	router.ServeHTTP(wrongProject, httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/run-contract-1?projectId=another-project", nil))
	if wrongProject.Code != http.StatusNotFound {
		t.Fatalf("cross-project snapshot should be hidden, got status=%d body=%s", wrongProject.Code, wrongProject.Body.String())
	}
}

func TestWorkflowSubmissionRejectsCrossProjectGraph(t *testing.T) {
	handler, _, _, payload := newWorkflowAPIHarness(t)
	var request map[string]any
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatal(err)
	}
	request["projectId"] = "another-project"
	changed, _ := json.Marshal(request)
	recorder := httptest.NewRecorder()
	NewRouter(handler, nil, false).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(changed)))
	if recorder.Code != http.StatusBadRequest || !strings.Contains(recorder.Body.String(), "does not belong") {
		t.Fatalf("expected project mismatch rejection, got status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestWorkflowRunEventStreamReplaysAfterLastEventID(t *testing.T) {
	handler, service, client, payload := newWorkflowAPIHarness(t)
	var request workflowrun.Request
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatal(err)
	}
	job, _, err := service.Submit(context.Background(), &request)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	claimed, err := client.ClaimWorkflowJob(context.Background(), "test-worker", now, time.Minute, 3)
	if err != nil {
		t.Fatal(err)
	}
	first, err := client.AppendWorkflowRunEvent(context.Background(), &db.WorkflowRunEvent{
		WorkflowRunID: request.WorkflowRunID, EventType: "workflowlog",
		Payload: `{"message":"first"}`, CreatedAt: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := client.AppendWorkflowRunEvent(context.Background(), &db.WorkflowRunEvent{
		WorkflowRunID: request.WorkflowRunID, EventType: "workflowlog",
		Payload: `{"message":"second"}`, CreatedAt: now.Add(time.Second),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.CompleteWorkflowJob(context.Background(), job.ID, claimed.LeaseOwner, now.Add(2*time.Second)); err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	httpRequest := httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/"+request.WorkflowRunID+"/events", nil)
	httpRequest.Header.Set("Last-Event-ID", stringID(first.ID))
	NewRouter(handler, nil, false).ServeHTTP(recorder, httpRequest)
	body := recorder.Body.String()
	if recorder.Code != http.StatusOK || strings.Contains(body, "first") || !strings.Contains(body, "second") {
		t.Fatalf("unexpected SSE replay: status=%d body=%q", recorder.Code, body)
	}
	if !strings.Contains(body, "id: "+stringID(second.ID)) || !strings.Contains(body, "event: workflowlog") {
		t.Fatalf("missing SSE framing: %q", body)
	}
}

func stringID(id int64) string {
	return fmt.Sprintf("%d", id)
}

type failingHeartbeatStore struct {
	db.WorkflowJobStore
	called chan struct{}
}

func (s *failingHeartbeatStore) HeartbeatWorkflowJob(context.Context, string, string, time.Time, time.Duration) error {
	close(s.called)
	return fmt.Errorf("lease ownership lost")
}

func TestWorkflowHeartbeatFailureCancelsExecution(t *testing.T) {
	store := &failingHeartbeatStore{called: make(chan struct{})}
	service := &WorkflowService{store: store, config: config.WorkflowWorkerConfig{HeartbeatSeconds: 1, LeaseSeconds: 60}}
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	go service.heartbeat(ctx, "owner", "job", cancel)

	select {
	case <-ctx.Done():
		if !strings.Contains(context.Cause(ctx).Error(), "heartbeat failed") {
			t.Fatalf("unexpected cancellation cause: %v", context.Cause(ctx))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("heartbeat failure did not cancel workflow execution")
	}
}
