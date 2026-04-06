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
  ScenarioTestResultEvent,
  ScenarioRunStatus,
  WorkflowRunStatus,
} from "../types/react-flow-cots";

interface UseRealtimeLogsProps {
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
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
  const updateExecutionStatus = useExecutionStore((state) => state.updateExecutionStatus);
  const failExecution = useExecutionStore((state) => state.failExecution);
  const appendScenarioLog = useScenarioRunStore((state) => state.appendScenarioLog);
  const updateScenarioRun = useScenarioRunStore((state) => state.updateScenarioRun);
  const scenarioRuns = useScenarioRunStore((state) => state.scenarioRuns);
  const updateTestResult = useTestResultStore((state) => state.updateTestResult);

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
        (run) => run.workflowRunId === workflowRunId && run.scenarioId === scenarioId,
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
      typeof result.status === "string"
        ? (result.status as WorkflowRunStatus)
        : undefined;

    if (!scenarioId && aggregatedStatus) {
      updateExecutionStatus(workflowRunId, aggregatedStatus, result);
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
      (run) => run.workflowRunId === workflowRunId && run.scenarioId === scenarioId,
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

    for (const result of [...results].sort((left, right) => left.sequence - right.sequence)) {
      updateTestResult(result.testResultId, {
        sessionId: backendSessionId || scenarioRun?.backendSessionId || scenarioRun?.id || scenarioId,
        projectId,
        workflowRunId,
        workflowId,
        scenarioRunId: scenarioRun?.id,
        scenarioId,
        scenarioName,
        testName: result.testName,
        testType: result.testType || "database",
        status: result.status as "pending" | "running" | "passed" | "failed",
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
