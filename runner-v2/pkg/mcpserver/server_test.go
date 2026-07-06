package mcpserver

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMCPListsTools(t *testing.T) {
	server, _ := New("http://ui:3000", "")
	request := httptest.NewRequest(http.MethodPost, "/mcp", bytes.NewBufferString(`{"jsonrpc":"2.0","id":1,"method":"tools/list"}`))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "tokyo_validate_workflow") {
		t.Fatalf("unexpected response: %d %s", recorder.Code, recorder.Body.String())
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

type roundTripper func(*http.Request) (*http.Response, error)

func (fn roundTripper) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }
