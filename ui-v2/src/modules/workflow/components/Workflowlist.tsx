"use client";

import { useRouter } from "next/navigation";
import { useWorkflowStore } from "../stores/workflow.store.sync";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@tabler/icons-react";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useState } from "react";

export const WorkflowList = () => {
  const router = useRouter();
  const workflows = useWorkflowStore((s) => s.workflows);
  const executions = useExecutionStore((s) => s.executions);
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow);
  const setActiveWorkflow = useWorkflowStore((s) => s.setActiveWorkflow);

  const [isCreating, setIsCreating] = useState(false);

  const workflowsList = Object.values(workflows)
    .filter((w) => !w.is_deleted) // Filter out deleted workflows
    .sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });

  const handleCreate = async () => {
    try {
      setIsCreating(true);

      // Create workflow
      const id = createWorkflow("New Workflow");

      // Set as active
      setActiveWorkflow(id);

      // Small delay to ensure IndexedDB persistence completes
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Navigate
      router.push(`/workflow/${id}`);
    } catch (error) {
      console.error("Failed to create workflow:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Workflows</h1>
        <Button
          className="cursor-pointer font-semibold"
          onClick={handleCreate}
          disabled={isCreating}
        >
          <IconPlus className="w-4 h-4" />
          {isCreating ? "Creating..." : "New Workflow"}
        </Button>
      </div>

      {workflowsList.length === 0 && (
        <p className="text-muted-foreground">No workflows yet.</p>
      )}

      <div className="grid gap-3">
        {workflowsList.map((workflow) => {
          const executionCount = Object.values(executions).filter(
            (e) => e.workflowId === workflow.id && !e.is_deleted,
          ).length;

          return (
            <div
              key={workflow.id}
              className="border rounded p-4 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => {
                setActiveWorkflow(workflow.id);
                router.push(`/workflow/${workflow.id}`);
              }}
            >
              <div className="font-medium">{workflow.name}</div>
              <div className="text-sm text-muted-foreground">
                {executionCount} execution{executionCount !== 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
