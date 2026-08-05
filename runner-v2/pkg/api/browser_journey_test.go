package api

import (
	"testing"

	"github.com/dev-atharva/cots/pkg/browserjourney"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

func TestAccumulateJourneySummaryKeepsJourneyAndLegacyCountersSeparate(t *testing.T) {
	summary := dto.WorkflowBundleRunSummary{TotalTests: 2, PassedTests: 2}
	accumulateJourneySummary(&summary, &browserjourney.Result{Outcome: "failed", Steps: []browserjourney.StepResult{{Outcome: "passed"}, {Outcome: "failed"}, {Outcome: "skipped"}}})
	if summary.TotalTests != 2 || summary.PassedTests != 2 {
		t.Fatalf("legacy counters changed: %+v", summary)
	}
	if summary.TotalJourneys != 1 || summary.FailedJourneys != 1 || summary.TotalSteps != 3 || summary.PassedSteps != 1 || summary.FailedSteps != 1 || summary.SkippedSteps != 1 {
		t.Fatalf("journey counters = %+v", summary)
	}
}

func TestInterruptedJourneyResponseDoesNotReplaySteps(t *testing.T) {
	response := interruptedJourneyResponse("checkout", "scenario", &workflowbundle.JourneyPlan{Steps: []workflowbundle.ScenarioStep{{ID: "open", Name: "Open", Kind: "action", Action: &workflowbundle.StepAction{Operation: "navigate"}}}}, nil)
	if response.Success || response.Journey == nil || response.Journey.Outcome != "interrupted" || response.Journey.Steps[0].Outcome != "skipped" || response.Journey.Steps[0].SkipReason != "journey-not-started" {
		t.Fatalf("response = %+v", response)
	}
}
