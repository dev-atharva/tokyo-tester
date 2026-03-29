package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/logger"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				requestID := GetRequestID(r.Context())
				stack := string(debug.Stack())

				logger.Error(
					"panic recovered",
					"request_id", requestID,
					"error", err,
					"method", r.Method,
					"path", r.URL.Path,
					"stack", stack,
				)

				appErr := errors.New(
					errors.ErrInternal,
					fmt.Sprintf("internal server error (request_id: %s)", requestID),
				)

				errors.ResponseWithError(w, appErr)
			}
		}()

		next.ServeHTTP(w, r)
	})
}
