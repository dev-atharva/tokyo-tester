package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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
)

type Handler struct {
	sessionManager *session.Manager
	providers      *provider.Registry
}

func NewHandler() *Handler {
	providers := provider.NewRegistry()

	providers.Register("postgres", &predefined.PostgresProvider{})
	providers.Register("mysql", &predefined.MysqlProvider{})
	providers.Register("mariadb", &predefined.MariaDbProvider{})
	providers.Register("redis", &predefined.RedisProvider{})
	providers.Register("memcached", &predefined.MemcachedProvider{})
	providers.Register("kafka", &predefined.KafkaProvider{})

	return &Handler{
		sessionManager: session.NewManager(),
		providers:      providers,
	}
}

// Create services handles /services post request
func (h *Handler) CreateServices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.GetRequestID(ctx)

	ctx, span := telemetry.StartSpan(ctx, "api.create_services")
	defer span.End()

	logger.InfoContext(ctx, "creating services", "requet_id", requestID)

	var req dto.CreateServicesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.WarnContext(ctx, "invalid request body", "error", err)
		errors.ResponseBadRequest(w, "invalid request body")
		return
	}

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
	sessionID := h.sessionManager.Create(orch)
	telemetry.AddSpanAttributes(ctx, telemetry.SessionIDAttr(sessionID))

	sess, _ := h.sessionManager.Get(sessionID)
	if err := orch.ProvisionServices(sess.Context, services); err != nil {
		logger.ErrorContext(ctx, "service provisioning failed", "error", err, "session_id", sessionID)

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
	logger.InfoContext(ctx, "services provisioned successfully", "session_id", sessionID, "count", len(services))

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

	var req dto.RunTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.WarnContext(ctx, "invalid request body", "error", err)
		errors.ResponseBadRequest(w, "invalid request body")
		return
	}

	if err := dto.Validate(req); err != nil {
		fieldErros := dto.FormatValidationErrors(err)
		logger.WarnContext(ctx, "validation failed", "errors", fieldErros)
		errors.RespondValidationError(w, "validation failed", fieldErros)
		return
	}

	sess, err := h.sessionManager.Get(sessionId)
	if err != nil {
		logger.WarnContext(ctx, "session not found", "session_id", sessionId)
		errors.RespondNotFound(w, "session")
		return
	}

	tests := req.ToConfigList()
	telemetry.AddSpanAttributes(ctx, telemetry.TestNameAttr(fmt.Sprintf("%d tests", len(tests))))

	testRegistry := test.NewRegistory()

	results := []dto.TestResult{}
	passed := 0
	failed := 0

	for _, testCfg := range tests {

		testCtx, testSpan := telemetry.StartSpan(ctx, "test.execute", telemetry.TestNameAttr(testCfg.Name), telemetry.TestTypeAttr(testCfg.Type))

		logger.DebugContext(ctx, "executing test", "test_name", testCfg.Name, "test_type", testCfg.Type)

		interpolatedConfig, err := test.InterpolateTestConfig(testCfg.Config, sess)
		if err != nil {
			results = append(results, dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("config interpolation failed : %v", err),
			})
			failed++
			telemetry.RecordError(testCtx, err)
			testSpan.End()
			continue
		}
		testCfg.Config = interpolatedConfig

		executor, ok := testRegistry.Get(testCfg.Type)
		if !ok {
			results = append(results, dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("executor not found for type %s", testCfg.Type),
			})
			failed++
			testSpan.End()
			continue
		}

		err = executor.Execute(sess.Context, testCfg, sess.Orchestrator.GetRegistry())
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
			results = append(results, dto.TestResult{
				Name:          testCfg.Name,
				Type:          testCfg.Type,
				Passed:        false,
				Error:         errorMsg,
				ContainerLogs: containerLogs,
			})
			failed++
			telemetry.RecordError(testCtx, err)
		} else {
			sess.StoreTestResult(testCfg.Name, map[string]any{
				"status": "passed",
				"name":   testCfg.Name,
				"type":   testCfg.Type,
			})

			logger.InfoContext(ctx, "test passed", "test_name", testCfg.Name)
			results = append(results, dto.TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: true,
			})
			passed++
		}
		testSpan.End()
	}
	logger.InfoContext(ctx, "tests completed", "session_id", sessionId, "total", len(tests), "passed", passed, "failed", failed)

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

	if err := h.sessionManager.Delete(sessionID); err != nil {
		logger.WarnContext(ctx, "session not found for cleanup", "session_id", sessionID)
		errors.RespondNotFound(w, "session")
		return
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
