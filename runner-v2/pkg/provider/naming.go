package provider

import (
	"context"
	"regexp"
	"strings"
)

type sessionIDContextKey string

const sessionIDKey sessionIDContextKey = "provider_session_id"

var nonContainerNameChars = regexp.MustCompile(`[^a-zA-Z0-9_.-]+`)

func WithSessionID(ctx context.Context, sessionID string) context.Context {
	if strings.TrimSpace(sessionID) == "" {
		return ctx
	}
	return context.WithValue(ctx, sessionIDKey, sessionID)
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
