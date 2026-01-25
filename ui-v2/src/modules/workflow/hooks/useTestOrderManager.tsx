import { useState, useEffect, useCallback } from "react";
import { useWorkflowStore } from "../stores/workflow.store.sync";

export function useTestOrderManager(workflowId: string) {
  const workflow = useWorkflowStore((s) => s.getWorkflow(workflowId));
  const updateWorkflowGraph = useWorkflowStore((s) => s.updateWorkflowGraph);

  const [customTestOrder, setCustomTestOrder] = useState<Map<string, string[]>>(
    new Map(),
  );

  // Load test order from workflow
  useEffect(() => {
    if (workflow?.customTestOrder) {
      setCustomTestOrder(new Map(Object.entries(workflow.customTestOrder)));
    }
  }, [workflow?.customTestOrder]);

  // Update test order
  const updateTestOrder = useCallback(
    (newOrder: Map<string, string[]>) => {
      setCustomTestOrder(newOrder);

      if (workflow) {
        updateWorkflowGraph(
          workflow.id,
          workflow.nodes,
          workflow.edges,
          newOrder,
        );
      }
    },
    [workflow, updateWorkflowGraph],
  );

  return {
    customTestOrder,
    updateTestOrder,
  };
}
