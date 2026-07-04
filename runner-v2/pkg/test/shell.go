package test

import (
	"context"
	"fmt"
	"os"
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

	env, err := e.buildEnvironment(registry, testCfg.Config)
	if err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Env = env

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("command failed %w\nOutput: %s", err, string(output))
	}

	expectedOutputValue, ok, err := lookupConfigValue(testCfg.Config, "expected_output")
	if err != nil {
		return err
	}
	if ok {
		expectedOutput, ok := expectedOutputValue.(string)
		if !ok {
			return fmt.Errorf("expected_output must be a string")
		}
		if !strings.Contains(string(output), expectedOutput) {
			return fmt.Errorf("output does not match expected string: %s\n ActualOutput: %s", expectedOutput, string(output))
		}
	}

	if expectedCode, found, err := getInt64Config(testCfg.Config, "expected_exit_code"); err != nil {
		return err
	} else if found {
		if cmd.ProcessState.ExitCode() != int(expectedCode) {
			return fmt.Errorf("expected exit code %d, got %d", expectedCode, cmd.ProcessState.ExitCode())
		}
	}

	return nil
}

func (e *ShellExecutor) buildEnvironment(registry *orchestrator.RuntimeRegsitry, cfg map[string]any) ([]string, error) {
	env := os.Environ()
	envVars, _, err := getStringMap(cfg, "env")
	if err != nil {
		return nil, err
	}
	for key, value := range envVars {
		interpolated, err := registry.InterpolateEnvVars(map[string]string{key: value})
		if err != nil {
			return nil, fmt.Errorf("failed to interpolate shell environment variable %s: %w", key, err)
		}
		env = append(env, fmt.Sprintf("%s=%s", key, interpolated[key]))
	}
	return env, nil
}
