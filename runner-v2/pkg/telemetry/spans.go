package telemetry

import (
	"context"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

func StartSpan(ctx context.Context, spanName string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	tracer := GetTracer()
	return tracer.Start(ctx, spanName, trace.WithAttributes(attrs...))
}

func EndSpan(span trace.Span, err error) {
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	} else {
		span.SetStatus(codes.Ok, "")
	}
	span.End()
}

func AddSpanAttributes(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	if span.IsRecording() {
		span.SetAttributes(attrs...)
	}
}

func AddSpanEvent(ctx context.Context, name string, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	if span.IsRecording() {
		span.AddEvent(name, trace.WithAttributes(attrs...))
	}
}

func RecordError(ctx context.Context, err error) {
	span := trace.SpanFromContext(ctx)
	if span.IsRecording() {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
}

//Common attribure helper functions

func ServiceAttr(serviceName string) attribute.KeyValue {
	return attribute.String("service.name", serviceName)
}

func ServiceTypeAttr(serviceType string) attribute.KeyValue {
	return attribute.String("service.type", serviceType)
}

func TestNameAttr(testName string) attribute.KeyValue {
	return attribute.String("test.name", testName)
}
func TestTypeAttr(testType string) attribute.KeyValue {
	return attribute.String("test.type", testType)
}

func SessionIDAttr(sessionID string) attribute.KeyValue {
	return attribute.String("session.id", sessionID)
}

func WorkflowIDAttr(workflowID string) attribute.KeyValue {
	return attribute.String("workflow.id", workflowID)
}

func WorkflowRunIDAttr(workflowRunID string) attribute.KeyValue {
	return attribute.String("workflow_run.id", workflowRunID)
}

func ScenarioIDAttr(scenarioID string) attribute.KeyValue {
	return attribute.String("scenario.id", scenarioID)
}

func ScenarioNameAttr(scenarioName string) attribute.KeyValue {
	return attribute.String("scenario.name", scenarioName)
}

func BackendSessionIDAttr(backendSessionID string) attribute.KeyValue {
	return attribute.String("backend_session.id", backendSessionID)
}

func ContainerIDAttr(containerID string) attribute.KeyValue {
	return attribute.String("container.id", containerID)
}

func QueryAttr(query string) attribute.KeyValue {
	return attribute.String("db.query", query)
}

func DBTypeAttr(dbType string) attribute.KeyValue {
	return attribute.String("db.Type", dbType)
}

func ClientIDAttr(clientID string) attribute.KeyValue {
	return attribute.String("client.id", clientID)
}

func UserIDAttr(userID string) attribute.KeyValue {
	return attribute.String("user.id", userID)
}
