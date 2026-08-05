package dto

import (
	"github.com/dev-atharva/cots/pkg/browserjourney"
	"github.com/dev-atharva/cots/pkg/executionevent"
)

type WorkflowBundleScenarioResponse struct {
	ScenarioName  string                      `json:"scenario_name"`
	SessionID     string                      `json:"session_id"`
	Success       bool                        `json:"success"`
	CleanupFailed bool                        `json:"cleanup_failed,omitempty"`
	Results       []TestResult                `json:"results"`
	Journey       *browserjourney.Result      `json:"journey,omitempty"`
	Summary       TestSummary                 `json:"summary"`
	Error         string                      `json:"error,omitempty"`
	Diagnostics   []executionevent.Diagnostic `json:"diagnostics,omitempty"`
}

type WorkflowBundleRunSummary struct {
	TotalScenarios      int `json:"total_scenarios"`
	PassedScenarios     int `json:"passed_scenarios"`
	FailedScenarios     int `json:"failed_scenarios"`
	TotalTests          int `json:"total_tests"`
	PassedTests         int `json:"passed_tests"`
	FailedTests         int `json:"failed_tests"`
	RetriedTests        int `json:"retried_tests,omitempty"`
	TotalJourneys       int `json:"total_journeys,omitempty"`
	PassedJourneys      int `json:"passed_journeys,omitempty"`
	FailedJourneys      int `json:"failed_journeys,omitempty"`
	InterruptedJourneys int `json:"interrupted_journeys,omitempty"`
	TotalSteps          int `json:"total_steps,omitempty"`
	PassedSteps         int `json:"passed_steps,omitempty"`
	FailedSteps         int `json:"failed_steps,omitempty"`
	SkippedSteps        int `json:"skipped_steps,omitempty"`
	InterruptedSteps    int `json:"interrupted_steps,omitempty"`
}

type WorkflowBundleRunResponse struct {
	WorkflowName string                           `json:"workflow_name"`
	Success      bool                             `json:"success"`
	Summary      WorkflowBundleRunSummary         `json:"summary"`
	Scenarios    []WorkflowBundleScenarioResponse `json:"scenarios"`
}
