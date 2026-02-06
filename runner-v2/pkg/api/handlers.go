package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/provider/predefined"
	"github.com/dev-atharva/cots/pkg/session"
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

type CreateServicesRequest struct {
	Services []config.ServiceConfig `json:"services"`
}

type CreateServicesResponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

type RunTestsRequest struct {
	Tests []config.TestConfig `json:"tests"`
}

type RunTestsResponse struct {
	SessionID string       `json:"session_id"`
	Results   []TestResult `json:"results"`
	Summary   TestSummary  `json:"summary"`
}

type TestResult struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Passed bool   `json:"passed"`
	Error  string `json:"error,omitempty"`
}

type TestSummary struct {
	Total  int `json:"total"`
	Passed int `json:"passed"`
	Failed int `json:"failed"`
}

type CleanupResponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// Create services handles /services post request
func (h *Handler) CreateServices(w http.ResponseWriter, r *http.Request) {
	var req CreateServicesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body ,%v", err))
		return
	}

	if len(req.Services) == 0 {
		respondError(w, http.StatusBadRequest, "services array cannot be empty")
		return
	}

	//validate configuration
	cfg := &config.Config{Services: req.Services}
	if err := validateServices(cfg); err != nil {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("invalid configuration: %v", err))
		return
	}

	// Check for circular dependency
	graph := orchestrator.NewDependencyGraph()
	for _, svc := range req.Services {
		graph.AddNode(svc.Name, svc.DependsOn)
	}
	if _, err := graph.TopologicalSort(); err != nil {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("dependeny error: %v", err))
		return
	}

	orch := orchestrator.NewOrchestrator(h.providers)
	sessionID := h.sessionManager.Create(orch)

	sess, _ := h.sessionManager.Get(sessionID)
	if err := orch.ProvisionServices(sess.Context, req.Services); err != nil {
		h.sessionManager.Delete(sessionID)
		respondError(w, http.StatusInternalServerError, fmt.Sprintf("failed to provision services: %v", err))
		return
	}
	respondJson(w, http.StatusCreated, CreateServicesResponse{
		SessionID: sessionID,
		Message:   fmt.Sprintf("Successfully provisioned %d services", len(req.Services)),
	})
}

// RunTests handles Post request to /tests/{SessionID}
func (h *Handler) RunTests(w http.ResponseWriter, r *http.Request) {
	sessionId := chi.URLParam(r, "sessionID")

	var req RunTestsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("invalid request body: %v", err))
		return
	}

	if len(req.Tests) == 0 {
		respondError(w, http.StatusBadRequest, "test arrya cannot be empty")
		return
	}

	sess, err := h.sessionManager.Get(sessionId)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	testRegistry := test.NewRegistory()

	results := []TestResult{}
	passed := 0
	failed := 0

	for _, testCfg := range req.Tests {
		interpolatedConfig, err := test.InterpolateTestConfig(testCfg.Config, sess)
		if err != nil {
			results = append(results, TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("config interpolation failed : %v", err),
			})
			failed++
			continue
		}
		testCfg.Config = interpolatedConfig

		executor, ok := testRegistry.Get(testCfg.Type)
		if !ok {
			results = append(results, TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  fmt.Sprintf("executor bot found for type %s", testCfg.Type),
			})
			failed++
			continue
		}

		err = executor.Execute(sess.Context, testCfg, sess.Orchestrator.GetRegistry())
		if err != nil {
			results = append(results, TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: false,
				Error:  err.Error(),
			})
			failed++
		} else {
			sess.StoreTestResult(testCfg.Name, map[string]any{
				"status": "passed",
				"name":   testCfg.Name,
				"type":   testCfg.Type,
			})

			results = append(results, TestResult{
				Name:   testCfg.Name,
				Type:   testCfg.Type,
				Passed: true,
			})
			passed++
		}
	}

	respondJson(w, http.StatusOK, RunTestsResponse{
		SessionID: sessionId,
		Results:   results,
		Summary: TestSummary{
			Total:  len(req.Tests),
			Passed: passed,
			Failed: failed,
		},
	})
}

func (h *Handler) CleanUpSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	if err := h.sessionManager.Delete(sessionID); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	respondJson(w, http.StatusOK, CleanupResponse{
		SessionID: sessionID,
		Message:   "Session cleaned up successfully",
	})
}

func validateServices(cfg *config.Config) error {
	serviceNames := make(map[string]bool)

	for _, svc := range cfg.Services {
		if svc.Name == "" {
			return fmt.Errorf("service name cannot be empty")
		}
		if serviceNames[svc.Name] {
			return fmt.Errorf("duplicate service name %s", svc.Name)
		}
		serviceNames[svc.Name] = true

		if svc.Type == "" {
			return fmt.Errorf("service type cannot be empty ")
		}

		if svc.Type == "generic" && svc.Image == "" {
			return fmt.Errorf("service %s: geenric type requires an image", svc.Image)
		}
	}
	return nil
}

func respondJson(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJson(w, status, ErrorResponse{Error: message})
}
