import type {
  ScenarioTestResultEvent,
  WorkflowLogEvent,
  WorkflowRunInput,
} from "@/modules/workflow/types/react-flow-cots";
import { logsChannel, testResultChannel } from "./channels";

export interface WorkflowRuntime {
  input: WorkflowRunInput;
  log: (
    message: string,
    status?: WorkflowLogEvent["status"],
    extra?: Partial<WorkflowLogEvent>,
  ) => Promise<unknown>;
  emitScenarioTestResults: (
    scenarioId: string,
    scenarioName: string,
    backendSessionId: string | undefined,
    results: ScenarioTestResultEvent["results"],
  ) => Promise<unknown>;
}

interface CreateWorkflowRuntimeParams {
  input: WorkflowRunInput;
  publish: (payload: any) => Promise<any>;
}

export function createWorkflowRuntime({
  input,
  publish,
}: CreateWorkflowRuntimeParams): WorkflowRuntime {
  const { workflowRunId, projectId, workflowId } = input;
  let logSequence = 0;
  let testSequence = 0;

  const log: WorkflowRuntime["log"] = async (
    message,
    status = "running",
    extra,
  ) =>
    publish(
      logsChannel().workflowlog({
        workflowRunId,
        projectId,
        workflowId,
        message,
        status,
        timestamp: Date.now(),
        sequence: logSequence++,
        ...extra,
      }),
    );

  const emitScenarioTestResults: WorkflowRuntime["emitScenarioTestResults"] =
    async (scenarioId, scenarioName, backendSessionId, results) => {
      if (results.length === 0) {
        return;
      }

      return publish(
        testResultChannel().testresult({
          workflowRunId,
          projectId,
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

  return {
    input,
    log,
    emitScenarioTestResults,
  };
}
