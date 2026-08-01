package api

import (
	"errors"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/dto"
	apperrors "github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

func TestClassifyExecutionError(t *testing.T) {
	tests := []struct {
		name       string
		code       apperrors.ErrorCode
		source     executionevent.DiagnosticSource
		confidence executionevent.DiagnosticConfidence
	}{
		{"validation", apperrors.ErrValidation, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"invalid request", apperrors.ErrInvalidRequest, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"missing field", apperrors.ErrMissingField, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"dependency cycle", apperrors.ErrDependencyCycle, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"dependency missing", apperrors.ErrDepenedncyMissing, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"configuration", apperrors.ErrConfiguration, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"environment missing", apperrors.ErrEnvVarMissing, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"registry credentials", apperrors.ErrRegistryAuth, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"test missing", apperrors.ErrTestNotFound, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"service missing", apperrors.ErrServiceNotFound, executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain},
		{"network creation", apperrors.ErrNetworkCreate, executionevent.SourceHostInfrastructure, executionevent.ConfidenceLikely},
		{"network cleanup", apperrors.ErrNetworkCleanup, executionevent.SourceHostInfrastructure, executionevent.ConfidenceLikely},
		{"container stop", apperrors.ErrContainerStop, executionevent.SourceHostInfrastructure, executionevent.ConfidenceLikely},
		{"service cleanup", apperrors.ErrServiceCleanup, executionevent.SourceHostInfrastructure, executionevent.ConfidenceLikely},
		{"image pull ambiguity", apperrors.ErrImagePull, executionevent.SourceUndetermined, executionevent.ConfidenceUnknown},
		{"service provision", apperrors.ErrServiceProvision, executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely},
		{"container startup", apperrors.ErrContainerStart, executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely},
		{"database connection", apperrors.ErrDatabaseConnection, executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely},
		{"database query", apperrors.ErrDatabaseQuery, executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely},
		{"test execution", apperrors.ErrTestExecution, executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely},
		{"test timeout", apperrors.ErrTestTimeout, executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely},
		{"migration", apperrors.ErrDatabaseMigration, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"session missing", apperrors.ErrSessionNotFound, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"session expired", apperrors.ErrSessionExpired, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"sync batch", apperrors.ErrSyncBatch, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"sync pull", apperrors.ErrSyncPull, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"sync clear", apperrors.ErrSyncClear, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"internal", apperrors.ErrInternal, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"not implemented", apperrors.ErrNotImplemented, executionevent.SourceTokyoTester, executionevent.ConfidenceCertain},
		{"generic timeout", apperrors.ErrTimeout, executionevent.SourceUndetermined, executionevent.ConfidenceUnknown},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			source, confidence, code := classifyExecutionError(apperrors.New(test.code, "typed failure"))
			if source != test.source || confidence != test.confidence || code != test.code.String() {
				t.Fatalf("got (%s, %s, %s), want (%s, %s, %s)", source, confidence, code, test.source, test.confidence, test.code)
			}
		})
	}
}

func TestClassifyExecutionErrorDoesNotInferFromProse(t *testing.T) {
	source, confidence, code := classifyExecutionError(errors.New("registry authentication failed for payment-api"))
	if source != executionevent.SourceUndetermined || confidence != executionevent.ConfidenceUnknown || code != apperrors.ErrInternal.String() {
		t.Fatalf("untyped prose was classified as (%s, %s, %s)", source, confidence, code)
	}
}

func TestTypedTestExecutionBoundaryPreservesEvidenceAndClassification(t *testing.T) {
	testErr := typedTestExecutionError(errors.New("expected status 503, got 200"), "health", "http", map[string]string{"api": "ready"})
	source, confidence, code := classifyExecutionError(testErr)
	if source != executionevent.SourceServiceEnvironment || confidence != executionevent.ConfidenceLikely || code != apperrors.ErrTestExecution.String() {
		t.Fatalf("typed test failure was classified as (%s, %s, %s)", source, confidence, code)
	}
	if testErr.TestName != "health" || testErr.TestType != "http" || testErr.ContainerLogs["api"] != "ready" {
		t.Fatalf("typed test evidence was not preserved: %#v", testErr)
	}
}

func TestBuildExecutionDiagnosticBoundsEvidenceAndPreservesService(t *testing.T) {
	logs := strings.Repeat("x", diagnosticEvidenceLimit+200)
	err := &orchestrator.EnhancedError{
		BaseError:     apperrors.New(apperrors.ErrContainerStart, "container exited"),
		ServiceName:   "payment-api",
		ContainerLogs: logs,
	}
	diagnostic := buildExecutionDiagnostic(executionevent.StageProvision, err, "Service failed", "checkout", "", "", nil)
	if len(diagnostic.Evidence) != 2 {
		t.Fatalf("got %d evidence entries, want 2", len(diagnostic.Evidence))
	}
	if diagnostic.Evidence[1].ServiceName != "payment-api" || len(diagnostic.Evidence[1].Message) > diagnosticEvidenceLimit+3 {
		t.Fatalf("container evidence was not bounded or attributed: %#v", diagnostic.Evidence[1])
	}
}

func TestWorkflowDiagnosticsPreservesPrimaryAndCleanupFailures(t *testing.T) {
	primary := executionevent.Diagnostic{Code: apperrors.ErrContainerStart.String(), Stage: executionevent.StageProvision}
	cleanup := executionevent.Diagnostic{Code: apperrors.ErrServiceCleanup.String(), Stage: executionevent.StageCleanup}
	results := []dto.WorkflowBundleScenarioResponse{{
		Diagnostics: []executionevent.Diagnostic{cleanup},
		Results:     []dto.TestResult{{Diagnostic: &primary}},
	}}
	diagnostics := workflowDiagnostics(results)
	if len(diagnostics) != 2 || diagnostics[0].Code != cleanup.Code || diagnostics[1].Code != primary.Code {
		t.Fatalf("multiple diagnostics were not preserved: %#v", diagnostics)
	}
}

func TestAttachScenarioToDiagnostics(t *testing.T) {
	testDiagnostic := executionevent.Diagnostic{Code: apperrors.ErrTestExecution.String()}
	result := dto.WorkflowBundleScenarioResponse{
		Diagnostics: []executionevent.Diagnostic{{Code: apperrors.ErrServiceCleanup.String()}},
		Results:     []dto.TestResult{{Diagnostic: &testDiagnostic}},
	}
	attachScenarioToDiagnostics(&result, "checkout")
	if result.Diagnostics[0].ScenarioID != "checkout" || result.Results[0].Diagnostic.ScenarioID != "checkout" {
		t.Fatalf("scenario identity was not attached: %#v", result)
	}
}
