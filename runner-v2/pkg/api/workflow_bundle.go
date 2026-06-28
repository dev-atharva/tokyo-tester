package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/middleware"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
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
		if result.Success {
			response.Summary.PassedScenarios++
		} else {
			response.Summary.FailedScenarios++
			response.Success = false
		}
	}

	respondJson(w, http.StatusOK, response)
}

func (h *Handler) runWorkflowBundleScenario(
	ctx context.Context,
	bundle *workflowbundle.Bundle,
	scenario workflowbundle.BundleScenario,
) dto.WorkflowBundleScenarioResponse {
	return h.runWorkflowBundleScenarioForRun(ctx, bundle, scenario, nil)
}

func (h *Handler) runWorkflowBundleScenarioForRun(
	ctx context.Context,
	bundle *workflowbundle.Bundle,
	scenario workflowbundle.BundleScenario,
	execution *dto.ExecutionContextDTO,
) dto.WorkflowBundleScenarioResponse {
	response := dto.WorkflowBundleScenarioResponse{
		ScenarioName: scenario.Name,
		Success:      false,
	}

	translated, err := bundle.TranslateScenario(scenario)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	response.Summary.Total = len(translated.Tests)
	previous, _ := h.resolvePersistedSession(ctx, "", execution)
	if previous != nil && previous.Phase != "" && previous.Phase != sessionPhaseCreated {
		if err := h.cleanupPersistedSessionResources(ctx, previous.ID); err != nil {
			response.Error = fmt.Sprintf("failed to clean interrupted scenario resources: %s", err)
			if ctx.Err() == nil {
				h.persistSessionFailure(ctx, previous.ID, err, sessionPhaseFailed)
			}
			return response
		}
		if previous.Phase == sessionPhaseCleaningUp && previous.CheckpointIndex >= len(translated.Tests) {
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
	ctx = provider.WithSessionID(withExecutionContext(ctx, execution), sessionID)
	response.SessionID = sessionID

	sess, err := h.sessionManager.Get(sessionID)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	persisted, err := h.buildPersistedSession(ctx, sessionID, execution, translated.Services)
	if err != nil {
		response.Error = fmt.Sprintf("failed to persist scenario state: %s", err)
		h.cleanupWorkflowBundleSession(ctx, sessionID)
		return response
	}
	if persisted != nil {
		sess.PersistedID = persisted.ID
	}

	releaseProvision, err := h.acquireSlot(ctx, h.provisionSlots, "provision")
	if err != nil {
		response.Error = err.Error()
		h.cleanupWorkflowBundleSession(ctx, sessionID)
		return response
	}

	provisionCtx, cancel := withOperationTimeout(ctx, h.provisionTimeout)
	err = orch.ProvisionServices(logger.WithContext(provisionCtx, logger.FromContext(ctx)), translated.Services)
	cancel()
	releaseProvision()
	if err != nil {
		response.Error = fmt.Sprintf("service provisioning failed: %s", extractBaseError(err))
		if persisted != nil && ctx.Err() == nil {
			h.persistSessionFailure(ctx, persisted.ID, err, sessionPhaseFailed)
		}
		h.cleanupWorkflowBundleSession(ctx, sessionID)
		return response
	}
	if persisted != nil {
		h.persistProvisionedState(ctx, persisted.ID, orch)
		if err := h.ensureTestPlan(ctx, persisted.ID, translated.Tests); err != nil {
			response.Error = fmt.Sprintf("failed to persist test plan: %s", err)
			h.cleanupWorkflowBundleSession(ctx, sessionID)
			return response
		}
	}

	results, persistedByName, err := h.loadPersistedResults(ctx, persisted, translated.Tests, sess)
	if err != nil {
		response.Error = fmt.Sprintf("failed to restore test checkpoints: %s", err)
		h.cleanupWorkflowBundleSession(ctx, sessionID)
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
	if cleanupErr := h.cleanupWorkflowBundleSession(ctx, sessionID); cleanupErr != nil {
		if response.Error == "" {
			response.Error = cleanupErr.Error()
		} else {
			response.Error = fmt.Sprintf("%s; cleanup failed: %s", response.Error, cleanupErr.Error())
		}
		response.Success = false
	}
	if persisted != nil {
		phase := sessionPhaseCompleted
		status := "completed"
		if !response.Success {
			phase, status = sessionPhaseFailed, "failed"
		}
		_ = h.persistCheckpoint(ctx, persisted.ID, len(translated.Tests), phase, status, summarizeResults(results))
		h.releaseSessionLease(ctx, persisted.ID)
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
	releaseTests, err := h.acquireSlot(ctx, h.testRunSlots, "test execution")
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
		interpolated, err := test.InterpolateTestConfig(testCfg.Config, sess)
		if err != nil {
			result := dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("config interpolation failed: %v", err),
			}
			results = append(results, result)
			summary.Failed++
			if onResult != nil {
				onResult(testCfg, result, asPersistedInterpolationData(result))
			}
			continue
		}
		testCfg.Config = interpolated

		executor, ok := registry.Get(testCfg.Type)
		if !ok {
			result := dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("executor not found for type %s", testCfg.Type),
			}
			results = append(results, result)
			summary.Failed++
			if onResult != nil {
				onResult(testCfg, result, asPersistedInterpolationData(result))
			}
			continue
		}

		if err := executor.Execute(testCtxRoot, testCfg, sess.Orchestrator.GetRegistry()); err != nil {
			containerLogs := sess.Orchestrator.GetAllServiceLogs(sess.Context)
			if testErr, ok := err.(*test.TestError); ok && len(testErr.ContainerLogs) > 0 {
				containerLogs = testErr.ContainerLogs
			}
			result := dto.TestResult{
				Name:          testCfg.Name,
				Type:          testCfg.Type,
				Passed:        false,
				Error:         extractBaseError(err),
				ContainerLogs: containerLogs,
			}
			results = append(results, result)
			summary.Failed++
			if onResult != nil {
				onResult(testCfg, result, asPersistedInterpolationData(result))
			}
			continue
		}

		sess.StoreTestResult(testCfg.Name, map[string]any{
			"status": "passed",
			"name":   testCfg.Name,
			"type":   testCfg.Type,
		})
		result := dto.TestResult{
			Name:   testCfg.Name,
			Type:   testCfg.Type,
			Passed: true,
		}
		results = append(results, result)
		summary.Passed++
		if onResult != nil {
			onResult(testCfg, result, map[string]any{"status": "passed", "name": testCfg.Name, "type": testCfg.Type})
		}
	}

	return results, summary
}

func (h *Handler) cleanupWorkflowBundleSession(ctx context.Context, sessionID string) error {
	releaseCleanup, err := h.acquireSlot(ctx, h.cleanupSlots, "cleanup")
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
