"use client";

import {
  IconActivity,
  IconArrowRight,
  IconBox,
  IconChecklist,
  IconClock,
  IconCopy,
  IconDotsVertical,
  IconDownload,
  IconFileImport,
  IconFileOff,
  IconFolderOpen,
  IconPlus,
  IconRoute,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react";
import Image from "next/image";
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContext } from "@/modules/projects/project-context";
import { useSyncContext } from "@/modules/sync/SyncProvider";
import { syncService } from "@/modules/sync/sync-service";
import {
  createClonedWorkflowBundle,
  createWorkflowBundle,
  materializeWorkflowBundle,
  parseWorkflowBundle,
} from "../lib/workflow-bundle";
import {
  resolveWorkflowListState,
  summarizeWorkflowCard,
  summarizeWorkflowList,
} from "../lib/workflow-presentation";
import type {
  WorkflowTemplate,
  WorkflowTemplateId,
} from "../lib/workflow-templates";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useScenarioStore } from "../stores/scenario.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import { useWorkflowStore } from "../stores/workflow.store.sync";
import { WorkflowTemplateGallery } from "./WorkflowTemplateGallery";

export const WorkflowList = () => {
  const router = useRouter();
  const workflows = useWorkflowStore((s) => s.workflows);
  const hydrated = useWorkflowStore((s) => s.hydrated);
  const { isHydrating } = useSyncContext();
  const isReady = hydrated && !isHydrating;
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
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] =
    useState<WorkflowTemplateId>();
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
  const canEdit = activeProject?.allowedActions.includes("edit") ?? false;
  const scenariosList = useMemo(
    () =>
      Object.values(scenariosMap).filter((scenario) => !scenario.is_deleted),
    [scenariosMap],
  );
  const executionsList = useMemo(
    () =>
      Object.values(executions).filter((execution) => !execution.is_deleted),
    [executions],
  );
  const listState = resolveWorkflowListState({
    isReady,
    hasProject,
    canEdit,
    workflowCount: workflowsList.length,
  });
  const listSummary = useMemo(
    () => summarizeWorkflowList(workflowsList, scenariosList, executionsList),
    [executionsList, scenariosList, workflowsList],
  );

  const handleCreate = async () => {
    if (!activeProjectId || !canEdit) {
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

    await syncService.flushPendingBeforeRun(20);
    router.push(`/workflow/${workflowId}`);
    return workflowId;
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !activeProjectId || !canEdit) {
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
        description: syncService.hasPendingPreRunChanges()
          ? `${materialized.workflow.name} was created. Sync is still catching up, so wait for the status to clear before running.`
          : `${materialized.workflow.name} is synced and ready to edit.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import workflow.";
      toast.error("Import failed", { description: message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateFromTemplate = async (template: WorkflowTemplate) => {
    if (!activeProjectId || !canEdit) return;

    try {
      setPendingTemplateId(template.id);
      const materialized = materializeWorkflowBundle(
        template.bundle,
        workflowsList.map((workflow) => workflow.name),
      );
      await createWorkflowFromBundle(
        materialized.workflow.name,
        materialized.workflow.description || "",
        materialized.workflow.nodes,
        materialized.workflow.edges,
        materialized.scenarios,
      );
      setIsTemplateGalleryOpen(false);
      toast.success("Workflow created from template", {
        description: `${materialized.workflow.name} is synced and ready to edit.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create workflow from template.";
      toast.error("Template creation failed", { description: message });
    } finally {
      setPendingTemplateId(undefined);
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
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const executionStatusLabel = (status: string) =>
    status.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());

  const executionStatusVariant = (status: string) => {
    if (["failed", "partial_failed", "cleanup_failed"].includes(status)) {
      return "destructive" as const;
    }
    if (["running", "pending", "cancelling"].includes(status)) {
      return "default" as const;
    }
    if (status === "completed") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <>
      <AlertDialog
        open={Boolean(workflowPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setWorkflowPendingDelete(null);
          }
        }}
      >
        <div
          className="workflow-shell-enter mx-auto flex w-full max-w-[1920px] flex-col gap-5 p-4 sm:p-6"
          data-testid="workflow-list"
          data-hydrated={isReady}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImport}
          />

          <section className="relative overflow-hidden border bg-card shadow-sm">
            <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center border bg-primary/8 shadow-sm">
                  <Image
                    src="/icon.svg"
                    alt=""
                    width={30}
                    height={30}
                    priority
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[0.68rem] font-semibold tracking-[0.16em] text-primary uppercase">
                      Tokyo operations console
                    </span>
                    {activeProject ? (
                      <Badge variant="outline" className="max-w-56 truncate">
                        {activeProject.name}
                      </Badge>
                    ) : null}
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Workflows
                  </h1>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    {activeProject
                      ? canEdit
                        ? "Compose services and scenarios, then run the full environment with confidence."
                        : "Inspect configured environments and run the workflows available to your project."
                      : "Select a project to load its testing workflows and execution history."}
                  </p>
                </div>
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setIsTemplateGalleryOpen(true)}
                    disabled={!hasProject}
                  >
                    <IconTemplate data-icon="inline-start" />
                    Templates
                  </Button>
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
              ) : activeProject ? (
                <Badge variant="outline">Runner · read only</Badge>
              ) : null}
            </div>
          </section>

          {hasProject && listState !== "loading" ? (
            <section
              aria-label="Workflow summary"
              className="grid grid-cols-2 border-y bg-muted/20 md:grid-cols-4"
            >
              {[
                {
                  label: "Workflows",
                  value: listSummary.workflows,
                  icon: IconRoute,
                  testId: "workflow-summary-workflows",
                },
                {
                  label: "Services",
                  value: listSummary.services,
                  icon: IconBox,
                  testId: "workflow-summary-services",
                },
                {
                  label: "Scenarios",
                  value: listSummary.scenarios,
                  icon: IconChecklist,
                  testId: "workflow-summary-scenarios",
                },
                {
                  label: "Executions",
                  value: listSummary.executions,
                  icon: IconActivity,
                  testId: "workflow-summary-executions",
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  data-testid={metric.testId}
                  className="flex items-center gap-3 border-border/70 p-3.5 not-last:border-r max-md:nth-[2]:border-r-0 max-md:nth-[-n+2]:border-b"
                >
                  <div className="flex size-8 items-center justify-center border bg-background text-primary">
                    <metric.icon className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums leading-none">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                      {metric.label}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {listState === "loading" ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {["primary", "secondary", "tertiary"].map((skeletonId) => (
                <Card key={skeletonId} aria-label="Loading workflow">
                  <CardHeader>
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </CardContent>
                  <CardFooter className="justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-20" />
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : listState === "no-project" ? (
            <Empty className="min-h-72 border bg-muted/15">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="size-10">
                  <IconFileOff className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No active project</EmptyTitle>
                <EmptyDescription>
                  {projects.length === 0
                    ? "You do not belong to a project yet. Ask an admin to add you to one."
                    : "Choose a project from the switcher in the top bar to load its workflows."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : listState === "empty-editable" ||
            listState === "empty-readonly" ? (
            <Empty className="min-h-72 border bg-muted/15">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="size-10">
                  <IconRoute className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No workflows yet</EmptyTitle>
                <EmptyDescription>
                  {canEdit
                    ? "Start from a working example or compose a blank environment for your first scenario."
                    : "No workflows are available to run in this project yet."}
                </EmptyDescription>
              </EmptyHeader>
              {canEdit ? (
                <EmptyContent className="flex-row justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setIsTemplateGalleryOpen(true)}
                    disabled={!hasProject}
                  >
                    <IconTemplate data-icon="inline-start" />
                    Browse templates
                  </Button>
                  <Button
                    className="cursor-pointer font-semibold shadow-md"
                    onClick={handleCreate}
                    disabled={isCreating || !hasProject}
                  >
                    <IconPlus data-icon="inline-start" />
                    Create blank workflow
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {workflowsList.map((workflow) => {
                const summary = summarizeWorkflowCard(
                  workflow,
                  scenariosList,
                  executionsList,
                );
                const latestStatus = summary.latestExecution?.status;

                return (
                  <Card
                    key={workflow.id}
                    data-testid="workflow-card"
                    data-workflow-name={workflow.name}
                    data-service-count={summary.services}
                    data-scenario-count={summary.scenarios}
                    data-execution-count={summary.executions}
                    data-latest-status={latestStatus ?? "not-run"}
                    className="workflow-card-enter group relative transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    style={{
                      animationDelay: `${Math.min(workflowsList.indexOf(workflow), 5) * 45}ms`,
                    }}
                  >
                    <CardHeader>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {(workflow.provenance ?? "manual") === "mcp"
                            ? "MCP generated"
                            : workflow.provenance === "import"
                              ? "Imported"
                              : "Manual"}
                        </Badge>
                        {latestStatus ? (
                          <Badge variant={executionStatusVariant(latestStatus)}>
                            {executionStatusLabel(latestStatus)}
                          </Badge>
                        ) : (
                          <Badge variant="ghost">Not run</Badge>
                        )}
                      </div>
                      <CardTitle className="truncate text-base transition-colors group-hover:text-primary">
                        {workflow.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 min-h-9">
                        {workflow.description ||
                          "A composed environment ready for service and scenario configuration."}
                      </CardDescription>
                      <CardAction>
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
                              {canEdit ? (
                                <DropdownMenuItem
                                  onClick={() => handleClone(workflow.id)}
                                >
                                  <IconCopy />
                                  Clone workflow
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onClick={() => handleExport(workflow.id)}
                              >
                                <IconDownload />
                                Export bundle
                              </DropdownMenuItem>
                              {canEdit ? (
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
                              ) : null}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 border bg-muted/20">
                        {[
                          {
                            label: "Services",
                            value: summary.services,
                            icon: IconBox,
                          },
                          {
                            label: "Scenarios",
                            value: summary.scenarios,
                            icon: IconChecklist,
                          },
                          {
                            label: "Executions",
                            value: summary.executions,
                            icon: IconActivity,
                          },
                        ].map(({ label, value, icon: MetricIcon }) => (
                          <div
                            key={String(label)}
                            className="flex flex-col gap-1 px-3 py-2.5 not-last:border-r"
                          >
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MetricIcon className="size-3.5" />
                              <span className="text-[0.66rem] tracking-wide uppercase">
                                {label}
                              </span>
                            </div>
                            <span className="text-sm font-semibold tabular-nums">
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="justify-between gap-3 bg-muted/10">
                      <div className="min-w-0 text-[0.68rem] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <IconClock className="size-3.5" />
                          Updated {formatDate(workflow.updated_at)} ·{" "}
                          {summary.executions} execution
                          {summary.executions !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => {
                          setActiveWorkflow(workflow.id);
                          router.push(`/workflow/${workflow.id}`);
                        }}
                      >
                        Open
                        <IconArrowRight data-icon="inline-end" />
                      </Button>
                    </CardFooter>
                  </Card>
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
      <WorkflowTemplateGallery
        open={isTemplateGalleryOpen}
        onOpenChange={setIsTemplateGalleryOpen}
        onSelect={(template) => void handleCreateFromTemplate(template)}
        pendingTemplateId={pendingTemplateId}
      />
    </>
  );
};
