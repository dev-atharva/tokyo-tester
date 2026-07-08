package mcpserver

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestMCPListsTools(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	request := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "tokyo_validate_workflow") || !strings.Contains(recorder.Body.String(), "tokyo_review_workflow_plan") {
		t.Fatalf("unexpected response: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestMCPListsAndReadsLeanAuthoringResources(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	listRequest := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"resources/list"}`))
	listRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK || !strings.Contains(listRecorder.Body.String(), "tokyo://authoring") || !strings.Contains(listRecorder.Body.String(), "tokyo://quality-rubric") {
		t.Fatalf("unexpected resources response: %d %s", listRecorder.Code, listRecorder.Body.String())
	}

	readRequest := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"tokyo://scenario-patterns"}}`))
	readRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(readRecorder, readRequest)
	body := readRecorder.Body.String()
	if !strings.Contains(body, "Scenario patterns") || len(body) > 1800 {
		t.Fatalf("unexpected resource body (%d bytes): %s", len(body), body)
	}
}

func TestMCPReviewWorkflowPlanWarnsWithoutBlocking(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	requestBody := `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"tokyo_review_workflow_plan","arguments":{"repositories":[{"path":"./api"}],"serviceInventory":[{"name":"api","type":"generic","repository":"./api"},{"name":"worker","type":"generic"},{"name":"postgres","type":"postgres","repository":"./infra"}],"dependencyMap":[],"scenarioMatrix":[{"scenario":"smoke","servicesTouched":["api"]}],"evidenceNotes":[],"openQuestions":["Which topic does the worker consume?"]}}}`
	request := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(requestBody))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}
	body := recorder.Body.String()
	for _, expected := range []string{"missing_dependencies", "missing_evidence_notes", "open_questions", "incomplete_repo_provenance", "untested_infrastructure", `"isError":false`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected %q in review response: %s", expected, body)
		}
	}
	if len(body) > 3500 {
		t.Fatalf("review response is too large (%d bytes): %s", len(body), body)
	}
	var response rpcResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	result := response.Result.(map[string]any)
	content := result["content"].([]any)[0].(map[string]any)["text"].(string)
	var contentPayload any
	if err := json.Unmarshal([]byte(content), &contentPayload); err != nil {
		t.Fatal(err)
	}
	if result["structuredContent"] == nil {
		t.Fatal("structuredContent was not returned")
	}
}

func TestMCPToolAnnotationsAndSchemaDescriptions(t *testing.T) {
	byName := map[string]map[string]any{}
	for _, tool := range tools() {
		byName[tool["name"].(string)] = tool
	}
	createRevision := byName["tokyo_create_workflow_revision"]["annotations"].(map[string]any)
	if createRevision["idempotentHint"] != false || createRevision["readOnlyHint"] != false {
		t.Fatalf("unexpected create revision annotations: %+v", createRevision)
	}
	review := byName["tokyo_review_workflow_plan"]
	reviewAnnotations := review["annotations"].(map[string]any)
	if reviewAnnotations["readOnlyHint"] != true || reviewAnnotations["destructiveHint"] != false {
		t.Fatalf("unexpected review annotations: %+v", reviewAnnotations)
	}
	schema := review["inputSchema"].(map[string]any)
	properties := schema["properties"].(map[string]any)
	if properties["repositories"].(map[string]any)["description"] == "" {
		t.Fatal("review schema is missing field descriptions")
	}
}

func TestMCPForwardsAuthorizationWithoutFilesystemAccess(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	server.client.Transport = roundTripper(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer tt_pat_test" {
			t.Fatal("authorization was not forwarded")
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"projects":[]}`))}, nil
	})
	request := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tokyo_list_projects","arguments":{}}}`))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"isError":false`) {
		t.Fatalf("unexpected response: %s", recorder.Body.String())
	}
}

func TestMCPRunsSelectedExistingScenarios(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	server.client.Transport = roundTripper(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/agent/workflows/workflow-1/runs" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Idempotency-Key") != "retry-key-123" {
			t.Fatal("idempotency key was not forwarded")
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"scenarioIds":["scenario-2"]`) {
			t.Fatalf("scenario selection was not forwarded: %s", body)
		}
		return &http.Response{StatusCode: http.StatusAccepted, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"workflowRunId":"run-1"}`))}, nil
	})
	request := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tokyo_run_existing_workflow","arguments":{"workflowId":"workflow-1","scenarioIds":["scenario-2"],"idempotencyKey":"retry-key-123"}}}`))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"isError":false`) {
		t.Fatalf("unexpected response: %s", recorder.Body.String())
	}
}

func TestMCPRestoresWorkflowRevisionWithVersionGuard(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	server.client.Transport = roundTripper(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/agent/workflows/workflow-1/revisions/revision-2/restore" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"expectedVersion":7`) {
			t.Fatalf("version guard was not forwarded: %s", body)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"revision_number":8}`))}, nil
	})
	request := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"tokyo_restore_workflow_revision","arguments":{"workflowId":"workflow-1","revisionId":"revision-2","expectedVersion":7}}}`))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"isError":false`) {
		t.Fatalf("unexpected response: %s", recorder.Body.String())
	}
}

func TestTokyoTesterSkillStaysCompactAndReferencesExist(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to resolve test path")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	skillPath := filepath.Join(root, ".agents", "skills", "tokyo-tester", "SKILL.md")
	skillBytes, err := os.ReadFile(skillPath)
	if err != nil {
		t.Fatal(err)
	}
	skill := string(skillBytes)
	if lines := strings.Count(skill, "\n") + 1; lines >= 200 {
		t.Fatalf("SKILL.md is too long: %d lines", lines)
	}
	for _, expected := range []string{"Discover every relevant repository", "tokyo_review_workflow_plan", "references/research.md", "references/scenario-design.md"} {
		if !strings.Contains(skill, expected) {
			t.Fatalf("skill is missing %q", expected)
		}
	}
	for _, name := range []string{"research.md", "graph-modeling.md", "scenario-design.md", "quality-rubric.md", "authoring.md"} {
		if _, err := os.ReadFile(filepath.Join(root, ".agents", "skills", "tokyo-tester", "references", name)); err != nil {
			t.Fatalf("missing reference %s: %v", name, err)
		}
	}
}

type roundTripper func(*http.Request) (*http.Response, error)

func (fn roundTripper) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }
