package orchestrator

import (
	"context"
	stderrors "errors"
	"io"
	"strings"
	"testing"

	"github.com/testcontainers/testcontainers-go"
)

type logsContainer struct {
	testcontainers.Container
	logs string
	err  error
}

func (c *logsContainer) Logs(context.Context) (io.ReadCloser, error) {
	if c.err != nil {
		return nil, c.err
	}
	return io.NopCloser(strings.NewReader(c.logs)), nil
}

func TestWrapErrorWithLogs(t *testing.T) {
	tests := []struct {
		name      string
		container testcontainers.Container
		wantLogs  string
	}{
		{
			name:      "captures container logs",
			container: &logsContainer{logs: "service failed to start"},
			wantLogs:  "service failed to start",
		},
		{
			name:      "records log retrieval failure",
			container: &logsContainer{err: stderrors.New("logs unavailable")},
			wantLogs:  "Failed to retrieve container logs: failed to retrieve container logs : logs unavailable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			orchestrator := NewOrchestrator(nil)
			orchestrator.containers["api"] = tt.container

			err := orchestrator.WrapErrorWithLogs(
				context.Background(),
				stderrors.New("provisioning failed"),
				"api",
				false,
			)

			enhancedErr, ok := err.(*EnhancedError)
			if !ok {
				t.Fatalf("error type = %T, want *EnhancedError", err)
			}
			if enhancedErr.ContainerLogs != tt.wantLogs {
				t.Fatalf("container logs = %q, want %q", enhancedErr.ContainerLogs, tt.wantLogs)
			}
		})
	}
}

func TestWrapErrorWithLogsReturnsNilForNilError(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	if err := orchestrator.WrapErrorWithLogs(context.Background(), nil, "api", false); err != nil {
		t.Fatalf("error = %v, want nil", err)
	}
}
