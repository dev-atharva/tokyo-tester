package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/dev-atharva/cots/pkg/browserjourney"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/middleware"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/session"
	"github.com/dev-atharva/cots/pkg/telemetry"
	"github.com/dev-atharva/cots/pkg/test"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

func (h *Handler) RunWorkflowBundle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.GetRequestID(ctx)

	ctx, span := telemetry.StartSpan(ctx, "api.run_workflow_bundle")
	defer span.End()

	logger.InfoContext(ctx, "running workflow bundle", "request_id", requestID)

	bundle, err := workflowbundle.Decode(r.Body)
	if err != nil {
		logger.WarnContext(ctx, "invalid workflow bundle", "error", err)
		errors.ResponseBadRequest(w, err.Error())
		return
	}

	response := dto.WorkflowBundleRunResponse{
		WorkflowName: bundle.Workflow.Name,
		Success:      true,
		Scenarios:    make([]dto.WorkflowBundleScenarioResponse, 0, len(bundle.Scenarios)),
	}

	for _, scenario := range bundle.Scenarios {
		result := h.runWorkflowBundleScenario(ctx, bundle, scenario)
		response.Scenarios = append(response.Scenarios, result)
		response.Summary.TotalScenarios++
		response.Summary.TotalTests += result.Summary.Total
		response.Summary.PassedTests += result.Summary.Passed
		response.Summary.FailedTests += result.Summary.Failed
		response.Summary.RetriedTests += result.Summary.Retried
		accumulateJourneySummary(&response.Summary, result.Journey)
		if result.Success {
			response.Summary.PassedScenarios++
		} else {
			response.Summary.FailedScenarios++
			response.Success = false
		}
	}

	respondJson(w, http.StatusOK, response)
}

func accumulateJourneySummary(summary *dto.WorkflowBundleRunSummary, journey *browserjourney.Result) {
	if summary == nil || journey == nil {
		return
	}
	summary.TotalJourneys++
	switch journey.Outcome {
	case "passed":
		summary.PassedJourneys++
	case "failed":
		summary.FailedJourneys++
	case "interrupted":
		summary.InterruptedJourneys++
	}
	for _, step := range journey.Steps {
		summary.TotalSteps++
		switch step.Outcome {
		case "passed":
			summary.PassedSteps++
		case "failed":
			summary.FailedSteps++
		case "skipped":
			summary.SkippedSteps++
		case "interrupted":
			summary.InterruptedSteps++
		}
	}
}

func interruptedJourneyResponse(name, scenarioID string, plan *workflowbundle.JourneyPlan, startedAt *time.Time) dto.WorkflowBundleScenarioResponse {
	started := time.Now().UTC()
	if startedAt != nil {
		started = startedAt.UTC()
	}
	completed := time.Now().UTC()
	journey := browserjourney.Result{
		SchemaVersion: browserjourney.ResultSchemaVersion, Kind: browserjourney.ResultKind,
		ScenarioID: scenarioID, Outcome: "interrupted", StartedAt: started, CompletedAt: completed,
		DurationMs: completed.Sub(started).Milliseconds(),
		Evidence: browserjourney.JourneyEvidence{
			Screenshot: browserjourney.EvidenceSlot{Status: "unavailable", Reason: "capture-failed"},
			Trace:      browserjourney.EvidenceSlot{Status: "unavailable", Reason: "capture-failed"},
		},
	}
	if plan != nil {
		for index, step := range plan.Steps {
			op := ""
			if step.Action != nil {
				op = step.Action.Operation
			}
			if step.Assertion != nil {
				op = step.Assertion.Operation
			}
			if step.Control != nil {
				op = step.Control.Operation
			}
			journey.Steps = append(journey.Steps, browserjourney.StepResult{StepID: step.ID, Sequence: index, Name: step.Name, Kind: step.Kind, Operation: op, Outcome: "skipped", SkipReason: "journey-not-started"})
		}
	}
	return dto.WorkflowBundleScenarioResponse{ScenarioName: name, Success: false, Error: "interrupted browser journey was not replayed automatically", Journey: &journey}
}

func (h *Handler) runWorkflowBundleScenario(
	ctx context.Context,
	bundle *workflowbundle.Bundle,
	scenario workflowbundle.BundleScenario,
) dto.WorkflowBundleScenarioResponse {
	return h.runWorkflowBundleScenarioForRun(ctx, bundle, scenario, nil, nil)
}

func (h *Handler) runWorkflowBundleScenarioForRun(
	ctx context.Context,
	bundle *workflowbundle.Bundle,
	scenario workflowbundle.BundleScenario,
	execution *dto.ExecutionContextDTO,
	runSecrets *runsecret.RunSecrets,
) (response dto.WorkflowBundleScenarioResponse) {
	response = dto.WorkflowBundleScenarioResponse{
		ScenarioName: scenario.Name,
		Success:      false,
	}

	translated, err := bundle.TranslateScenario(scenario)
	if err != nil {
		response.Error = err.Error()
		diagnostic := buildExecutionDiagnostic(executionevent.StageTranslation, err, "The scenario could not be translated into an executable plan.", executionScenarioID(execution), "", "", nil)
		diagnostic.Source, diagnostic.Confidence, diagnostic.Code = executionevent.SourceWorkflowConfig, executionevent.ConfidenceCertain, errors.ErrValidation.String()
		response.Diagnostics = append(response.Diagnostics, diagnostic)
		return response
	}
	translated.Services = h.withContainerResources(translated.Services)
	response.Summary.Total = len(translated.Tests)
	previous, _ := h.resolvePersistedSession(ctx, "", execution)
	if previous != nil && previous.Phase != "" && previous.Phase != sessionPhaseCreated {
		if err := h.cleanupPersistedSessionResources(ctx, previous.ID); err != nil {
			response.CleanupFailed = true
			response.Error = fmt.Sprintf("failed to clean interrupted scenario resources: %s", err)
			if ctx.Err() == nil {
				h.persistSessionFailure(ctx, previous.ID, err, sessionPhaseCleanupFailed)
			}
			return response
		}
		if translated.ExecutionModel == workflowbundle.ExecutionModelJourney {
			if previous.Result != "" && json.Unmarshal([]byte(previous.Result), &response) == nil && response.Journey != nil {
				h.releaseSessionLease(ctx, previous.ID)
				return response
			}
			response = interruptedJourneyResponse(scenario.Name, executionScenarioID(execution), translated.Journey, previous.StartedAt)
			persistCtx := context.WithoutCancel(ctx)
			_ = h.persistCheckpoint(persistCtx, previous.ID, 0, sessionPhaseFailed, "failed", response)
			h.releaseSessionLease(persistCtx, previous.ID)
			return response
		}
		if (previous.Phase == sessionPhaseCleaningUp || previous.Phase == sessionPhaseCleanupFailed) && previous.CheckpointIndex >= len(translated.Tests) {
			results, _, loadErr := h.loadPersistedResults(ctx, previous, translated.Tests, nil)
			if loadErr != nil {
				response.Error = fmt.Sprintf("failed to restore completed test checkpoints: %s", loadErr)
				return response
			}
			response.SessionID = previous.BackendSessionID
			response.Results = results
			response.Summary = summarizeTestResults(results, len(translated.Tests))
			response.Success = response.Summary.Failed == 0
			if !response.Success {
				response.Error = "one or more tests failed"
			}
			phase, status := sessionPhaseCompleted, "completed"
			if !response.Success {
				phase, status = sessionPhaseFailed, "failed"
			}
			_ = h.persistCheckpoint(ctx, previous.ID, len(translated.Tests), phase, status, summarizeResults(results))
			h.releaseSessionLease(ctx, previous.ID)
			return response
		}
	}

	orch := orchestrator.NewOrchestrator(h.providers)
	sessionExecution := toSessionExecutionContext(execution)
	if sessionExecution == nil {
		sessionExecution = &session.ExecutionContext{WorkflowID: bundle.Workflow.Name, ScenarioName: scenario.Name}
	}
	sessionID := h.sessionManager.Create(orch, sessionExecution)
	ctx = withWorkflowResourceMetadata(withExecutionContext(ctx, execution), execution, sessionID)
	response.SessionID = sessionID
	cleanupDone := false
	cleanupSession := func() error {
		if cleanupDone {
			return nil
		}
		cleanupDone = true
		return h.cleanupWorkflowBundleSession(context.WithoutCancel(ctx), sessionID)
	}
	var persisted *db.Session
	defer func() {
		if cleanupDone {
			return
		}
		cleanupErr := cleanupSession()
		persistCtx := context.WithoutCancel(ctx)
		if cleanupErr != nil {
			response.CleanupFailed = true
			if response.Error == "" {
				response.Error = cleanupErr.Error()
			} else {
				response.Error = fmt.Sprintf("%s; cleanup failed: %s", response.Error, cleanupErr.Error())
			}
			response.Success = false
			diagnostic := buildExecutionDiagnostic(executionevent.StageCleanup, cleanupErr, "Tokyo Tester could not completely remove the scenario environment.", executionScenarioID(execution), "", "", nil)
			response.Diagnostics = append(response.Diagnostics, diagnostic)
			if persisted != nil {
				_ = h.persistCheckpoint(persistCtx, persisted.ID, persisted.CheckpointIndex, sessionPhaseCleanupFailed, "cleanup_failed", summarizeResults(response.Results))
			}
		} else if persisted != nil && ctx.Err() != nil {
			if context.Cause(ctx) == db.ErrWorkflowCancellationRequested {
				_ = h.persistCheckpoint(persistCtx, persisted.ID, persisted.CheckpointIndex, "cancelled", "cancelled", summarizeResults(response.Results))
			} else {
				h.persistInterruptedSession(persistCtx, persisted.ID)
			}
		}
		if persisted != nil {
			h.releaseSessionLease(persistCtx, persisted.ID)
		}
	}()

	sess, err := h.sessionManager.Get(sessionID)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	persisted, err = h.buildPersistedSession(ctx, sessionID, execution, translated.Services)
	if err != nil {
		response.Error = fmt.Sprintf("failed to persist scenario state: %s", err)
		return response
	}
	if persisted != nil {
		sess.PersistedID = persisted.ID
		heartbeatCtx, stopHeartbeat := context.WithCancel(ctx)
		defer stopHeartbeat()
		go h.heartbeatSession(heartbeatCtx, persisted.ID)
	}

	releaseProvision, err := acquireDurableSlot(ctx, h.provisionSlots)
	if err != nil {
		response.Error = err.Error()
		return response
	}

	reportWorkflowProgress(ctx, "provision", fmt.Sprintf("Provisioning %d services", len(translated.Services)))
	provisionCtx, cancel := withOperationTimeout(ctx, h.provisionTimeout)
	err = orch.ProvisionServices(logger.WithContext(provisionCtx, logger.FromContext(ctx)), translated.Services)
	cancel()
	releaseProvision()
	if err != nil {
		response.Error = fmt.Sprintf("service provisioning failed: %s", extractBaseError(err))
		diagnostic := buildExecutionDiagnostic(executionevent.StageProvision, err, "A service did not become ready during environment provisioning.", executionScenarioID(execution), "", "", nil)
		response.Diagnostics = append(response.Diagnostics, diagnostic)
		executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageProvision, Kind: "diagnostic", Status: "failed", Message: diagnostic.Summary, ServiceNames: diagnostic.ServiceNames, Diagnostic: &diagnostic})
		if persisted != nil && ctx.Err() == nil {
			h.persistSessionFailure(ctx, persisted.ID, err, sessionPhaseFailed)
		}
		return response
	}
	reportWorkflowProgress(ctx, "provision", "All scenario services are ready")
	if translated.ExecutionModel == workflowbundle.ExecutionModelJourney {
		if persisted != nil {
			h.persistProvisionedState(ctx, persisted.ID, orch)
		}
		result, executeErr := h.browserJourneys.Execute(ctx, browserjourney.Request{
			ScenarioID: executionScenarioID(execution), Plan: *translated.Journey,
			Environment: browserjourney.ProvisionedEnvironment{Attachment: browserjourney.NewNetworkAttachment(orch.NetworkName())},
			RunSecrets:  runSecrets,
			Artifact:    browserjourney.ArtifactContext{ProjectID: executionProjectID(execution), WorkflowRunID: executionWorkflowRunID(execution), ScenarioRunID: executionScenarioRunID(execution)},
		})
		response.Journey = &result
		response.Diagnostics = append(response.Diagnostics, result.Diagnostics...)
		response.Success = result.Outcome == "passed" && executeErr == nil
		if executeErr != nil {
			response.Error = executeErr.Error()
		} else if !response.Success {
			response.Error = "browser journey failed"
		}
		persistCtx := context.WithoutCancel(ctx)
		if persisted != nil {
			_ = h.persistCheckpoint(persistCtx, persisted.ID, len(translated.Journey.Steps), sessionPhaseCleaningUp, "", response)
		}
		reportWorkflowProgress(ctx, "cleanup", "Cleaning up scenario containers and network")
		cleanupErr := cleanupSession()
		if cleanupErr != nil {
			response.CleanupFailed, response.Success = true, false
			if response.Error == "" {
				response.Error = cleanupErr.Error()
			} else {
				response.Error += "; cleanup failed: " + cleanupErr.Error()
			}
			diagnostic := buildExecutionDiagnostic(executionevent.StageCleanup, cleanupErr, "Tokyo Tester could not completely remove the scenario environment.", executionScenarioID(execution), "", "", nil)
			response.Diagnostics = append(response.Diagnostics, diagnostic)
		}
		if persisted != nil {
			phase, status := sessionPhaseCompleted, "completed"
			if cleanupErr != nil {
				phase, status = sessionPhaseCleanupFailed, "cleanup_failed"
			} else if !response.Success {
				phase, status = sessionPhaseFailed, "failed"
			}
			_ = h.persistCheckpoint(persistCtx, persisted.ID, len(translated.Journey.Steps), phase, status, response)
			h.releaseSessionLease(persistCtx, persisted.ID)
		}
		return response
	}
	if persisted != nil {
		h.persistProvisionedState(ctx, persisted.ID, orch)
		if err := h.ensureTestPlan(ctx, persisted.ID, translated.Tests); err != nil {
			response.Error = fmt.Sprintf("failed to persist test plan: %s", err)
			return response
		}
	}

	results, persistedByName, err := h.loadPersistedResults(ctx, persisted, translated.Tests, sess)
	if err != nil {
		response.Error = fmt.Sprintf("failed to restore test checkpoints: %s", err)
		return response
	}
	remaining := make([]config.TestConfig, 0, len(translated.Tests)-len(results))
	for _, testConfig := range translated.Tests {
		if _, completed := persistedByName[testConfig.Name]; !completed {
			remaining = append(remaining, testConfig)
		}
	}
	newResults, _ := h.executeWorkflowBundleTestsWithCallback(ctx, sess, remaining, func(testConfig config.TestConfig, result dto.TestResult, interpolation any) {
		if persisted == nil || ctx.Err() != nil {
			return
		}
		_ = h.persistTestResult(ctx, persisted, result, interpolation, time.Now().UTC())
		for index := range translated.Tests {
			if translated.Tests[index].Name == testConfig.Name {
				_ = h.persistCheckpoint(ctx, persisted.ID, index+1, sessionPhaseRunningTests, "", nil)
				break
			}
		}
	})
	if ctx.Err() != nil {
		response.Error = ctx.Err().Error()
		return response
	}
	resultByName := make(map[string]dto.TestResult, len(results)+len(newResults))
	for _, result := range append(results, newResults...) {
		resultByName[result.Name] = result
	}
	results = results[:0]
	summary := dto.TestSummary{Total: len(translated.Tests)}
	for _, testConfig := range translated.Tests {
		result, ok := resultByName[testConfig.Name]
		if !ok {
			continue
		}
		results = append(results, result)
		if result.Passed {
			summary.Passed++
		} else {
			summary.Failed++
		}
		if len(result.Attempts) > 1 {
			summary.Retried++
		}
	}
	response.Results = results
	response.Summary = summary
	response.Success = summary.Failed == 0
	if !response.Success {
		response.Error = "one or more tests failed"
	}

	if persisted != nil {
		_ = h.persistCheckpoint(ctx, persisted.ID, len(translated.Tests), sessionPhaseCleaningUp, "", summarizeResults(results))
	}
	reportWorkflowProgress(ctx, "cleanup", "Cleaning up scenario containers and network")
	cleanupFailed := false
	if cleanupErr := cleanupSession(); cleanupErr != nil {
		cleanupFailed = true
		response.CleanupFailed = true
		if response.Error == "" {
			response.Error = cleanupErr.Error()
		} else {
			response.Error = fmt.Sprintf("%s; cleanup failed: %s", response.Error, cleanupErr.Error())
		}
		response.Success = false
		diagnostic := buildExecutionDiagnostic(executionevent.StageCleanup, cleanupErr, "Tokyo Tester could not completely remove the scenario environment.", executionScenarioID(execution), "", "", nil)
		response.Diagnostics = append(response.Diagnostics, diagnostic)
		executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "diagnostic", Status: "failed", Message: diagnostic.Summary, ServiceNames: diagnostic.ServiceNames, Diagnostic: &diagnostic})
	}
	if persisted != nil {
		phase := sessionPhaseCompleted
		status := "completed"
		if cleanupFailed {
			phase, status = sessionPhaseCleanupFailed, "cleanup_failed"
		} else if !response.Success {
			phase, status = sessionPhaseFailed, "failed"
		}
		_ = h.persistCheckpoint(ctx, persisted.ID, len(translated.Tests), phase, status, summarizeResults(results))
		h.releaseSessionLease(ctx, persisted.ID)
	}
	if !cleanupFailed {
		reportWorkflowProgress(ctx, "cleanup", "Scenario resources cleaned up")
	}

	return response
}

func (h *Handler) cleanupPersistedSessionResources(ctx context.Context, sessionID string) error {
	if h.resourceCleaner == nil {
		return fmt.Errorf("Docker resource cleaner is unavailable")
	}
	var cleanupErr error
	for attempt := 0; attempt < 3; attempt++ {
		cleanupErr = h.resourceCleaner.CleanupSessionResources(ctx, sessionID)
		if cleanupErr == nil {
			return nil
		}
		if attempt < 2 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt+1) * time.Second):
			}
		}
	}
	return cleanupErr
}

func summarizeTestResults(results []dto.TestResult, total int) dto.TestSummary {
	summary := dto.TestSummary{Total: total}
	for _, result := range results {
		if result.Passed {
			summary.Passed++
		} else {
			summary.Failed++
		}
	}
	return summary
}

func (h *Handler) executeWorkflowBundleTests(
	sess *session.Session,
	testsToRun []config.TestConfig,
) ([]dto.TestResult, dto.TestSummary) {
	return h.executeWorkflowBundleTestsWithCallback(sess.Context, sess, testsToRun, nil)
}

func (h *Handler) executeWorkflowBundleTestsWithCallback(
	ctx context.Context,
	sess *session.Session,
	testsToRun []config.TestConfig,
	onResult func(config.TestConfig, dto.TestResult, any),
) ([]dto.TestResult, dto.TestSummary) {
	releaseTests, err := acquireDurableSlot(ctx, h.testRunSlots)
	if err != nil {
		return []dto.TestResult{{
			Name:   "bundle-execution",
			Type:   "delay",
			Passed: false,
			Error:  err.Error(),
		}}, dto.TestSummary{Total: 1, Failed: 1}
	}
	defer releaseTests()

	testCtxRoot, cancel := withOperationTimeout(ctx, h.testRunTimeout)
	defer cancel()

	registry := test.NewRegistory()
	results := make([]dto.TestResult, 0, len(testsToRun))
	summary := dto.TestSummary{Total: len(testsToRun)}

	for _, testCfg := range testsToRun {
		executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "test", Status: "started", Message: fmt.Sprintf("Running test %q", testCfg.Name), TestID: testCfg.ID, TestName: testCfg.Name, ServiceNames: testCfg.TargetServices, Attempt: 1, MaxAttempts: 2})
		interpolated, err := test.InterpolateTestConfig(testCfg.Config, sess)
		if err != nil {
			wrapped := errors.Wrap(err, errors.ErrConfiguration, "test configuration interpolation failed").WithDetail("test", testCfg.Name)
			diagnostic := buildExecutionDiagnostic(executionevent.StageExecution, wrapped, "The test configuration could not be resolved for this environment.", "", testCfg.ID, testCfg.Name, testCfg.TargetServices)
			result := dto.TestResult{
				Name:       testCfg.Name,
				Type:       testCfg.Type,
				Passed:     false,
				Error:      fmt.Sprintf("config interpolation failed: %v", err),
				Diagnostic: &diagnostic,
			}
			results = append(results, result)
			summary.Failed++
			if onResult != nil {
				onResult(testCfg, result, asPersistedInterpolationData(result))
			}
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "test", Status: "failed", Message: fmt.Sprintf("Test %q failed during configuration", testCfg.Name), TestID: testCfg.ID, TestName: testCfg.Name, ServiceNames: testCfg.TargetServices, Diagnostic: &diagnostic})
			continue
		}
		testCfg.Config = interpolated

		executor, ok := registry.Get(testCfg.Type)
		if !ok {
			wrapped := errors.New(errors.ErrConfiguration, "test executor is not available").WithDetail("test", testCfg.Name)
			diagnostic := buildExecutionDiagnostic(executionevent.StageExecution, wrapped, "Tokyo Tester does not support the configured test type.", "", testCfg.ID, testCfg.Name, testCfg.TargetServices)
			result := dto.TestResult{
				Name:       testCfg.Name,
				Type:       testCfg.Type,
				Passed:     false,
				Error:      fmt.Sprintf("executor not found for type %s", testCfg.Type),
				Diagnostic: &diagnostic,
			}
			results = append(results, result)
			summary.Failed++
			if onResult != nil {
				onResult(testCfg, result, asPersistedInterpolationData(result))
			}
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "test", Status: "failed", Message: fmt.Sprintf("Test %q could not start", testCfg.Name), TestID: testCfg.ID, TestName: testCfg.Name, ServiceNames: testCfg.TargetServices, Diagnostic: &diagnostic})
			continue
		}

		retryReport, executeErr := test.ExecuteWithRetry(
			testCtxRoot, executor, testCfg, sess.Orchestrator.GetRegistry(),
			test.RetryOptions{
				Disabled: h.disableTestRetries,
				Observer: func(event test.RetryEvent) {
					executionevent.Report(ctx, executionevent.Activity{
						Stage: executionevent.StageExecution, Kind: "test", Status: "retrying",
						Message: fmt.Sprintf("Retrying test %q after a transient transport failure", testCfg.Name),
						TestID:  testCfg.ID, TestName: testCfg.Name, ServiceNames: testCfg.TargetServices,
						Attempt: event.NextAttempt, MaxAttempts: event.MaxAttempts, RetryReason: event.Reason,
					})
				},
			},
		)
		attempts, durationMs, recovered := retryReportFields(retryReport)
		if len(attempts) > 1 {
			summary.Retried++
		}
		if err := executeErr; err != nil {
			containerLogs := sess.Orchestrator.GetAllServiceLogs(sess.Context)
			testErr := typedTestExecutionError(err, testCfg.Name, testCfg.Type, containerLogs)
			if len(testErr.ContainerLogs) > 0 {
				containerLogs = testErr.ContainerLogs
			}
			diagnostic := buildExecutionDiagnostic(executionevent.StageExecution, testErr, "The test observed behavior that did not match its expectation.", "", testCfg.ID, testCfg.Name, testCfg.TargetServices)
			appendAttemptEvidence(&diagnostic, attempts)
			result := dto.TestResult{
				Name:          testCfg.Name,
				Type:          testCfg.Type,
				Passed:        false,
				Error:         extractBaseError(err),
				DurationMs:    durationMs,
				Attempts:      attempts,
				ContainerLogs: containerLogs,
				Diagnostic:    &diagnostic,
			}
			results = append(results, result)
			summary.Failed++
			if onResult != nil {
				onResult(testCfg, result, asPersistedInterpolationData(result))
			}
			failureMessage := fmt.Sprintf("Test %q failed", testCfg.Name)
			if len(attempts) > 1 {
				failureMessage = fmt.Sprintf("Test %q failed after %d attempts", testCfg.Name, len(attempts))
			}
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "test", Status: "failed", Message: failureMessage, TestID: testCfg.ID, TestName: testCfg.Name, ServiceNames: testCfg.TargetServices, Attempt: len(attempts), MaxAttempts: 2, Diagnostic: &diagnostic})
			continue
		}

		sess.StoreTestResult(testCfg.Name, map[string]any{
			"status": "passed",
			"name":   testCfg.Name,
			"type":   testCfg.Type,
		})
		result := dto.TestResult{
			Name:       testCfg.Name,
			Type:       testCfg.Type,
			Passed:     true,
			DurationMs: durationMs,
			Attempts:   attempts,
			Recovered:  recovered,
		}
		results = append(results, result)
		summary.Passed++
		if onResult != nil {
			onResult(testCfg, result, map[string]any{"status": "passed", "name": testCfg.Name, "type": testCfg.Type})
		}
		passedMessage := fmt.Sprintf("Test %q passed", testCfg.Name)
		if recovered {
			passedMessage = fmt.Sprintf("Test %q passed after retry", testCfg.Name)
		}
		executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageExecution, Kind: "test", Status: "passed", Message: passedMessage, TestID: testCfg.ID, TestName: testCfg.Name, ServiceNames: testCfg.TargetServices, Attempt: len(attempts), MaxAttempts: 2})
	}

	return results, summary
}

func executionScenarioID(execution *dto.ExecutionContextDTO) string {
	if execution == nil {
		return ""
	}
	return execution.ScenarioID
}

func executionProjectID(execution *dto.ExecutionContextDTO) string {
	if execution == nil {
		return ""
	}
	return execution.ProjectID
}

func executionWorkflowRunID(execution *dto.ExecutionContextDTO) string {
	if execution == nil {
		return ""
	}
	return execution.WorkflowRunID
}

func executionScenarioRunID(execution *dto.ExecutionContextDTO) string {
	if execution == nil {
		return ""
	}
	return execution.SessionID
}

func (h *Handler) cleanupWorkflowBundleSession(ctx context.Context, sessionID string) error {
	releaseCleanup, err := acquireDurableSlot(ctx, h.cleanupSlots)
	if err != nil {
		return h.sessionManager.DeleteWithContext(ctx, sessionID)
	}
	defer releaseCleanup()

	var cleanupErr error
	for attempt := 0; attempt < 3; attempt++ {
		cleanupCtx, cancel := withOperationTimeout(ctx, h.cleanupTimeout)
		cleanupErr = h.sessionManager.DeleteWithContext(cleanupCtx, sessionID)
		cancel()
		if cleanupErr == nil {
			return nil
		}
		if attempt < 2 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt+1) * time.Second):
			}
		}
	}
	return cleanupErr
}
