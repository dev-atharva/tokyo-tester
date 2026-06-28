import { describe, expect, test } from "bun:test";
import {
  buildWorkflowEventsUrl,
  extractWorkflowError,
  isNewerEventId,
  isWorkflowRunStatus,
  resolveScenarioLogStatus,
  resolveScenarioTestStatus,
} from "./realtime-events";

describe("runner realtime event reducers", () => {
  test("builds an authorized replay URL from the persisted event cursor", () => {
    expect(buildWorkflowEventsUrl("run/one", "project one", "42")).toBe(
      "/api/v1/workflow-runs/run%2Fone/events?projectId=project+one&after=42",
    );
  });

  test("never moves an SSE replay cursor backwards", () => {
    expect(isNewerEventId("42", "43")).toBe(true);
    expect(isNewerEventId("42", "42")).toBe(false);
    expect(isNewerEventId("42", "41")).toBe(false);
  });
  test("recognizes terminal and partial workflow statuses", () => {
    expect(isWorkflowRunStatus("completed")).toBe(true);
    expect(isWorkflowRunStatus("partial_failed")).toBe(true);
    expect(isWorkflowRunStatus("unknown")).toBe(false);
  });

  test("aggregates scenario errors when the workflow event has no explicit error", () => {
    expect(
      extractWorkflowError(undefined, {
        scenarioResults: [
          {
            scenarioId: "one",
            scenarioName: "First",
            error: "provision failed",
          },
          { scenarioId: "two", scenarioName: "Second", error: "test failed" },
        ],
      }),
    ).toBe("First: provision failed\nSecond: test failed");
    expect(extractWorkflowError("runner unavailable", {})).toBe(
      "runner unavailable",
    );
  });

  test("does not regress terminal scenario state on late running events", () => {
    expect(resolveScenarioLogStatus("completed", "running")).toBe("completed");
    expect(resolveScenarioLogStatus("pending", "running")).toBe("running");
    expect(resolveScenarioLogStatus("running", "failed")).toBe("failed");
  });

  test("derives scenario status from a test-result batch", () => {
    const result = (status: "pending" | "running" | "passed" | "failed") => ({
      testResultId: status,
      testName: status,
      testType: "delay",
      status,
      resultData: null,
      durationMs: 0,
      executedAt: new Date(0).toISOString(),
      action: "update" as const,
      sequence: 0,
    });

    expect(resolveScenarioTestStatus("pending", [result("running")])).toBe(
      "running",
    );
    expect(resolveScenarioTestStatus("running", [result("passed")])).toBe(
      "completed",
    );
    expect(
      resolveScenarioTestStatus("running", [
        result("passed"),
        result("failed"),
      ]),
    ).toBe("failed");
  });
});
