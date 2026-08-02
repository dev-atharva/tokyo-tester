import type { ScenarioTestDefinition } from "../types/react-flow-cots";

function operation(test: ScenarioTestDefinition): string {
  switch (test.type) {
    case "http":
      return test.httpConfig?.method ?? "GET";
    case "document":
      return test.documentConfig?.operation ?? "";
    case "cache":
      return test.cacheConfig?.operation ?? "";
    case "queue":
      return test.queueConfig?.operation ?? "";
    case "database":
      return test.databaseConfig?.query ?? "";
    case "shell":
      return test.shellConfig?.command ?? "";
    case "delay":
      return String(test.delayConfig?.durationMs ?? "");
  }
}

export function retryOperationSignature(test: ScenarioTestDefinition): string {
  return `${test.type}:${operation(test)}`;
}

export function isAutomaticallyRetrySafe(
  test: ScenarioTestDefinition,
): boolean {
  switch (test.type) {
    case "http":
      return ["GET", "HEAD", "OPTIONS"].includes(
        test.httpConfig?.method ?? "GET",
      );
    case "document":
      return ["find_one", "find_many", "count_documents", "exists"].includes(
        test.documentConfig?.operation ?? "",
      );
    case "cache":
      return ["ping", "get", "exists"].includes(
        test.cacheConfig?.operation ?? "",
      );
    case "queue":
      return ["check_topic", "list_topics"].includes(
        test.queueConfig?.operation ?? "",
      );
    default:
      return false;
  }
}

export function hasExplicitIdempotencyRetry(
  test: ScenarioTestDefinition,
): boolean {
  return Boolean(
    test.retryPolicy?.mode !== "never" &&
      test.retryPolicy?.idempotencyConfirmed,
  );
}

export function guidedRetryDescription(test: ScenarioTestDefinition): string {
  if (test.type === "delay") return "Delay steps are never retried.";
  if (test.retryPolicy?.mode === "never") {
    return "Automatic retry is disabled. Switch to Expert mode to edit this policy.";
  }
  if (hasExplicitIdempotencyRetry(test)) {
    return "An Expert confirmed this operation can safely run twice. One transient transport failure will be retried.";
  }
  if (isAutomaticallyRetrySafe(test)) {
    return "Tokyo Tester retries one safe transient connection failure. Assertions and timeouts still fail immediately.";
  }
  return "This operation is not automatically retried. Switch to Expert mode only if you can confirm it is idempotent.";
}

export function clearStaleIdempotencyConfirmation(
  previous: ScenarioTestDefinition,
  next: ScenarioTestDefinition,
): ScenarioTestDefinition {
  if (
    !previous.retryPolicy?.idempotencyConfirmed ||
    retryOperationSignature(previous) === retryOperationSignature(next)
  ) {
    return next;
  }

  return {
    ...next,
    retryPolicy: {
      mode: next.retryPolicy?.mode ?? previous.retryPolicy.mode,
    },
  };
}
