"use client";
import { useEffect, useRef } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import {
  fetchLogsRealtimeSubscriptionToken,
  fetchTestResultRealtimeSubscriptionToken,
} from "@/modules/utils/get-subscribe-token";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useTestResultStore } from "../stores/test-result.store";

type TestStatus = "pending" | "running" | "passed" | "failed";

interface UseRealtimeLogsProps {
  onComplete?: (result: any) => void;
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

  const appendLog = useExecutionStore((s) => s.appendLog);
  const completeExecution = useExecutionStore((s) => s.completeExecution);
  const failExecution = useExecutionStore((s) => s.failExecution);

  const addTestResult = useTestResultStore((s) => s.addTestResult);
  const updateTestResult = useTestResultStore((s) => s.updateTestResult);
  const hasTestResult = useTestResultStore((s) => s.hasTestResult);

  const processedEventIds = useRef(new Set<string>());

  /* ---------------- Workflow Logs ---------------- */
  useEffect(() => {
    if (!latestLogData) return;

    if (latestLogData.topic === "workflowlog") {
      const { sessionId, message, status, result, error } = latestLogData.data;
      const eventId = `workflowlog:${sessionId}:${status}:${message}`;

      if (processedEventIds.current.has(eventId)) return;
      processedEventIds.current.add(eventId);

      appendLog(sessionId, message);

      if (status === "completed") {
        completeExecution(sessionId, result);
        onComplete?.(result);
      }

      if (status === "failed") {
        failExecution(sessionId, error ?? "Workflow execution failed");
        onError?.(error ?? "Workflow execution failed");
      }
    }

    // prevent unbounded growth
    if (processedEventIds.current.size > 2000) {
      processedEventIds.current.clear();
    }
  }, [
    latestLogData,
    appendLog,
    completeExecution,
    failExecution,
    onComplete,
    onError,
  ]);

  /* ---------------- Bulk Test Results ---------------- */
  useEffect(() => {
    if (!latestResultData) return;

    if (latestResultData.topic === "testresult") {
      const { sessionId, workflowId, results } = latestResultData.data;

      console.log(`Received bulk update with ${results.length} test results`);

      // Create a unique ID for this bulk emission
      const bulkEventId = `bulk:${sessionId}:${Date.now()}`;

      if (processedEventIds.current.has(bulkEventId)) {
        console.warn("Duplicate bulk event detected, skipping");
        return;
      }
      processedEventIds.current.add(bulkEventId);

      // Process each result in the bulk payload
      results.forEach((result) => {
        const {
          testResultId,
          testName,
          testType,
          status,
          resultData,
          durationMs,
          executedAt,
          action,
          containerLogs,
        } = result;

        const normalizedStatus = status as TestStatus;

        const basePayload = {
          id: testResultId,
          sessionId,
          workflowId,
          testName,
          testType: testType || "database",
          status: normalizedStatus,
          resultData: resultData ?? null,
          durationMs: durationMs ?? 0,
          executedAt: executedAt ?? new Date().toISOString(),
          containerLogs: containerLogs,
        };

        if (action === "create") {
          addTestResult(basePayload);
        } else if (action === "update") {
          // action === "update"
          if (!hasTestResult(testResultId)) {
            addTestResult(basePayload);
          } else {
            updateTestResult(testResultId, {
              status: normalizedStatus,
              resultData,
              durationMs,
              containerLogs,
            });
          }
        }
      });
    }

    // prevent unbounded growth
    if (processedEventIds.current.size > 2000) {
      processedEventIds.current.clear();
    }
  }, [addTestResult, updateTestResult, hasTestResult, latestResultData]);

  return {
    isConnected: !!(latestLogData && latestResultData),
  };
}
