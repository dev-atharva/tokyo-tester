package browserjourney

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestManagedExecutorReachesWorkflowNetworkAndRunsJourney(t *testing.T) {
	if os.Getenv("RUN_BROWSER_JOURNEY_INTEGRATION") != "1" {
		t.Skip("set RUN_BROWSER_JOURNEY_INTEGRATION=1")
	}
	testcontainers.SkipIfProviderIsNotHealthy(t)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	network, err := network.New(ctx)
	testcontainers.CleanupNetwork(t, network)
	if err != nil {
		t.Fatal(err)
	}
	target, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{ContainerRequest: testcontainers.ContainerRequest{
		Image: "nginx:1.30.4-alpine", Networks: []string{network.Name}, NetworkAliases: map[string][]string{network.Name: {"web"}},
		Files:      []testcontainers.ContainerFile{{Reader: strings.NewReader("<!doctype html><h1>Tokyo Browser Journey</h1><label>Password <input type=password></label>"), ContainerFilePath: "/usr/share/nginx/html/index.html", FileMode: 0o644}},
		WaitingFor: wait.ForLog("start worker processes").WithStartupTimeout(30 * time.Second),
	}, Started: true})
	testcontainers.CleanupContainer(t, target)
	if err != nil {
		t.Fatal(err)
	}

	executor := NewManagedExecutorWithSandbox("tokyo-tester-browser-executor:1.61.0", config.ContainerResourceLimits{MemoryBytes: 1 << 30, NanoCPUs: 1_000_000_000, PIDs: 256}, &FileArtifactSink{Root: t.TempDir()}, false)
	// Docker Desktop cannot provide Chromium's Linux user-namespace sandbox.
	// This opt-out is deliberately private to the integration test; production
	// construction always requires the sandbox and fails closed when unavailable.
	result, err := executor.Execute(ctx, Request{ScenarioID: "browser", Environment: ProvisionedEnvironment{Attachment: NewNetworkAttachment(network.Name)}, Plan: workflowbundle.JourneyPlan{
		Environment: workflowbundle.JourneyEnvironment{Driver: "browser", Browser: workflowbundle.BrowserEnvironment{TargetService: "web", TargetPort: "80"}},
		Steps: []workflowbundle.ScenarioStep{
			{ID: "open", Name: "Open", Kind: "action", Action: &workflowbundle.StepAction{Operation: "navigate", Path: "/"}},
			{ID: "visible", Name: "Heading visible", Kind: "assertion", Assertion: &workflowbundle.StepAssertion{Operation: "visible", Locator: &workflowbundle.BrowserLocator{Strategy: "text", Value: "Tokyo Browser Journey"}}},
		},
	}})
	if err != nil {
		t.Fatalf("execute: %v; result=%+v", err, result)
	}
	if result.Outcome != "passed" || len(result.Steps) != 2 {
		t.Fatalf("result = %+v", result)
	}

	failurePlan := workflowbundle.JourneyPlan{Environment: workflowbundle.JourneyEnvironment{Driver: "browser", Browser: workflowbundle.BrowserEnvironment{TargetService: "web", TargetPort: "80"}}, Steps: []workflowbundle.ScenarioStep{
		{ID: "open", Name: "Open", Kind: "action", Action: &workflowbundle.StepAction{Operation: "navigate", Path: "/"}},
		{ID: "missing", Name: "Missing", Kind: "assertion", TimeoutMs: 250, Assertion: &workflowbundle.StepAssertion{Operation: "visible", Locator: &workflowbundle.BrowserLocator{Strategy: "text", Value: "Not present"}}},
	}}
	failed, err := executor.Execute(ctx, Request{ScenarioID: "failure", Environment: ProvisionedEnvironment{Attachment: NewNetworkAttachment(network.Name)}, Plan: failurePlan, Artifact: ArtifactContext{ProjectID: "p", WorkflowRunID: "r", ScenarioRunID: "plain"}})
	if err != nil || failed.Outcome != "failed" || failed.Evidence.Screenshot.Status != "available" || failed.Evidence.Trace.Status != "available" {
		t.Fatalf("non-secret failure: err=%v result=%+v", err, failed)
	}

	secretPlan := failurePlan
	secretPlan.Steps = []workflowbundle.ScenarioStep{
		failurePlan.Steps[0],
		{ID: "fill", Name: "Fill", Kind: "action", Action: &workflowbundle.StepAction{Operation: "fill", Locator: &workflowbundle.BrowserLocator{Strategy: "label", Value: "Password"}, Value: &workflowbundle.StepValue{Source: "run-secret", SecretRef: "PASSWORD"}}},
		failurePlan.Steps[1],
	}
	secret := "TOKYO_SENTINEL_SECRET_7f4b9a"
	runSecrets, secretErr := runsecret.New([]string{"PASSWORD"}, []runsecret.SuppliedValue{{SecretRef: "PASSWORD", Value: []byte(secret)}})
	if secretErr != nil {
		t.Fatal(secretErr)
	}
	defer runSecrets.Destroy()
	secretFailure, err := executor.Execute(ctx, Request{ScenarioID: "secret", Environment: ProvisionedEnvironment{Attachment: NewNetworkAttachment(network.Name)}, Plan: secretPlan, RunSecrets: runSecrets, Artifact: ArtifactContext{ProjectID: "p", WorkflowRunID: "r", ScenarioRunID: "secret"}})
	encoded, _ := json.Marshal(secretFailure)
	if err != nil || secretFailure.Outcome != "failed" || secretFailure.Evidence.Screenshot.Status != "suppressed" || secretFailure.Evidence.Trace.Status != "suppressed" || strings.Contains(string(encoded), secret) {
		t.Fatalf("secret failure: err=%v result=%+v encoded=%s", err, secretFailure, encoded)
	}

	cancelCtx, cancelJourney := context.WithCancel(ctx)
	time.AfterFunc(1500*time.Millisecond, cancelJourney)
	cancelled, err := executor.Execute(cancelCtx, Request{ScenarioID: "cancel", Environment: ProvisionedEnvironment{Attachment: NewNetworkAttachment(network.Name)}, Plan: workflowbundle.JourneyPlan{Environment: failurePlan.Environment, Steps: []workflowbundle.ScenarioStep{{ID: "wait", Name: "Wait", Kind: "control", Control: &workflowbundle.StepControl{Operation: "delay", DurationMs: 30_000}}}}})
	var runError *RunError
	if !errors.As(err, &runError) || runError.Kind != RunErrorCancellation || !errors.Is(err, context.Canceled) || cancelled.Outcome != "interrupted" {
		t.Fatalf("cancellation: err=%v result=%+v", err, cancelled)
	}
}
