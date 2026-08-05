import type {
  SessionData,
  TestResultData,
  WorkflowRunData,
} from "@/modules/sync/sync-types";
import type {
  FlowEdge,
  FlowNode,
  JourneyEnvironment,
  ScenarioExecutionModel,
  ScenarioStep,
  ScenarioTestDefinition,
  WorkflowLogEvent,
  WorkflowRunInput,
  WorkflowRunStatus,
} from "../types/react-flow-cots";
import type { RunSecretInput } from "./run-secrets";

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
  if (response.status === 202) {
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

  if (response.ok) {
    throw new Error(
      `Runner returned unexpected ${response.status}; the workflow was not accepted for execution`,
    );
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

export async function authorizeWorkflowRun(
  input: WorkflowRunInput,
  runSecrets: RunSecretInput[],
  fetcher: Fetcher = fetch,
): Promise<WorkflowRunSubmission> {
  const response = await fetcher("/api/v1/workflow-runs/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: input, runSecrets }),
  });
  if (response.status === 202) {
    return (await response.json()) as WorkflowRunSubmission;
  }
  let message = `Runner returned ${response.status}`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) message = payload.error;
  } catch {}
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
  executionDefinition?: WorkflowExecutionDefinition | null;
}

export interface WorkflowExecutionDefinition {
  workflowRevisionId: string;
  revisionNumber: number;
  workflowVersion: number;
  workflow: {
    id: string;
    name: string;
    description?: string;
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
  scenarios: Array<{
    id: string;
    name: string;
    description?: string;
    executionModel: ScenarioExecutionModel;
    tests?: ScenarioTestDefinition[];
    testOrder?: string[];
    environment?: JourneyEnvironment;
    steps?: ScenarioStep[];
    stepOrder?: string[];
  }>;
}

export function browserJourneyArtifactUrl(
  workflowRunId: string,
  artifactId: string,
  projectId: string,
): string {
  const query = new URLSearchParams({ projectId });
  return `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}/artifacts/${encodeURIComponent(artifactId)}?${query.toString()}`;
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

export interface StoredWorkflowLogEvent {
  id: number;
  event: WorkflowLogEvent;
}

export interface WorkflowLogReplay {
  events: StoredWorkflowLogEvent[];
  newestEventId?: number;
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

function parseStoredWorkflowLogEvent(
  stored: WorkflowLogPage["events"][number],
): StoredWorkflowLogEvent | null {
  try {
    return {
      id: stored.id,
      event: JSON.parse(stored.payload) as WorkflowLogEvent,
    };
  } catch {
    return null;
  }
}

/**
 * Replays every persisted event newer than `afterEventId`. Pages are returned
 * newest-first by the runner, so reconciliation continues backwards until it
 * reaches the known cursor. This prevents a terminal snapshot from hiding
 * structured events that were persisted while SSE was disconnected.
 */
export async function fetchWorkflowRunEventsSince(
  workflowRunId: string,
  projectId: string,
  afterEventId: number,
  pageSize = 200,
  fetcher: Fetcher = fetch,
): Promise<WorkflowLogReplay> {
  const collected = new Map<number, WorkflowLogEvent>();
  const seenCursors = new Set<number>();
  let newestStoredEventId: number | undefined;
  let before: number | undefined;

  while (true) {
    const page = await fetchWorkflowRunLogs(
      workflowRunId,
      projectId,
      before,
      pageSize,
      fetcher,
    );
    let reachedKnownCursor = false;
    for (const stored of page.events) {
      if (stored.id <= afterEventId) {
        reachedKnownCursor = true;
        continue;
      }
      newestStoredEventId = Math.max(newestStoredEventId || 0, stored.id);
      const parsed = parseStoredWorkflowLogEvent(stored);
      if (parsed) collected.set(parsed.id, parsed.event);
    }

    if (reachedKnownCursor || !page.hasMore || page.nextBefore === undefined) {
      break;
    }
    if (seenCursors.has(page.nextBefore)) {
      throw new Error("Runner returned a repeated pagination cursor");
    }
    seenCursors.add(page.nextBefore);
    before = page.nextBefore;
  }

  const events = [...collected.entries()]
    .map(([id, event]) => ({ id, event }))
    .sort((left, right) => left.id - right.id);
  return { events, newestEventId: newestStoredEventId };
}

export async function fetchWorkflowRunSnapshot(
  workflowRunId: string,
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<WorkflowRunSnapshot> {
  const query = new URLSearchParams({ projectId });
  const response = await fetcher(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}?${query.toString()}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Runner returned ${response.status}`);
  }
  return (await response.json()) as WorkflowRunSnapshot;
}
