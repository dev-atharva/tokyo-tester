package test

import (
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

type ShellExecutor struct{}

func (e *ShellExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	command, ok := testCfg.Config["command"].(string)
	if !ok {
		return fmt.Errorf("shell test requires 'command' in configuration")
	}

	env := e.buildEnvironment(registry, testCfg.Config)

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Env = env

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("command failed %w\nOutput: %s", err, string(output))
	}

	if expectedOutput, ok := testCfg.Config["expected_output"].(string); ok {
		if !strings.Contains(string(output), expectedOutput) {
			return fmt.Errorf("output does not match expected string: %s\n ActualOutput: %s", expectedOutput, string(output))
		}
	}

	if expectedCode, ok := testCfg.Config["expected_exit_code"].(int); ok {
		if cmd.ProcessState.ExitCode() != expectedCode {
			return fmt.Errorf("expected exit code %d, got %d", expectedCode, cmd.ProcessState.ExitCode())
		}
	}

	return nil
}

func (e *ShellExecutor) buildEnvironment(registry *orchestrator.RuntimeRegsitry, cfg map[string]any) []string {
	env := []string{}

	if envVars, ok := cfg["env"].(map[string]any); ok {
		for key, val := range envVars {
			if strVal, ok := val.(string); ok {
				interpolated, err := registry.InterpolateEnvVars(map[string]string{key: strVal})
				if err == nil {
					env = append(env, fmt.Sprintf("%s=%s", key, interpolated[key]))
				}
			}
		}
	}

	return env
}
