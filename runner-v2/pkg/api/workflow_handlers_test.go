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

	"github.com/dev-atharva/cots/internal/testmysql"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	mysqldb "github.com/dev-atharva/cots/pkg/db/mysql"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
	"github.com/dev-atharva/cots/pkg/workflowrun"
)

func newWorkflowAPIHarness(t *testing.T) (*Handler, *WorkflowService, *mysqldb.Client, []byte) {
	return newWorkflowAPIHarnessWithSeed(t, true)
}

func newWorkflowAPIHarnessWithSeed(t *testing.T, seedWorkflow bool) (*Handler, *WorkflowService, *mysqldb.Client, []byte) {
	t.Helper()
	client := testmysql.NewClient(t, "workflow_api")

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
	if seedWorkflow {
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
	}

	appConfig := config.AppConfig{
		ProvisionTimeoutSec: 30, TestRunTimeoutSec: 30, CleanupTimeoutSec: 30,
		OperationQueueTimeoutSec: 5, MaxConcurrentProvision: 1,
		MaxConcurrentTestRuns: 1, MaxConcurrentCleanup: 1,
	}
	handler := NewHandler(client, appConfig)
	service, err := NewWorkflowService(handler, client, client, config.WorkflowWorkerConfig{
		Concurrency: 1, ScenarioConcurrency: 1, MaxQueuedGlobal: 10,
		MaxQueuedPerUser: 3, MaxQueuedPerProject: 10, MaxRunningPerUser: 1,
		MaxRunningPerProject: 2, LeaseSeconds: 60,
		HeartbeatSeconds: 15, MaxRecoveries: 3, EventRetentionDays: 30,
		EncryptionKey: base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{9}, 32)),
	})
	if err != nil {
		t.Fatal(err)
	}
	handler.SetWorkflowService(service)
	return handler, service, client, payload
}

func TestWorkflowRunSubmissionPersistsUnsyncedGraph(t *testing.T) {
	handler, _, client, payload := newWorkflowAPIHarnessWithSeed(t, false)
	router := NewRouter(handler, nil, false)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(payload)))
	if recorder.Code != http.StatusAccepted || !strings.Contains(recorder.Body.String(), `"created":true`) {
		t.Fatalf("unexpected submission for unsynced workflow: status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	var request workflowrun.Request
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatal(err)
	}
	workflow, err := client.GetWorkflow(context.Background(), request.WorkflowID)
	if err != nil {
		t.Fatalf("workflow was not persisted from run payload: %v", err)
	}
	if workflow.ProjectID != request.ProjectID || !strings.Contains(workflow.NodesConfig, `"id"`) {
		t.Fatalf("unexpected persisted workflow: %+v", workflow)
	}
	for _, scenario := range request.Scenarios {
		persisted, err := client.GetScenario(context.Background(), scenario.ID)
		if err != nil {
			t.Fatalf("scenario %s was not persisted from run payload: %v", scenario.ID, err)
		}
		if persisted.ProjectID != request.ProjectID || persisted.WorkflowID != request.WorkflowID {
			t.Fatalf("unexpected persisted scenario: %+v", persisted)
		}
	}
}

func TestWorkflowRunSubmissionIsIdempotent(t *testing.T) {
	handler, _, client, payload := newWorkflowAPIHarness(t)
	router := NewRouter(handler, nil, false)

	post := func(body []byte) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(body)))
		return recorder
	}

	first := post(payload)
	if first.Code != http.StatusAccepted || !strings.Contains(first.Body.String(), `"created":true`) || !strings.Contains(first.Body.String(), `"workflowRevisionId"`) || !strings.Contains(first.Body.String(), `"position":1`) {
		t.Fatalf("unexpected first submission: status=%d body=%s", first.Code, first.Body.String())
	}
	second := post(payload)
	if second.Code != http.StatusAccepted || !strings.Contains(second.Body.String(), `"created":false`) {
		t.Fatalf("unexpected idempotent submission: status=%d body=%s", second.Code, second.Body.String())
	}
	var submitted workflowrun.Request
	if err := json.Unmarshal(payload, &submitted); err != nil {
		t.Fatal(err)
	}
	revisions, err := client.ListWorkflowRevisions(context.Background(), submitted.ProjectID, submitted.WorkflowID)
	if err != nil {
		t.Fatal(err)
	}
	if len(revisions) != 1 {
		t.Fatalf("idempotent retry created %d execution revisions", len(revisions))
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

func TestWorkflowRunSecretAuthorizationBlocksInvalidSetsAndPersistsOnlyCiphertext(t *testing.T) {
	handler, service, client, payload := newWorkflowAPIHarness(t)
	var request workflowrun.Request
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatal(err)
	}
	request.WorkflowRunID = "run-secret-contract"
	request.Scenarios = request.Scenarios[:1]
	request.Scenarios[0].ExecutionModel = workflowbundle.ExecutionModelJourney
	request.Scenarios[0].Tests = nil
	request.Scenarios[0].TestOrder = nil
	request.Scenarios[0].Environment = &workflowbundle.JourneyEnvironment{Driver: "browser", Browser: workflowbundle.BrowserEnvironment{TargetService: workflowbundle.SanitizeName(request.Nodes[0].Data.Label), TargetPort: request.Nodes[0].Data.Service.Ports[0].ContainerPort}}
	request.Scenarios[0].Steps = []workflowbundle.ScenarioStep{{ID: "password", Name: "Password", Kind: "action", Action: &workflowbundle.StepAction{Operation: "fill", Locator: &workflowbundle.BrowserLocator{Strategy: "label", Value: "Password"}, Value: &workflowbundle.StepValue{Source: "run-secret", SecretRef: "PASSWORD"}}}}
	request.Scenarios[0].StepOrder = []string{"password"}
	persistedWorkflow, err := client.GetWorkflow(context.Background(), request.WorkflowID)
	if err != nil {
		t.Fatal(err)
	}
	nodes, _ := json.Marshal(request.Nodes)
	edges, _ := json.Marshal(request.Edges)
	persistedWorkflow.NodesConfig, persistedWorkflow.EdgesConfig = string(nodes), string(edges)
	if err := client.UpsertWorkflow(context.Background(), persistedWorkflow); err != nil {
		t.Fatal(err)
	}
	persistedScenario, err := client.GetScenario(context.Background(), request.Scenarios[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	environment, _ := json.Marshal(request.Scenarios[0].Environment)
	steps, _ := json.Marshal(request.Scenarios[0].Steps)
	stepOrder, _ := json.Marshal(request.Scenarios[0].StepOrder)
	persistedScenario.ExecutionModel = workflowbundle.ExecutionModelJourney
	persistedScenario.TestsConfig, persistedScenario.TestOrder = "[]", "[]"
	persistedScenario.EnvironmentConfig, persistedScenario.StepsConfig, persistedScenario.StepOrder = string(environment), string(steps), string(stepOrder)
	if err := client.UpsertScenario(context.Background(), persistedScenario); err != nil {
		t.Fatal(err)
	}
	requestPayload, _ := json.Marshal(&request)
	router := NewRouter(handler, nil, false)

	direct := httptest.NewRecorder()
	router.ServeHTTP(direct, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(requestPayload)))
	if direct.Code != http.StatusBadRequest || !strings.Contains(direct.Body.String(), runsecret.CodeRequired) || !strings.Contains(direct.Body.String(), "PASSWORD") {
		t.Fatalf("direct secret-bearing submission was not blocked: status=%d body=%s", direct.Code, direct.Body.String())
	}

	authorize := func(values any) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]any{"request": request, "runSecrets": values})
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs/authorize", bytes.NewReader(body)))
		return recorder
	}
	missing := authorize([]any{})
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), runsecret.CodeMissing) {
		t.Fatalf("missing secret was not blocked: status=%d body=%s", missing.Code, missing.Body.String())
	}
	tampered := request
	tampered.Scenarios = append([]workflowrun.Scenario(nil), request.Scenarios...)
	tampered.Scenarios[0].Steps, tampered.Scenarios[0].StepOrder = nil, nil
	tamperedBody, _ := json.Marshal(map[string]any{"request": tampered, "runSecrets": []any{}})
	tamperedResponse := httptest.NewRecorder()
	router.ServeHTTP(tamperedResponse, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs/authorize", bytes.NewReader(tamperedBody)))
	if tamperedResponse.Code != http.StatusBadRequest || !strings.Contains(tamperedResponse.Body.String(), "PASSWORD") {
		t.Fatalf("tampered requirements bypassed persisted preflight: status=%d body=%s", tamperedResponse.Code, tamperedResponse.Body.String())
	}
	extra := authorize([]any{map[string]string{"secretRef": "PASSWORD", "value": "sentinel"}, map[string]string{"secretRef": "EXTRA", "value": "other"}})
	if extra.Code != http.StatusBadRequest || !strings.Contains(extra.Body.String(), runsecret.CodeExtra) {
		t.Fatalf("extra secret was not blocked: status=%d body=%s", extra.Code, extra.Body.String())
	}
	var browserRequest map[string]any
	if err := json.Unmarshal(requestPayload, &browserRequest); err != nil {
		t.Fatal(err)
	}
	uiNodes := browserRequest["nodes"].([]any)
	uiNodes[0].(map[string]any)["position"] = map[string]any{"x": 40, "y": 80}
	uiNodes[0].(map[string]any)["type"] = "custom"
	acceptedBody, _ := json.Marshal(map[string]any{
		"request":    browserRequest,
		"runSecrets": []any{map[string]string{"secretRef": "PASSWORD", "value": "sentinel"}},
	})
	accepted := httptest.NewRecorder()
	router.ServeHTTP(accepted, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs/authorize", bytes.NewReader(acceptedBody)))
	if accepted.Code != http.StatusAccepted || !strings.Contains(accepted.Body.String(), `"created":true`) {
		t.Fatalf("authorized run with UI-only node metadata was not accepted: status=%d body=%s", accepted.Code, accepted.Body.String())
	}

	job, err := client.GetWorkflowJob(context.Background(), request.WorkflowRunID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(job.PayloadCiphertext, []byte("sentinel")) || len(job.PayloadCiphertext) == 0 || len(job.PayloadNonce) == 0 {
		t.Fatalf("job did not retain only authenticated ciphertext: %+v", job)
	}
	plaintext, err := service.cipher.Decrypt(job.PayloadCiphertext, job.PayloadNonce)
	if err != nil {
		t.Fatal(err)
	}
	defer runsecret.Clear(plaintext)
	decodedRequest, decodedSecrets, err := runsecret.DecodeJobPayload(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	defer decodedSecrets.Destroy()
	encodedRequest, _ := json.Marshal(decodedRequest)
	if bytes.Contains(encodedRequest, []byte("sentinel")) || !decodedSecrets.Present() {
		t.Fatalf("public request or secret set had the wrong lifetime: request=%s names=%v", encodedRequest, decodedSecrets.Names())
	}
	revisions, err := client.ListWorkflowRevisions(context.Background(), request.ProjectID, request.WorkflowID)
	if err != nil || len(revisions) != 1 || strings.Contains(revisions[0].Snapshot, "sentinel") {
		t.Fatalf("execution revision exposed a run-secret value: revisions=%+v err=%v", revisions, err)
	}
	cancelled := httptest.NewRecorder()
	router.ServeHTTP(cancelled, httptest.NewRequest(http.MethodDelete, "/api/v1/workflow-runs/"+request.WorkflowRunID+"?projectId="+request.ProjectID, nil))
	if cancelled.Code != http.StatusAccepted {
		t.Fatalf("secret-bearing run cancellation failed: status=%d body=%s", cancelled.Code, cancelled.Body.String())
	}
	terminalJob, err := client.GetWorkflowJob(context.Background(), request.WorkflowRunID)
	if err != nil || len(terminalJob.PayloadCiphertext) != 0 || len(terminalJob.PayloadNonce) != 0 {
		t.Fatalf("terminal job retained encrypted secret payload: job=%+v err=%v", terminalJob, err)
	}
}

func TestNormalizeScenarioExecutionFieldsRemovesInactiveEmptyCollections(t *testing.T) {
	journey := &workflowrun.Scenario{
		ExecutionModel: workflowbundle.ExecutionModelJourney,
		Tests:          []workflowbundle.ScenarioTestDefinition{},
		TestOrder:      []string{},
	}
	normalizeScenarioExecutionFields(journey)
	if journey.Tests != nil || journey.TestOrder != nil {
		t.Fatalf("journey retained inactive legacy fields: %+v", journey)
	}

	legacy := &workflowrun.Scenario{
		ExecutionModel: workflowbundle.ExecutionModelLegacyTests,
		Environment:    &workflowbundle.JourneyEnvironment{},
		Steps:          []workflowbundle.ScenarioStep{},
		StepOrder:      []string{},
	}
	normalizeScenarioExecutionFields(legacy)
	if legacy.Environment != nil || legacy.Steps != nil || legacy.StepOrder != nil {
		t.Fatalf("legacy scenario retained inactive journey fields: %+v", legacy)
	}
}

func TestWorkflowRunOutputRedactionAppliesBeforePersistenceEncoding(t *testing.T) {
	secrets, err := runsecret.New([]string{"PASSWORD"}, []runsecret.SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("sentinel-value")}})
	if err != nil {
		t.Fatal(err)
	}
	defer secrets.Destroy()
	ctx := runsecret.WithContext(context.Background(), secrets)
	encoded, err := marshalRunOutput(ctx, map[string]any{
		"message": "failure contained sentinel-value",
		"nested":  map[string]string{"detail": base64.StdEncoding.EncodeToString([]byte("sentinel-value"))},
	})
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encoded, []byte("sentinel-value")) || bytes.Contains(encoded, []byte(base64.StdEncoding.EncodeToString([]byte("sentinel-value")))) || !bytes.Contains(encoded, []byte(runsecret.Redacted)) {
		t.Fatalf("persisted output was not redacted: %s", encoded)
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		t.Fatalf("redaction broke structured JSON: %v (%s)", err, encoded)
	}
}

func TestWorkflowRunSnapshotUsesImmutableExecutionRevision(t *testing.T) {
	handler, _, client, payload := newWorkflowAPIHarness(t)
	router := NewRouter(handler, nil, false)
	var submitted workflowrun.Request
	if err := json.Unmarshal(payload, &submitted); err != nil {
		t.Fatal(err)
	}

	post := httptest.NewRecorder()
	router.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(payload)))
	if post.Code != http.StatusAccepted {
		t.Fatalf("submission failed: status=%d body=%s", post.Code, post.Body.String())
	}

	current, err := client.GetWorkflow(context.Background(), submitted.WorkflowID)
	if err != nil {
		t.Fatal(err)
	}
	current.Name = "Edited after execution started"
	current.NodesConfig = "[]"
	current.Version++
	current.UpdatedAt = time.Now().UTC()
	if err := client.UpsertWorkflow(context.Background(), current); err != nil {
		t.Fatal(err)
	}

	get := httptest.NewRecorder()
	router.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/"+submitted.WorkflowRunID+"?projectId="+submitted.ProjectID, nil))
	if get.Code != http.StatusOK {
		t.Fatalf("snapshot failed: status=%d body=%s", get.Code, get.Body.String())
	}
	var response struct {
		ExecutionDefinition struct {
			WorkflowRevisionID string `json:"workflowRevisionId"`
			RevisionNumber     int    `json:"revisionNumber"`
			Workflow           struct {
				Name  string                    `json:"name"`
				Nodes []workflowbundle.FlowNode `json:"nodes"`
			} `json:"workflow"`
			Scenarios []map[string]any `json:"scenarios"`
		} `json:"executionDefinition"`
	}
	if err := json.Unmarshal(get.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	definition := response.ExecutionDefinition
	if definition.WorkflowRevisionID == "" || definition.RevisionNumber < 1 {
		t.Fatalf("missing revision metadata: %#v", definition)
	}
	if definition.Workflow.Name != submitted.WorkflowName || len(definition.Workflow.Nodes) != len(submitted.Nodes) {
		t.Fatalf("snapshot rendered the edited workflow instead of the execution revision: %#v", definition.Workflow)
	}
	if len(definition.Scenarios) != len(submitted.Scenarios) {
		t.Fatalf("got %d scenarios, want %d", len(definition.Scenarios), len(submitted.Scenarios))
	}
	for _, node := range definition.Workflow.Nodes {
		if registry := node.Data.Service.Registry; registry != nil && (registry.Username != "" || registry.Password != "" || registry.Token != "") {
			t.Fatalf("execution definition exposed registry credentials for node %s", node.ID)
		}
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

func TestWorkflowRunCancellationEndpointCancelsPendingRun(t *testing.T) {
	handler, _, _, payload := newWorkflowAPIHarness(t)
	router := NewRouter(handler, nil, false)
	submit := httptest.NewRecorder()
	router.ServeHTTP(submit, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-runs", bytes.NewReader(payload)))
	if submit.Code != http.StatusAccepted {
		t.Fatalf("submission failed: status=%d body=%s", submit.Code, submit.Body.String())
	}
	cancel := httptest.NewRecorder()
	router.ServeHTTP(cancel, httptest.NewRequest(http.MethodDelete, "/api/v1/workflow-runs/run-contract-1?projectId=project-contract-1", nil))
	if cancel.Code != http.StatusAccepted || !strings.Contains(cancel.Body.String(), `"status":"cancelled"`) {
		t.Fatalf("unexpected cancellation response: status=%d body=%s", cancel.Code, cancel.Body.String())
	}
	snapshot := httptest.NewRecorder()
	router.ServeHTTP(snapshot, httptest.NewRequest(http.MethodGet, "/api/v1/workflow-runs/run-contract-1?projectId=project-contract-1", nil))
	if snapshot.Code != http.StatusOK || !strings.Contains(snapshot.Body.String(), `"status":"cancelled"`) {
		t.Fatalf("cancelled status was not durable: status=%d body=%s", snapshot.Code, snapshot.Body.String())
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

func TestWriteWorkflowHeartbeatProducesVisibleSSEEvent(t *testing.T) {
	recorder := httptest.NewRecorder()
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	if err := writeWorkflowHeartbeat(recorder, "run-heartbeat", "running", now); err != nil {
		t.Fatal(err)
	}
	body := recorder.Body.String()
	if !strings.Contains(body, "event: heartbeat\n") || !strings.Contains(body, `"workflowRunId":"run-heartbeat"`) || !strings.Contains(body, `"status":"running"`) {
		t.Fatalf("unexpected heartbeat frame: %q", body)
	}
}

func TestSessionHeartbeatRenewsLeaseDuringLongOperation(t *testing.T) {
	handler, _, client, _ := newWorkflowAPIHarness(t)
	old := time.Now().UTC().Add(-time.Hour)
	session := &db.Session{
		ID: "long-running-session", ProjectID: "project-contract-1", WorkflowRunID: "long-running-run",
		WorkflowID: "workflow-contract-1", ScenarioID: "long-running-scenario", ScenarioName: "Long running",
		Status: "running", OwnerID: handler.ownerID, HeartbeatAt: &old, LeaseExpiresAt: &old,
		Phase: sessionPhaseRunningTests, Version: 1, CreatedAt: old, UpdatedAt: old,
	}
	if err := client.UpsertSession(context.Background(), session); err != nil {
		t.Fatal(err)
	}

	handler.sessionHeartbeatInterval = 10 * time.Millisecond
	handler.leaseDuration = time.Minute
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go handler.heartbeatSession(ctx, session.ID)

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		stored, err := client.GetSession(context.Background(), session.ID)
		if err == nil && stored.HeartbeatAt != nil && stored.HeartbeatAt.After(old) && stored.LeaseExpiresAt != nil && stored.LeaseExpiresAt.After(time.Now()) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("session heartbeat did not renew the persisted lease")
}

func TestInterruptedSessionRemainsRecoverable(t *testing.T) {
	handler, _, client, _ := newWorkflowAPIHarness(t)
	now := time.Now().UTC()
	completedAt := now
	session := &db.Session{
		ID: "interrupted-session", ProjectID: "project-contract-1", WorkflowRunID: "interrupted-run",
		WorkflowID: "workflow-contract-1", ScenarioID: "interrupted-scenario", ScenarioName: "Interrupted",
		Status: "running", Error: "context canceled", CompletedAt: &completedAt,
		Phase: sessionPhaseRunningTests, CheckpointIndex: 1, Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	if err := client.UpsertSession(context.Background(), session); err != nil {
		t.Fatal(err)
	}

	handler.persistInterruptedSession(context.Background(), session.ID)
	stored, err := client.GetSession(context.Background(), session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != "pending" || stored.Phase != sessionPhaseRunningTests || stored.CheckpointIndex != 1 || stored.CompletedAt != nil || stored.Error != "" {
		t.Fatalf("interrupted session was not left recoverable: %+v", stored)
	}
	if isTerminalScenarioCheckpoint(stored) {
		t.Fatal("interrupted session must not be treated as a terminal scenario checkpoint")
	}
	if !isTerminalScenarioCheckpoint(&db.Session{Status: "completed", Phase: sessionPhaseCompleted}) {
		t.Fatal("completed scenario checkpoint should remain reusable")
	}
}

func TestWorkflowResourceMetadataIncludesDurableOwnershipLabels(t *testing.T) {
	execution := &dto.ExecutionContextDTO{
		SessionID: "scenario-run-1", WorkflowID: "workflow-1", WorkflowRunID: "workflow-run-1", ScenarioID: "scenario-1",
	}
	ctx := withWorkflowResourceMetadata(context.Background(), execution, "backend-session-1")
	labels := provider.ResourceLabels(ctx, provider.ResourceTypeContainer)
	want := map[string]string{
		provider.LabelSessionID:        "scenario-run-1",
		provider.LabelBackendSessionID: "backend-session-1",
		provider.LabelWorkflowID:       "workflow-1",
		provider.LabelWorkflowRunID:    "workflow-run-1",
		provider.LabelScenarioID:       "scenario-1",
	}
	for key, expected := range want {
		if labels[key] != expected {
			t.Fatalf("unexpected resource label %s: got %q want %q", key, labels[key], expected)
		}
	}
}
