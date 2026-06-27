"use client";

import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useEffect, useRef } from "react";
import {
  fetchLogsRealtimeSubscriptionToken,
  fetchTestResultRealtimeSubscriptionToken,
} from "@/modules/utils/get-subscribe-token";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import type {
  ScenarioRunStatus,
  ScenarioTestResultEvent,
  WorkflowRunStatus,
} from "../types/react-flow-cots";

interface UseRealtimeLogsProps {
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

type AggregatedScenarioResult = {
  scenarioId: string;
  scenarioName: string;
  backendSessionId?: string | null;
  status?: ScenarioRunStatus;
  success?: boolean;
  error?: string | null;
};

type AggregatedWorkflowResult = {
  status?: WorkflowRunStatus;
  scenarioResults?: AggregatedScenarioResult[];
};

function isWorkflowRunStatus(value: unknown): value is WorkflowRunStatus {
  return (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "partial_failed"
  );
}

function extractWorkflowError(
  explicitError: string | undefined,
  result: unknown,
): string | undefined {
  if (explicitError) {
    return explicitError;
  }
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const scenarioResults = (result as AggregatedWorkflowResult).scenarioResults;
  if (!Array.isArray(scenarioResults)) {
    return undefined;
  }
  return scenarioResults
    .filter((scenario) => scenario.error)
    .map((scenario) =>
      scenario.error
        ? `${scenario.scenarioName || scenario.scenarioId}: ${scenario.error}`
        : null,
    )
    .filter((message): message is string => Boolean(message))
    .join("\n");
}

export function useRealtimeLogs({
  onComplete,
  onError,
}: UseRealtimeLogsProps = {}) {
  const { latestData: latestLogData } = useInngestSubscription({
    refreshToken: fetchLogsRealtimeSubscriptionToken,
  });
  const { latestData: latestResultData } = useInngestSubscription({
    refreshToken: fetchTestResultRealtimeSubscriptionToken,
  });

  const appendLog = useExecutionStore((state) => state.appendLog);
  const updateExecutionStatus = useExecutionStore(
    (state) => state.updateExecutionStatus,
  );
  const failExecution = useExecutionStore((state) => state.failExecution);
  const appendScenarioLog = useScenarioRunStore(
    (state) => state.appendScenarioLog,
  );
  const updateScenarioRun = useScenarioRunStore(
    (state) => state.updateScenarioRun,
  );
  const scenarioRuns = useScenarioRunStore((state) => state.scenarioRuns);
  const updateTestResult = useTestResultStore(
    (state) => state.updateTestResult,
  );

  const processedEventIds = useRef(new Set<string>());

  useEffect(() => {
    if (!latestLogData || latestLogData.topic !== "workflowlog") {
      return;
    }

    const {
      workflowRunId,
      scenarioId,
      message,
      status,
      result,
      error,
      timestamp,
      sequence,
      backendSessionId,
    } = latestLogData.data;
    const eventId = `workflowlog:${workflowRunId}:${scenarioId || "workflow"}:${timestamp}:${sequence}`;
    if (processedEventIds.current.has(eventId)) {
      return;
    }
    processedEventIds.current.add(eventId);

    appendLog(workflowRunId, message);

    if (scenarioId) {
      const scenarioRun = Object.values(scenarioRuns).find(
        (run) =>
          run.workflowRunId === workflowRunId && run.scenarioId === scenarioId,
      );
      if (scenarioRun) {
        let nextStatus: ScenarioRunStatus | undefined;

        if (status === "failed") {
          nextStatus = "failed";
        } else if (status === "completed") {
          nextStatus = "completed";
        } else if (
          scenarioRun.status !== "completed" &&
          scenarioRun.status !== "failed"
        ) {
          nextStatus = "running";
        }

        appendScenarioLog(scenarioRun.id, message);
        updateScenarioRun(scenarioRun.id, {
          backendSessionId,
          status: nextStatus,
          error: error ?? scenarioRun.error,
        });
      }
    }

    const aggregatedStatus =
      !scenarioId &&
      result &&
      typeof result === "object" &&
      "status" in result &&
      isWorkflowRunStatus(result.status)
        ? result.status
        : undefined;

    if (!scenarioId && aggregatedStatus) {
      const aggregatedResult =
        result && typeof result === "object"
          ? (result as AggregatedWorkflowResult)
          : undefined;
      const workflowError = extractWorkflowError(error, result);
      const aggregatedScenarioResults = aggregatedResult?.scenarioResults;

      if (Array.isArray(aggregatedScenarioResults)) {
        for (const aggregatedScenario of aggregatedScenarioResults) {
          const scenarioRun = Object.values(scenarioRuns).find(
            (run) =>
              run.workflowRunId === workflowRunId &&
              run.scenarioId === aggregatedScenario.scenarioId,
          );
          if (!scenarioRun) {
            continue;
          }
          updateScenarioRun(scenarioRun.id, {
            backendSessionId:
              aggregatedScenario.backendSessionId ||
              scenarioRun.backendSessionId,
            status:
              aggregatedScenario.status ??
              (aggregatedScenario.success === true
                ? "completed"
                : aggregatedScenario.success === false
                  ? "failed"
                  : scenarioRun.status),
            error: aggregatedScenario.error ?? scenarioRun.error,
          });
        }
      }

      updateExecutionStatus(
        workflowRunId,
        aggregatedStatus,
        result,
        workflowError,
      );
      if (aggregatedStatus === "completed") {
        onComplete?.(result);
      }
      return;
    }

    if (status === "completed") {
      updateExecutionStatus(workflowRunId, "completed", result);
      onComplete?.(result);
    }

    if (status === "failed" && !scenarioId) {
      failExecution(workflowRunId, error ?? "Workflow execution failed");
      onError?.(error ?? "Workflow execution failed");
    }
  }, [
    latestLogData,
    appendLog,
    appendScenarioLog,
    updateScenarioRun,
    scenarioRuns,
    updateExecutionStatus,
    onComplete,
    failExecution,
    onError,
  ]);

  useEffect(() => {
    if (!latestResultData || latestResultData.topic !== "testresult") {
      return;
    }

    const {
      workflowRunId,
      projectId,
      workflowId,
      scenarioId,
      scenarioName,
      backendSessionId,
      results,
      bulkId,
    } = latestResultData.data;

    if (processedEventIds.current.has(bulkId)) {
      return;
    }
    processedEventIds.current.add(bulkId);

    const scenarioRun = Object.values(scenarioRuns).find(
      (run) =>
        run.workflowRunId === workflowRunId && run.scenarioId === scenarioId,
    );
    if (scenarioRun) {
      const hasRunning = results.some(
        (result: ScenarioTestResultEvent["results"][number]) =>
          result.status === "running" || result.status === "pending",
      );
      const hasFailed = results.some(
        (result: ScenarioTestResultEvent["results"][number]) =>
          result.status === "failed",
      );
      const hasPassed =
        results.length > 0 &&
        results.every(
          (result: ScenarioTestResultEvent["results"][number]) =>
            result.status === "passed",
        );

      let nextScenarioStatus = scenarioRun.status;
      if (hasFailed) {
        nextScenarioStatus = "failed";
      } else if (hasPassed) {
        nextScenarioStatus = "completed";
      } else if (
        hasRunning &&
        scenarioRun.status !== "completed" &&
        scenarioRun.status !== "failed"
      ) {
        nextScenarioStatus = "running";
      }

      updateScenarioRun(scenarioRun.id, {
        backendSessionId,
        status: nextScenarioStatus,
      });
    }

    for (const result of [...results].sort(
      (left, right) => left.sequence - right.sequence,
    )) {
      updateTestResult(result.testResultId, {
        sessionId:
          backendSessionId ||
          scenarioRun?.backendSessionId ||
          scenarioRun?.id ||
          scenarioId,
        projectId,
        workflowRunId,
        workflowId,
        scenarioRunId: scenarioRun?.id,
        scenarioId,
        scenarioName,
        testName: result.testName,
        testType: result.testType || "database",
        status: result.status,
        resultData: result.resultData ?? null,
        durationMs: result.durationMs ?? 0,
        executedAt: result.executedAt ?? new Date().toISOString(),
        containerLogs: result.containerLogs,
      });
    }
  }, [latestResultData, updateScenarioRun, scenarioRuns, updateTestResult]);

  return {
    isConnected: !!(latestLogData && latestResultData),
  };
}
