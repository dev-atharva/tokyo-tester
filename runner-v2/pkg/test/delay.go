package test

import (
	"context"
	"fmt"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

type DelayExecutor struct{}

func (e *DelayExecutor) Execute(ctx context.Context, testCfg config.TestConfig, _ *orchestrator.RuntimeRegsitry) error {
	rawDuration, ok := testCfg.Config["duration_ms"]
	if !ok {
		return fmt.Errorf("delay test requires 'duration_ms' in the configuration")
	}

	var durationMs int
	switch value := rawDuration.(type) {
	case int:
		durationMs = value
	case int32:
		durationMs = int(value)
	case int64:
		durationMs = int(value)
	case float64:
		durationMs = int(value)
	default:
		return fmt.Errorf("duration_ms must be a number, got %T", rawDuration)
	}

	if durationMs <= 0 {
		return fmt.Errorf("duration_ms must be greater than 0")
	}

	timer := time.NewTimer(time.Duration(durationMs) * time.Millisecond)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return fmt.Errorf("delay interrupted: %w", ctx.Err())
	case <-timer.C:
		return nil
	}
}
