"use client";

import { IconFileOff, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useWorkflowStore } from "../stores/workflow.store.sync";
import { Badge } from "@/components/ui/badge";

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

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h age`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage your test workflows
          </p>
        </div>

        <Button
          className="cursor-pointer font-semibold shadow-md"
          onClick={handleCreate}
          disabled={isCreating}
        >
          <IconPlus className="mr-2 size-4" />
          {isCreating ? "Creating..." : "New Workflow"}
        </Button>
      </div>

      {workflowsList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-border/60 rounded-xl bg-muted/20">
          <div className="p-4 rounded-full bg-muted/50 mb-4">
            <IconFileOff className="size-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
            Get started by creating your first workflow to automate your testing
            scenarios
          </p>
          <Button
            className="cursor-pointer font-semibold shadow-md"
            onClick={handleCreate}
            disabled={isCreating}
          >
            <IconPlus className="mr-2 size-4" />
            Create Workflow
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {workflowsList.map((workflow) => {
            const executionCount = Object.values(executions).filter(
              (e) => e.workflowId === workflow.id && !e.is_deleted,
            ).length;

            return (
              <button
                type="button"
                key={workflow.id}
                className="group relative bg-card border-2 border-border/60 rounded-xl p-5 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200 text-left w-full"
                onClick={() => {
                  setActiveWorkflow(workflow.id);
                  router.push(`/workflow/${workflow.id}`);
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1.5 truncate group-hover:text-primary transition-colors">
                      {workflow.name}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>Created {formatDate(workflow.created_at)}</span>
                      <span className="text-border"></span>
                      <span>
                        {executionCount} execution
                        {executionCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  {executionCount > 0 && (
                    <Badge variant="secondary" className=" shrink-0">
                      {executionCount}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
