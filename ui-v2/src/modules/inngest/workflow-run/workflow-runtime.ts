import type {
  JsonValue,
  ScenarioTestResultEvent,
  WorkflowLogEvent,
  WorkflowRunInput,
} from "@/modules/workflow/types/react-flow-cots";
import type { SyncBatchRequest, WorkflowRunData } from "@/modules/sync/sync-types";
import { logsChannel, testResultChannel } from "./channels";
import { COTS_API_BASE_URL } from "./config";

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
  const startedAt = new Date().toISOString();
  const workflowLogs: string[] = [];
  let workflowRunVersion = 1;
  let publishChain: Promise<unknown> = Promise.resolve();

  const toJsonValue = (value: unknown): JsonValue =>
    JSON.parse(JSON.stringify(value)) as JsonValue;

  const persistWorkflowRun = async ({
    status,
    error,
    result,
  }: {
    status: string;
    error?: string;
    result?: unknown;
  }) => {
    const now = new Date().toISOString();
    const workflowRunData: WorkflowRunData = {
      id: workflowRunId,
      project_id: projectId,
      workflow_id: workflowId,
      status,
      summary:
        result && typeof result === "object" ? toJsonValue(result) : undefined,
      logs: [...workflowLogs],
      error,
      started_at: startedAt,
      completed_at:
        status === "running" || status === "pending" ? null : now,
      metadata: {
        scenario_run_ids: input.scenarios.map((scenario) => scenario.scenarioRunId),
      },
      version: workflowRunVersion++,
      created_at: startedAt,
      updated_at: now,
      user_id: input.userId ?? "demo-user",
      client_id: input.clientId ?? "server-runtime",
      is_deleted: false,
    };

    const syncBatch: SyncBatchRequest = {
      user_id: workflowRunData.user_id,
      project_id: projectId,
      client_id: workflowRunData.client_id,
      timestamp: now,
      changes: [
        {
          entity_type: "workflow_run",
          entity_id: workflowRunId,
          change_type: workflowRunVersion === 2 ? "insert" : "update",
          data: toJsonValue(workflowRunData),
          client_time: now,
          client_version: workflowRunData.version,
        },
      ],
    };

    const response = await fetch(`${COTS_API_BASE_URL}/api/v1/sync/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncBatch),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to persist workflow run ${workflowRunId}: ${response.status} ${await response.text()}`,
      );
    }
  };

  const queuePublish = <T>(task: () => Promise<T>): Promise<T> => {
    const nextTask = publishChain.then(task, task);
    publishChain = nextTask.then(
      () => undefined,
      () => undefined,
    );
    return nextTask;
  };

  const log: WorkflowRuntime["log"] = async (
    message,
    status = "running",
    extra,
  ) => {
    workflowLogs.push(message);

    const settled = await Promise.allSettled([
      persistWorkflowRun({
        status:
          !extra?.scenarioId && extra?.result && typeof extra.result === "object" && "status" in extra.result
            ? String((extra.result as { status?: string }).status || status)
            : status,
        error: extra?.error,
        result: !extra?.scenarioId ? extra?.result : undefined,
      }),
      queuePublish(() =>
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
        ),
      ),
    ]);

    for (const result of settled) {
      if (result.status === "rejected") {
        console.error("[WorkflowRuntime] Failed to emit workflow update:", result.reason);
      }
    }
  };

  const emitScenarioTestResults: WorkflowRuntime["emitScenarioTestResults"] =
    async (scenarioId, scenarioName, backendSessionId, results) => {
      if (results.length === 0) {
        return;
      }

      return queuePublish(() =>
        publish(
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
        ),
      );
    };

  return {
    input,
    log,
    emitScenarioTestResults,
  };
}
