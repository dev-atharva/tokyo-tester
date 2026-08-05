package browserjourney

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
	"github.com/docker/docker/api/types"
	containerTypes "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go"
	tcexec "github.com/testcontainers/testcontainers-go/exec"
)

const (
	defaultExecutorImage = "tokyo-tester-browser-executor:1.61.0"
	executorShmBytes     = int64(256 << 20)
	executorTmpfsBytes   = int64(40 << 20)
	maxProtocolEvent     = 16 << 10
)

type ManagedExecutor struct {
	image           string
	limits          config.ContainerResourceLimits
	sink            ArtifactSink
	chromiumSandbox bool
}

func NewManagedExecutor(image string, limits config.ContainerResourceLimits, sink ArtifactSink) *ManagedExecutor {
	return NewManagedExecutorWithSandbox(image, limits, sink, true)
}

func NewManagedExecutorWithSandbox(image string, limits config.ContainerResourceLimits, sink ArtifactSink, chromiumSandbox bool) *ManagedExecutor {
	if strings.TrimSpace(image) == "" {
		image = defaultExecutorImage
	}
	return &ManagedExecutor{image: image, limits: limits, sink: sink, chromiumSandbox: chromiumSandbox}
}

type protocolEvent struct {
	Type       string `json:"type"`
	ID         string `json:"id,omitempty"`
	Sequence   int    `json:"sequence,omitempty"`
	State      string `json:"state,omitempty"`
	Success    bool   `json:"success,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Code       string `json:"code,omitempty"`
}

type manifest struct {
	ProtocolVersion    int            `json:"protocolVersion"`
	Success            bool           `json:"success"`
	StartedAt          string         `json:"startedAt"`
	CompletedAt        string         `json:"completedAt"`
	DurationMs         int64          `json:"durationMs"`
	FinalURL           string         `json:"finalURL"`
	Steps              []manifestStep `json:"steps"`
	Failure            *stepFailure   `json:"failure"`
	Artifacts          manifestFiles  `json:"artifacts"`
	EvidenceSuppressed bool           `json:"evidenceSuppressed"`
}

type manifestStep struct {
	ID          string       `json:"id"`
	Sequence    int          `json:"sequence"`
	State       string       `json:"state"`
	StartedAt   string       `json:"startedAt"`
	CompletedAt string       `json:"completedAt"`
	DurationMs  int64        `json:"durationMs"`
	Error       *stepFailure `json:"error,omitempty"`
}

type stepFailure struct {
	ID       string `json:"id,omitempty"`
	Sequence int    `json:"sequence,omitempty"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

type manifestFiles struct {
	Screenshot string `json:"screenshot,omitempty"`
	Trace      string `json:"trace,omitempty"`
}

type attachedContainer struct {
	container testcontainers.Container
	attach    types.HijackedResponse
	events    <-chan protocolEvent
	errors    <-chan error
	once      sync.Once
}

func (e *ManagedExecutor) Execute(ctx context.Context, request Request) (result Result, runErr error) {
	started := time.Now().UTC()
	result = Result{SchemaVersion: ResultSchemaVersion, Kind: ResultKind, ScenarioID: request.ScenarioID, Outcome: "interrupted", StartedAt: started, Evidence: notCapturedEvidence("success-policy")}
	if err := validateRequest(request); err != nil {
		result.Steps = skippedSteps(request.Plan.Steps, 0, "journey-not-started")
		finishResult(&result, started)
		return result, &RunError{Kind: RunErrorInvalidRequest, Cause: err}
	}

	executor, err := e.start(ctx, request)
	if err != nil {
		result.Steps = skippedSteps(request.Plan.Steps, 0, "journey-not-started")
		finishResult(&result, started)
		return result, classifyRunError(ctx, RunErrorLaunch, false, err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		if err := executor.close(cleanupCtx); err != nil && runErr == nil {
			runErr = &RunError{Kind: RunErrorCleanup, StepBegan: len(result.Steps) > 0, Cause: err}
		}
	}()

	ready, err := awaitProtocolEvent(ctx, executor, func(event protocolEvent) bool { return event.Type == "ready" })
	if err != nil || ready.Type != "ready" {
		result.Steps = skippedSteps(request.Plan.Steps, 0, "journey-not-started")
		finishResult(&result, started)
		return result, classifyRunError(ctx, RunErrorProtocol, false, err)
	}

	payload, err := marshalExecutorRequest(request)
	if err != nil {
		result.Steps = skippedSteps(request.Plan.Steps, 0, "journey-not-started")
		finishResult(&result, started)
		return result, &RunError{Kind: RunErrorInvalidRequest, Cause: err}
	}
	defer clear(payload)
	if _, err := executor.attach.Conn.Write(append(payload, '\n')); err != nil {
		result.Steps = skippedSteps(request.Plan.Steps, 0, "journey-not-started")
		finishResult(&result, started)
		return result, classifyRunError(ctx, RunErrorTransport, false, err)
	}

	executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "journey", Status: "started", Message: "Running browser journey"})
	stepBegan := false
	activeStep := false
	stepStarted := make(map[int]time.Time)
	for {
		event, err := awaitProtocolEvent(ctx, executor, func(protocolEvent) bool { return true })
		if err != nil {
			result.Steps = interruptedSteps(request.Plan.Steps, result.Steps, activeStep, stepBegan)
			finishResult(&result, started)
			return result, classifyRunError(ctx, RunErrorProtocol, stepBegan, err)
		}
		switch event.Type {
		case "step":
			if event.Sequence < 0 || event.Sequence >= len(request.Plan.Steps) || request.Plan.Steps[event.Sequence].ID != event.ID {
				result.Steps = interruptedSteps(request.Plan.Steps, result.Steps, activeStep, stepBegan)
				finishResult(&result, started)
				return result, &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: fmt.Errorf("out-of-order step event for %q", event.ID)}
			}
			step := request.Plan.Steps[event.Sequence]
			stepBegan = true
			activityStatus := event.State
			if event.State == "running" {
				activityStatus, activeStep, stepStarted[event.Sequence] = "started", true, time.Now().UTC()
			}
			if event.State == "passed" || event.State == "failed" {
				activeStep = false
				if event.Sequence == len(result.Steps) {
					completed := time.Now().UTC()
					began := stepStarted[event.Sequence]
					partial := StepResult{StepID: step.ID, Sequence: event.Sequence, Name: step.Name, Kind: step.Kind, Operation: operation(step), Outcome: event.State, DurationMs: event.DurationMs, CompletedAt: &completed}
					if !began.IsZero() {
						partial.StartedAt = &began
					}
					result.Steps = append(result.Steps, partial)
				}
			}
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "step", Status: activityStatus, Message: fmt.Sprintf("Browser step %q %s", step.Name, activityStatus), StepID: step.ID, StepName: step.Name, Sequence: event.Sequence, StepKind: step.Kind, Operation: operation(step)})
		case "protocol_error":
			result.Steps = interruptedSteps(request.Plan.Steps, result.Steps, activeStep, stepBegan)
			finishResult(&result, started)
			return result, &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: fmt.Errorf("executor protocol error %s", event.Code)}
		case "result_ready":
			return e.readResult(ctx, executor.container, request, started, result.Steps, activeStep, stepBegan)
		}
	}
}

func (e *ManagedExecutor) start(ctx context.Context, request Request) (*attachedContainer, error) {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	defer dockerClient.Close()
	init := true
	pids := e.limits.PIDs
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{ContainerRequest: testcontainers.ContainerRequest{
		Image:          e.image,
		Env:            map[string]string{"TOKYO_CHROMIUM_SANDBOX": strconv.FormatBool(e.chromiumSandbox)},
		Labels:         provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
		Networks:       []string{request.Environment.Attachment.networkName},
		NetworkAliases: map[string][]string{request.Environment.Attachment.networkName: {"browser-executor"}},
		Tmpfs:          map[string]string{"/artifacts": fmt.Sprintf("rw,size=%d,mode=0700,uid=1001,gid=1001", executorTmpfsBytes), "/tmp": "rw,size=256m,mode=1777"},
		ConfigModifier: func(cfg *containerTypes.Config) {
			cfg.OpenStdin, cfg.StdinOnce, cfg.Tty, cfg.User = true, true, false, "pwuser"
		},
		HostConfigModifier: func(host *containerTypes.HostConfig) {
			host.Init, host.ShmSize, host.IpcMode, host.ReadonlyRootfs = &init, executorShmBytes, "private", true
			host.SecurityOpt, host.CapDrop = []string{"no-new-privileges:true"}, []string{"ALL"}
			host.Resources.Memory, host.Resources.MemorySwap = e.limits.MemoryBytes, e.limits.MemoryBytes
			host.Resources.NanoCPUs = e.limits.NanoCPUs
			if pids > 0 {
				host.Resources.PidsLimit = &pids
			}
		},
	}, Started: false})
	if err != nil {
		return nil, err
	}
	attached, err := dockerClient.ContainerAttach(ctx, container.GetContainerID(), containerTypes.AttachOptions{Stream: true, Stdin: true, Stdout: true, Stderr: true})
	if err != nil {
		_ = container.Terminate(context.Background())
		return nil, err
	}
	events := make(chan protocolEvent, 32)
	protocolErrors := make(chan error, 1)
	stdoutReader, stdoutWriter := io.Pipe()
	go func() { _, _ = stdcopy.StdCopy(stdoutWriter, io.Discard, attached.Reader); _ = stdoutWriter.Close() }()
	go decodeProtocol(stdoutReader, events, protocolErrors)
	if err := container.Start(ctx); err != nil {
		attached.Close()
		_ = container.Terminate(context.Background())
		return nil, err
	}
	if err := e.inspectIsolation(ctx, container, request.Environment.Attachment.networkName); err != nil {
		attached.Close()
		_ = container.Terminate(context.Background())
		return nil, err
	}
	return &attachedContainer{container: container, attach: attached, events: events, errors: protocolErrors}, nil
}

func (e *ManagedExecutor) inspectIsolation(ctx context.Context, container testcontainers.Container, networkName string) error {
	inspect, err := container.Inspect(ctx)
	if err != nil {
		return err
	}
	if inspect.Config.User != "pwuser" || inspect.HostConfig.IpcMode != "private" || inspect.HostConfig.ShmSize != executorShmBytes || !inspect.HostConfig.ReadonlyRootfs {
		return fmt.Errorf("browser executor isolation profile was not applied")
	}
	if inspect.HostConfig.NetworkMode == "host" || len(inspect.HostConfig.PortBindings) != 0 || len(inspect.HostConfig.Binds) != 0 {
		return fmt.Errorf("browser executor exposed host network, ports, or bind mounts")
	}
	if _, ok := inspect.NetworkSettings.Networks[networkName]; !ok {
		return fmt.Errorf("browser executor is not attached to the workflow network")
	}
	if e.limits.MemoryBytes > 0 && (inspect.HostConfig.Memory != e.limits.MemoryBytes || inspect.HostConfig.MemorySwap != e.limits.MemoryBytes) {
		return fmt.Errorf("browser executor memory policy differs from runner policy")
	}
	if e.limits.NanoCPUs > 0 && inspect.HostConfig.NanoCPUs != e.limits.NanoCPUs {
		return fmt.Errorf("browser executor CPU policy differs from runner policy")
	}
	if e.limits.PIDs > 0 && (inspect.HostConfig.PidsLimit == nil || *inspect.HostConfig.PidsLimit != e.limits.PIDs) {
		return fmt.Errorf("browser executor PID policy differs from runner policy")
	}
	if !containsString(inspect.HostConfig.SecurityOpt, "no-new-privileges:true") || !containsString(inspect.HostConfig.CapDrop, "ALL") {
		return fmt.Errorf("browser executor privilege policy was not applied")
	}
	return nil
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func decodeProtocol(reader io.Reader, events chan<- protocolEvent, protocolErrors chan<- error) {
	defer close(events)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024), maxProtocolEvent)
	for scanner.Scan() {
		var event protocolEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			protocolErrors <- err
			return
		}
		if event.Type == "" {
			protocolErrors <- errors.New("protocol event has no type")
			return
		}
		events <- event
	}
	if err := scanner.Err(); err != nil {
		protocolErrors <- err
	}
}

func awaitProtocolEvent(ctx context.Context, executor *attachedContainer, accept func(protocolEvent) bool) (protocolEvent, error) {
	for {
		select {
		case <-ctx.Done():
			return protocolEvent{}, context.Cause(ctx)
		case err, ok := <-executor.errors:
			if ok && err != nil {
				return protocolEvent{}, err
			}
		case event, ok := <-executor.events:
			if !ok {
				return protocolEvent{}, errors.New("executor event stream closed")
			}
			if accept(event) {
				return event, nil
			}
		}
	}
}

func (a *attachedContainer) close(ctx context.Context) error {
	var result error
	a.once.Do(func() {
		a.attach.Close()
		result = a.container.Terminate(ctx)
	})
	return result
}

func marshalExecutorRequest(request Request) ([]byte, error) {
	secrets := make(map[string]string)
	if request.RunSecrets != nil {
		if err := request.RunSecrets.VisitValues(func(name string, value []byte) error {
			secrets[name] = string(value)
			return nil
		}); err != nil {
			return nil, err
		}
	}
	defer clearStringMap(secrets)
	browser := request.Plan.Environment.Browser
	baseURL := "http://" + net.JoinHostPort(browser.TargetService, browser.TargetPort)
	return json.Marshal(struct {
		BaseURL string                        `json:"baseURL"`
		Steps   []workflowbundle.ScenarioStep `json:"steps"`
		Secrets map[string]string             `json:"secrets,omitempty"`
	}{BaseURL: baseURL, Steps: request.Plan.Steps, Secrets: secrets})
}

func (e *ManagedExecutor) readResult(ctx context.Context, container testcontainers.Container, request Request, fallbackStarted time.Time, partial []StepResult, activeStep, stepBegan bool) (Result, error) {
	content, err := copyArtifact(ctx, container, "/artifacts/result.json", maxManifestBytes)
	if err != nil {
		return interruptedResult(request, fallbackStarted, partial, activeStep, stepBegan), &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: err}
	}
	var manifest manifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return interruptedResult(request, fallbackStarted, partial, activeStep, stepBegan), &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: err}
	}
	if manifest.ProtocolVersion != 1 {
		return interruptedResult(request, fallbackStarted, partial, activeStep, stepBegan), &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: fmt.Errorf("unsupported executor protocol version %d", manifest.ProtocolVersion)}
	}
	result, err := resultFromManifest(request, manifest, fallbackStarted)
	if err != nil {
		return interruptedResult(request, fallbackStarted, partial, activeStep, stepBegan), &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: err}
	}
	if request.RunSecrets != nil && request.RunSecrets.Present() {
		result.Evidence = JourneyEvidence{Screenshot: EvidenceSlot{Status: "suppressed", Reason: "secret-bearing"}, Trace: EvidenceSlot{Status: "suppressed", Reason: "secret-bearing"}}
	} else if result.Outcome == "failed" {
		result.Evidence = e.captureEvidence(ctx, container, request.Artifact, manifest.Artifacts)
		appendEvidenceDiagnostics(&result, request)
	}
	status := result.Outcome
	executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "journey", Status: status, Message: "Browser journey " + status})
	if manifest.Failure != nil && manifest.Failure.Code == "executor_error" {
		return result, &RunError{Kind: RunErrorProtocol, StepBegan: stepBegan, Cause: errors.New(redact(manifest.Failure.Message, request.RunSecrets))}
	}
	return result, nil
}

func appendEvidenceDiagnostics(result *Result, request Request) {
	for _, evidence := range []struct {
		kind string
		slot EvidenceSlot
	}{{"screenshot", result.Evidence.Screenshot}, {"trace", result.Evidence.Trace}} {
		kind, slot := evidence.kind, evidence.slot
		if slot.Status != "unavailable" {
			continue
		}
		code := "evidence_capture_failed"
		if slot.Reason == "limit-exceeded" {
			code = "evidence_limit_exceeded"
		}
		if slot.Reason == "storage-failed" {
			code = "evidence_storage_failed"
		}
		result.Diagnostics = append(result.Diagnostics, executionevent.Diagnostic{DiagnosticID: uuid.NewString(), Code: code, Source: executionevent.SourceTokyoTester, Confidence: executionevent.ConfidenceCertain, Stage: executionevent.StageAggregation, Summary: fmt.Sprintf("Browser %s evidence is unavailable.", kind), ScenarioID: request.ScenarioID, ServiceNames: []string{request.Plan.Environment.Browser.TargetService}})
	}
}

func resultFromManifest(request Request, value manifest, fallbackStarted time.Time) (Result, error) {
	started := parseTime(value.StartedAt, fallbackStarted)
	completed := parseTime(value.CompletedAt, time.Now().UTC())
	result := Result{SchemaVersion: ResultSchemaVersion, Kind: ResultKind, ScenarioID: request.ScenarioID, StartedAt: started, CompletedAt: completed, DurationMs: value.DurationMs, Evidence: notCapturedEvidence("success-policy")}
	if location := sanitizeLocation(value.FinalURL, request.RunSecrets); location != nil {
		result.FinalLocation = location
	}
	if len(value.Steps) > len(request.Plan.Steps) {
		return Result{}, errors.New("executor returned too many step results")
	}
	for index, actual := range value.Steps {
		if actual.Sequence != index || actual.ID != request.Plan.Steps[index].ID {
			return Result{}, fmt.Errorf("executor returned an out-of-order result for step %q", actual.ID)
		}
		definition := request.Plan.Steps[index]
		step := StepResult{StepID: definition.ID, Sequence: index, Name: definition.Name, Kind: definition.Kind, Operation: operation(definition), Outcome: actual.State, DurationMs: actual.DurationMs}
		step.StartedAt, step.CompletedAt = timePointer(actual.StartedAt), timePointer(actual.CompletedAt)
		if actual.State == "failed" {
			diagnosticID := uuid.NewString()
			step.DiagnosticID = diagnosticID
			message := "The browser step did not observe the expected behavior."
			result.Diagnostics = append(result.Diagnostics, executionevent.Diagnostic{DiagnosticID: diagnosticID, Code: "browser_step_failed", Source: executionevent.SourceServiceEnvironment, Confidence: executionevent.ConfidenceLikely, Stage: executionevent.StageExecution, Summary: message, ScenarioID: request.ScenarioID, StepID: definition.ID, StepName: definition.Name, ServiceNames: []string{request.Plan.Environment.Browser.TargetService}})
		}
		result.Steps = append(result.Steps, step)
	}
	if value.Success {
		if len(result.Steps) != len(request.Plan.Steps) {
			return Result{}, errors.New("successful executor result omitted steps")
		}
		result.Outcome = "passed"
	} else if value.Failure != nil && value.Failure.Code == "step_failed" {
		result.Outcome = "failed"
		result.Steps = append(result.Steps, skippedSteps(request.Plan.Steps, len(result.Steps), "prior-step-failed")...)
	} else {
		result.Outcome = "interrupted"
		result.Steps = append(result.Steps, skippedSteps(request.Plan.Steps, len(result.Steps), "journey-interrupted")...)
	}
	if result.DurationMs <= 0 {
		result.DurationMs = completed.Sub(started).Milliseconds()
	}
	return result, nil
}

func (e *ManagedExecutor) captureEvidence(ctx context.Context, container testcontainers.Container, scope ArtifactContext, files manifestFiles) JourneyEvidence {
	evidence := JourneyEvidence{Screenshot: EvidenceSlot{Status: "unavailable", Reason: "capture-failed"}, Trace: EvidenceSlot{Status: "unavailable", Reason: "capture-failed"}}
	if e.sink == nil {
		evidence.Screenshot.Reason, evidence.Trace.Reason = "storage-failed", "storage-failed"
		return evidence
	}
	total := int64(0)
	for _, candidate := range []struct {
		name, kind, contentType string
		limit                   int64
		slot                    *EvidenceSlot
	}{
		{files.Screenshot, "screenshot", "image/png", maxScreenshotBytes, &evidence.Screenshot},
		{files.Trace, "trace", "application/zip", maxTraceBytes, &evidence.Trace},
	} {
		if candidate.name == "" {
			continue
		}
		if (candidate.kind == "screenshot" && candidate.name != "failure.png") || (candidate.kind == "trace" && candidate.name != "trace.zip") {
			candidate.slot.Reason = "capture-failed"
			continue
		}
		content, err := copyArtifact(ctx, container, "/artifacts/"+candidate.name, candidate.limit)
		if err != nil {
			candidate.slot.Reason = "limit-exceeded"
			continue
		}
		if total+int64(len(content)) > maxTotalBytes || !validMagic(candidate.kind, content) {
			candidate.slot.Reason = "limit-exceeded"
			continue
		}
		reference, err := e.sink.Store(ctx, scope, candidate.kind, candidate.contentType, bytes.NewReader(content), candidate.limit)
		if err != nil {
			candidate.slot.Reason = "storage-failed"
			continue
		}
		total += int64(len(content))
		candidate.slot.Status, candidate.slot.Reason, candidate.slot.Artifact = "available", "", &reference
	}
	return evidence
}

func copyArtifact(ctx context.Context, container testcontainers.Container, path string, limit int64) ([]byte, error) {
	exitCode, reader, err := container.Exec(ctx, []string{"cat", "--", path}, tcexec.Multiplexed())
	if err != nil {
		return nil, err
	}
	if exitCode != 0 {
		return nil, fmt.Errorf("artifact reader exited with code %d", exitCode)
	}
	content, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > limit {
		return nil, fmt.Errorf("artifact exceeded %d bytes", limit)
	}
	return content, nil
}

func validMagic(kind string, content []byte) bool {
	if kind == "screenshot" {
		return len(content) >= 8 && bytes.Equal(content[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	}
	return len(content) >= 4 && bytes.Equal(content[:4], []byte{'P', 'K', 0x03, 0x04})
}

func notCapturedEvidence(reason string) JourneyEvidence {
	return JourneyEvidence{Screenshot: EvidenceSlot{Status: "not-captured", Reason: reason}, Trace: EvidenceSlot{Status: "not-captured", Reason: reason}}
}

func sanitizeLocation(raw string, secrets *runsecret.RunSecrets) *FinalLocation {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Path == "" {
		return nil
	}
	path := redact(parsed.EscapedPath(), secrets)
	keys := make([]string, 0, len(parsed.Query()))
	for key := range parsed.Query() {
		keys = append(keys, redact(key, secrets))
	}
	return &FinalLocation{Path: path, QueryKeys: sortedUnique(keys)}
}

func redact(value string, secrets *runsecret.RunSecrets) string {
	result := value
	if secrets != nil {
		result = secrets.RedactString(result)
	}
	if len(result) > 2048 {
		result = result[:2048]
	}
	return result
}

func clearStringMap(values map[string]string) {
	for name := range values {
		values[name] = ""
		delete(values, name)
	}
}

func interruptedResult(request Request, started time.Time, partial []StepResult, activeStep, stepBegan bool) Result {
	result := Result{SchemaVersion: ResultSchemaVersion, Kind: ResultKind, ScenarioID: request.ScenarioID, Outcome: "interrupted", StartedAt: started, Evidence: notCapturedEvidence("capture-failed")}
	result.Steps = interruptedSteps(request.Plan.Steps, partial, activeStep, stepBegan)
	finishResult(&result, started)
	return result
}

func interruptedSteps(steps []workflowbundle.ScenarioStep, completed []StepResult, activeStep, stepBegan bool) []StepResult {
	result := append([]StepResult(nil), completed...)
	from := len(result)
	if activeStep && from < len(steps) {
		step := steps[from]
		result = append(result, StepResult{StepID: step.ID, Sequence: from, Name: step.Name, Kind: step.Kind, Operation: operation(step), Outcome: "interrupted"})
		from++
	}
	reason := "journey-not-started"
	if stepBegan {
		reason = "journey-interrupted"
	}
	return append(result, skippedSteps(steps, from, reason)...)
}

func finishResult(result *Result, started time.Time) {
	result.CompletedAt = time.Now().UTC()
	result.DurationMs = result.CompletedAt.Sub(started).Milliseconds()
}
func parseTime(value string, fallback time.Time) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return fallback
	}
	return parsed
}
func timePointer(value string) *time.Time {
	if value == "" {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return nil
	}
	return &parsed
}
func classifyRunError(ctx context.Context, kind RunErrorKind, began bool, err error) *RunError {
	if ctx.Err() != nil {
		kind, err = RunErrorCancellation, context.Cause(ctx)
	}
	return &RunError{Kind: kind, StepBegan: began, Cause: err}
}
