package browserjourney

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

const (
	ResultSchemaVersion = 1
	ResultKind          = "browser-journey"
)

type Executor interface {
	Execute(context.Context, Request) (Result, error)
}

type Request struct {
	ScenarioID  string
	Plan        workflowbundle.JourneyPlan
	Environment ProvisionedEnvironment
	RunSecrets  *runsecret.RunSecrets
	Artifact    ArtifactContext
}

type ProvisionedEnvironment struct {
	Attachment NetworkAttachment
}

// NetworkAttachment is issued by the orchestrator after service provisioning.
// Its fields intentionally remain private so callers cannot manufacture Docker
// topology outside this package and the orchestrator bridge.
type NetworkAttachment struct{ networkName string }

func NewNetworkAttachment(networkName string) NetworkAttachment {
	return NetworkAttachment{networkName: strings.TrimSpace(networkName)}
}

type ArtifactContext struct {
	ProjectID     string
	WorkflowRunID string
	ScenarioRunID string
}

type Result struct {
	SchemaVersion int                         `json:"schemaVersion"`
	Kind          string                      `json:"kind"`
	ScenarioID    string                      `json:"scenarioId"`
	Outcome       string                      `json:"outcome"`
	StartedAt     time.Time                   `json:"startedAt"`
	CompletedAt   time.Time                   `json:"completedAt"`
	DurationMs    int64                       `json:"durationMs"`
	FinalLocation *FinalLocation              `json:"finalLocation,omitempty"`
	Steps         []StepResult                `json:"steps"`
	Diagnostics   []executionevent.Diagnostic `json:"diagnostics,omitempty"`
	Evidence      JourneyEvidence             `json:"evidence"`
}

type FinalLocation struct {
	Path      string   `json:"path"`
	QueryKeys []string `json:"queryKeys,omitempty"`
}

type StepResult struct {
	StepID       string     `json:"stepId"`
	Sequence     int        `json:"sequence"`
	Name         string     `json:"name"`
	Kind         string     `json:"kind"`
	Operation    string     `json:"operation"`
	Outcome      string     `json:"outcome"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
	DurationMs   int64      `json:"durationMs,omitempty"`
	DiagnosticID string     `json:"diagnosticId,omitempty"`
	SkipReason   string     `json:"skipReason,omitempty"`
}

type JourneyEvidence struct {
	Screenshot EvidenceSlot `json:"screenshot"`
	Trace      EvidenceSlot `json:"trace"`
}

type EvidenceSlot struct {
	Status   string             `json:"status"`
	Reason   string             `json:"reason,omitempty"`
	Artifact *ArtifactReference `json:"artifact,omitempty"`
}

type ArtifactReference struct {
	ArtifactID  string    `json:"artifactId"`
	Kind        string    `json:"kind"`
	ContentType string    `json:"contentType"`
	SizeBytes   int64     `json:"sizeBytes"`
	SHA256      string    `json:"sha256"`
	CreatedAt   time.Time `json:"createdAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

type RunErrorKind string

const (
	RunErrorInvalidRequest RunErrorKind = "invalid_request"
	RunErrorLaunch         RunErrorKind = "runtime_launch"
	RunErrorTransport      RunErrorKind = "transport"
	RunErrorProtocol       RunErrorKind = "protocol"
	RunErrorEvidence       RunErrorKind = "evidence"
	RunErrorCancellation   RunErrorKind = "cancellation"
	RunErrorCleanup        RunErrorKind = "cleanup"
)

type RunError struct {
	Kind      RunErrorKind
	StepBegan bool
	Cause     error
}

func (e *RunError) Error() string {
	if e == nil || e.Cause == nil {
		return string(e.Kind)
	}
	return fmt.Sprintf("browser journey %s: %v", e.Kind, e.Cause)
}

func (e *RunError) Unwrap() error { return e.Cause }

func operation(step workflowbundle.ScenarioStep) string {
	switch step.Kind {
	case "action":
		if step.Action != nil {
			return step.Action.Operation
		}
	case "assertion":
		if step.Assertion != nil {
			return step.Assertion.Operation
		}
	case "control":
		if step.Control != nil {
			return step.Control.Operation
		}
	}
	return ""
}

func skippedSteps(steps []workflowbundle.ScenarioStep, from int, reason string) []StepResult {
	result := make([]StepResult, 0, len(steps)-from)
	for index := from; index < len(steps); index++ {
		step := steps[index]
		result = append(result, StepResult{StepID: step.ID, Sequence: index, Name: step.Name, Kind: step.Kind, Operation: operation(step), Outcome: "skipped", SkipReason: reason})
	}
	return result
}

func validateRequest(request Request) error {
	if request.Plan.Environment.Driver != "browser" {
		return fmt.Errorf("unsupported journey driver %q", request.Plan.Environment.Driver)
	}
	if request.Environment.Attachment.networkName == "" {
		return errors.New("workflow network attachment is missing")
	}
	browser := request.Plan.Environment.Browser
	if strings.TrimSpace(browser.TargetService) == "" || strings.TrimSpace(browser.TargetPort) == "" {
		return errors.New("browser target service and port are required")
	}
	for _, step := range request.Plan.Steps {
		if step.Action == nil || step.Action.Value == nil || step.Action.Value.Source != "run-secret" {
			continue
		}
		if request.RunSecrets == nil || !request.RunSecrets.Contains(step.Action.Value.SecretRef) {
			return fmt.Errorf("run secret %q was not resolved", step.Action.Value.SecretRef)
		}
	}
	return nil
}

func sortedUnique(values []string) []string {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	result := make([]string, 0, len(set))
	for value := range set {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
