package test

import (
	"context"
	"fmt"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

type Executor interface {
	Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error
}

type Registry struct {
	executors map[string]Executor
}

func NewRegistory() *Registry {
	r := &Registry{
		executors: make(map[string]Executor),
	}
	r.Register("database", &DatabaseExecutor{})
	r.Register("http", &HTTPExecutor{})
	r.Register("shell", &ShellExecutor{})
	r.Register("cache", &CacheExecutor{})
	r.Register("queue", &QueueExecutor{})
	return r
}

func (r *Registry) Register(name string, executor Executor) {
	r.executors[name] = executor
}

func (r *Registry) Get(testType string) (Executor, bool) {
	executor, ok := r.executors[testType]
	return executor, ok
}

// TestError wraps test execution errors with container logs
type TestError struct {
	TestName      string
	TestType      string
	BaseError     error
	ContainerLogs map[string]string
}

func (e *TestError) Error() string {
	var b strings.Builder

	fmt.Fprintf(&b, "Test '%s' (type: %s) failed: %v",
		e.TestName, e.TestType, e.BaseError)

	if len(e.ContainerLogs) > 0 {
		b.WriteString("\n\n--- Related Container Logs ---")
		for serviceName, logs := range e.ContainerLogs {
			fmt.Fprintf(&b, "\n\n[%s]\n%s", serviceName, logs)
		}
	}

	return b.String()
}

// Manage test execution with dependency handling
type Runner struct {
	registry     *Registry
	runtimeReg   *orchestrator.RuntimeRegsitry
	orchestrator *orchestrator.Orchestrator
}

func NewRunner(registry *Registry, runtimeReg *orchestrator.RuntimeRegsitry, orch *orchestrator.Orchestrator) *Runner {
	return &Runner{
		registry:     registry,
		runtimeReg:   runtimeReg,
		orchestrator: orch,
	}
}

func (r *Runner) RunTests(ctx context.Context, tests []config.TestConfig) error {
	graph := orchestrator.NewDependencyGraph()
	testMap := make(map[string]config.TestConfig)
	for _, test := range tests {
		graph.AddNode(test.Name, test.DependsOn)
		testMap[test.Name] = test
	}

	levels, err := graph.TopologicalSort()
	if err != nil {
		return fmt.Errorf("test dependency resolution failed : %w", err)
	}

	for levelIdx, level := range levels {
		fmt.Printf("\nExecution test level %d: %v\n", levelIdx, level)
		for _, testName := range level {
			testCfg := testMap[testName]
			executor, ok := r.registry.Get(testCfg.Type)
			if !ok {
				return fmt.Errorf("test %s: executor not found for type: %s", testName, testCfg.Type)
			}

			fmt.Printf("Running test : %s (type %s)\n", testName, testCfg.Type)
			if err := executor.Execute(ctx, testCfg, r.runtimeReg); err != nil {
				// Collect logs from all services when test fails
				testErr := &TestError{
					TestName:      testName,
					TestType:      testCfg.Type,
					BaseError:     err,
					ContainerLogs: r.orchestrator.GetAllServiceLogs(ctx),
				}
				return testErr
			}
			fmt.Printf("Test %s passed\n", testName)
		}
	}

	return nil
}

// RunSingleTest runs a single test and returns enhanced error with logs on failure
func (r *Runner) RunSingleTest(ctx context.Context, testCfg config.TestConfig) error {
	executor, ok := r.registry.Get(testCfg.Type)
	if !ok {
		return fmt.Errorf("executor not found for type: %s", testCfg.Type)
	}

	fmt.Printf("Running test: %s (type %s)\n", testCfg.Name, testCfg.Type)
	if err := executor.Execute(ctx, testCfg, r.runtimeReg); err != nil {
		testErr := &TestError{
			TestName:      testCfg.Name,
			TestType:      testCfg.Type,
			BaseError:     err,
			ContainerLogs: r.orchestrator.GetAllServiceLogs(ctx),
		}
		return testErr
	}

	fmt.Printf("Test %s passed\n", testCfg.Name)
	return nil
}
