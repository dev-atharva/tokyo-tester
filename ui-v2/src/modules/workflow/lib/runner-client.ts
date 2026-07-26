import type {
  SessionData,
  TestResultData,
  WorkflowRunData,
} from "@/modules/sync/sync-types";
import type {
  WorkflowRunInput,
  WorkflowRunStatus,
} from "../types/react-flow-cots";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function submitWorkflowRun(
  input: WorkflowRunInput,
  fetcher: Fetcher = fetch,
): Promise<WorkflowRunSubmission> {
  const response = await fetcher("/api/v1/workflow-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.ok) {
    try {
      return (await response.json()) as WorkflowRunSubmission;
    } catch {
      return {
        workflowRunId: input.workflowRunId,
        status: "pending",
        created: true,
      };
    }
  }

  let message = `Runner returned ${response.status}`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) message = payload.error;
  } catch {
    const body = await response.text().catch(() => "");
    if (body) message = body;
  }
  throw new Error(message);
}

export interface WorkflowQueueInfo {
  status: string;
  position?: number;
  queuedAt: string;
  startedAt?: string;
  workerConcurrency?: number;
  estimatedRun?: WorkflowTimeEstimate;
  estimatedWait?: WorkflowTimeEstimate;
  estimatedTotal?: WorkflowTimeEstimate;
}

export interface WorkflowTimeEstimate {
  p50Seconds: number;
  p90Seconds: number;
  sampleSize: number;
}

export interface WorkflowRunSubmission {
  workflowRunId: string;
  workflowRevisionId?: string;
  status: string;
  created: boolean;
  queue?: WorkflowQueueInfo;
}

export async function cancelWorkflowRun(
  workflowRunId: string,
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<{
  workflowRunId: string;
  status: WorkflowRunStatus;
  changed: boolean;
}> {
  const query = new URLSearchParams({ projectId });
  const response = await fetcher(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}?${query.toString()}`,
    { method: "DELETE" },
  );
  if (response.ok) {
    return (await response.json()) as {
      workflowRunId: string;
      status: WorkflowRunStatus;
      changed: boolean;
    };
  }
  let message = `Runner returned ${response.status}`;
  try {
    const body = (await response.json()) as { error?: string };
    message = body.error || message;
  } catch {}
  throw new Error(message);
}

export interface WorkflowRunSnapshot {
  workflowRun: WorkflowRunData;
  scenarioRuns: SessionData[];
  testResults: TestResultData[];
  queue?: WorkflowQueueInfo;
}

export interface WorkflowLogPage {
  events: Array<{
    id: number;
    workflow_run_id: string;
    event_type: "workflowlog";
    payload: string;
    created_at: string;
  }>;
  hasMore: boolean;
  nextBefore?: number;
}

export async function fetchWorkflowRunLogs(
  workflowRunId: string,
  projectId: string,
  before?: number,
  limit = 100,
  fetcher: Fetcher = fetch,
): Promise<WorkflowLogPage> {
  const query = new URLSearchParams({ projectId, limit: String(limit) });
  if (before) query.set("before", String(before));
  const response = await fetcher(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}/logs?${query.toString()}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Runner returned ${response.status}`);
  }
  return (await response.json()) as WorkflowLogPage;
}

export async function fetchWorkflowRunSnapshot(
  workflowRunId: string,
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<WorkflowRunSnapshot> {
  const query = new URLSearchParams({ projectId });
  const response = await fetcher(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}?${query.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Runner returned ${response.status}`);
  }
  return (await response.json()) as WorkflowRunSnapshot;
}
