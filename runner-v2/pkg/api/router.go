package api

import (
	"net/http"

	"github.com/dev-atharva/cots/pkg/middleware"
	"github.com/dev-atharva/cots/pkg/sync"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

func NewRouter(handler *Handler, syncHandler *sync.Handler, tracingEnabled bool) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Recovery)
	r.Use(middleware.Logging)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.CorsMiddleware)

	if tracingEnabled {
		r.Use(middleware.Tracing)
	}

	r.Post("/services", handler.CreateServices)
	r.Post("/tests/{sessionID}", handler.RunTests)
	r.Delete("/cleanup/{sessionID}", handler.CleanUpSession)
	r.Post("/workflow-bundles/run", handler.RunWorkflowBundle)
	r.Get("/api/v1/workflow-bundles/capabilities", handler.GetWorkflowBundleCapabilities)
	r.Post("/api/v1/workflow-bundles/validate", handler.ValidateWorkflowBundle)
	r.Post("/api/v1/workflow-runs", handler.SubmitWorkflowRun)
	r.Get("/api/v1/workflow-runs/{workflowRunID}", handler.GetWorkflowRun)
	r.Delete("/api/v1/workflow-runs/{workflowRunID}", handler.CancelWorkflowRun)
	r.Get("/api/v1/workflow-runs/{workflowRunID}/events", handler.StreamWorkflowRunEvents)
	r.Get("/api/v1/workflow-runs/{workflowRunID}/logs", handler.ListWorkflowRunLogs)
	r.Get("/api/v1/workflows/{workflowID}/revisions", handler.ListWorkflowRevisions)
	r.Post("/api/v1/workflows/{workflowID}/revisions", handler.CreateWorkflowRevision)
	r.Post("/api/v1/workflows/{workflowID}/revisions/{revisionID}/restore", handler.RestoreWorkflowRevision)
	// r.Get("/sessions",hand)

	if syncHandler != nil {
		r.Route("/api/v1/sync", func(r chi.Router) {
			r.Post("/batch", syncHandler.HandleBatch)
			r.Get("/status", syncHandler.HandleStatus)
			r.Get("/pull/{clientId}", syncHandler.HandlePull)
			r.Delete("/clear/{clientId}", syncHandler.HandleClear)
		})
	}

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		respond := func(status int, body map[string]string) {
			if r.Method == http.MethodHead {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
				return
			}
			respondJson(w, status, body)
		}

		if handler.db == nil {
			respond(http.StatusServiceUnavailable, map[string]string{"status": "unhealthy", "error": "database is not configured"})
			return
		}
		if err := handler.db.Ping(r.Context()); err != nil {
			respond(http.StatusServiceUnavailable, map[string]string{"status": "unhealthy", "error": "database is unavailable"})
			return
		}
		if handler.readinessCheck != nil {
			if err := handler.readinessCheck(r.Context()); err != nil {
				respond(http.StatusServiceUnavailable, map[string]string{"status": "unhealthy", "error": "Docker daemon is unavailable"})
				return
			}
		}
		respond(http.StatusOK, map[string]string{"status": "ok"})
	}
	r.Get("/health", healthHandler)
	r.Head("/health", healthHandler)

	return r
}
