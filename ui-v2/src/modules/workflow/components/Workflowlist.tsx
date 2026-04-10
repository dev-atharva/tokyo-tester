"use client";

import {
  IconCopy,
  IconDotsVertical,
  IconDownload,
  IconFileImport,
  IconFileOff,
  IconFolderOpen,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectContext } from "@/modules/projects/project-context";
import {
  createClonedWorkflowBundle,
  createWorkflowBundle,
  materializeWorkflowBundle,
  parseWorkflowBundle,
} from "../lib/workflow-bundle";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useScenarioStore } from "../stores/scenario.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import { useWorkflowStore } from "../stores/workflow.store.sync";

export const WorkflowList = () => {
  const router = useRouter();
  const workflows = useWorkflowStore((s) => s.workflows);
  const executions = useExecutionStore((s) => s.executions);
  const clearExecution = useExecutionStore((s) => s.clearExecution);
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);
  const updateWorkflowGraph = useWorkflowStore((s) => s.updateWorkflowGraph);
  const setActiveWorkflow = useWorkflowStore((s) => s.setActiveWorkflow);
  const createScenario = useScenarioStore((s) => s.createScenario);
  const deleteScenario = useScenarioStore((s) => s.deleteScenario);
  const updateScenario = useScenarioStore((s) => s.updateScenario);
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario);
  const scenariosMap = useScenarioStore((s) => s.scenarios);
  const scenarioRuns = useScenarioRunStore((s) => s.scenarioRuns);
  const clearScenarioRun = useScenarioRunStore((s) => s.clearScenarioRun);
  const testResults = useTestResultStore((s) => s.testResults);
  const deleteTestResult = useTestResultStore((s) => s.deleteTestResult);
  const { activeProjectId, activeProject, projects } = useProjectContext();

  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [workflowPendingDelete, setWorkflowPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const workflowsList = useMemo(
    () =>
      Object.values(workflows)
        .filter(
          (w) =>
            !w.is_deleted &&
            !!activeProjectId &&
            w.projectId === activeProjectId,
        )
        .sort((a, b) => {
          const aTime = new Date(a.created_at).getTime();
          const bTime = new Date(b.created_at).getTime();
          return bTime - aTime;
        }),
    [workflows, activeProjectId],
  );

  const hasProject = Boolean(activeProjectId);

  const handleCreate = async () => {
    if (!activeProjectId) {
      return;
    }

    try {
      setIsCreating(true);

      const id = createWorkflow(activeProjectId, "New Workflow");

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

  const createWorkflowFromBundle = async (
    workflowName: string,
    workflowDescription: string,
    nodes: Parameters<typeof updateWorkflowGraph>[1],
    edges: Parameters<typeof updateWorkflowGraph>[2],
    scenarios: ReturnType<typeof materializeWorkflowBundle>["scenarios"],
  ) => {
    if (!activeProjectId) {
      throw new Error("Select a project before importing a workflow.");
    }

    const workflowId = createWorkflow(
      activeProjectId,
      workflowName,
      workflowDescription,
    );
    updateWorkflowGraph(workflowId, nodes, edges);

    let firstScenarioId: string | null = null;
    for (const scenario of scenarios) {
      const scenarioId = createScenario(workflowId, scenario.name);
      if (!firstScenarioId) {
        firstScenarioId = scenarioId;
      }
      updateScenario(scenarioId, {
        name: scenario.name,
        description: scenario.description || "",
        tests: scenario.tests,
        testOrder: scenario.testOrder,
      });
    }

    setActiveWorkflow(workflowId);
    if (firstScenarioId) {
      setActiveScenario(workflowId, firstScenarioId);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    router.push(`/workflow/${workflowId}`);
    return workflowId;
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !activeProjectId) {
      return;
    }

    try {
      setIsImporting(true);
      const bundle = parseWorkflowBundle(await file.text());
      const materialized = materializeWorkflowBundle(
        bundle,
        workflowsList.map((workflow) => workflow.name),
      );

      await createWorkflowFromBundle(
        materialized.workflow.name,
        materialized.workflow.description || "",
        materialized.workflow.nodes,
        materialized.workflow.edges,
        materialized.scenarios,
      );

      toast.success("Workflow imported", {
        description: `${materialized.workflow.name} is ready to edit.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import workflow.";
      toast.error("Import failed", { description: message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = (workflowId: string) => {
    const workflow = workflows[workflowId];
    if (!workflow) {
      return;
    }

    try {
      const scenarios = Object.values(scenariosMap).filter(
        (scenario) =>
          scenario.workflowId === workflowId && !scenario.is_deleted,
      );
      const bundle = createWorkflowBundle(workflow, scenarios);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workflow"}.workflow-bundle.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      toast.success("Workflow exported", {
        description: `${workflow.name} was saved as a workflow bundle.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export workflow.";
      toast.error("Export failed", { description: message });
    }
  };

  const handleClone = async (workflowId: string) => {
    const workflow = workflows[workflowId];
    if (!workflow) {
      return;
    }

    try {
      const scenarios = Object.values(scenariosMap).filter(
        (scenario) =>
          scenario.workflowId === workflowId && !scenario.is_deleted,
      );
      const cloned = createClonedWorkflowBundle(
        workflow,
        scenarios,
        workflowsList.map((item) => item.name),
      );

      await createWorkflowFromBundle(
        cloned.workflow.name,
        cloned.workflow.description || "",
        cloned.workflow.nodes,
        cloned.workflow.edges,
        cloned.scenarios,
      );

      toast.success("Workflow cloned", {
        description: `${cloned.workflow.name} was created from ${workflow.name}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clone workflow.";
      toast.error("Clone failed", { description: message });
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!workflowPendingDelete) {
      return;
    }

    const { id: workflowId, name } = workflowPendingDelete;

    try {
      setIsDeleting(true);

      const relatedScenarios = Object.values(scenariosMap).filter(
        (scenario) =>
          scenario.workflowId === workflowId && !scenario.is_deleted,
      );
      const relatedExecutions = Object.values(executions).filter(
        (execution) =>
          execution.workflowId === workflowId && !execution.is_deleted,
      );
      const relatedScenarioRuns = Object.values(scenarioRuns).filter(
        (run) => run.workflowId === workflowId && !run.is_deleted,
      );
      const relatedTestResults = Object.values(testResults).filter(
        (result) => result.workflowId === workflowId && !result.is_deleted,
      );

      for (const result of relatedTestResults) {
        deleteTestResult(result.id);
      }

      for (const run of relatedScenarioRuns) {
        clearScenarioRun(run.id);
      }

      for (const execution of relatedExecutions) {
        clearExecution(execution.workflowRunId);
      }

      for (const scenario of relatedScenarios) {
        deleteScenario(scenario.id);
      }

      deleteWorkflow(workflowId);
      setWorkflowPendingDelete(null);

      toast.success("Workflow deleted", {
        description: `${name} and its related data were removed.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete workflow.";
      toast.error("Delete failed", { description: message });
    } finally {
      setIsDeleting(false);
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
    <AlertDialog
      open={Boolean(workflowPendingDelete)}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setWorkflowPendingDelete(null);
        }
      }}
    >
      <div className="flex flex-col gap-6 p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImport}
        />

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Workflows</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeProject
                ? `Create and manage workflows in ${activeProject.name}`
                : "Select a project to start creating workflows"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="cursor-pointer font-semibold shadow-md"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting || !hasProject}
            >
              <IconFileImport data-icon="inline-start" />
              {isImporting ? "Importing..." : "Import Workflow"}
            </Button>
            <Button
              className="cursor-pointer font-semibold shadow-md"
              onClick={handleCreate}
              disabled={isCreating || !hasProject}
            >
              <IconPlus data-icon="inline-start" />
              {isCreating ? "Creating..." : "New Workflow"}
            </Button>
          </div>
        </div>

        {!hasProject ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-16">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <IconFileOff className="size-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">No active project</h3>
            <p className="mb-2 max-w-md text-center text-sm text-muted-foreground">
              {projects.length === 0
                ? "You do not belong to any project yet. Ask an admin to add you to a project."
                : "Choose a project from the switcher in the top bar to load its workflows."}
            </p>
          </div>
        ) : workflowsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/20 px-4 py-16">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <IconFileOff className="size-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">No workflows yet</h3>
            <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
              Get started by creating your first workflow to automate your
              testing scenarios
            </p>
            <Button
              className="cursor-pointer font-semibold shadow-md"
              onClick={handleCreate}
              disabled={isCreating || !hasProject}
            >
              <IconPlus data-icon="inline-start" />
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
                <div
                  key={workflow.id}
                  className="group relative w-full cursor-pointer rounded-xl border-2 border-border/60 bg-card p-5 text-left transition-all duration-200 hover:border-primary/50 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setActiveWorkflow(workflow.id);
                        router.push(`/workflow/${workflow.id}`);
                      }}
                    >
                      <h3 className="mb-1.5 truncate text-lg font-semibold transition-colors group-hover:text-primary">
                        {workflow.name}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>Created {formatDate(workflow.created_at)}</span>
                        <span>
                          {executionCount} execution
                          {executionCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                    <div className="flex items-start gap-2">
                      {executionCount > 0 && (
                        <Badge variant="secondary" className="shrink-0">
                          {executionCount}
                        </Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                        >
                          <IconDotsVertical />
                          <span className="sr-only">Workflow actions</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => {
                                setActiveWorkflow(workflow.id);
                                router.push(`/workflow/${workflow.id}`);
                              }}
                            >
                              <IconFolderOpen />
                              Open workflow
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleClone(workflow.id)}
                            >
                              <IconCopy />
                              Clone workflow
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExport(workflow.id)}
                            >
                              <IconDownload />
                              Export bundle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                setWorkflowPendingDelete({
                                  id: workflow.id,
                                  name: workflow.name,
                                })
                              }
                            >
                              <IconTrash />
                              Delete workflow
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
          <AlertDialogDescription>
            {workflowPendingDelete
              ? `${workflowPendingDelete.name} will be deleted along with its scenarios, executions, scenario runs, and test results.`
              : "This workflow will be deleted along with all related data."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDeleteWorkflow}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete workflow"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
