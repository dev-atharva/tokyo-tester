package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dev-atharva/cots/pkg/db"
)

type healthDatabase struct {
	db.Database
	pingErr error
}

func (database healthDatabase) Ping(context.Context) error {
	return database.pingErr
}

func TestHealthSupportsGetAndHead(t *testing.T) {
	router := NewRouter(&Handler{db: healthDatabase{}}, nil, false)

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(method, "/health", nil))

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
			}
			if method == http.MethodHead && recorder.Body.Len() != 0 {
				t.Fatalf("HEAD response body = %q, want empty", recorder.Body.String())
			}
		})
	}
}
