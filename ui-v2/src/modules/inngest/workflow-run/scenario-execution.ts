import {
  translateScenarioToExecutionBundle,
  validateScenario,
} from "@/modules/utils/scenario-translator";
import type {
  CreateServicesResponse,
  JsonValue,
  RunTestsResponse,
  ScenarioExecutionResult,
  WorkflowRunInput,
} from "@/modules/workflow/types/react-flow-cots";
import {
  CLEANUP_MAX_ATTEMPTS,
  CLEANUP_TIMEOUT_MS,
  COTS_API_BASE_URL,
  PROVISION_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
} from "./config";
import { fetchWithTimeout, withRetry } from "./network";
import type { WorkflowRuntime } from "./workflow-runtime";

type WorkflowErrorResponse = {
  error?: string;
  details?: Record<string, string>;
  container_logs?: Record<string, string>;
};

type ServiceGraph = ReturnType<typeof import("@/modules/utils/scenario-translator").translateWorkflowGraphToServiceGraph>;

function formatContainerLogs(logs?: Record<string, string>) {
  if (!logs || Object.keys(logs).length === 0) {
    return "";
  }

  return Object.entries(logs)
    .map(([service, serviceLogs]) => `[${service}]\n${serviceLogs}`)
    .join("\n\n");
}

function buildExecutionContext(
  input: WorkflowRunInput,
  scenario: WorkflowRunInput["scenarios"][number],
) {
  return {
    session_id: scenario.scenarioRunId,
    project_id: scenario.projectId,
    user_id: scenario.user_id || input.userId,
    client_id: scenario.client_id || input.clientId,
    workflow_id: input.workflowId,
    workflow_run_id: input.workflowRunId,
    scenario_id: scenario.id,
    scenario_name: scenario.name,
  };
}

export async function executeScenario(
  runtime: WorkflowRuntime,
  serviceGraph: ServiceGraph,
  scenario: WorkflowRunInput["scenarios"][number],
): Promise<ScenarioExecutionResult> {
  const { input, log, emitScenarioTestResults } = runtime;

  await log(`Preparing scenario "${scenario.name}"`, "running", {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    stage: "validation",
  });

  const validation = validateScenario(serviceGraph, scenario);
  if (!validation.valid) {
    const error = validation.errors.map((item) => item.message).join(", ");
    await log(`Scenario "${scenario.name}" failed validation: ${error}`, "failed", {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      stage: "validation",
      error,
    });

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      success: false,
      status: "failed",
      error,
    };
  }

  const translated = translateScenarioToExecutionBundle(serviceGraph, scenario);
  let backendSessionId: string | undefined;

  try {
    await log(`Scenario "${scenario.name}" translated service bundle`, "running", {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      stage: "provision",
      result: JSON.parse(
        JSON.stringify({
          services: translated.services,
          tests: translated.tests,
        }),
      ) as JsonValue,
    });

    await log(
      `Provisioning ${translated.services.length} services for "${scenario.name}"`,
      "running",
      {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        stage: "provision",
      },
    );

    const provisionRes = await fetchWithTimeout(
      `${COTS_API_BASE_URL}/services`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: translated.services,
          execution_context: buildExecutionContext(input, scenario),
        }),
      },
      PROVISION_TIMEOUT_MS,
    );

    if (!provisionRes.ok) {
      throw new Error(await provisionRes.text());
    }

    const provisionData: CreateServicesResponse = await provisionRes.json();
    backendSessionId = provisionData.session_id;

    await emitScenarioTestResults(
      scenario.id,
      scenario.name,
      backendSessionId,
      translated.tests.map((test) => ({
        testResultId: `${input.workflowRunId}_${scenario.id}_${test.name}`,
        testName: test.name,
        testType: test.type,
        status: "pending",
        resultData: null,
        durationMs: 0,
        executedAt: new Date().toISOString(),
        action: "create",
        sequence: 0,
      })),
    );

    await log(
      `Executing ${translated.tests.length} tests for "${scenario.name}"`,
      "running",
      {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        backendSessionId,
        stage: "execution",
      },
    );

    await emitScenarioTestResults(
      scenario.id,
      scenario.name,
      backendSessionId,
      translated.tests.map((test) => ({
        testResultId: `${input.workflowRunId}_${scenario.id}_${test.name}`,
        testName: test.name,
        testType: test.type,
        status: "running",
        resultData: null,
        durationMs: 0,
        executedAt: new Date().toISOString(),
        action: "update",
        sequence: 0,
      })),
    );

    const testRes = await fetchWithTimeout(
      `${COTS_API_BASE_URL}/tests/${backendSessionId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tests: translated.tests,
          execution_context: buildExecutionContext(input, scenario),
        }),
      },
      TEST_TIMEOUT_MS,
    );

    if (!testRes.ok) {
      const body = await testRes.text();
      let errorMessage = body;
      try {
        const errorData = JSON.parse(body) as WorkflowErrorResponse;
        errorMessage = errorData.error || body;
        if (errorData.container_logs) {
          await log(
            `Scenario "${scenario.name}" failed with container logs:\n${formatContainerLogs(errorData.container_logs)}`,
            "failed",
            {
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              backendSessionId,
              stage: "execution",
              error: errorMessage,
            },
          );
        }
      } catch {}
      throw new Error(errorMessage);
    }

    const testData: RunTestsResponse = await testRes.json();

    await emitScenarioTestResults(
      scenario.id,
      scenario.name,
      backendSessionId,
      testData.results.map((result) => ({
        testResultId: `${input.workflowRunId}_${scenario.id}_${result.name}`,
        testName: result.name,
        testType: result.type,
        status: result.passed ? "passed" : "failed",
        resultData: result,
        durationMs: result.duration || 0,
        executedAt: new Date().toISOString(),
        action: "update",
        containerLogs: result.container_logs,
        sequence: 0,
      })),
    );

    await log(
      `Scenario "${scenario.name}" finished: ${testData.summary.passed} passed, ${testData.summary.failed} failed`,
      testData.summary.failed === 0 ? "completed" : "failed",
      {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        backendSessionId,
        stage: "execution",
      },
    );

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      backendSessionId,
      success: testData.summary.failed === 0,
      status: testData.summary.failed === 0 ? "completed" : "failed",
      testResults: testData,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log(`Scenario "${scenario.name}" failed: ${message}`, "failed", {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      backendSessionId,
      stage: "execution",
      error: message,
    });

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      backendSessionId,
      success: false,
      status: "failed",
      error: message,
    };
  } finally {
    if (backendSessionId) {
      try {
        await withRetry(
          () =>
            fetchWithTimeout(
              `${COTS_API_BASE_URL}/cleanup/${backendSessionId}`,
              {
                method: "DELETE",
              },
              CLEANUP_TIMEOUT_MS,
            ).then(async (response) => {
              if (!response.ok) {
                throw new Error(await response.text());
              }
            }),
          CLEANUP_MAX_ATTEMPTS,
          1500,
        );

        await log(`Cleaned up scenario "${scenario.name}"`, "running", {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          backendSessionId,
          stage: "cleanup",
        });
      } catch (cleanupError) {
        const message =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        await log(`Cleanup for scenario "${scenario.name}" failed: ${message}`, "failed", {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          backendSessionId,
          stage: "cleanup",
          error: message,
        });
      }
    }
  }
}
