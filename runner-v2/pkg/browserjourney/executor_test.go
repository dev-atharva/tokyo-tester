package browserjourney

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

func TestResultFromManifestSynthesizesFailFastSuffixAndSanitizesLocation(t *testing.T) {
	request := testRequest([]workflowbundle.ScenarioStep{
		{ID: "open", Name: "Open", Kind: "action", Action: &workflowbundle.StepAction{Operation: "navigate", Path: "/"}},
		{ID: "assert", Name: "Confirmation", Kind: "assertion", Assertion: &workflowbundle.StepAssertion{Operation: "visible", Locator: &workflowbundle.BrowserLocator{Strategy: "text", Value: "Done"}}},
		{ID: "later", Name: "Later", Kind: "control", Control: &workflowbundle.StepControl{Operation: "delay", DurationMs: 10}},
	})
	now := time.Now().UTC()
	result, err := resultFromManifest(request, manifest{
		ProtocolVersion: 1, Success: false, StartedAt: now.Format(time.RFC3339Nano), CompletedAt: now.Add(time.Second).Format(time.RFC3339Nano),
		FinalURL: "http://web:3000/checkout/confirmation?token=secret&locale=en#private", DurationMs: 1000,
		Steps: []manifestStep{
			{ID: "open", Sequence: 0, State: "passed", StartedAt: now.Format(time.RFC3339Nano), CompletedAt: now.Add(time.Millisecond).Format(time.RFC3339Nano), DurationMs: 1},
			{ID: "assert", Sequence: 1, State: "failed", StartedAt: now.Format(time.RFC3339Nano), CompletedAt: now.Add(time.Second).Format(time.RFC3339Nano), DurationMs: 999},
		}, Failure: &stepFailure{ID: "assert", Sequence: 1, Code: "step_failed", Message: "not visible"},
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "failed" || len(result.Steps) != 3 {
		t.Fatalf("result = %+v", result)
	}
	if result.Steps[2].Outcome != "skipped" || result.Steps[2].SkipReason != "prior-step-failed" {
		t.Fatalf("suffix = %+v", result.Steps[2])
	}
	if result.FinalLocation == nil || result.FinalLocation.Path != "/checkout/confirmation" || strings.Join(result.FinalLocation.QueryKeys, ",") != "locale,token" {
		t.Fatalf("location = %+v", result.FinalLocation)
	}
	encoded, _ := json.Marshal(result)
	for _, forbidden := range []string{"http://web", "secret", "#private", "locale=en"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("result leaked %q: %s", forbidden, encoded)
		}
	}
}

func TestValidateRequestRejectsMissingRunSecretBeforeLaunch(t *testing.T) {
	request := testRequest([]workflowbundle.ScenarioStep{{ID: "fill", Name: "Fill", Kind: "action", Action: &workflowbundle.StepAction{Operation: "fill", Locator: &workflowbundle.BrowserLocator{Strategy: "label", Value: "Password"}, Value: &workflowbundle.StepValue{Source: "run-secret", SecretRef: "PASSWORD"}}}})
	if err := validateRequest(request); err == nil || !strings.Contains(err.Error(), "PASSWORD") {
		t.Fatalf("error = %v", err)
	}
	request.RunSecrets, _ = runsecret.New([]string{"PASSWORD"}, []runsecret.SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("sentinel")}})
	defer request.RunSecrets.Destroy()
	if err := validateRequest(request); err != nil {
		t.Fatal(err)
	}
	location := sanitizeLocation("http://web:3000/sentinel?sentinel=value", request.RunSecrets)
	if location.Path != "/[REDACTED]" || len(location.QueryKeys) != 1 || location.QueryKeys[0] != "[REDACTED]" {
		t.Fatalf("location = %+v", location)
	}
}

func TestInterruptedStepsPreserveCompletedWorkAndOnlyInterruptActiveStep(t *testing.T) {
	steps := testRequest([]workflowbundle.ScenarioStep{
		{ID: "one", Name: "One", Kind: "action", Action: &workflowbundle.StepAction{Operation: "navigate"}},
		{ID: "two", Name: "Two", Kind: "action", Action: &workflowbundle.StepAction{Operation: "click"}},
		{ID: "three", Name: "Three", Kind: "assertion", Assertion: &workflowbundle.StepAssertion{Operation: "visible"}},
	}).Plan.Steps
	completed := []StepResult{{StepID: "one", Sequence: 0, Outcome: "passed"}}
	result := interruptedSteps(steps, completed, true, true)
	if result[0].Outcome != "passed" || result[1].Outcome != "interrupted" || result[2].Outcome != "skipped" || result[2].SkipReason != "journey-interrupted" {
		t.Fatalf("result = %+v", result)
	}
	betweenSteps := interruptedSteps(steps, completed, false, true)
	if betweenSteps[1].Outcome != "skipped" || betweenSteps[1].SkipReason != "journey-interrupted" {
		t.Fatalf("between steps = %+v", betweenSteps)
	}
}

func testRequest(steps []workflowbundle.ScenarioStep) Request {
	return Request{ScenarioID: "scenario", Plan: workflowbundle.JourneyPlan{Environment: workflowbundle.JourneyEnvironment{Driver: "browser", Browser: workflowbundle.BrowserEnvironment{TargetService: "web", TargetPort: "3000"}}, Steps: steps}, Environment: ProvisionedEnvironment{Attachment: NewNetworkAttachment("workflow-network")}}
}
