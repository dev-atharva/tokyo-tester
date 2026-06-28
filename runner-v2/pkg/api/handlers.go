package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/middleware"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/provider/predefined"
	"github.com/dev-atharva/cots/pkg/session"
	"github.com/dev-atharva/cots/pkg/telemetry"
	"github.com/dev-atharva/cots/pkg/test"
	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel/attribute"
)

func withExecutionContext(ctx context.Context, execution *dto.ExecutionContextDTO) context.Context {
	if execution == nil {
		return ctx
	}

	args := make([]any, 0, 8)
	attrs := make([]attribute.KeyValue, 0, 4)

	if execution.WorkflowID != "" {
		args = append(args, "workflow_id", execution.WorkflowID)
		attrs = append(attrs, telemetry.WorkflowIDAttr(execution.WorkflowID))
	}
	if execution.WorkflowRunID != "" {
		args = append(args, "workflow_run_id", execution.WorkflowRunID)
		attrs = append(attrs, telemetry.WorkflowRunIDAttr(execution.WorkflowRunID))
	}
	if execution.ScenarioID != "" {
		args = append(args, "scenario_id", execution.ScenarioID)
		attrs = append(attrs, telemetry.ScenarioIDAttr(execution.ScenarioID))
	}
	if execution.ScenarioName != "" {
		args = append(args, "scenario_name", execution.ScenarioName)
		attrs = append(attrs, telemetry.ScenarioNameAttr(execution.ScenarioName))
	}

	if len(attrs) > 0 {
		telemetry.AddSpanAttributes(ctx, attrs...)
	}
	if len(args) > 0 {
		return logger.WithFields(ctx, args...)
	}

	return ctx
}

func toSessionExecutionContext(execution *dto.ExecutionContextDTO) *session.ExecutionContext {
	if execution == nil {
		return nil
	}

	return &session.ExecutionContext{
		SessionID:     execution.SessionID,
		ProjectID:     execution.ProjectID,
		UserID:        execution.UserID,
		ClientID:      execution.ClientID,
		WorkflowID:    execution.WorkflowID,
		WorkflowRunID: execution.WorkflowRunID,
		ScenarioID:    execution.ScenarioID,
		ScenarioName:  execution.ScenarioName,
	}
}

func executionContextFromSession(sess *session.Session) *dto.ExecutionContextDTO {
	if sess == nil || sess.Execution == nil {
		return nil
	}

	return &dto.ExecutionContextDTO{
		WorkflowID:    sess.Execution.WorkflowID,
		WorkflowRunID: sess.Execution.WorkflowRunID,
		ScenarioID:    sess.Execution.ScenarioID,
		ScenarioName:  sess.Execution.ScenarioName,
	}
}

type Handler struct {
	sessionManager   *session.Manager
	providers        *provider.Registry
	db               db.Database
	ownerID          string
	leaseDuration    time.Duration
	provisionTimeout time.Duration
	testRunTimeout   time.Duration
	cleanupTimeout   time.Duration
	queueTimeout     time.Duration
	provisionSlots   chan struct{}
	testRunSlots     chan struct{}
	cleanupSlots     chan struct{}
	workflowService  *WorkflowService
	resourceCleaner  sessionResourceCleaner
}

type sessionResourceCleaner interface {
	CleanupSessionResources(ctx context.Context, sessionID string) error
}

func (h *Handler) SetWorkflowService(service *WorkflowService) {
	h.workflowService = service
}

func (h *Handler) SetSessionResourceCleaner(cleaner sessionResourceCleaner) {
	h.resourceCleaner = cleaner
}

func NewHandler(database db.Database, appCfg config.AppConfig) *Handler {
	providers := provider.NewRegistry()

	providers.Register("postgres", &predefined.PostgresProvider{})
	providers.Register("mysql", &predefined.MysqlProvider{})
	providers.Register("mariadb", &predefined.MariaDbProvider{})
	providers.Register("redis", &predefined.RedisProvider{})
	providers.Register("memcached", &predefined.MemcachedProvider{})
	providers.Register("kafka", &predefined.KafkaProvider{})
	providers.Register("rabbitmq", &predefined.RabbitMQProvider{})
	providers.Register("mongodb", &predefined.MongoDBProvider{})

	return &Handler{
		sessionManager:   session.NewManager(),
		providers:        providers,
		db:               database,
		ownerID:          runtimeOwnerID(),
		leaseDuration:    5 * time.Minute,
		provisionTimeout: time.Duration(appCfg.ProvisionTimeoutSec) * time.Second,
		testRunTimeout:   time.Duration(appCfg.TestRunTimeoutSec) * time.Second,
		cleanupTimeout:   time.Duration(appCfg.CleanupTimeoutSec) * time.Second,
		queueTimeout:     time.Duration(appCfg.OperationQueueTimeoutSec) * time.Second,
		provisionSlots:   make(chan struct{}, appCfg.MaxConcurrentProvision),
		testRunSlots:     make(chan struct{}, appCfg.MaxConcurrentTestRuns),
		cleanupSlots:     make(chan struct{}, appCfg.MaxConcurrentCleanup),
	}
}

// Create services handles /services post request
func (h *Handler) CreateServices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.GetRequestID(ctx)

	ctx, span := telemetry.StartSpan(ctx, "api.create_services")
	defer span.End()

	logger.InfoContext(ctx, "creating services", "requet_id", requestID)

	releaseSlot, err := h.acquireSlot(ctx, h.provisionSlots, "provision")
	if err != nil {
		logger.WarnContext(ctx, "provision request rejected by concurrency guard", "error", err)
		http.Error(w, err.Error(), http.StatusTooManyRequests)
		return
	}
	defer releaseSlot()

	var req dto.CreateServicesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.WarnContext(ctx, "invalid request body", "error", err)
		errors.ResponseBadRequest(w, "invalid request body")
		return
	}

	ctx = withExecutionContext(ctx, req.ExecutionContext)

	if err := dto.Validate(req); err != nil {
		fieldErrors := dto.FormatValidationErrors(err)
		logger.WarnContext(ctx, "validation failed", "errors", fieldErrors)
		errors.RespondValidationError(w, "validation failed", fieldErrors)
		return
	}

	services := req.ToConfigList()
	telemetry.AddSpanAttributes(ctx, telemetry.ServiceAttr(fmt.Sprintf("%d services", len(services))))

	servicesNames := make(map[string]bool)
	for _, svc := range services {
		if servicesNames[svc.Name] {
			errors.ResponseBadRequest(w, fmt.Sprintf("duplicate service name : %s", svc.Name))
			return
		}
		servicesNames[svc.Name] = true
	}

	// Check for circular dependency
	graph := orchestrator.NewDependencyGraph()
	for _, svc := range req.Services {
		graph.AddNode(svc.Name, svc.DependsOn)
	}
	if _, err := graph.TopologicalSort(); err != nil {
		logger.WarnContext(ctx, "dependency cycle detected", "error", err)
		appErr := errors.Wrap(err, errors.ErrDependencyCycle, "circular dependency detected")
		errors.ResponseWithError(w, appErr)
		return
	}

	orch := orchestrator.NewOrchestrator(h.providers)
	sessionID := h.sessionManager.Create(orch, toSessionExecutionContext(req.ExecutionContext))
	telemetry.AddSpanAttributes(ctx, telemetry.SessionIDAttr(sessionID))
	ctx = logger.WithFields(ctx, "session_id", sessionID)
	ctx = provider.WithSessionID(ctx, sessionID)

	sess, _ := h.sessionManager.Get(sessionID)
	persisted, err := h.buildPersistedSession(ctx, sessionID, req.ExecutionContext, services)
	if err != nil {
		logger.WarnContext(ctx, "failed to persist session metadata before provisioning", "error", err)
	}
	if sess != nil && persisted != nil {
		sess.PersistedID = persisted.ID
	}
	provisionCtx := withExecutionContext(ctx, req.ExecutionContext)
	opCtx, cancel := withOperationTimeout(sess.Context, h.provisionTimeout)
	defer cancel()
	if err := orch.ProvisionServices(logger.WithContext(opCtx, logger.FromContext(provisionCtx)), services); err != nil {
		logger.ErrorContext(ctx, "service provisioning failed", "error", err)

		var containerLogs map[string]string
		if enhancedErr, ok := err.(*orchestrator.EnhancedError); ok {
			containerLogs = enhancedErr.AllServiceLogs
			if containerLogs == nil && enhancedErr.ContainerLogs != "" {
				containerLogs = map[string]string{
					enhancedErr.ServiceName: enhancedErr.ContainerLogs,
				}
			}
		}
		h.sessionManager.Delete(sessionID)
		if persisted != nil {
			h.persistSessionFailure(ctx, persisted.ID, err, sessionPhaseFailed)
			h.releaseSessionLease(ctx, persisted.ID)
		}
		telemetry.RecordError(ctx, err)

		appErr := errors.Wrap(err, errors.ErrServiceProvision, "failed to provision services")
		if len(containerLogs) > 0 {
			appErr.Details = make(map[string]string)
			for svc, logs := range containerLogs {
				appErr.Details[svc] = logs[:min(500, len(logs))]
			}
		}
		errors.ResponseWithError(w, appErr)
		return
	}
	logger.InfoContext(ctx, "services provisioned successfully", "count", len(services))
	if persisted != nil {
		h.persistProvisionedState(ctx, persisted.ID, orch)
	}

	respondJson(w, http.StatusCreated, dto.CreateServicesResponse{
		SessionID: sessionID,
		Message:   fmt.Sprintf("Successfully provisioned %d services", len(services)),
	})
}

// RunTests handles Post request to /tests/{SessionID}
func (h *Handler) RunTests(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	sessionId := chi.URLParam(r, "sessionID")
	requestID := middleware.GetRequestID(ctx)

	ctx, span := telemetry.StartSpan(ctx, "api.run_tests", telemetry.SessionIDAttr(sessionId))
	defer span.End()

	logger.InfoContext(ctx, "running tests", "request_id", requestID, "session_id", sessionId)

	releaseSlot, err := h.acquireSlot(ctx, h.testRunSlots, "test execution")
	if err != nil {
		logger.WarnContext(ctx, "test request rejected by concurrency guard", "error", err)
		http.Error(w, err.Error(), http.StatusTooManyRequests)
		return
	}
	defer releaseSlot()

	var req dto.RunTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.WarnContext(ctx, "invalid request body", "error", err)
		errors.ResponseBadRequest(w, "invalid request body")
		return
	}

	ctx = withExecutionContext(ctx, req.ExecutionContext)

	if err := dto.Validate(req); err != nil {
		fieldErros := dto.FormatValidationErrors(err)
		logger.WarnContext(ctx, "validation failed", "errors", fieldErros)
		errors.RespondValidationError(w, "validation failed", fieldErros)
		return
	}

	sess, persisted, err := h.getOrRecoverSession(ctx, sessionId, req.ExecutionContext)
	if err != nil {
		logger.WarnContext(ctx, "session unavailable", "session_id", sessionId, "error", err)
		errors.ResponseBadRequest(w, err.Error())
		return
	}
	ctx = withExecutionContext(ctx, executionContextFromSession(sess))
	testCtxRoot, cancel := withOperationTimeout(sess.Context, h.testRunTimeout)
	defer cancel()

	tests := req.ToConfigList()
	if persisted != nil {
		tests, err = mergePersistedPlan(tests, persisted.TestPlan)
		if err != nil {
			errors.ResponseBadRequest(w, fmt.Sprintf("failed to load persisted test plan: %v", err))
			return
		}
		if err := h.ensureTestPlan(ctx, persisted.ID, tests); err != nil {
			logger.WarnContext(ctx, "failed to persist test plan", "session_id", persisted.ID, "error", err)
		}
		if err := rejectUnsafeResume(tests, persisted.CheckpointIndex); err != nil {
			errors.ResponseBadRequest(w, err.Error())
			return
		}
	}
	telemetry.AddSpanAttributes(ctx, telemetry.TestNameAttr(fmt.Sprintf("%d tests", len(tests))))

	testRegistry := test.NewRegistory()

	results, persistedByName, err := h.loadPersistedResults(ctx, persisted, tests, sess)
	if err != nil {
		logger.WarnContext(ctx, "failed to load persisted test results", "session_id", sessionId, "error", err)
	}
	passed := 0
	failed := 0
	for _, existing := range results {
		if existing.Passed {
			passed++
		} else {
			failed++
		}
	}

	startIndex := 0
	if persisted != nil && persisted.CheckpointIndex > 0 && persisted.CheckpointIndex < len(tests) {
		startIndex = persisted.CheckpointIndex
	}

	for idx := startIndex; idx < len(tests); idx++ {
		testCfg := tests[idx]
		if _, exists := persistedByName[testCfg.Name]; exists {
			continue
		}

		testCtx, testSpan := telemetry.StartSpan(ctx, "test.execute", telemetry.TestNameAttr(testCfg.Name), telemetry.TestTypeAttr(testCfg.Type))
		testCtx = logger.WithFields(testCtx, "test_name", testCfg.Name, "test_type", testCfg.Type)

		logger.DebugContext(testCtx, "executing test")

		interpolatedConfig, err := test.InterpolateTestConfig(testCfg.Config, sess)
		if err != nil {
			result := dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("config interpolation failed : %v", err),
			}
			results = append(results, result)
			failed++
			if persisted != nil {
				_ = h.persistTestResult(ctx, persisted, result, asPersistedInterpolationData(result), time.Now().UTC())
				_ = h.persistCheckpoint(ctx, persisted.ID, idx+1, sessionPhaseFailed, "failed", summarizeResults(results))
			}
			telemetry.RecordError(testCtx, err)
			testSpan.End()
			continue
		}
		testCfg.Config = interpolatedConfig

		executor, ok := testRegistry.Get(testCfg.Type)
		if !ok {
			result := dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("executor not found for type %s", testCfg.Type),
			}
			results = append(results, result)
			failed++
			if persisted != nil {
				_ = h.persistTestResult(ctx, persisted, result, asPersistedInterpolationData(result), time.Now().UTC())
				_ = h.persistCheckpoint(ctx, persisted.ID, idx+1, sessionPhaseFailed, "failed", summarizeResults(results))
			}
			testSpan.End()
			continue
		}

		err = executor.Execute(testCtxRoot, testCfg, sess.Orchestrator.GetRegistry())
		if err != nil {
			var containerLogs map[string]string
			var errorMsg string

			if testErr, ok := err.(*test.TestError); ok {
				containerLogs = testErr.ContainerLogs
				errorMsg = extractBaseError(testErr.BaseError)
			} else {
				errorMsg = extractBaseError(err)
				containerLogs = sess.Orchestrator.GetAllServiceLogs(sess.Context)
			}
			logger.ErrorContext(testCtx, "test execution failed", "test_name", testCfg.Name, "error", errorMsg)
			result := dto.TestResult{
				Name:          testCfg.Name,
				Type:          testCfg.Type,
				Passed:        false,
				Error:         errorMsg,
				ContainerLogs: containerLogs,
			}
			results = append(results, result)
			failed++
			if persisted != nil {
				_ = h.persistTestResult(ctx, persisted, result, asPersistedInterpolationData(result), time.Now().UTC())
				_ = h.persistCheckpoint(ctx, persisted.ID, idx+1, sessionPhaseFailed, "failed", summarizeResults(results))
			}
			telemetry.RecordError(testCtx, err)
		} else {
			interpolationData := map[string]any{
				"status": "passed",
				"name":   testCfg.Name,
				"type":   testCfg.Type,
			}
			sess.StoreTestResult(testCfg.Name, interpolationData)

			logger.InfoContext(testCtx, "test passed")
			result := dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: true,
			}
			results = append(results, result)
			passed++
			if persisted != nil {
				_ = h.persistTestResult(ctx, persisted, result, interpolationData, time.Now().UTC())
				_ = h.persistCheckpoint(ctx, persisted.ID, idx+1, sessionPhaseRunningTests, "", nil)
			}
		}
		testSpan.End()
	}
	logger.InfoContext(ctx, "tests completed", "total", len(tests), "passed", passed, "failed", failed)
	if persisted != nil {
		finalStatus := "completed"
		finalPhase := sessionPhaseTestsDone
		if failed > 0 {
			finalStatus = "failed"
			finalPhase = sessionPhaseFailed
		}
		_ = h.persistCheckpoint(ctx, persisted.ID, len(tests), finalPhase, finalStatus, summarizeResults(results))
		h.releaseSessionLease(ctx, persisted.ID)
	}

	respondJson(w, http.StatusOK, dto.RunTestReponse{
		SessionID: sessionId,
		Results:   results,
		Summary: dto.TestSummary{
			Total:  len(req.Tests),
			Passed: passed,
			Failed: failed,
		},
	})
}

func (h *Handler) CleanUpSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionID := chi.URLParam(r, "sessionID")

	ctx, span := telemetry.StartSpan(ctx, "api.cleanup_session", telemetry.SessionIDAttr(sessionID))
	defer span.End()

	logger.InfoContext(ctx, "cleaning up session", "session_id", sessionID)

	releaseSlot, err := h.acquireSlot(ctx, h.cleanupSlots, "cleanup")
	if err != nil {
		logger.WarnContext(ctx, "cleanup request rejected by concurrency guard", "error", err)
		http.Error(w, err.Error(), http.StatusTooManyRequests)
		return
	}
	defer releaseSlot()

	if sess, err := h.sessionManager.Get(sessionID); err == nil {
		ctx = withExecutionContext(ctx, executionContextFromSession(sess))
	}

	persisted, _ := h.resolvePersistedSession(ctx, sessionID, nil)
	if persisted != nil {
		_ = h.persistCheckpoint(ctx, persisted.ID, persisted.CheckpointIndex, sessionPhaseCleaningUp, "", nil)
	}

	cleanupCtx, cancel := withOperationTimeout(ctx, h.cleanupTimeout)
	defer cancel()

	if err := h.sessionManager.DeleteWithContext(cleanupCtx, sessionID); err != nil {
		if persisted == nil {
			logger.WarnContext(ctx, "session not found for cleanup", "session_id", sessionID)
			errors.RespondNotFound(w, "session")
			return
		}
		logger.WarnContext(ctx, "cleanup requested without active local runtime", "session_id", sessionID)
		h.releaseSessionLease(ctx, persisted.ID)
		respondJson(w, http.StatusOK, dto.CleanUpReponse{
			SessionID: sessionID,
			Message:   "Session record updated, but no active local runtime was available to clean up remote Docker resources",
		})
		return
	}
	if persisted != nil {
		_ = h.persistCheckpoint(ctx, persisted.ID, persisted.CheckpointIndex, sessionPhaseCompleted, persisted.Status, summarizeResults(nil))
		h.releaseSessionLease(ctx, persisted.ID)
	}
	logger.InfoContext(ctx, "session cleaned up successfully", "session_id", sessionID)
	respondJson(w, http.StatusOK, dto.CleanUpReponse{
		SessionID: sessionID,
		Message:   "Session cleaned up successfully",
	})
}

func respondJson(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func extractBaseError(err error) string {
	if err == nil {
		return ""
	}
	errStr := err.Error()
	if before, _, found := strings.Cut(errStr, "\n--- Container Logs"); found {
		return strings.TrimSpace(before)
	}
	if before, _, found := strings.Cut(errStr, "\n--- All Service Logs"); found {
		return strings.TrimSpace(before)
	}
	return strings.TrimSpace(errStr)
}

func (h *Handler) GetServiceLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionID := chi.URLParam(r, "sessionID")
	serviceName := chi.URLParam(r, "serviceName")

	sess, err := h.sessionManager.Get(sessionID)
	if err != nil {
		if persisted, lookupErr := h.resolvePersistedSession(ctx, sessionID, nil); lookupErr == nil && persisted != nil && persisted.Logs != "" {
			respondJson(w, http.StatusOK, map[string]string{
				"service": serviceName,
				"logs":    persisted.Logs,
			})
			return
		}
		logger.WarnContext(ctx, "session not found", "session_id", sessionID)
		errors.RespondNotFound(w, "session")
		return
	}

	logs, err := sess.Orchestrator.GetLogsForService(sess.Context, serviceName)
	if err != nil {
		logger.WarnContext(ctx, "failed to get service logs", "errors", err, "service_name", serviceName)
		appErr := errors.Wrap(err, errors.ErrServiceNotFound, "failed to get logs")
		errors.ResponseWithError(w, appErr)
		return
	}
	respondJson(w, http.StatusOK, map[string]string{
		"service": serviceName,
		"logs":    logs,
	})
}

func (h *Handler) GetAllServiceLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionID := chi.URLParam(r, "sessionID")

	logger.DebugContext(ctx, "getting all service logs", "session_id", sessionID)

	sess, err := h.sessionManager.Get(sessionID)
	if err != nil {
		if persisted, lookupErr := h.resolvePersistedSession(ctx, sessionID, nil); lookupErr == nil && persisted != nil && persisted.Logs != "" {
			respondJson(w, http.StatusOK, map[string]any{
				"session_id": sessionID,
				"logs":       persisted.Logs,
			})
			return
		}
		logger.WarnContext(ctx, "session not found", "session_id", sessionID)
		errors.RespondNotFound(w, "session")
		return
	}

	logs := sess.Orchestrator.GetAllServiceLogs(sess.Context)
	respondJson(w, http.StatusOK, map[string]any{
		"session_id": sessionID,
		"logs":       logs,
	})
}
