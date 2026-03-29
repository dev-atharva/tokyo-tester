package telemetry

import (
	"context"
	"fmt"
	"time"

	"github.com/dev-atharva/cots/pkg/logger"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.40.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	tracer trace.Tracer
)

type TracerProvider struct {
	provider *sdktrace.TracerProvider
}

func InitTracer(serviceName, collectorURL string) (*TracerProvider, error) {
	ctx := context.Background()

	exporter, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpoint(collectorURL), otlptracehttp.WithInsecure())
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP exporter: %w", err)
	}
	res, err := resource.Merge(resource.Default(), resource.NewWithAttributes(semconv.SchemaURL, semconv.ServiceName(serviceName), semconv.ServiceVersion("1.0.0")))

	if err != nil {
		return nil, fmt.Errorf("hfailed to create resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(sdktrace.WithResource(res), sdktrace.WithSampler(sdktrace.AlwaysSample()), sdktrace.WithBatcher(exporter, sdktrace.WithMaxExportBatchSize(100), sdktrace.WithBatchTimeout(5*time.Second)))

	otel.SetTracerProvider(tp)

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	tracer = tp.Tracer("github.com/dev-atharva/cots")

	logger.Info("OpenTelemetry tracing is initalized", "service_name", serviceName, "collector_url", collectorURL)

	return &TracerProvider{provider: tp}, nil
}

func (tp *TracerProvider) Shutdown(ctx context.Context) error {
	if tp.provider != nil {
		return tp.provider.Shutdown(ctx)
	}
	return nil
}

func GetTracer() trace.Tracer {
	if tracer == nil {
		return otel.Tracer("noop") //Returning a no-op tracer if not initialized
	}
	return tracer
}
