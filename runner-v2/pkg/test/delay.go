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
	_, found, err := lookupConfigValue(testCfg.Config, "duration_ms")
	if err != nil {
		return ConfigurationFailure(err)
	}
	if !found {
		return ConfigurationFailure(fmt.Errorf("delay test requires 'duration_ms' in the configuration"))
	}
	durationMs, err := getIntOrDefault(testCfg.Config, "duration_ms", 0)
	if err != nil {
		return ConfigurationFailure(err)
	}

	if durationMs <= 0 {
		return ConfigurationFailure(fmt.Errorf("duration_ms must be greater than 0"))
	}

	timer := time.NewTimer(time.Duration(durationMs) * time.Millisecond)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
