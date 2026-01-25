import { useWorkflowStore } from "./workflow.store";

export const useLatestExecution = (workflowId: string) =>
  useWorkflowStore((state) => {
    const wf = state.workflows[workflowId];
    if (!wf || wf.executions.length === 0) return null;
    return wf.executions[0];
  });
