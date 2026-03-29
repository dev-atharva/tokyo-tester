package middleware

import (
	"net/http"

	"github.com/dev-atharva/cots/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
)

func Tracing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		ctx, span := telemetry.StartSpan(ctx, "http.request",
			attribute.String("http.method", r.Method),
			attribute.String("http.target", r.URL.Path),
			attribute.String("http.scheme", r.URL.Scheme),
			semconv.HTTPRoute(r.URL.Path),
			attribute.String("http.user_agent", r.UserAgent()),
			attribute.String("http.remote_addr", r.RemoteAddr),
		)
		defer span.End()

		requestID := GetRequestID(ctx)
		if requestID != "" {
			telemetry.AddSpanAttributes(ctx, attribute.String("request.id", requestID))
		}

		wrapped := newRepsonseWriter(w)

		next.ServeHTTP(wrapped, r.WithContext(ctx))

		telemetry.AddSpanAttributes(ctx, semconv.HTTPResponseStatusCode(wrapped.statusCode), attribute.Int64("http.response_size", wrapped.written))

		if wrapped.statusCode >= 400 {
			telemetry.AddSpanAttributes(ctx, attribute.Bool("error", true))
		}
	})

}
