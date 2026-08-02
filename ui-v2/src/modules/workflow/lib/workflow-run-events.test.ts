import { describe, expect, test } from "bun:test";
import type { WorkflowLogEvent } from "../types/react-flow-cots";
import {
  executionNodePosition,
  keyLogLines,
  mergeWorkflowRunEvents,
  operationalWorkflowRunEvents,
  reconcileServiceExecutionState,
  reconcileTestExecutionStatus,
  resolveScenarioPresentationStatus,
  testRetryResult,
} from "./workflow-run-events";

function event(sequence: number): WorkflowLogEvent {
  return {
    workflowRunId: "run-1",
    projectId: "project-1",
    workflowId: "workflow-1",
    scenarioId: "scenario-1",
    message: `event-${sequence}`,
    kind: "lifecycle",
    timestamp: sequence,
    sequence,
  };
}

describe("workflow run event presentation", () => {
  test("deduplicates replayed and live events and preserves execution order", () => {
    expect(
      mergeWorkflowRunEvents([event(2), event(1)], [event(2), event(3)]).map(
        (item) => item.sequence,
      ),
    ).toEqual([1, 2, 3]);
  });

  test("bounds operational rendering without truncating the raw event source", () => {
    const events = Array.from({ length: 8 }, (_, index) => event(index + 1));
    expect(
      operationalWorkflowRunEvents(events, 3).map((item) => item.sequence),
    ).toEqual([6, 7, 8]);
    expect(events).toHaveLength(8);
  });

  test("assigns stable unique keys to repeated plain log lines", () => {
    expect(keyLogLines(["same", "same", "different", "same"])).toEqual([
      { key: "plain:0", line: "same" },
      { key: "plain:1", line: "same" },
      { key: "plain:2", line: "different" },
      { key: "plain:3", line: "same" },
    ]);
  });

  test("lays out immutable services whose historical position is missing", () => {
    expect(executionNodePosition(undefined, 4)).toEqual({ x: 260, y: 160 });
    expect(executionNodePosition({ x: Number.NaN, y: 2 }, 0)).toEqual({
      x: 0,
      y: 0,
    });
    expect(executionNodePosition({ x: 12, y: 24 }, 0)).toEqual({
      x: 12,
      y: 24,
    });
  });

  test("uses durable test results instead of stale in-flight events", () => {
    expect(
      reconcileTestExecutionStatus({
        eventStatus: "started",
        storedStatus: "passed",
        scenarioStatus: "completed",
        workflowStatus: "completed",
      }),
    ).toBe("passed");
  });

  test("presents a structured retry event as active execution", () => {
    expect(
      reconcileTestExecutionStatus({
        eventStatus: "retrying",
        scenarioStatus: "running",
        workflowStatus: "running",
      }),
    ).toBe("running");
  });

  test("restores recovered attempt history from a durable result", () => {
    expect(
      testRetryResult({
        recovered_after_retry: true,
        attempts: [
          {
            attempt: 1,
            outcome: "failed",
            duration_ms: 7,
            failure_class: "transient_transport",
            failure_code: "TEST_TRANSPORT_CONNECTION_RESET",
            retry_scheduled: true,
          },
          { attempt: 2, outcome: "passed", duration_ms: 11 },
        ],
      }),
    ).toEqual({
      recovered: true,
      attempts: [
        {
          attempt: 1,
          outcome: "failed",
          duration_ms: 7,
          failure_class: "transient_transport",
          failure_code: "TEST_TRANSPORT_CONNECTION_RESET",
          retry_scheduled: true,
        },
        { attempt: 2, outcome: "passed", duration_ms: 11 },
      ],
    });
  });

  test("never presents active or queued tests after a terminal run", () => {
    expect(
      reconcileTestExecutionStatus({
        eventStatus: "started",
        scenarioStatus: "completed",
        workflowStatus: "completed",
      }),
    ).toBe("not_recorded");
    expect(
      reconcileTestExecutionStatus({
        scenarioStatus: "failed",
        workflowStatus: "partial_failed",
      }),
    ).toBe("not_run");
  });

  test("terminal durable state closes stale scenario and service projections", () => {
    expect(resolveScenarioPresentationStatus("running", "completed")).toBe(
      "completed",
    );
    expect(
      reconcileServiceExecutionState("testing", "completed", "completed"),
    ).toBe("complete");
    expect(
      reconcileServiceExecutionState(
        "failed",
        "cleanup_failed",
        "cleanup_failed",
      ),
    ).toBe("failed");
  });
});
