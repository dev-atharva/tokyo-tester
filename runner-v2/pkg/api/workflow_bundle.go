package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/middleware"
	"github.com/dev-atharva/cots/pkg/orchestrator"
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
	response := dto.WorkflowBundleScenarioResponse{
		ScenarioName: scenario.Name,
		Success:      false,
	}

	translated, err := bundle.TranslateScenario(scenario)
	if err != nil {
		response.Error = err.Error()
		return response
	}

	orch := orchestrator.NewOrchestrator(h.providers)
	sessionID := h.sessionManager.Create(orch, &session.ExecutionContext{
		WorkflowID:   bundle.Workflow.Name,
		ScenarioName: scenario.Name,
	})
	response.SessionID = sessionID

	sess, err := h.sessionManager.Get(sessionID)
	if err != nil {
		response.Error = err.Error()
		return response
	}

	releaseProvision, err := h.acquireSlot(ctx, h.provisionSlots, "provision")
	if err != nil {
		response.Error = err.Error()
		h.cleanupWorkflowBundleSession(ctx, sessionID)
		return response
	}

	provisionCtx, cancel := withOperationTimeout(sess.Context, h.provisionTimeout)
	err = orch.ProvisionServices(provisionCtx, translated.Services)
	cancel()
	releaseProvision()
	if err != nil {
		response.Error = fmt.Sprintf("service provisioning failed: %s", extractBaseError(err))
		h.cleanupWorkflowBundleSession(ctx, sessionID)
		return response
	}

	results, summary := h.executeWorkflowBundleTests(sess, translated.Tests)
	response.Results = results
	response.Summary = summary
	response.Success = summary.Failed == 0
	if !response.Success {
		response.Error = "one or more tests failed"
	}

	if cleanupErr := h.cleanupWorkflowBundleSession(ctx, sessionID); cleanupErr != nil {
		if response.Error == "" {
			response.Error = cleanupErr.Error()
		} else {
			response.Error = fmt.Sprintf("%s; cleanup failed: %s", response.Error, cleanupErr.Error())
		}
		response.Success = false
	}

	return response
}

func (h *Handler) executeWorkflowBundleTests(
	sess *session.Session,
	testsToRun []config.TestConfig,
) ([]dto.TestResult, dto.TestSummary) {
	releaseTests, err := h.acquireSlot(sess.Context, h.testRunSlots, "test execution")
	if err != nil {
		return []dto.TestResult{{
			Name:   "bundle-execution",
			Type:   "delay",
			Passed: false,
			Error:  err.Error(),
		}}, dto.TestSummary{Total: 1, Failed: 1}
	}
	defer releaseTests()

	testCtxRoot, cancel := withOperationTimeout(sess.Context, h.testRunTimeout)
	defer cancel()

	registry := test.NewRegistory()
	results := make([]dto.TestResult, 0, len(testsToRun))
	summary := dto.TestSummary{Total: len(testsToRun)}

	for _, testCfg := range testsToRun {
		interpolated, err := test.InterpolateTestConfig(testCfg.Config, sess)
		if err != nil {
			results = append(results, dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("config interpolation failed: %v", err),
			})
			summary.Failed++
			continue
		}
		testCfg.Config = interpolated

		executor, ok := registry.Get(testCfg.Type)
		if !ok {
			results = append(results, dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("executor not found for type %s", testCfg.Type),
			})
			summary.Failed++
			continue
		}

		if err := executor.Execute(testCtxRoot, testCfg, sess.Orchestrator.GetRegistry()); err != nil {
			containerLogs := sess.Orchestrator.GetAllServiceLogs(sess.Context)
			if testErr, ok := err.(*test.TestError); ok && len(testErr.ContainerLogs) > 0 {
				containerLogs = testErr.ContainerLogs
			}
			results = append(results, dto.TestResult{
				Name:          testCfg.Name,
				Type:          testCfg.Type,
				Passed:        false,
				Error:         extractBaseError(err),
				ContainerLogs: containerLogs,
			})
			summary.Failed++
			continue
		}

		sess.StoreTestResult(testCfg.Name, map[string]any{
			"status": "passed",
			"name":   testCfg.Name,
			"type":   testCfg.Type,
		})
		results = append(results, dto.TestResult{
			Name:   testCfg.Name,
			Type:   testCfg.Type,
			Passed: true,
		})
		summary.Passed++
	}

	return results, summary
}

func (h *Handler) cleanupWorkflowBundleSession(ctx context.Context, sessionID string) error {
	releaseCleanup, err := h.acquireSlot(ctx, h.cleanupSlots, "cleanup")
	if err != nil {
		return h.sessionManager.DeleteWithContext(ctx, sessionID)
	}
	defer releaseCleanup()

	cleanupCtx, cancel := withOperationTimeout(ctx, h.cleanupTimeout)
	defer cancel()
	return h.sessionManager.DeleteWithContext(cleanupCtx, sessionID)
}
