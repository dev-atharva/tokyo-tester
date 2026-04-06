import type {
  ScenarioExecutionResult,
  WorkflowResult,
} from "@/modules/workflow/types/react-flow-cots";

export function summarizeScenarioResults(scenarioResults: ScenarioExecutionResult[]) {
  return scenarioResults.reduce(
    (acc, scenario) => {
      acc.totalScenarios += 1;
      if (scenario.success) {
        acc.passedScenarios += 1;
      } else {
        acc.failedScenarios += 1;
      }

      const tests = scenario.testResults?.summary;
      if (tests) {
        acc.totalTests += tests.total;
        acc.passedTests += tests.passed;
        acc.failedTests += tests.failed;
      }

      return acc;
    },
    {
      totalScenarios: 0,
      passedScenarios: 0,
      failedScenarios: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
    },
  );
}

export function toWorkflowResult(
  workflowRunId: string,
  scenarioResults: ScenarioExecutionResult[],
): WorkflowResult {
  const summary = summarizeScenarioResults(scenarioResults);
  const success = summary.failedScenarios === 0;

  return {
    success,
    workflowRunId,
    scenarioResults,
    summary,
  };
}
