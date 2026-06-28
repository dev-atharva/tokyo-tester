"use client";

import { useEffect, useRef, useState } from "react";
import {
  type AggregatedWorkflowResult,
  buildWorkflowEventsUrl,
  extractWorkflowError,
  isWorkflowRunStatus,
  resolveScenarioLogStatus,
  resolveScenarioTestStatus,
} from "../lib/realtime-events";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import type {
  ScenarioTestResultEvent,
  WorkflowLogEvent,
} from "../types/react-flow-cots";

interface UseRealtimeLogsProps {
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

export function useRealtimeLogs({
  onComplete,
  onError,
}: UseRealtimeLogsProps = {}) {
  const appendLog = useExecutionStore((state) => state.appendLog);
  const activeWorkflowRunId = useExecutionStore(
    (state) => state.activeWorkflowRunId,
  );
  const activeExecution = useExecutionStore((state) =>
    state.activeWorkflowRunId
      ? state.executions[state.activeWorkflowRunId]
      : undefined,
  );
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
  const processedRunId = useRef<string | null>(null);
  const [runnerLogQueue, setRunnerLogQueue] = useState<
    Array<{
      topic: "workflowlog";
      data: WorkflowLogEvent;
      eventId: string;
    }>
  >([]);
  const [runnerResultQueue, setRunnerResultQueue] = useState<
    Array<{
      topic: "testresult";
      data: ScenarioTestResultEvent;
      eventId: string;
    }>
  >([]);
  const [runnerConnected, setRunnerConnected] = useState(false);
  const activeExecutionStatus = activeExecution?.status;
  const activeProjectId = activeExecution?.projectId;
  const updateReplayCursor = useExecutionStore(
    (state) => state.updateReplayCursor,
  );

  const latestLogData = runnerLogQueue[0] ?? null;
  const latestResultData = runnerResultQueue[0] ?? null;

  useEffect(() => {
    if (processedRunId.current === activeWorkflowRunId) return;
    processedRunId.current = activeWorkflowRunId;
    processedEventIds.current.clear();
    setRunnerLogQueue([]);
    setRunnerResultQueue([]);
  }, [activeWorkflowRunId]);

  useEffect(() => {
    if (
      !activeWorkflowRunId ||
      !activeProjectId ||
      (activeExecutionStatus !== "pending" &&
        activeExecutionStatus !== "running")
    ) {
      setRunnerConnected(false);
      return;
    }

    const cursor =
      useExecutionStore.getState().executions[activeWorkflowRunId]?.lastEventId;
    const source = new EventSource(
      buildWorkflowEventsUrl(activeWorkflowRunId, activeProjectId, cursor),
    );
    source.onopen = () => setRunnerConnected(true);
    source.onerror = () => setRunnerConnected(false);
    source.addEventListener("workflowlog", (event) => {
      try {
        setRunnerLogQueue((queued) => [
          ...queued,
          {
            topic: "workflowlog",
            data: JSON.parse(event.data) as WorkflowLogEvent,
            eventId: event.lastEventId,
          },
        ]);
      } catch (error) {
        console.error("Failed to parse runner workflow event", error);
      }
    });
    source.addEventListener("testresult", (event) => {
      try {
        setRunnerResultQueue((queued) => [
          ...queued,
          {
            topic: "testresult",
            data: JSON.parse(event.data) as ScenarioTestResultEvent,
            eventId: event.lastEventId,
          },
        ]);
      } catch (error) {
        console.error("Failed to parse runner test result event", error);
      }
    });
    return () => source.close();
  }, [activeExecutionStatus, activeProjectId, activeWorkflowRunId]);

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
      setRunnerLogQueue((queued) => queued.slice(1));
      return;
    }
    processedEventIds.current.add(eventId);
    if (latestLogData.eventId) {
      updateReplayCursor(workflowRunId, latestLogData.eventId);
    }

    appendLog(workflowRunId, message);

    if (scenarioId) {
      const scenarioRun = Object.values(scenarioRuns).find(
        (run) =>
          run.workflowRunId === workflowRunId && run.scenarioId === scenarioId,
      );
      if (scenarioRun) {
        appendScenarioLog(scenarioRun.id, message);
        updateScenarioRun(scenarioRun.id, {
          backendSessionId,
          status: resolveScenarioLogStatus(scenarioRun.status, status),
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
      } else if (
        aggregatedStatus === "failed" ||
        aggregatedStatus === "partial_failed"
      ) {
        onError?.(workflowError ?? "Workflow execution failed");
      }
      setRunnerLogQueue((queued) => queued.slice(1));
      return;
    }

    if (status === "running" && !scenarioId) {
      updateExecutionStatus(workflowRunId, "running");
    }

    if (status === "completed") {
      updateExecutionStatus(workflowRunId, "completed", result);
      onComplete?.(result);
    }

    if (status === "failed" && !scenarioId) {
      failExecution(workflowRunId, error ?? "Workflow execution failed");
      onError?.(error ?? "Workflow execution failed");
    }
    setRunnerLogQueue((queued) => queued.slice(1));
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
    updateReplayCursor,
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
      setRunnerResultQueue((queued) => queued.slice(1));
      return;
    }
    processedEventIds.current.add(bulkId);
    if (latestResultData.eventId) {
      updateReplayCursor(workflowRunId, latestResultData.eventId);
    }

    const scenarioRun = Object.values(scenarioRuns).find(
      (run) =>
        run.workflowRunId === workflowRunId && run.scenarioId === scenarioId,
    );
    if (scenarioRun) {
      updateScenarioRun(scenarioRun.id, {
        backendSessionId,
        status: resolveScenarioTestStatus(scenarioRun.status, results),
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
    setRunnerResultQueue((queued) => queued.slice(1));
  }, [
    latestResultData,
    updateScenarioRun,
    scenarioRuns,
    updateTestResult,
    updateReplayCursor,
  ]);

  return {
    isConnected: runnerConnected,
  };
}
