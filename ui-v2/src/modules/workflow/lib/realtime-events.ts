import type {
  ScenarioRunStatus,
  ScenarioTestResultEvent,
  WorkflowRunStatus,
} from "../types/react-flow-cots";

export type AggregatedScenarioResult = {
  scenarioId: string;
  scenarioName: string;
  backendSessionId?: string | null;
  status?: ScenarioRunStatus;
  success?: boolean;
  error?: string | null;
};

export type AggregatedWorkflowResult = {
  status?: WorkflowRunStatus;
  scenarioResults?: AggregatedScenarioResult[];
};

export function isWorkflowRunStatus(
  value: unknown,
): value is WorkflowRunStatus {
  return (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "partial_failed"
  );
}

export function buildWorkflowEventsUrl(
  workflowRunId: string,
  projectId: string,
  after?: string,
): string {
  const query = new URLSearchParams({ projectId });
  if (after) query.set("after", after);
  return `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}/events?${query.toString()}`;
}

export function isNewerEventId(
  current: string | undefined,
  candidate: string,
): boolean {
  if (!candidate) return false;
  if (!current) return true;
  try {
    return BigInt(candidate) > BigInt(current);
  } catch {
    return candidate !== current;
  }
}

export function extractWorkflowError(
  explicitError: string | undefined,
  result: unknown,
): string | undefined {
  if (explicitError) return explicitError;
  if (!result || typeof result !== "object") return undefined;

  const scenarios = (result as AggregatedWorkflowResult).scenarioResults;
  if (!Array.isArray(scenarios)) return undefined;

  const message = scenarios
    .filter((scenario) => scenario.error)
    .map(
      (scenario) =>
        `${scenario.scenarioName || scenario.scenarioId}: ${scenario.error}`,
    )
    .join("\n");
  return message || undefined;
}

export function resolveScenarioLogStatus(
  current: ScenarioRunStatus,
  eventStatus: string | undefined,
): ScenarioRunStatus {
  if (eventStatus === "failed") return "failed";
  if (eventStatus === "completed") return "completed";
  if (current === "completed" || current === "failed") return current;
  return "running";
}

export function resolveScenarioTestStatus(
  current: ScenarioRunStatus,
  results: ScenarioTestResultEvent["results"],
): ScenarioRunStatus {
  if (results.some((result) => result.status === "failed")) return "failed";
  if (
    results.length > 0 &&
    results.every((result) => result.status === "passed")
  ) {
    return "completed";
  }
  if (
    results.some(
      (result) => result.status === "running" || result.status === "pending",
    ) &&
    current !== "completed" &&
    current !== "failed"
  ) {
    return "running";
  }
  return current;
}
