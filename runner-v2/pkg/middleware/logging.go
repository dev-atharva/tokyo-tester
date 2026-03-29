package middleware

import (
	"net/http"
	"time"

	"github.com/dev-atharva/cots/pkg/logger"
)

type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    int64
}

func newRepsonseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
	}
}

func (rw *responseWriter) WriteHeader(statusCode int) {
	rw.statusCode = statusCode
	rw.ResponseWriter.WriteHeader(statusCode)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(b)
	rw.written += int64(n)
	return n, err
}

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := newRepsonseWriter(w)

		requestID := GetRequestID(r.Context())

		logger.Info("http request started", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "remote_addr", r.RemoteAddr, "user_agent", r.UserAgent())

		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)

		logger.Info("http request completed", "request_id", requestID, "method", r.Method, "path", r.URL.Path, "status", wrapped.statusCode, "duration_ms", duration.Milliseconds(), "bytes_written", wrapped.written)
	})
}
