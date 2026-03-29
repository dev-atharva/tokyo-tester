import { useCallback, useState } from "react";
import { toast } from "sonner";
import { inngest } from "@/modules/inngest/client";
import { validateFlow } from "@/modules/utils/react-flow-translator";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useRegistrySecretStore } from "../stores/registry-secret-store";
import { useUIStore } from "../stores/ui.store";
import type {
  FlowEdge,
  FlowNode,
  ValidationResult,
} from "../types/react-flow-cots";

interface UseWorkflowExecutionProps {
  workflowId: string;
  workflowName: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  customTestOrder: Map<string, string[]>;
  onStart?: (sessionId: string) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

export function useWorkflowExecution({
  workflowId,
  workflowName,
  nodes,
  edges,
  customTestOrder,
  onStart,
  onComplete: _onComplete,
  onError,
}: UseWorkflowExecutionProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  const startExecution = useExecutionStore((s) => s.startExecution);
  const failExecution = useExecutionStore((s) => s.failExecution);
  const activeExecution = useExecutionStore((s) => s.getActiveExecution());
  const secretStore = useRegistrySecretStore.getState();
  const registrySecrets = secretStore.secrets;

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
          registrySecrets,
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
    openLogsDrawer,
    registrySecrets,
  ]);

  return {
    execute,
    isExecuting,
    validationResult,
    activeExecution,
    canExecute: nodes.length > 0 && !isExecuting,
  };
}
