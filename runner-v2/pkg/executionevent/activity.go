package executionevent

import "context"

type Stage string

const (
	StageValidation  Stage = "validation"
	StageTranslation Stage = "translation"
	StageProvision   Stage = "provision"
	StageExecution   Stage = "execution"
	StageCleanup     Stage = "cleanup"
	StageAggregation Stage = "aggregation"
)

type DiagnosticSource string

const (
	SourceTokyoTester        DiagnosticSource = "tokyo_tester"
	SourceWorkflowConfig     DiagnosticSource = "workflow_configuration"
	SourceServiceEnvironment DiagnosticSource = "service_environment"
	SourceHostInfrastructure DiagnosticSource = "host_infrastructure"
	SourceUndetermined       DiagnosticSource = "undetermined"
)

type DiagnosticConfidence string

const (
	ConfidenceCertain DiagnosticConfidence = "certain"
	ConfidenceLikely  DiagnosticConfidence = "likely"
	ConfidenceUnknown DiagnosticConfidence = "unknown"
)

type EvidenceKind string

const (
	EvidenceRunnerError    EvidenceKind = "runner_error"
	EvidenceContainerLog   EvidenceKind = "container_log"
	EvidenceTestResult     EvidenceKind = "test_result"
	EvidenceLifecycleEvent EvidenceKind = "lifecycle_event"
)

type Evidence struct {
	Kind        EvidenceKind `json:"kind"`
	ServiceName string       `json:"serviceName,omitempty"`
	Message     string       `json:"message"`
}

type Diagnostic struct {
	DiagnosticID string               `json:"diagnosticId,omitempty"`
	Code         string               `json:"code"`
	Source       DiagnosticSource     `json:"source"`
	Confidence   DiagnosticConfidence `json:"confidence"`
	Stage        Stage                `json:"stage"`
	Summary      string               `json:"summary"`
	ScenarioID   string               `json:"scenarioId,omitempty"`
	TestID       string               `json:"testId,omitempty"`
	TestName     string               `json:"testName,omitempty"`
	StepID       string               `json:"stepId,omitempty"`
	StepName     string               `json:"stepName,omitempty"`
	ServiceNames []string             `json:"serviceNames,omitempty"`
	Evidence     []Evidence           `json:"evidence,omitempty"`
}

type Activity struct {
	Stage        Stage       `json:"stage"`
	Kind         string      `json:"kind"`
	Status       string      `json:"activityStatus"`
	Message      string      `json:"message"`
	ServiceID    string      `json:"serviceId,omitempty"`
	ServiceName  string      `json:"serviceName,omitempty"`
	ServiceNames []string    `json:"serviceNames,omitempty"`
	TestID       string      `json:"testId,omitempty"`
	TestName     string      `json:"testName,omitempty"`
	StepID       string      `json:"stepId,omitempty"`
	StepName     string      `json:"stepName,omitempty"`
	Sequence     int         `json:"sequence,omitempty"`
	StepKind     string      `json:"stepKind,omitempty"`
	Operation    string      `json:"operation,omitempty"`
	Attempt      int         `json:"attempt,omitempty"`
	MaxAttempts  int         `json:"maxAttempts,omitempty"`
	RetryReason  string      `json:"retryReason,omitempty"`
	Diagnostic   *Diagnostic `json:"diagnostic,omitempty"`
}

type Reporter func(Activity)

type reporterContextKey struct{}

func WithReporter(ctx context.Context, reporter Reporter) context.Context {
	if reporter == nil {
		return ctx
	}
	return context.WithValue(ctx, reporterContextKey{}, reporter)
}

func Report(ctx context.Context, activity Activity) {
	reporter, _ := ctx.Value(reporterContextKey{}).(Reporter)
	if reporter != nil {
		reporter(activity)
	}
}
