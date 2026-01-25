import { useState, useCallback } from "react";
import { FlowNode, FlowEdge } from "../types/react-flow-cots";
import { validateFlow } from "@/modules/utils/react-flow-translator";
import { useExecutionStore } from "../stores/execution.store.sync";
import { inngest } from "@/modules/inngest/client";
import { toast } from "sonner";
import { useUIStore } from "../stores/ui.store";

interface UseWorkflowExecutionProps {
  workflowId: string;
  workflowName: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  customTestOrder: Map<string, string[]>;
  onStart?: (sessionId: string) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function useWorkflowExecution({
  workflowId,
  workflowName,
  nodes,
  edges,
  customTestOrder,
  onStart,
  onComplete,
  onError,
}: UseWorkflowExecutionProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const startExecution = useExecutionStore((s) => s.startExecution);
  const completeExecution = useExecutionStore((s) => s.completeExecution);
  const failExecution = useExecutionStore((s) => s.failExecution);
  const activeExecution = useExecutionStore((s) => s.getActiveExecution());

  const openLogsDrawer = useUIStore((s) => s.openLogs);

  const execute = useCallback(async () => {
    // Validate
    const result = validateFlow(nodes, edges);
    setValidationResult(result);

    if (!result.valid) {
      onError?.("Flow validation failed");
      toast.error("Flow validation failed");
      return;
    }

    setIsExecuting(true);

    try {
      const sessionId = crypto.randomUUID();

      // Start execution in store
      startExecution(workflowId, sessionId);
      onStart?.(sessionId);

      // Send to Inngest
      await inngest.send({
        name: "cots/workflow.start",
        data: {
          sessionId,
          workflowId,
          workflowName,
          nodes,
          edges,
          customTestOrder: Array.from(customTestOrder.entries()),
          userId: "demo-user",
        },
      });

      openLogsDrawer();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      failExecution("unknown", message);
      onError?.(message);
      toast.error(`Failed to start workflow: ${message}`);
    } finally {
      setIsExecuting(false);
    }
  }, [
    workflowId,
    workflowName,
    nodes,
    edges,
    customTestOrder,
    startExecution,
    failExecution,
    onStart,
    onError,
  ]);

  return {
    execute,
    isExecuting,
    validationResult,
    activeExecution,
    canExecute: nodes.length > 0 && !isExecuting,
  };
}
