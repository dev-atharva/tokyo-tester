package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAgentCapabilitiesEndpoint(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewRouter(&Handler{}, nil, false).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/workflow-bundles/capabilities", nil))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"schemaVersion":3`) || !strings.Contains(recorder.Body.String(), `"acceptedSchemaVersions":[2,3]`) {
		t.Fatalf("unexpected response: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestAgentValidationReturnsRepairableIssue(t *testing.T) {
	body := `{"schemaVersion":2,"kind":"cots.workflow-bundle","workflow":{"name":"bad","nodes":[{"id":"api","data":{"label":"api","service":{"type":"generic","image":"api:test"}}}],"edges":[]},"scenarios":[{"name":"smoke","tests":[{"id":"wait","name":"wait","type":"delay","targetServices":["missing"],"delayConfig":{"durationMs":1}}],"testOrder":["wait"]}]}`
	recorder := httptest.NewRecorder()
	NewRouter(&Handler{}, nil, false).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/workflow-bundles/validate", strings.NewReader(body)))
	if recorder.Code != http.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), `"code":"unknown_target_service"`) {
		t.Fatalf("unexpected response: %d %s", recorder.Code, recorder.Body.String())
	}
}
