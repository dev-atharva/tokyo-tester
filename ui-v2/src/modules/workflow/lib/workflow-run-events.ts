import type {
  ScenarioRunStatus,
  TestAttempt,
  WorkflowLogEvent,
  WorkflowRunStatus,
} from "../types/react-flow-cots";

export const MAX_OPERATIONAL_WORKFLOW_EVENTS = 2_000;

export type ServiceExecutionState =
  | "queued"
  | "provisioning"
  | "ready"
  | "testing"
  | "cleaning"
  | "complete"
  | "failed";

export type TestExecutionDisplayStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "not_run"
  | "not_recorded"
  | "interrupted";

export function testRetryResult(value: unknown): {
  attempts: TestAttempt[];
  recovered: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { attempts: [], recovered: false };
  }
  const result = value as {
    attempts?: unknown;
    recovered_after_retry?: unknown;
    recoveredAfterRetry?: unknown;
  };
  const attempts = Array.isArray(result.attempts)
    ? result.attempts.filter((attempt): attempt is TestAttempt =>
        Boolean(
          attempt &&
            typeof attempt === "object" &&
            typeof (attempt as TestAttempt).attempt === "number" &&
            typeof (attempt as TestAttempt).outcome === "string",
        ),
      )
    : [];
  return {
    attempts,
    recovered: Boolean(
      result.recovered_after_retry ??
        result.recoveredAfterRetry ??
        (attempts.length > 1 && attempts.at(-1)?.outcome === "passed"),
    ),
  };
}

function isTerminalWorkflowStatus(status?: WorkflowRunStatus) {
  return Boolean(
    status && !["pending", "running", "cancelling"].includes(status),
  );
}

function isTerminalScenarioStatus(status?: ScenarioRunStatus) {
  return Boolean(
    status && !["pending", "running", "cancelling"].includes(status),
  );
}

export function resolveScenarioPresentationStatus(
  scenarioStatus: ScenarioRunStatus | undefined,
  workflowStatus: WorkflowRunStatus | undefined,
): ScenarioRunStatus {
  if (scenarioStatus && isTerminalScenarioStatus(scenarioStatus)) {
    return scenarioStatus;
  }
  if (workflowStatus === "completed") return "completed";
  if (workflowStatus === "cancelled") return "cancelled";
  if (workflowStatus === "cleanup_failed") return "cleanup_failed";
  if (workflowStatus === "failed" || workflowStatus === "partial_failed") {
    return "failed";
  }
  return scenarioStatus || "pending";
}

export function reconcileServiceExecutionState(
  current: ServiceExecutionState,
  scenarioStatus: ScenarioRunStatus | undefined,
  workflowStatus: WorkflowRunStatus | undefined,
): ServiceExecutionState {
  if (current === "failed") return current;
  const resolvedScenario = resolveScenarioPresentationStatus(
    scenarioStatus,
    workflowStatus,
  );
  return isTerminalScenarioStatus(resolvedScenario) ||
    isTerminalWorkflowStatus(workflowStatus)
    ? "complete"
    : current;
}

function normalizeActiveTestStatus(
  status?: string,
): TestExecutionDisplayStatus {
  if (status === "started" || status === "running" || status === "retrying")
    return "running";
  if (status === "passed" || status === "failed" || status === "pending") {
    return status;
  }
  return "pending";
}

export function reconcileTestExecutionStatus({
  eventStatus,
  storedStatus,
  scenarioStatus,
  workflowStatus,
}: {
  eventStatus?: string;
  storedStatus?: string;
  scenarioStatus?: ScenarioRunStatus;
  workflowStatus?: WorkflowRunStatus;
}): TestExecutionDisplayStatus {
  if (storedStatus === "passed" || storedStatus === "failed") {
    return storedStatus;
  }
  if (eventStatus === "passed" || eventStatus === "failed") {
    return eventStatus;
  }

  const resolvedScenario = resolveScenarioPresentationStatus(
    scenarioStatus,
    workflowStatus,
  );
  if (
    !isTerminalScenarioStatus(resolvedScenario) &&
    !isTerminalWorkflowStatus(workflowStatus)
  ) {
    return normalizeActiveTestStatus(eventStatus || storedStatus);
  }

  if (resolvedScenario === "completed") return "not_recorded";
  if (
    eventStatus === "started" ||
    eventStatus === "running" ||
    eventStatus === "retrying" ||
    storedStatus === "running"
  ) {
    return "interrupted";
  }
  return "not_run";
}

export function executionNodePosition(
  position: { x: number; y: number } | undefined,
  index: number,
) {
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    return position;
  }
  return { x: (index % 3) * 260, y: Math.floor(index / 3) * 160 };
}

function eventKey(event: WorkflowLogEvent): string {
  return `${event.workflowRunId}:${event.scenarioId || "workflow"}:${event.timestamp}:${event.sequence}:${event.kind || "log"}`;
}

export function mergeWorkflowRunEvents(
  ...sources: WorkflowLogEvent[][]
): WorkflowLogEvent[] {
  const byKey = new Map<string, WorkflowLogEvent>();
  for (const event of sources.flat()) byKey.set(eventKey(event), event);
  return [...byKey.values()].sort(
    (left, right) =>
      left.timestamp - right.timestamp || left.sequence - right.sequence,
  );
}

export function operationalWorkflowRunEvents(
  events: WorkflowLogEvent[],
  limit = MAX_OPERATIONAL_WORKFLOW_EVENTS,
): WorkflowLogEvent[] {
  return events.slice(-limit);
}

export function keyLogLines(logs: string[]) {
  return logs.map((line, index) => ({ key: `plain:${index}`, line }));
}
