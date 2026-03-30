import { channel, topic } from "@inngest/realtime";
import { z } from "zod";
import {
  translateScenarioToExecutionBundle,
  translateWorkflowGraphToServiceGraph,
  validateScenario,
  validateWorkflowGraph,
} from "@/modules/utils/scenario-translator";
import type {
  CreateServicesResponse,
  JsonValue,
  RunTestsResponse,
  ScenarioExecutionResult,
  ScenarioTestResultEvent,
  WorkflowLogEvent,
  WorkflowResult,
  WorkflowRunInput,
} from "@/modules/workflow/types/react-flow-cots";
import { inngest } from "../client";

const COTS_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type WorkflowErrorResponse = {
  error?: string;
  details?: Record<string, string>;
  container_logs?: Record<string, string>;
};

export const logsChannel = channel("logs").addTopic(
  topic("workflowlog").type<WorkflowLogEvent>(),
);

export const testResultChannel = channel("testResult").addTopic(
  topic("testresult").schema(
    z.object({
      workflowRunId: z.string(),
      workflowId: z.string(),
      scenarioId: z.string(),
      scenarioName: z.string(),
      backendSessionId: z.string().optional(),
      bulkId: z.string(),
      timestamp: z.number(),
      results: z.array(
        z.object({
          testResultId: z.string(),
          testName: z.string(),
          testType: z.string().optional(),
          status: z.string(),
          resultData: z.unknown().optional(),
          durationMs: z.number().optional(),
          executedAt: z.string().optional(),
          action: z.enum(["create", "update"]),
          containerLogs: z.record(z.string()).optional(),
          sequence: z.number(),
        }),
      ),
    }) satisfies z.ZodType<ScenarioTestResultEvent>,
  ),
);

export const cotsWorkFlow = inngest.createFunction(
  {
    id: "cots-workflow-run",
    name: "COTS Scenario Workflow Run",
    retries: 0,
  },
  { event: "cots/workflow.run.start" },
  async ({ event, step, publish }) => {
    const input = event.data as WorkflowRunInput;
    const { workflowRunId, workflowId, workflowName } = input;
    let logSequence = 0;
    let testSequence = 0;

    const log = async (
      message: string,
      status: WorkflowLogEvent["status"] = "running",
      extra?: Partial<WorkflowLogEvent>,
    ) =>
      publish(
        logsChannel().workflowlog({
          workflowRunId,
          workflowId,
          message,
          status,
          timestamp: Date.now(),
          sequence: logSequence++,
          ...extra,
        }),
      );

    const emitScenarioTestResults = async (
      scenarioId: string,
      scenarioName: string,
      backendSessionId: string | undefined,
      results: ScenarioTestResultEvent["results"],
    ) => {
      if (results.length === 0) {
        return;
      }

      return publish(
        testResultChannel().testresult({
          workflowRunId,
          workflowId,
          scenarioId,
          scenarioName,
          backendSessionId,
          bulkId: `${workflowRunId}:${scenarioId}:${Date.now()}`,
          timestamp: Date.now(),
          results: results.map((result) => ({
            ...result,
            sequence: testSequence++,
          })),
        }),
      );
    };

    const formatContainerLogs = (logs?: Record<string, string>) => {
      if (!logs || Object.keys(logs).length === 0) {
        return "";
      }

      return Object.entries(logs)
        .map(([service, serviceLogs]) => `[${service}]\n${serviceLogs}`)
        .join("\n\n");
    };

    await log(`Starting workflow run: ${workflowName}`);

    const workflowValidation = validateWorkflowGraph(input.nodes, input.edges);
    if (!workflowValidation.valid) {
      const message = workflowValidation.errors.map((error) => error.message).join(", ");
      await log(`Workflow validation failed: ${message}`, "failed", {
        stage: "validation",
        error: message,
      });
      throw new Error(message);
    }

    const serviceGraph = translateWorkflowGraphToServiceGraph(
      input.nodes,
      input.edges,
      input.registrySecrets,
    );

    const scenarioResults = await step.run("execute-scenarios", async () => {
      return Promise.all(
        input.scenarios.map(async (scenario): Promise<ScenarioExecutionResult> => {
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
            await log(
              `Scenario "${scenario.name}" translated service bundle`,
              "running",
              {
                scenarioId: scenario.id,
                scenarioName: scenario.name,
                stage: "provision",
                result: JSON.parse(
                  JSON.stringify({
                    services: translated.services,
                    tests: translated.tests,
                  }),
                ) as JsonValue,
              },
            );

            await log(
              `Provisioning ${translated.services.length} services for "${scenario.name}"`,
              "running",
              {
                scenarioId: scenario.id,
                scenarioName: scenario.name,
                stage: "provision",
              },
            );

            const provisionRes = await fetch(`${COTS_API_BASE_URL}/services`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                services: translated.services,
                execution_context: {
                  workflow_id: workflowId,
                  workflow_run_id: workflowRunId,
                  scenario_id: scenario.id,
                  scenario_name: scenario.name,
                },
              }),
            });

            if (!provisionRes.ok) {
              const body = await provisionRes.text();
              throw new Error(body);
            }

            const provisionData: CreateServicesResponse = await provisionRes.json();
            backendSessionId = provisionData.session_id;

            await emitScenarioTestResults(
              scenario.id,
              scenario.name,
              backendSessionId,
              translated.tests.map((test) => ({
                testResultId: `${workflowRunId}_${scenario.id}_${test.name}`,
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

            await log(`Executing ${translated.tests.length} tests for "${scenario.name}"`, "running", {
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              backendSessionId,
              stage: "execution",
            });

            await emitScenarioTestResults(
              scenario.id,
              scenario.name,
              backendSessionId,
              translated.tests.map((test) => ({
                testResultId: `${workflowRunId}_${scenario.id}_${test.name}`,
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

            const testRes = await fetch(`${COTS_API_BASE_URL}/tests/${backendSessionId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tests: translated.tests,
                execution_context: {
                  workflow_id: workflowId,
                  workflow_run_id: workflowRunId,
                  scenario_id: scenario.id,
                  scenario_name: scenario.name,
                },
              }),
            });

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
                testResultId: `${workflowRunId}_${scenario.id}_${result.name}`,
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
              await fetch(`${COTS_API_BASE_URL}/cleanup/${backendSessionId}`, {
                method: "DELETE",
              }).catch(() => undefined);

              await log(`Cleaned up scenario "${scenario.name}"`, "running", {
                scenarioId: scenario.id,
                scenarioName: scenario.name,
                backendSessionId,
                stage: "cleanup",
              });
            }
          }
        }),
      );
    });

    const summary = scenarioResults.reduce(
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

    const success = summary.failedScenarios === 0;
    const status = success
      ? "completed"
      : summary.passedScenarios > 0
        ? "partial_failed"
        : "failed";

    await log(
      `Workflow run complete: ${summary.passedScenarios}/${summary.totalScenarios} scenarios passed`,
      status === "completed" ? "completed" : "failed",
      {
        stage: "aggregation",
        result: {
          ...summary,
          status,
        },
      },
    );

    return {
      success,
      workflowRunId,
      scenarioResults,
      summary,
    } satisfies WorkflowResult;
  },
);
