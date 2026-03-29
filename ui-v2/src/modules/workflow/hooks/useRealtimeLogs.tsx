"use client";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { useEffect, useRef } from "react";
import {
  fetchLogsRealtimeSubscriptionToken,
  fetchTestResultRealtimeSubscriptionToken,
} from "@/modules/utils/get-subscribe-token";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useTestResultStore } from "../stores/test-result.store";

type TestStatus = "pending" | "running" | "passed" | "failed";

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

  const appendLog = useExecutionStore((s) => s.appendLog);
  const completeExecution = useExecutionStore((s) => s.completeExecution);
  const failExecution = useExecutionStore((s) => s.failExecution);

  const _addTestResult = useTestResultStore((s) => s.addTestResult);
  const updateTestResult = useTestResultStore((s) => s.updateTestResult);
  const _hasTestResult = useTestResultStore((s) => s.hasTestResult);

  const processedEventIds = useRef(new Set<string>());

  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  /* ---------------- Workflow Logs ---------------- */
  useEffect(() => {
    if (!latestLogData) return;

    if (latestLogData.topic === "workflowlog") {
      const { sessionId, message, status, result, error, timestamp, sequence } =
        latestLogData.data;
      const eventId = `workflowlog:${sessionId}:${timestamp}:${sequence}`;

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
      const entries = Array.from(processedEventIds.current);
      processedEventIds.current = new Set(entries.slice(1000));
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
      const { sessionId, workflowId, results, bulkId } = latestResultData.data;

      console.log(`Received bulk update with ${results.length} test results`);

      if (processedEventIds.current.has(bulkId)) {
        return;
      }
      processedEventIds.current.add(bulkId);

      const sortedResults = [...results].sort(
        (a, b) => a.sequence - b.sequence,
      );

      // Process each result in the bulk payload
      sortedResults.forEach((result) => {
        const {
          testResultId,
          testName,
          testType,
          status,
          resultData,
          durationMs,
          executedAt,
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

        updateTestResult(testResultId, basePayload);
      });
    }

    // prevent unbounded growth
    if (processedEventIds.current.size > 2000) {
      const entries = Array.from(processedEventIds.current);
      processedEventIds.current = new Set(entries.slice(1000));
      processedEventIds.current.clear();
    }
  }, [updateTestResult, latestResultData]);

  return {
    isConnected: !!(latestLogData && latestResultData),
  };
}
