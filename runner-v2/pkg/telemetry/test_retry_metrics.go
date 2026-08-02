package telemetry

import (
	"context"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var (
	retryMetricsOnce sync.Once
	retriesScheduled metric.Int64Counter
	retriesRecovered metric.Int64Counter
	retriesExhausted metric.Int64Counter
)

func initRetryMetrics() {
	meter := otel.Meter("github.com/dev-atharva/cots/test-retries")
	retriesScheduled, _ = meter.Int64Counter("tokyo_test_retries_scheduled_total")
	retriesRecovered, _ = meter.Int64Counter("tokyo_test_retries_recovered_total")
	retriesExhausted, _ = meter.Int64Counter("tokyo_test_retries_exhausted_total")
}

func RecordTestRetryScheduled(ctx context.Context, testType, reason string) {
	retryMetricsOnce.Do(initRetryMetrics)
	if retriesScheduled != nil {
		retriesScheduled.Add(ctx, 1, metric.WithAttributes(
			attribute.String("test.type", testType),
			attribute.String("retry.reason", reason),
		))
	}
}

func RecordTestRetryRecovered(ctx context.Context, testType, reason string) {
	retryMetricsOnce.Do(initRetryMetrics)
	if retriesRecovered != nil {
		retriesRecovered.Add(ctx, 1, metric.WithAttributes(
			attribute.String("test.type", testType),
			attribute.String("retry.reason", reason),
		))
	}
}

func RecordTestRetryExhausted(ctx context.Context, testType, reason string) {
	retryMetricsOnce.Do(initRetryMetrics)
	if retriesExhausted != nil {
		retriesExhausted.Add(ctx, 1, metric.WithAttributes(
			attribute.String("test.type", testType),
			attribute.String("retry.reason", reason),
		))
	}
}
