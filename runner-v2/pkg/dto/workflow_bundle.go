package dto

type WorkflowBundleScenarioResponse struct {
	ScenarioName string       `json:"scenario_name"`
	SessionID    string       `json:"session_id"`
	Success      bool         `json:"success"`
	Results      []TestResult `json:"results"`
	Summary      TestSummary  `json:"summary"`
	Error        string       `json:"error,omitempty"`
}

type WorkflowBundleRunSummary struct {
	TotalScenarios  int `json:"total_scenarios"`
	PassedScenarios int `json:"passed_scenarios"`
	FailedScenarios int `json:"failed_scenarios"`
	TotalTests      int `json:"total_tests"`
	PassedTests     int `json:"passed_tests"`
	FailedTests     int `json:"failed_tests"`
}

type WorkflowBundleRunResponse struct {
	WorkflowName string                           `json:"workflow_name"`
	Success      bool                             `json:"success"`
	Summary      WorkflowBundleRunSummary         `json:"summary"`
	Scenarios    []WorkflowBundleScenarioResponse `json:"scenarios"`
}
