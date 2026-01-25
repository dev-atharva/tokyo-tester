import { useEffect, useRef } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { fetchRealtimeSubscriptionToken } from "@/modules/utils/get-subscribe-token";
import { useExecutionStore } from "../stores/execution.store.sync";

interface UseRealtimeLogsProps {
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function useRealtimeLogs({
  onComplete,
  onError,
}: UseRealtimeLogsProps = {}) {
  const { latestData } = useInngestSubscription({
    refreshToken: fetchRealtimeSubscriptionToken,
  });

  const appendLog = useExecutionStore((s) => s.appendLog);
  const completeExecution = useExecutionStore((s) => s.completeExecution);
  const failExecution = useExecutionStore((s) => s.failExecution);

  const processedMessageIds = useRef(new Set<string>());

  useEffect(() => {
    if (!latestData || latestData.topic !== "workflowlog") return;

    const { sessionId, message, status, result, error } = latestData.data;

    // Deduplication
    const messageId = `${sessionId}-${status}-${message}-${Date.now()}`;
    if (processedMessageIds.current.has(messageId)) {
      return;
    }

    processedMessageIds.current.add(messageId);

    // Clear old message IDs periodically to prevent memory leak
    if (processedMessageIds.current.size > 1000) {
      processedMessageIds.current.clear();
    }

    // Append log
    appendLog(sessionId, message);

    // Handle completion
    if (status === "completed") {
      completeExecution(sessionId, result);
      onComplete?.(result);
    }

    // Handle failure
    if (status === "failed") {
      failExecution(sessionId, error ?? "Workflow execution failed");
      onError?.(error ?? "Workflow execution failed");
    }
  }, [
    latestData,
    appendLog,
    completeExecution,
    failExecution,
    onComplete,
    onError,
  ]);

  return {
    isConnected: !!latestData,
  };
}
