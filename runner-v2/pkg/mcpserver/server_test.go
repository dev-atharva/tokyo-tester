package mcpserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestMCPListsTools(t *testing.T) {
	server := newTestServer(t)
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "tokyo_validate_workflow") || !strings.Contains(recorder.Body.String(), "tokyo_review_workflow_plan") {
		t.Fatalf("unexpected response: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestMCPHealthSupportsGetAndHead(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = roundTripper(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/api/health" {
			t.Fatalf("unexpected health dependency path: %s", request.URL.Path)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"status":"ok"}`)),
		}, nil
	})

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			server.Handler().ServeHTTP(recorder, httptest.NewRequest(method, "/health", nil))

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
			}
			if method == http.MethodHead && recorder.Body.Len() != 0 {
				t.Fatalf("HEAD response body = %q, want empty", recorder.Body.String())
			}
		})
	}
}

func TestMCPListsAndReadsLeanAuthoringResources(t *testing.T) {
	server := newTestServer(t)
	listRequest := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"resources/list"}`))
	listRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK || !strings.Contains(listRecorder.Body.String(), "tokyo://authoring") || !strings.Contains(listRecorder.Body.String(), "tokyo://quality-rubric") {
		t.Fatalf("unexpected resources response: %d %s", listRecorder.Code, listRecorder.Body.String())
	}

	readRequest := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"tokyo://scenario-patterns"}}`))
	readRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(readRecorder, readRequest)
	body := readRecorder.Body.String()
	if !strings.Contains(body, "Scenario patterns") || len(body) > 1800 {
		t.Fatalf("unexpected resource body (%d bytes): %s", len(body), body)
	}
}

func TestMCPReviewWorkflowPlanWarnsWithoutBlocking(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = authenticatedTransport(t, nil)
	requestBody := `{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"tokyo_review_workflow_plan","arguments":{"repositories":[{"path":"./api"}],"serviceInventory":[{"name":"api","type":"generic","repository":"./api"},{"name":"worker","type":"generic"},{"name":"postgres","type":"postgres","repository":"./infra"}],"dependencyMap":[],"scenarioMatrix":[{"scenario":"smoke","servicesTouched":["api"]}],"evidenceNotes":[],"openQuestions":["Which topic does the worker consume?"]}}}`
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(requestBody))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
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
	validate := byName["tokyo_validate_workflow"]["inputSchema"].(map[string]any)
	bundle := validate["properties"].(map[string]any)["bundle"].(map[string]any)
	scenarios := bundle["properties"].(map[string]any)["scenarios"].(map[string]any)
	scenarioModels := scenarios["items"].(map[string]any)["oneOf"].([]any)
	legacyScenario := scenarioModels[0].(map[string]any)
	testSchema := legacyScenario["properties"].(map[string]any)["tests"].(map[string]any)["items"].(map[string]any)
	httpConfig := testSchema["properties"].(map[string]any)["httpConfig"].(map[string]any)
	if httpConfig["additionalProperties"] != false || !containsString(httpConfig["required"], "method") || !containsString(httpConfig["required"], "path") {
		t.Fatalf("HTTP tool config is not strict: %+v", httpConfig)
	}
	queueConfig := testSchema["properties"].(map[string]any)["queueConfig"].(map[string]any)
	operation := queueConfig["properties"].(map[string]any)["operation"].(map[string]any)
	if !containsString(operation["enum"], "produce_and_consume") {
		t.Fatalf("queue tool config is missing supported operations: %+v", operation)
	}
	journeyScenario := scenarioModels[1].(map[string]any)
	steps := journeyScenario["properties"].(map[string]any)["steps"].(map[string]any)
	stepModels := steps["items"].(map[string]any)["oneOf"].([]any)
	actionStep := stepModels[0].(map[string]any)
	actions := actionStep["properties"].(map[string]any)["action"].(map[string]any)["oneOf"].([]any)
	fill := actions[1].(map[string]any)
	values := fill["properties"].(map[string]any)["value"].(map[string]any)["oneOf"].([]any)
	runSecret := values[1].(map[string]any)
	if runSecret["additionalProperties"] != false || !containsString(runSecret["required"], "secretRef") {
		t.Fatalf("journey run-secret schema is not strict: %+v", runSecret)
	}
}

func containsString(value any, expected string) bool {
	items, ok := value.([]string)
	if !ok {
		return false
	}
	for _, item := range items {
		if item == expected {
			return true
		}
	}
	return false
}

func TestMCPExchangesAuthorizationForInternalAssertion(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = authenticatedTransport(t, func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "" {
			t.Fatal("client authorization must not be forwarded to the application API")
		}
		if r.Header.Get("X-Tokyo-Agent-Assertion") == "" {
			t.Fatal("internal assertion was not forwarded")
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"projects":[]}`))}, nil
	})
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tokyo_list_projects","arguments":{}}}`))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"isError":false`) {
		t.Fatalf("unexpected response: %s", recorder.Body.String())
	}
}

func TestMCPRunsSelectedExistingScenarios(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = authenticatedTransport(t, func(r *http.Request) (*http.Response, error) {
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
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tokyo_run_existing_workflow","arguments":{"workflowId":"workflow-1","scenarioIds":["scenario-2"],"idempotencyKey":"retry-key-123"}}}`))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"isError":false`) {
		t.Fatalf("unexpected response: %s", recorder.Body.String())
	}
}

func TestMCPSecretBearingRunReturnsAndPollsHumanIntentWithoutValues(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = authenticatedTransport(t, func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/api/v1/agent/workflows/workflow-1/runs":
			body, _ := io.ReadAll(r.Body)
			if strings.Contains(strings.ToLower(string(body)), "secretvalue") || strings.Contains(string(body), `"value"`) {
				t.Fatalf("MCP run request crossed the human secret boundary: %s", body)
			}
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"kind":"human_input_required","runIntentId":"intent-1","status":"awaiting-human","handoffUrl":"https://tokyo.example/run-intents/intent-1","requiredSecretRefs":["LOGIN_PASSWORD"],"expiresAt":"2026-08-03T10:15:00Z"}`))}, nil
		case "/api/v1/agent/run-intents/intent-1":
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"kind":"human_input_required","runIntentId":"intent-1","status":"submitted","requiredSecretRefs":["LOGIN_PASSWORD"],"workflowRunId":"run-1"}`))}, nil
		default:
			t.Fatalf("unexpected application path: %s", r.URL.Path)
			return nil, nil
		}
	})

	call := func(id int, name, arguments string) string {
		t.Helper()
		request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":%q,"arguments":%s}}`, id, name, arguments)))
		request.Header.Set("Authorization", "Bearer tt_pat_test")
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s returned %d: %s", name, recorder.Code, recorder.Body.String())
		}
		return recorder.Body.String()
	}
	run := call(31, "tokyo_run_existing_workflow", `{"workflowId":"workflow-1","scenarioIds":["scenario-1"],"idempotencyKey":"intent-key-1"}`)
	if !strings.Contains(run, `"human_input_required"`) || !strings.Contains(run, `"isError":false`) {
		t.Fatalf("unexpected run-intent response: %s", run)
	}
	status := call(32, "tokyo_get_run_intent", `{"runIntentId":"intent-1"}`)
	if !strings.Contains(status, `"submitted"`) || !strings.Contains(status, `"workflowRunId":"run-1"`) {
		t.Fatalf("unexpected run-intent status: %s", status)
	}
	for _, response := range []string{run, status} {
		if strings.Contains(strings.ToLower(response), "secretvalue") || strings.Contains(response, `"value"`) || strings.Contains(response, "Available this session") {
			t.Fatalf("secret value or vault availability crossed MCP: %s", response)
		}
	}
}

func TestMCPReturnsOnlyExplicitlyRequestedPNGScreenshotAsImageContent(t *testing.T) {
	server := newTestServer(t)
	png := []byte{'\x89', 'P', 'N', 'G', '\r', '\n', '\x1a', '\n'}
	server.client.Transport = authenticatedTransport(t, func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/agent/runs/run-1/artifacts/artifact-1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"image/png"}}, Body: io.NopCloser(bytes.NewReader(png))}, nil
	})
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":33,"method":"tools/call","params":{"name":"tokyo_get_run_screenshot","arguments":{"workflowRunId":"run-1","artifactId":"artifact-1"}}}`))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"type":"image"`) || !strings.Contains(recorder.Body.String(), `"mimeType":"image/png"`) {
		t.Fatalf("unexpected image response: %d %s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "structuredContent") {
		t.Fatalf("image response must not be shadowed by structured content: %s", recorder.Body.String())
	}
	byName := map[string]map[string]any{}
	for _, candidate := range tools() {
		byName[candidate["name"].(string)] = candidate
	}
	if _, exists := byName["tokyo_get_run_screenshot"]["outputSchema"]; exists {
		t.Fatal("image tool must not advertise a structured output schema")
	}
	if _, exists := byName["tokyo_get_run_trace"]; exists {
		t.Fatal("Playwright traces must remain UI-only")
	}
}

func TestMCPRestoresWorkflowRevisionWithVersionGuard(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = authenticatedTransport(t, func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/agent/workflows/workflow-1/revisions/revision-2/restore" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"expectedVersion":7`) {
			t.Fatalf("version guard was not forwarded: %s", body)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"revision_number":8}`))}, nil
	})
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"tokyo_restore_workflow_revision","arguments":{"workflowId":"workflow-1","revisionId":"revision-2","expectedVersion":7}}}`))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"isError":false`) {
		t.Fatalf("unexpected response: %s", recorder.Body.String())
	}
}

func TestMCPReturnsInsufficientScopeBeforeCallingApplication(t *testing.T) {
	server := newTestServer(t)
	server.client.Transport = roundTripper(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api/v1/agent/introspect" {
			t.Fatalf("application must not be called without run scope: %s", r.URL.Path)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"active":true,"sub":"user-1","user_id":"user-1","email":"user@example.com","project_id":"project-1","scopes":["read"]}`))}, nil
	})
	request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"tokyo_run_existing_workflow","arguments":{"workflowId":"workflow-1","idempotencyKey":"retry-key-123"}}}`))
	request.Header.Set("Authorization", "Bearer tt_pat_test")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, received %d: %s", recorder.Code, recorder.Body.String())
	}
	challenge := recorder.Header().Get("WWW-Authenticate")
	if !strings.Contains(challenge, `error="insufficient_scope"`) || !strings.Contains(challenge, `scope="run"`) {
		t.Fatalf("unexpected challenge: %s", challenge)
	}
}

func TestMCPRejectsUnexpectedBrowserOriginAndProtocolVersion(t *testing.T) {
	server, err := New(Config{
		AppBaseURL: "http://ui:3000", PublicMCPURL: "http://localhost:8090/mcp",
		AllowedOrigins: "https://tokyo.example", AuthMode: "personal_token", InternalSecret: "test-internal-secret-at-least-32-bytes",
	})
	if err != nil {
		t.Fatal(err)
	}
	originRequest := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	originRequest.Header.Set("Origin", "https://attacker.example")
	originRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(originRecorder, originRequest)
	if originRecorder.Code != http.StatusForbidden {
		t.Fatalf("unexpected origin status: %d", originRecorder.Code)
	}

	protocolRequest := newMCPRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`))
	protocolRequest.Header.Set("MCP-Protocol-Version", "2024-01-01")
	protocolRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(protocolRecorder, protocolRequest)
	if protocolRecorder.Code != http.StatusBadRequest {
		t.Fatalf("unexpected protocol status: %d", protocolRecorder.Code)
	}

	missingProtocolRequest := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":3,"method":"tools/list"}`))
	missingProtocolRecorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(missingProtocolRecorder, missingProtocolRequest)
	if missingProtocolRecorder.Code != http.StatusBadRequest || !strings.Contains(missingProtocolRecorder.Body.String(), "MCP-Protocol-Version is required") {
		t.Fatalf("unexpected missing protocol response: %d %s", missingProtocolRecorder.Code, missingProtocolRecorder.Body.String())
	}
}

func TestMCPValidateReceiptAuthorizesExactImport(t *testing.T) {
	server := newTestServer(t)
	bundle := map[string]any{
		"schemaVersion": float64(2),
		"kind":          "cots.workflow-bundle",
		"workflow":      map[string]any{"name": "orders"},
	}
	imports := 0
	server.client.Transport = authenticatedTransport(t, func(r *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var requestBody map[string]any
		if err := json.Unmarshal(body, &requestBody); err != nil {
			t.Fatal(err)
		}
		switch r.URL.Path {
		case "/api/v1/agent/workflows/validate":
			payload, _ := json.Marshal(map[string]any{"valid": true, "bundle": requestBody["bundle"], "issues": []any{}})
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(payload))}, nil
		case "/api/v1/agent/workflows/import":
			imports++
			if r.Header.Get("Idempotency-Key") != "stable-import-key" {
				t.Fatalf("idempotency key was not forwarded: %q", r.Header.Get("Idempotency-Key"))
			}
			if !reflect.DeepEqual(requestBody["bundle"], bundle) {
				t.Fatalf("import bundle changed after validation: %#v", requestBody["bundle"])
			}
			return &http.Response{StatusCode: http.StatusCreated, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"workflowId":"workflow-1"}`))}, nil
		default:
			t.Fatalf("unexpected application path: %s", r.URL.Path)
			return nil, nil
		}
	})

	call := func(id int, name string, arguments map[string]any) map[string]any {
		t.Helper()
		payload, err := json.Marshal(map[string]any{
			"jsonrpc": "2.0",
			"id":      id,
			"method":  "tools/call",
			"params":  map[string]any{"name": name, "arguments": arguments},
		})
		if err != nil {
			t.Fatal(err)
		}
		request := newMCPRequest(http.MethodPost, "/mcp", bytes.NewReader(payload))
		request.Header.Set("Authorization", "Bearer tt_pat_test")
		recorder := httptest.NewRecorder()
		server.Handler().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s returned %d: %s", name, recorder.Code, recorder.Body.String())
		}
		var response rpcResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		result, ok := response.Result.(map[string]any)
		if !ok {
			t.Fatalf("%s returned no result: %s", name, recorder.Body.String())
		}
		if result["isError"] == true {
			t.Fatalf("%s returned a tool error: %s", name, recorder.Body.String())
		}
		structured, ok := result["structuredContent"].(map[string]any)
		if !ok {
			t.Fatalf("%s returned no structured content: %s", name, recorder.Body.String())
		}
		return structured
	}

	validation := call(10, "tokyo_validate_workflow", map[string]any{"bundle": bundle})
	receipt, ok := validation["validationReceipt"].(string)
	if !ok || receipt == "" {
		t.Fatalf("validation returned no receipt: %#v", validation)
	}
	normalizedBundle, ok := validation["bundle"].(map[string]any)
	if !ok {
		t.Fatalf("validation returned no normalized bundle: %#v", validation)
	}
	call(11, "tokyo_import_workflow", map[string]any{
		"bundle":            normalizedBundle,
		"validationReceipt": receipt,
		"idempotencyKey":    "stable-import-key",
	})
	if imports != 1 {
		t.Fatalf("imports = %d, want 1", imports)
	}
}

func TestMCPOAuthRequiresExactProjectAudience(t *testing.T) {
	server, err := New(Config{
		AppBaseURL: "http://ui:3000", PublicMCPURL: "https://tokyo.example/mcp", AuthMode: "oauth",
		OAuthIssuer: "https://identity.example", OAuthIntrospectionURL: "https://identity.example/introspect",
		OAuthClientID: "client", OAuthClientSecret: "secret", InternalSecret: "test-internal-secret-at-least-32-bytes",
	})
	if err != nil {
		t.Fatal(err)
	}
	server.client.Transport = roundTripper(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://identity.example/introspect" {
			t.Fatalf("unexpected introspection URL: %s", r.URL)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"active":true,"sub":"oauth-user","email":"user@example.com","scope":"read","aud":"https://tokyo.example/mcp/projects/another-project"}`))}, nil
	})
	request := newMCPRequest(http.MethodPost, "/mcp/projects/project-1", bytes.NewBufferString(`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tokyo_list_projects","arguments":{}}}`))
	request.Header.Set("Authorization", "Bearer oauth-token")
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized || !strings.Contains(recorder.Header().Get("WWW-Authenticate"), "oauth-protected-resource/mcp/projects/project-1") {
		t.Fatalf("unexpected OAuth response: %d %s %s", recorder.Code, recorder.Header().Get("WWW-Authenticate"), recorder.Body.String())
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
	for _, expected := range []string{"Discover every relevant repository", "scripts/inspect_repository.py", "validationReceipt", "untrusted evidence", "tokyo_review_workflow_plan", "references/connection.md", "references/research.md", "references/scenario-design.md"} {
		if !strings.Contains(skill, expected) {
			t.Fatalf("skill is missing %q", expected)
		}
	}
	for _, name := range []string{"connection.md", "research.md", "graph-modeling.md", "scenario-design.md", "quality-rubric.md", "authoring.md"} {
		if _, err := os.ReadFile(filepath.Join(root, ".agents", "skills", "tokyo-tester", "references", name)); err != nil {
			t.Fatalf("missing reference %s: %v", name, err)
		}
	}
	if _, err := os.ReadFile(filepath.Join(root, ".agents", "skills", "tokyo-tester", "evaluations", "README.md")); err != nil {
		t.Fatalf("missing skill evaluations: %v", err)
	}
	for _, name := range []string{"inspect_repository.py", "test_inspect_repository.py"} {
		if _, err := os.ReadFile(filepath.Join(root, ".agents", "skills", "tokyo-tester", "scripts", name)); err != nil {
			t.Fatalf("missing skill script %s: %v", name, err)
		}
	}
}

type roundTripper func(*http.Request) (*http.Response, error)

func (fn roundTripper) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }

func newMCPRequest(method, target string, body io.Reader) *http.Request {
	request := httptest.NewRequest(method, target, body)
	request.Header.Set("MCP-Protocol-Version", protocolVersion)
	return request
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	server, err := New(Config{
		AppBaseURL: "http://ui:3000", PublicMCPURL: "http://localhost:8090/mcp",
		AuthMode: "personal_token", InternalSecret: "test-internal-secret-at-least-32-bytes",
	})
	if err != nil {
		t.Fatal(err)
	}
	return server
}

func authenticatedTransport(t *testing.T, next roundTripper) roundTripper {
	t.Helper()
	return func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/api/v1/agent/introspect" {
			if r.Header.Get("Authorization") != "Bearer tt_pat_test" {
				t.Fatal("token was not sent to introspection")
			}
			if r.Header.Get("X-Tokyo-MCP-Secret") == "" {
				t.Fatal("introspection secret was not sent")
			}
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"active":true,"sub":"user-1","user_id":"user-1","email":"user@example.com","project_id":"project-1","scopes":["read","workflow:write","run"]}`))}, nil
		}
		if next == nil {
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{}`))}, nil
		}
		return next(r)
	}
}
