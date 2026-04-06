package provider

import (
	"context"
	"regexp"
	"strings"
)

type sessionIDContextKey string
type resourceMetadataContextKey string

const sessionIDKey sessionIDContextKey = "provider_session_id"
const resourceMetadataKey resourceMetadataContextKey = "provider_resource_metadata"

var nonContainerNameChars = regexp.MustCompile(`[^a-zA-Z0-9_.-]+`)

const (
	LabelManaged          = "cots.managed"
	LabelResourceType     = "cots.resource_type"
	LabelSessionID        = "cots.session_id"
	LabelBackendSessionID = "cots.backend_session_id"
	LabelWorkflowID       = "cots.workflow_id"
	LabelWorkflowRunID    = "cots.workflow_run_id"
	LabelScenarioID       = "cots.scenario_id"

	ResourceTypeContainer = "container"
	ResourceTypeNetwork   = "network"
)

type ResourceMetadata struct {
	SessionID        string
	BackendSessionID string
	WorkflowID       string
	WorkflowRunID    string
	ScenarioID       string
}

func WithSessionID(ctx context.Context, sessionID string) context.Context {
	if strings.TrimSpace(sessionID) == "" {
		return ctx
	}
	return context.WithValue(ctx, sessionIDKey, sessionID)
}

func WithResourceMetadata(ctx context.Context, metadata ResourceMetadata) context.Context {
	if strings.TrimSpace(metadata.SessionID) == "" &&
		strings.TrimSpace(metadata.BackendSessionID) == "" &&
		strings.TrimSpace(metadata.WorkflowID) == "" &&
		strings.TrimSpace(metadata.WorkflowRunID) == "" &&
		strings.TrimSpace(metadata.ScenarioID) == "" {
		return ctx
	}
	return context.WithValue(ctx, resourceMetadataKey, metadata)
}

func ResourceLabels(ctx context.Context, resourceType string) map[string]string {
	labels := map[string]string{
		LabelManaged:      "true",
		LabelResourceType: resourceType,
	}

	metadata, _ := ctx.Value(resourceMetadataKey).(ResourceMetadata)
	if sessionID, _ := ctx.Value(sessionIDKey).(string); strings.TrimSpace(sessionID) != "" {
		labels[LabelBackendSessionID] = sessionID
	}
	if value := strings.TrimSpace(metadata.BackendSessionID); value != "" {
		labels[LabelBackendSessionID] = value
	}
	if value := strings.TrimSpace(metadata.SessionID); value != "" {
		labels[LabelSessionID] = value
	} else if value := strings.TrimSpace(labels[LabelBackendSessionID]); value != "" {
		labels[LabelSessionID] = value
	}
	if value := strings.TrimSpace(metadata.WorkflowID); value != "" {
		labels[LabelWorkflowID] = value
	}
	if value := strings.TrimSpace(metadata.WorkflowRunID); value != "" {
		labels[LabelWorkflowRunID] = value
	}
	if value := strings.TrimSpace(metadata.ScenarioID); value != "" {
		labels[LabelScenarioID] = value
	}

	return labels
}

func ContainerName(ctx context.Context, serviceName string) string {
	base := sanitizeContainerName(serviceName)
	if base == "" {
		base = "service"
	}

	sessionID, _ := ctx.Value(sessionIDKey).(string)
	sessionID = sanitizeContainerName(shortSessionID(sessionID))
	if sessionID == "" {
		return base
	}

	return truncateContainerName(base + "-" + sessionID)
}

func shortSessionID(sessionID string) string {
	if idx := strings.Index(sessionID, "-"); idx > 0 {
		return sessionID[:idx]
	}
	if len(sessionID) > 12 {
		return sessionID[:12]
	}
	return sessionID
}

func sanitizeContainerName(value string) string {
	sanitized := nonContainerNameChars.ReplaceAllString(strings.TrimSpace(value), "-")
	sanitized = strings.Trim(sanitized, "-_.")
	return sanitized
}

func truncateContainerName(value string) string {
	const maxLength = 63
	if len(value) <= maxLength {
		return value
	}
	return strings.TrimRight(value[:maxLength], "-_.")
}
