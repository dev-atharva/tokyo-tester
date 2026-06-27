import {
  translateWorkflowGraphToServiceGraph,
  validateWorkflowGraph,
} from "@/modules/utils/scenario-translator";
import type {
  JsonValue,
  WorkflowResult,
  WorkflowRunInput,
} from "@/modules/workflow/types/react-flow-cots";
import { inngest } from "../client";
import { SCENARIO_CONCURRENCY } from "./config";
import { mapWithConcurrency } from "./network";
import { executeScenario } from "./scenario-execution";
import { summarizeScenarioResults, toWorkflowResult } from "./summary";
import { createWorkflowRuntime } from "./workflow-runtime";

export const cotsWorkFlow = inngest.createFunction(
  {
    id: "cots-workflow-run",
    name: "COTS Scenario Workflow Run",
    retries: 0,
  },
  { event: "cots/workflow.run.start" },
  async ({ event, step, publish }) => {
    const input = event.data as WorkflowRunInput;
    const { workflowRunId, workflowName } = input;
    const runtime = createWorkflowRuntime({ input, publish });
    const { log } = runtime;

    await log(`Starting workflow run: ${workflowName}`);

    const workflowValidation = validateWorkflowGraph(input.nodes, input.edges);
    if (!workflowValidation.valid) {
      const message = workflowValidation.errors
        .map((error) => error.message)
        .join(", ");
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
      return mapWithConcurrency(
        input.scenarios,
        SCENARIO_CONCURRENCY,
        (scenario) => executeScenario(runtime, serviceGraph, scenario),
      );
    });

    const summary = summarizeScenarioResults(scenarioResults);

    const success = summary.failedScenarios === 0;
    const status = success
      ? "completed"
      : summary.passedScenarios > 0
        ? "partial_failed"
        : "failed";
    const scenarioSnapshots: JsonValue[] = scenarioResults.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.scenarioName,
      backendSessionId: scenario.backendSessionId ?? null,
      success: scenario.success,
      status: scenario.status,
      error: scenario.error ?? null,
    }));
    const workflowError = scenarioResults
      .filter((scenario) => !scenario.success && scenario.error)
      .map((scenario) => `${scenario.scenarioName}: ${scenario.error}`)
      .join("\n");

    await log(
      `Workflow run complete: ${summary.passedScenarios}/${summary.totalScenarios} scenarios passed`,
      status === "completed" ? "completed" : "failed",
      {
        stage: "aggregation",
        result: {
          ...summary,
          status,
          success,
          scenarioResults: scenarioSnapshots,
        },
        error: workflowError || undefined,
      },
    );

    return toWorkflowResult(
      workflowRunId,
      scenarioResults,
    ) satisfies WorkflowResult;
  },
);
