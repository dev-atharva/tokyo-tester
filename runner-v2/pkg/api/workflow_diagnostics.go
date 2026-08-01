package api

import (
	"errors"
	"strings"

	apperrors "github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	testpkg "github.com/dev-atharva/cots/pkg/test"
)

const diagnosticEvidenceLimit = 1200

func buildExecutionDiagnostic(stage executionevent.Stage, err error, summary, scenarioID, testID, testName string, serviceNames []string) executionevent.Diagnostic {
	source, confidence, code := classifyExecutionError(err)
	diagnostic := executionevent.Diagnostic{
		Code: code, Source: source, Confidence: confidence, Stage: stage,
		Summary: summary, ScenarioID: scenarioID, TestID: testID, TestName: testName,
		ServiceNames: append([]string(nil), serviceNames...),
	}

	var appErr *apperrors.AppError
	if errors.As(err, &appErr) {
		if service := strings.TrimSpace(appErr.Details["service"]); service != "" {
			diagnostic.ServiceNames = appendUniqueString(diagnostic.ServiceNames, service)
		}
	}

	diagnostic.Evidence = append(diagnostic.Evidence, executionevent.Evidence{
		Kind: executionevent.EvidenceRunnerError, Message: boundedDiagnosticEvidence(baseDiagnosticMessage(err)),
	})
	if testID != "" || testName != "" {
		diagnostic.Evidence = append(diagnostic.Evidence, executionevent.Evidence{
			Kind: executionevent.EvidenceTestResult, Message: boundedDiagnosticEvidence(baseDiagnosticMessage(err)),
		})
	}

	var enhanced *orchestrator.EnhancedError
	if errors.As(err, &enhanced) {
		if enhanced.ServiceName != "" && enhanced.ContainerLogs != "" {
			diagnostic.Evidence = append(diagnostic.Evidence, executionevent.Evidence{
				Kind: executionevent.EvidenceContainerLog, ServiceName: enhanced.ServiceName,
				Message: boundedDiagnosticEvidence(enhanced.ContainerLogs),
			})
		}
		for serviceName, logs := range enhanced.AllServiceLogs {
			diagnostic.Evidence = append(diagnostic.Evidence, executionevent.Evidence{
				Kind: executionevent.EvidenceContainerLog, ServiceName: serviceName, Message: boundedDiagnosticEvidence(logs),
			})
		}
	}

	var testErr *testpkg.TestError
	if errors.As(err, &testErr) {
		for serviceName, logs := range testErr.ContainerLogs {
			diagnostic.Evidence = append(diagnostic.Evidence, executionevent.Evidence{
				Kind: executionevent.EvidenceContainerLog, ServiceName: serviceName, Message: boundedDiagnosticEvidence(logs),
			})
		}
	}
	return diagnostic
}

func classifyExecutionError(err error) (executionevent.DiagnosticSource, executionevent.DiagnosticConfidence, string) {
	var appErr *apperrors.AppError
	if errors.As(err, &appErr) {
		switch appErr.Code {
		case apperrors.ErrValidation, apperrors.ErrInvalidRequest, apperrors.ErrMissingField,
			apperrors.ErrDependencyCycle, apperrors.ErrDepenedncyMissing,
			apperrors.ErrConfiguration, apperrors.ErrEnvVarMissing, apperrors.ErrRegistryAuth,
			apperrors.ErrTestNotFound, apperrors.ErrServiceNotFound:
			return executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain, appErr.Code.String()
		case apperrors.ErrNetworkCreate, apperrors.ErrNetworkCleanup, apperrors.ErrContainerStop, apperrors.ErrServiceCleanup:
			return executionevent.SourceHostInfrastructure, executionevent.ConfidenceLikely, appErr.Code.String()
		case apperrors.ErrImagePull:
			return executionevent.SourceUndetermined, executionevent.ConfidenceUnknown, appErr.Code.String()
		case apperrors.ErrServiceProvision, apperrors.ErrContainerStart:
			return executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely, appErr.Code.String()
		case apperrors.ErrDatabaseConnection, apperrors.ErrDatabaseQuery,
			apperrors.ErrTestExecution, apperrors.ErrTestTimeout:
			return executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely, appErr.Code.String()
		case apperrors.ErrDatabaseMigration, apperrors.ErrSessionNotFound, apperrors.ErrSessionExpired,
			apperrors.ErrSyncBatch, apperrors.ErrSyncPull, apperrors.ErrSyncClear,
			apperrors.ErrInternal, apperrors.ErrNotImplemented:
			return executionevent.SourceTokyoTester, executionevent.ConfidenceCertain, appErr.Code.String()
		case apperrors.ErrTimeout:
			return executionevent.SourceUndetermined, executionevent.ConfidenceUnknown, appErr.Code.String()
		}
	}

	var testErr *testpkg.TestError
	if errors.As(err, &testErr) {
		return executionevent.SourceServiceEnvironment, executionevent.ConfidenceLikely, apperrors.ErrTestExecution.String()
	}
	return executionevent.SourceUndetermined, executionevent.ConfidenceUnknown, apperrors.ErrInternal.String()
}

func typedTestExecutionError(err error, testName, testType string, containerLogs map[string]string) *testpkg.TestError {
	var existing *testpkg.TestError
	if errors.As(err, &existing) {
		if len(existing.ContainerLogs) == 0 {
			existing.ContainerLogs = containerLogs
		}
		return existing
	}
	return &testpkg.TestError{
		TestName:      testName,
		TestType:      testType,
		BaseError:     err,
		ContainerLogs: containerLogs,
	}
}

func baseDiagnosticMessage(err error) string {
	if err == nil {
		return "No additional error detail was recorded."
	}
	var enhanced *orchestrator.EnhancedError
	if errors.As(err, &enhanced) && enhanced.BaseError != nil {
		return enhanced.BaseError.Error()
	}
	var testErr *testpkg.TestError
	if errors.As(err, &testErr) && testErr.BaseError != nil {
		return testErr.BaseError.Error()
	}
	return extractBaseError(err)
}

func boundedDiagnosticEvidence(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= diagnosticEvidenceLimit {
		return value
	}
	return strings.ToValidUTF8(value[:diagnosticEvidenceLimit], "�") + "…"
}

func appendUniqueString(values []string, candidate string) []string {
	for _, value := range values {
		if value == candidate {
			return values
		}
	}
	return append(values, candidate)
}
