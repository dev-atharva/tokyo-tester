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
	r.Use(middleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.CorsMiddleware)

	if tracingEnabled {
		r.Use(middleware.Tracing)
	}

	r.Post("/services", handler.CreateServices)
	r.Post("/tests/{sessionID}", handler.RunTests)
	r.Delete("/cleanup/{sessionID}", handler.CleanUpSession)
	r.Post("/workflow-bundles/run", handler.RunWorkflowBundle)
	// r.Get("/sessions",hand)

	if syncHandler != nil {
		r.Route("/api/v1/sync", func(r chi.Router) {
			r.Post("/batch", syncHandler.HandleBatch)
			r.Get("/status", syncHandler.HandleStatus)
			r.Get("/pull/{clientId}", syncHandler.HandlePull)
			r.Delete("/clear/{clientId}", syncHandler.HandleClear)
		})
	}

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		respondJson(w, 200, map[string]string{"status": "ok"})
	})

	return r
}
