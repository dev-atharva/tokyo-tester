package api

import (
	"net/http"
	"os"

	"github.com/dev-atharva/cots/pkg/sync"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := os.Getenv("CORS_ORIGIN")
		if origin == "" {
			origin = "http://localhost:3000"
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func NewRouter(handler *Handler, syncHandler *sync.Handler) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(corsMiddleware)

	r.Post("/services", handler.CreateServices)
	r.Post("/tests/{sessionID}", handler.RunTests)
	r.Delete("/cleanup/{sessionID}", handler.CleanUpSession)
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
