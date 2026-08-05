package sync

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/dev-atharva/cots/internal/testmysql"
	"github.com/dev-atharva/cots/pkg/db"
	mysqldb "github.com/dev-atharva/cots/pkg/db/mysql"
	"github.com/dev-atharva/cots/pkg/types"
)

func TestProcessBatchSupportsScenarioEntities(t *testing.T) {
	t.Parallel()

	service, database := newTestService(t)
	defer database.Close()

	now := time.Now().UTC().Truncate(time.Second)

	workflowPayload := types.WorkflowData{
		ID:          "wf-1",
		UserID:      "user-1",
		ProjectID:   "project-1",
		Name:        "Order Workflow",
		Description: "workflow description",
		NodesConfig: rawJSON(t, map[string]any{"nodes": []string{"api"}}),
		EdgesConfig: rawJSON(t, []map[string]string{}),
		Metadata:    rawJSON(t, map[string]any{"layout": "graph"}),
		Version:     1,
		CreatedAt:   now,
		UpdatedAt:   now,
		ClientID:    "client-1",
		IsDeleted:   false,
	}

	scenarioPayload := types.ScenarioData{
		ID:                "scenario-1",
		ProjectID:         "project-1",
		WorkflowID:        workflowPayload.ID,
		UserID:            "user-1",
		Name:              "Happy Path",
		Description:       "scenario description",
		ExecutionModel:    "journey",
		TestsConfig:       rawJSON(t, []map[string]any{}),
		TestOrder:         rawJSON(t, []string{}),
		EnvironmentConfig: rawJSON(t, map[string]any{"driver": "browser", "browser": map[string]any{"targetService": "web", "targetPort": "3000"}}),
		StepsConfig:       rawJSON(t, []map[string]any{{"id": "open", "name": "open", "kind": "action"}}),
		StepOrder:         rawJSON(t, []string{"open"}),
		Metadata:          rawJSON(t, map[string]any{"color": "blue"}),
		Version:           1,
		CreatedAt:         now,
		UpdatedAt:         now,
		ClientID:          "client-1",
		IsDeleted:         false,
	}

	workflowRunPayload := types.WorkflowRunData{
		ID:          "workflow-run-1",
		ProjectID:   "project-1",
		WorkflowID:  workflowPayload.ID,
		UserID:      "user-1",
		Status:      "running",
		Summary:     rawJSON(t, map[string]int{"total_scenarios": 1}),
		Logs:        rawJSON(t, []string{"workflow started"}),
		Error:       "",
		StartedAt:   ptrTime(now),
		CompletedAt: nil,
		Metadata:    rawJSON(t, map[string]any{"mode": "continue_all"}),
		Version:     1,
		CreatedAt:   now,
		UpdatedAt:   now,
		ClientID:    "client-1",
		IsDeleted:   false,
	}

	sessionPayload := types.SessionData{
		ID:               "scenario-run-1",
		UserID:           "user-1",
		ProjectID:        "project-1",
		WorkflowRunID:    workflowRunPayload.ID,
		WorkflowID:       workflowPayload.ID,
		ScenarioID:       scenarioPayload.ID,
		ScenarioName:     scenarioPayload.Name,
		BackendSessionID: "backend-session-1",
		Status:           "running",
		Result:           rawJSON(t, map[string]string{"stage": "provision"}),
		ContainerIDs:     rawJSON(t, []string{"container-1"}),
		Logs:             rawJSON(t, []string{"scenario started"}),
		Error:            "",
		StartedAt:        ptrTime(now),
		CompletedAt:      nil,
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
		ClientID:         "client-1",
		IsDeleted:        false,
	}

	testResultPayload := types.TestResultData{
		ID:            "test-result-1",
		UserID:        "user-1",
		ProjectID:     "project-1",
		SessionID:     sessionPayload.ID,
		WorkflowRunID: workflowRunPayload.ID,
		WorkflowID:    workflowPayload.ID,
		ScenarioID:    scenarioPayload.ID,
		ScenarioName:  scenarioPayload.Name,
		TestName:      "Health Check",
		TestType:      "http",
		Status:        "running",
		ResultData:    `{"status":"running"}`,
		DurationMs:    10,
		ExecutedAt:    now,
		CreatedAt:     now,
		UpdatedAt:     now,
		ClientID:      "client-1",
		IsDeleted:     false,
	}

	req := &types.SyncBatchRequest{
		ClientID:  "client-1",
		UserID:    "user-1",
		ProjectID: "project-1",
		TimeStamp: now,
		Changes: []types.SyncChange{
			newSyncChange(t, "workflow", workflowPayload.ID, "insert", workflowPayload, now),
			newSyncChange(t, "scenario", scenarioPayload.ID, "insert", scenarioPayload, now),
			newSyncChange(t, "workflow_run", workflowRunPayload.ID, "insert", workflowRunPayload, now),
			newSyncChange(t, "scenario_run", sessionPayload.ID, "insert", sessionPayload, now),
			newSyncChange(t, "test_result", testResultPayload.ID, "insert", testResultPayload, now),
		},
	}

	resp, err := service.ProcessBatch(context.Background(), req)
	if err != nil {
		t.Fatalf("ProcessBatch returned error: %v", err)
	}

	if !resp.Success {
		t.Fatalf("expected successful response, got %+v", resp)
	}
	if resp.ProcessedCount != len(req.Changes) {
		t.Fatalf("expected %d processed changes, got %d", len(req.Changes), resp.ProcessedCount)
	}

	scenario, err := database.GetScenario(context.Background(), scenarioPayload.ID)
	if err != nil {
		t.Fatalf("GetScenario returned error: %v", err)
	}
	if scenario.WorkflowID != workflowPayload.ID || scenario.Name != scenarioPayload.Name || scenario.ExecutionModel != "journey" || scenario.StepOrder != `["open"]` {
		t.Fatalf("unexpected scenario persisted: %+v", scenario)
	}

	workflowRun, err := database.GetWorkflowRun(context.Background(), workflowRunPayload.ID)
	if err != nil {
		t.Fatalf("GetWorkflowRun returned error: %v", err)
	}
	if workflowRun.WorkflowID != workflowPayload.ID || workflowRun.Status != workflowRunPayload.Status {
		t.Fatalf("unexpected workflow run persisted: %+v", workflowRun)
	}

	session, err := database.GetSession(context.Background(), sessionPayload.ID)
	if err != nil {
		t.Fatalf("GetSession returned error: %v", err)
	}
	if session.WorkflowRunID != workflowRunPayload.ID || session.ScenarioID != scenarioPayload.ID || session.BackendSessionID != sessionPayload.BackendSessionID {
		t.Fatalf("unexpected session persisted: %+v", session)
	}

	testResult, err := database.GetTestResult(context.Background(), testResultPayload.ID)
	if err != nil {
		t.Fatalf("GetTestResult returned error: %v", err)
	}
	if testResult.WorkflowRunID != workflowRunPayload.ID || testResult.ScenarioID != scenarioPayload.ID || testResult.ScenarioName != scenarioPayload.Name {
		t.Fatalf("unexpected test result persisted: %+v", testResult)
	}
}

func TestProcessBatchRejectsStaleWorkflowUpdate(t *testing.T) {
	t.Parallel()
	service, database := newTestService(t)
	defer database.Close()

	now := time.Now().UTC().Truncate(time.Second)
	payload := types.WorkflowData{
		ID: "wf-concurrent", ProjectID: "project-1", UserID: "user-1", Name: "Original",
		NodesConfig: rawJSON(t, []any{}), EdgesConfig: rawJSON(t, []any{}), Metadata: rawJSON(t, map[string]any{}),
		Version: 1, CreatedAt: now, UpdatedAt: now, ClientID: "client-a",
	}
	insert := newSyncChange(t, "workflow", payload.ID, "insert", payload, now)
	insert.ClientVersion = 0
	if response, err := service.ProcessBatch(context.Background(), &types.SyncBatchRequest{
		ClientID: "client-a", UserID: "user-1", ProjectID: "project-1", TimeStamp: now, Changes: []types.SyncChange{insert},
	}); err != nil || !response.Success {
		t.Fatalf("insert failed: response=%+v error=%v", response, err)
	}

	payload.Name = "First editor"
	first := newSyncChange(t, "workflow", payload.ID, "update", payload, now.Add(time.Second))
	first.ClientVersion = 1
	if response, err := service.ProcessBatch(context.Background(), &types.SyncBatchRequest{
		ClientID: "client-a", UserID: "user-1", ProjectID: "project-1", TimeStamp: now, Changes: []types.SyncChange{first},
	}); err != nil || !response.Success || len(response.Conflicts) != 0 {
		t.Fatalf("first update failed: response=%+v error=%v", response, err)
	}

	payload.Name = "Stale second editor"
	stale := newSyncChange(t, "workflow", payload.ID, "update", payload, now.Add(2*time.Second))
	stale.ClientVersion = 1
	response, err := service.ProcessBatch(context.Background(), &types.SyncBatchRequest{
		ClientID: "client-b", UserID: "user-2", ProjectID: "project-1", TimeStamp: now, Changes: []types.SyncChange{stale},
	})
	if err != nil || !response.Success || len(response.Conflicts) != 1 {
		t.Fatalf("expected one acknowledged conflict: response=%+v error=%v", response, err)
	}
	if response.Conflicts[0].ClientVersion != 1 || response.Conflicts[0].CurrentVersion != 2 {
		t.Fatalf("unexpected conflict versions: %+v", response.Conflicts[0])
	}
	persisted, err := database.GetWorkflow(context.Background(), payload.ID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.Name != "First editor" || persisted.Version != 2 {
		t.Fatalf("stale update overwrote current data: %+v", persisted)
	}
}

func TestPullChangesIncludesScenariosAndWorkflowRuns(t *testing.T) {
	t.Parallel()

	service, database := newTestService(t)
	defer database.Close()

	now := time.Now().UTC().Truncate(time.Second)

	workflow := &db.Workflow{
		ID:          "wf-2",
		ProjectID:   "project-1",
		Name:        "Billing Workflow",
		Description: "workflow",
		NodesConfig: `{"nodes":["billing"]}`,
		EdgesConfig: `[]`,
		Metadata:    `{"zoom":1}`,
		Version:     1,
		CreatedAt:   now,
		UpdatedAt:   now,
		ClientID:    "client-1",
		UserID:      "user-1",
	}
	if err := database.UpsertWorkflow(context.Background(), workflow); err != nil {
		t.Fatalf("UpsertWorkflow returned error: %v", err)
	}

	scenario := &db.Scenario{
		ID:                "scenario-2",
		ProjectID:         "project-1",
		WorkflowID:        workflow.ID,
		Name:              "Failure Path",
		Description:       "scenario",
		ExecutionModel:    "journey",
		TestsConfig:       `[{"id":"test-2"}]`,
		TestOrder:         `["test-2"]`,
		EnvironmentConfig: `{"driver":"browser","browser":{"targetService":"web","targetPort":"3000"}}`,
		StepsConfig:       `[{"id":"visible"}]`,
		StepOrder:         `["visible"]`,
		Metadata:          `{"priority":"high"}`,
		Version:           1,
		CreatedAt:         now,
		UpdatedAt:         now,
		ClientID:          "client-1",
		UserID:            "user-1",
	}
	if err := database.UpsertScenario(context.Background(), scenario); err != nil {
		t.Fatalf("UpsertScenario returned error: %v", err)
	}

	workflowRun := &db.WorkflowRun{
		ID:          "workflow-run-2",
		ProjectID:   "project-1",
		WorkflowID:  workflow.ID,
		Status:      "partial_failed",
		Summary:     `{"passed":0,"failed":1}`,
		Logs:        `["workflow completed"]`,
		StartedAt:   ptrTime(now),
		CompletedAt: ptrTime(now.Add(2 * time.Minute)),
		Metadata:    `{"fanout":1}`,
		Version:     1,
		CreatedAt:   now,
		UpdatedAt:   now,
		ClientID:    "client-1",
		UserID:      "user-1",
	}
	if err := database.UpsertWorkflowRun(context.Background(), workflowRun); err != nil {
		t.Fatalf("UpsertWorkflowRun returned error: %v", err)
	}

	session := &db.Session{
		ID:               "scenario-run-2",
		ProjectID:        "project-1",
		WorkflowRunID:    workflowRun.ID,
		WorkflowID:       workflow.ID,
		ScenarioID:       scenario.ID,
		ScenarioName:     scenario.Name,
		BackendSessionID: "backend-session-2",
		Status:           "failed",
		Result:           `{"failed":1}`,
		ContainerIDs:     `["container-2"]`,
		Logs:             `["scenario failed"]`,
		Error:            "assertion failed",
		StartedAt:        ptrTime(now),
		CompletedAt:      ptrTime(now.Add(time.Minute)),
		Version:          1,
		CreatedAt:        now,
		UpdatedAt:        now,
		ClientID:         "client-1",
		UserID:           "user-1",
	}
	if err := database.UpsertSession(context.Background(), session); err != nil {
		t.Fatalf("UpsertSession returned error: %v", err)
	}

	testResult := &db.TestResult{
		ID:            "test-result-2",
		ProjectID:     "project-1",
		SessionID:     session.ID,
		WorkflowRunID: workflowRun.ID,
		WorkflowID:    workflow.ID,
		ScenarioID:    scenario.ID,
		ScenarioName:  scenario.Name,
		TestName:      "Assertions",
		TestType:      "shell",
		Status:        "failed",
		ResultData:    `{"exit_code":1}`,
		DurationMs:    42,
		ExecutedAt:    now,
		CreatedAt:     now,
		UpdatedAt:     now,
		ClientID:      "client-1",
		UserID:        "user-1",
	}
	if err := database.UpsertTestResult(context.Background(), testResult); err != nil {
		t.Fatalf("UpsertTestResult returned error: %v", err)
	}

	resp, err := service.PullChanges(context.Background(), "user-1", "project-1")
	if err != nil {
		t.Fatalf("PullChanges returned error: %v", err)
	}

	if len(resp.Workflows) != 1 || len(resp.Scenarios) != 1 || len(resp.WorkflowRuns) != 1 || len(resp.Sessions) != 1 || len(resp.TestResults) != 1 {
		t.Fatalf("unexpected pull counts: workflows=%d scenarios=%d workflowRuns=%d sessions=%d testResults=%d",
			len(resp.Workflows), len(resp.Scenarios), len(resp.WorkflowRuns), len(resp.Sessions), len(resp.TestResults))
	}

	if resp.Scenarios[0].ID != scenario.ID || resp.Scenarios[0].WorkflowID != workflow.ID || resp.Scenarios[0].ExecutionModel != "journey" || string(resp.Scenarios[0].StepOrder) != `["visible"]` {
		t.Fatalf("unexpected scenario pull payload: %+v", resp.Scenarios[0])
	}
	if resp.WorkflowRuns[0].ID != workflowRun.ID || resp.WorkflowRuns[0].Status != workflowRun.Status {
		t.Fatalf("unexpected workflow run pull payload: %+v", resp.WorkflowRuns[0])
	}
	if resp.Sessions[0].ScenarioID != scenario.ID || resp.Sessions[0].WorkflowRunID != workflowRun.ID || resp.Sessions[0].BackendSessionID != session.BackendSessionID {
		t.Fatalf("unexpected session pull payload: %+v", resp.Sessions[0])
	}
	if resp.TestResults[0].ScenarioID != scenario.ID || resp.TestResults[0].WorkflowRunID != workflowRun.ID || resp.TestResults[0].ScenarioName != scenario.Name {
		t.Fatalf("unexpected test result pull payload: %+v", resp.TestResults[0])
	}
}

func newTestService(t *testing.T) (*Service, *mysqldb.Client) {
	t.Helper()
	client := testmysql.NewClient(t, "sync")
	return NewService(client), client
}

func newSyncChange(t *testing.T, entityType, entityID, changeType string, payload any, clientTime time.Time) types.SyncChange {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	return types.SyncChange{
		EntityType:    entityType,
		EntityID:      entityID,
		ChangeType:    changeType,
		Data:          body,
		ClientTime:    clientTime,
		ClientVersion: 1,
	}
}

func rawJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	body, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	return json.RawMessage(body)
}

func ptrTime(value time.Time) *time.Time {
	return &value
}
