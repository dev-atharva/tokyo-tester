package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/session"
	"github.com/dev-atharva/cots/pkg/workflowrun"
)

func TestScenarioSnapshotsExposeCleanupFailure(t *testing.T) {
	snapshots := scenarioSnapshots(
		[]workflowrun.Scenario{{ID: "scenario-1", Name: "Checkout"}},
		[]dto.WorkflowBundleScenarioResponse{{
			ScenarioName:  "Checkout",
			Success:       false,
			CleanupFailed: true,
			Error:         "failed to remove Docker network",
		}},
	)

	if got := snapshots[0]["status"]; got != "cleanup_failed" {
		t.Fatalf("status = %v, want cleanup_failed", got)
	}
	if got := mapWorkflowStatus("cleanup_failed"); got != "cleanup_failed" {
		t.Fatalf("workflow status = %q, want cleanup_failed", got)
	}
}

func TestCleanupEndpointReportsActiveSessionCleanupFailure(t *testing.T) {
	handler := NewHandler(nil, config.AppConfig{
		CleanupTimeoutSec:        1,
		OperationQueueTimeoutSec: 1,
		MaxConcurrentCleanup:     1,
	})
	handler.sessionManager = session.NewManagerWithCleanup(func(context.Context, *session.Session) error {
		return context.DeadlineExceeded
	})
	handler.sessionManager.Register("session-1", orchestrator.NewOrchestrator(provider.NewRegistry()), nil)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodDelete, "/cleanup/session-1", nil)
	NewRouter(handler, nil, false).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500; body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "cleanup failed") {
		t.Fatalf("missing cleanup failure detail: %s", recorder.Body.String())
	}
	if _, err := handler.sessionManager.Get("session-1"); err != nil {
		t.Fatalf("failed cleanup removed retryable session: %v", err)
	}
}
