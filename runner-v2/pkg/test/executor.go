package test

import (
	"context"
	"fmt"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

type Executor interface {
	// Runs the test and returns error if test fails
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

	return r
}

func (r *Registry) Register(name string, executor Executor) {
	r.executors[name] = executor
}

func (r *Registry) Get(testType string) (Executor, bool) {
	executor, ok := r.executors[testType]
	return executor, ok
}

// Manage test execution with depenency handling
type Runner struct {
	registry   *Registry
	runtimeReg *orchestrator.RuntimeRegsitry
}

func NewRunner(registry *Registry, runtimeReg *orchestrator.RuntimeRegsitry) *Runner {
	return &Runner{
		registry:   registry,
		runtimeReg: runtimeReg,
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
				return fmt.Errorf("test %s failed %w", testName, err)
			}
			fmt.Printf("Test %s passed\n", testName)
		}
	}
	return nil
}
