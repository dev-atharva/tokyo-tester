package orchestrator

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/testcontainers/testcontainers-go"
)

type ContainerLogger struct {
	maxLines int
}

func NewContainerLogger() *ContainerLogger {
	return &ContainerLogger{
		maxLines: 100,
	}
}

func (c *ContainerLogger) GetLogs(ctx context.Context, container testcontainers.Container) (string, error) {
	if container == nil {
		return "", fmt.Errorf("container is nil")
	}
	logCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	logs, err := container.Logs(logCtx)
	if err != nil {
		return "", fmt.Errorf("failed to retrieve container logs : %w", err)
	}
	defer logs.Close()

	logBytes, err := io.ReadAll(logs)
	if err != nil {
		return "", fmt.Errorf("failed to read container logs : %w", err)
	}

	logString := string(logBytes)

	lines := strings.Split(logString, "\n")
	if len(lines) > c.maxLines {
		lines = lines[len(lines)-c.maxLines:]
		logString = strings.Join(lines, "\n")
	}
	return logString, nil
}

func (o *Orchestrator) GetLogsForService(ctx context.Context, serviceName string) (string, error) {
	o.mu.RLock()
	container, exists := o.containers[serviceName]
	o.mu.RUnlock()
	if !exists {
		return "", fmt.Errorf("service %s not found", serviceName)
	}
	logger := NewContainerLogger()
	return logger.GetLogs(ctx, container)
}

func (o *Orchestrator) GetAllServiceLogs(ctx context.Context) map[string]string {
	o.mu.RLock()
	defer o.mu.RUnlock()

	logs := make(map[string]string)
	logger := NewContainerLogger()

	for name, container := range o.containers {
		containerLogs, err := logger.GetLogs(ctx, container)
		if err != nil {
			logs[name] = fmt.Sprintf("Failed to retrieve logs: %v", err)
		} else {
			logs[name] = containerLogs
		}
	}
	return logs
}

type EnhancedError struct {
	BaseError      error
	ServiceName    string
	ContainerLogs  string
	AllServiceLogs map[string]string
}

func (e *EnhancedError) Error() string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Error: %v\n", e.BaseError)

	if e.ServiceName != "" {
		fmt.Fprintf(&sb, "\nService: %s\n", e.ServiceName)
	}
	if e.ContainerLogs != "" {
		fmt.Fprintf(&sb, "\n--- Container Logs (last 100 lines) ---\n%s\n", e.ContainerLogs)
	}
	if len(e.AllServiceLogs) > 0 {
		sb.WriteString("\n--- All Service Logs ---\n")
		for serviceName, logs := range e.AllServiceLogs {
			fmt.Fprintf(&sb, "\n[%s]\n%s\n", serviceName, logs)
		}
	}
	return sb.String()
}

func (o *Orchestrator) WrapErrorWithLogs(ctx context.Context, err error, serviceName string, includeAllLogs bool) error {
	if err == nil {
		return nil
	}
	enhancedErr := &EnhancedError{
		BaseError:   err,
		ServiceName: serviceName,
	}

	if serviceName != "" {
		logs, logErr := o.GetLogsForService(ctx, serviceName)
		if logErr != nil {
			enhancedErr.ContainerLogs = logs
		}
	}

	if includeAllLogs {
		enhancedErr.AllServiceLogs = o.GetAllServiceLogs(ctx)
	}
	return enhancedErr
}
