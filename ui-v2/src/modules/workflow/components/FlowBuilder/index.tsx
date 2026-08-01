"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectContext } from "@/modules/projects/project-context";
import { useSyncContext } from "@/modules/sync/SyncProvider";
import {
  translateWorkflowGraphToServiceGraph,
  validateScenario,
} from "@/modules/utils/scenario-translator";
import { useBuilderExperience } from "../../hooks/useBuilderExperience";
import {
  getShortcutDescription,
  useKeyboardShortcuts,
} from "../../hooks/useKeyboardShortcuts";
import { useRealtimeTestResults } from "../../hooks/useRealTimeTestReults";
import { useRealtimeLogs } from "../../hooks/useRealtimeLogs";
import { useWorkflowExecution } from "../../hooks/useWorkflowExecution";
import { useWorkflowGraph } from "../../hooks/useWorkflowGraph";
import { deriveGuidedChecklist } from "../../lib/builder-experience";
import {
  isWorkflowRunActive,
  shouldPollExecutionFallback,
} from "../../lib/realtime-events";
import { cancelWorkflowRun } from "../../lib/runner-client";
import { createDefaultServiceNode } from "../../lib/workflow-defaults";
import { getServiceRemovalImpact } from "../../lib/workflow-presentation";
import { useExecutionStore } from "../../stores/execution.store.sync";
import { useScenarioStore } from "../../stores/scenario.store.sync";
import { useUIStore } from "../../stores/ui.store";
import { useWorkflowStore } from "../../stores/workflow.store.sync";
import type { FlowNode, ServiceType } from "../../types/react-flow-cots";
import { EdgeConfigDialog } from "../EdgeConfigDialog";
import { ExecutionHistory } from "../ExecutionHistory";
import {
  type GuidedStage,
  GuidedWorkflowWorkspace,
} from "../GuidedWorkflowWorkspace";
import { ShortcutsDialog } from "../KeyboardShortCutsDialog";
import { NodeConfigDialog } from "../NodeConfigDialog";
import { NodeDrawer } from "../NodeDrawer";
import { RunWorkflowDialog } from "../RunWorkflowDialog";
import { ScenarioDialog } from "../ScenarioDialog";
import { ServiceNode } from "../ServiceNode";
import { WorkflowLogsDrawer } from "../WorkflowLogsDrawer";
import { WorkflowVersionsDialog } from "../WorkflowVersionsDialog";
import { FlowCanvas } from "./FlowCanvas";

const EXECUTION_FALLBACK_POLL_INTERVAL_MS = 15000;

interface FlowBuilderProps {
  workflowId: string;
  onWorkflowStart?: (workflowRunId: string) => void;
  onWorkComplete?: (results: unknown) => void;
  onError?: (error: string) => void;
}

export const FlowBuilder: React.FC<FlowBuilderProps> = ({
  workflowId,
  onWorkflowStart,
  onWorkComplete,
  onError,
}) => {
  const router = useRouter();
  const nodeTypes = useMemo(() => ({ serviceNode: ServiceNode }), []);

  // Stores
  const updateWorkflowName = useWorkflowStore((s) => s.updateWorkflowName);
  const activeWorkflowRunId = useExecutionStore((s) => s.activeWorkflowRunId);
  const executions = useExecutionStore((s) => s.executions);
  const scenariosMap = useScenarioStore((s) => s.scenarios);
  const updateExecutionStatus = useExecutionStore(
    (s) => s.updateExecutionStatus,
  );
  const hydrated = useWorkflowStore((s) => s.hydrated);
  const activeExecution = useMemo(
    () =>
      activeWorkflowRunId ? (executions[activeWorkflowRunId] ?? null) : null,
    [activeWorkflowRunId, executions],
  );
  const liveExecution = isWorkflowRunActive(activeExecution?.status)
    ? activeExecution
    : null;
  const openActiveRun = useCallback(() => {
    if (!liveExecution) return;
    router.push(
      `/workflow/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(liveExecution.workflowRunId)}?projectId=${encodeURIComponent(liveExecution.projectId)}`,
    );
  }, [liveExecution, router, workflowId]);
  const cancelActiveExecution = useCallback(async () => {
    if (!activeExecution) return;
    try {
      const result = await cancelWorkflowRun(
        activeExecution.workflowRunId,
        activeExecution.projectId,
      );
      updateExecutionStatus(activeExecution.workflowRunId, result.status);
      toast.info(
        result.status === "cancelled"
          ? "Workflow cancelled"
          : "Cancellation requested; cleaning up resources",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to cancel workflow",
      );
    }
  }, [activeExecution, updateExecutionStatus]);
  // UI State
  const {
    isDrawerOpen,
    isNodeConfigOpen,
    isScenarioDialogOpen,
    isLogsOpen,
    isShortcutsOpen,
    selectedNode,
    openDrawer,
    closeDrawer,
    openNodeConfig,
    closeNodeConfig,
    openScenarios,
    closeScenarios,
    closeLogs,
    openShortcuts,
    closeShortcuts,
  } = useUIStore();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"overview" | "detail">("overview");
  const [selectedArchitectureNodeId, setSelectedArchitectureNodeId] = useState<
    string | null
  >(null);
  const [focusedScenarioServices, setFocusedScenarioServices] = useState<
    string[] | null
  >(null);
  const autoLayoutWorkflowRef = useRef<string | null>(null);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [guidedStage, setGuidedStage] = useState<GuidedStage>("services");
  const [servicePendingRemoval, setServicePendingRemoval] =
    useState<FlowNode | null>(null);
  const { activeProject, userId } = useProjectContext();
  const {
    mode: authoringMode,
    setMode: setAuthoringMode,
    checklistDismissed,
    dismissChecklist,
    restoreChecklist,
    isReady: isBuilderExperienceReady,
  } = useBuilderExperience(userId);
  const { queueSize } = useSyncContext();
  const canEdit = activeProject?.allowedActions.includes("edit") ?? false;
  const canRun = activeProject?.allowedActions.includes("run") ?? false;

  // Graph operations
  const {
    workflow,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setNodes,
    deleteNode,
    updateNode,
    addNode,
    connectNodes,
    editingEdgeId,
    setEditingEdgeId,
    updateEdge,
    saveGuidedEdge,
    deleteEdge,
    tidyLayout,
  } = useWorkflowGraph(workflowId);
  const editingEdge = edges.find((edge) => edge.id === editingEdgeId) ?? null;
  const reviewEdgeCount = edges.filter((edge) => edge.data?.needsReview).length;
  const workflowStats = useMemo(() => {
    const scenarios = Object.values(scenariosMap).filter(
      (scenario) => scenario.workflowId === workflowId && !scenario.is_deleted,
    );
    return {
      services: nodes.length,
      scenarios: scenarios.length,
      steps: scenarios.reduce(
        (total, scenario) => total + scenario.tests.length,
        0,
      ),
    };
  }, [nodes.length, scenariosMap, workflowId]);

  useEffect(() => {
    if (
      !canEdit ||
      !workflow ||
      nodes.length === 0 ||
      autoLayoutWorkflowRef.current === workflow.id ||
      edges.some((edge) => edge.data?.layoutPoints?.length)
    ) {
      return;
    }
    autoLayoutWorkflowRef.current = workflow.id;
    void tidyLayout({ persist: false });
  }, [canEdit, edges, nodes.length, tidyLayout, workflow]);

  // Execution
  const { execute, isExecuting, canExecute, validationResult } =
    useWorkflowExecution({
      workflowId,
      workflowName: workflow?.name || "",
      nodes,
      edges,
      onStart: onWorkflowStart,
      onComplete: onWorkComplete,
      onError,
    });
  const runnableScenarios = useMemo(
    () =>
      Object.values(scenariosMap)
        .filter(
          (scenario) =>
            scenario.workflowId === workflowId && !scenario.is_deleted,
        )
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [scenariosMap, workflowId],
  );
  const serviceRemovalImpact = useMemo(
    () =>
      servicePendingRemoval
        ? getServiceRemovalImpact(
            servicePendingRemoval,
            edges,
            runnableScenarios,
          )
        : null,
    [edges, runnableScenarios, servicePendingRemoval],
  );
  const guidedValidationErrors = useMemo(() => {
    const serviceGraph = translateWorkflowGraphToServiceGraph(nodes, edges);
    const errors = runnableScenarios.flatMap(
      (scenario) => validateScenario(serviceGraph, scenario).errors,
    );
    return Array.from(
      new Map(errors.map((error) => [error.message, error])).values(),
    );
  }, [edges, nodes, runnableScenarios]);
  const displayedValidationErrors = useMemo(
    () =>
      Array.from(
        new Map(
          [...guidedValidationErrors, ...(validationResult?.errors ?? [])].map(
            (error) => [error.message, error],
          ),
        ).values(),
      ),
    [guidedValidationErrors, validationResult?.errors],
  );
  const guidedChecklist = useMemo(
    () =>
      deriveGuidedChecklist({
        serviceCount: nodes.length,
        edges,
        scenarios: runnableScenarios,
        validationErrorCount: displayedValidationErrors.length,
      }),
    [displayedValidationErrors.length, edges, nodes.length, runnableScenarios],
  );
  const hasRunnableTest = runnableScenarios.some(
    (scenario) => scenario.tests.length > 0,
  );
  const canLaunchWorkflow =
    canRun &&
    canExecute &&
    hasRunnableTest &&
    displayedValidationErrors.length === 0 &&
    queueSize === 0;
  const runDisabledReason = useMemo(() => {
    if (isExecuting) return "A workflow run is already starting.";
    if (!canRun) return "Your project role does not allow workflow runs.";
    if (queueSize > 0) {
      return "Wait for pending workflow changes to finish syncing.";
    }
    if (nodes.length === 0) return "Add at least one service before running.";
    if (runnableScenarios.length === 0) {
      return "Create at least one scenario before running.";
    }
    if (!hasRunnableTest) {
      return "Add at least one test step to a scenario before running.";
    }
    if (displayedValidationErrors.length > 0) {
      return `Resolve ${displayedValidationErrors.length} validation issue${displayedValidationErrors.length === 1 ? "" : "s"} before running.`;
    }
    return undefined;
  }, [
    canRun,
    displayedValidationErrors.length,
    hasRunnableTest,
    isExecuting,
    nodes.length,
    queueSize,
    runnableScenarios.length,
  ]);
  const showGuidedChecklist = useCallback(() => {
    restoreChecklist();
    setAuthoringMode("guided");
  }, [restoreChecklist, setAuthoringMode]);

  const confirmServiceRemoval = useCallback(() => {
    if (!servicePendingRemoval || !serviceRemovalImpact) return;
    deleteNode(servicePendingRemoval.id);
    setServicePendingRemoval(null);
    toast.success(`${servicePendingRemoval.data.label} removed`, {
      description: `${serviceRemovalImpact.connectedEdges} connection${serviceRemovalImpact.connectedEdges === 1 ? "" : "s"} removed. ${serviceRemovalImpact.referencedTests} scenario step${serviceRemovalImpact.referencedTests === 1 ? "" : "s"} preserved for repair.`,
    });
  }, [deleteNode, servicePendingRemoval, serviceRemovalImpact]);

  // Realtime logs
  const {
    isConnected: isRunnerRealtimeConnected,
    lastActivityAt: runnerLastActivityAt,
  } = useRealtimeLogs({
    onComplete: onWorkComplete,
    onError,
  });

  // Real-time test results with enhanced tracking
  const { summary, hasTests } = useRealtimeTestResults({
    onTestComplete: (testResult) => {
      console.log(
        `[FlowBuilder] Test completed: ${testResult.testName} - ${testResult.status}`,
      );

      // Show toast for test completion (only for final states)
      if (testResult.status === "passed") {
        toast.success(`✓ ${testResult.testName}`, {
          description: `Completed in ${testResult.durationMs}ms`,
          duration: 3000,
        });
      } else if (testResult.status === "failed") {
        const failureMessage =
          testResult.resultData &&
          typeof testResult.resultData === "object" &&
          "message" in testResult.resultData
            ? String(testResult.resultData.message)
            : "Test failed";
        toast.error(`✗ ${testResult.testName}`, {
          description: failureMessage,
          duration: 5000,
        });
      }
    },
    onAllTestsComplete: (workflowRunId, testSummary) => {
      console.log(
        `[FlowBuilder] All tests complete for workflow run ${workflowRunId}:`,
        testSummary,
      );

      // Show completion toast
      if (testSummary.failed === 0) {
        toast.success("All tests passed! 🎉", {
          description: `${testSummary.passed}/${testSummary.total} tests completed successfully`,
          duration: 5000,
        });
      } else {
        toast.warning("Tests completed with failures", {
          description: `${testSummary.passed} passed, ${testSummary.failed} failed`,
          duration: 5000,
        });
      }

      onWorkComplete?.(testSummary);
    },
    onError: (error) => {
      console.error("[FlowBuilder] Test execution error:", error);
      toast.error("Test execution error", {
        description: error,
        duration: 5000,
      });
      onError?.(error);
    },
  });

  // Log test summary changes for debugging
  useEffect(() => {
    if (hasTests) {
      console.log("[FlowBuilder] Test Summary:", summary);
    }
  }, [summary, hasTests]);

  const activeExecutionStatus = activeExecution?.status;
  const activeExecutionProjectId = activeExecution?.projectId;

  useEffect(() => {
    if (
      !shouldPollExecutionFallback({
        workflowRunId: activeWorkflowRunId,
        projectId: activeExecutionProjectId,
        status: activeExecutionStatus,
        realtimeConnected: isRunnerRealtimeConnected,
      })
    ) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const hydrateExecutionState = async () => {
      try {
        const { hydrateFromServer } = await import(
          "@/modules/sync/sync-hydration"
        );
        if (cancelled) return;
        await hydrateFromServer();
      } catch (error) {
        console.error("[FlowBuilder] Execution hydration failed:", error);
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(
            hydrateExecutionState,
            EXECUTION_FALLBACK_POLL_INTERVAL_MS,
          );
        }
      }
    };

    timeoutId = setTimeout(
      hydrateExecutionState,
      EXECUTION_FALLBACK_POLL_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    activeExecutionProjectId,
    activeExecutionStatus,
    activeWorkflowRunId,
    isRunnerRealtimeConnected,
  ]);

  // Inject delete handler into nodes
  useEffect(() => {
    if (!workflow) return;

    setNodes(
      workflow.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onDelete: canEdit ? deleteNode : undefined,
        },
      })),
    );
  }, [workflow?.id, deleteNode, setNodes, workflow, canEdit]);

  // Add service node helper
  const handleAddNode = (type: ServiceType) => {
    const id = `${type}-${Date.now()}`;
    const position = {
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
    };

    const flowNode = createDefaultServiceNode(id, position, type);

    flowNode.data = {
      ...flowNode.data,
      onDelete: deleteNode,
    };

    addNode(flowNode);
  };

  // Keyboard shortcuts
  const { shortcuts } = useKeyboardShortcuts(
    {
      openLogs: {
        shortcut: { key: "l", ctrl: true },
        handler: () => {
          if (liveExecution) {
            openActiveRun();
          }
        },
      },
      openAddNode: {
        shortcut: { key: "n", ctrl: true },
        handler: () => {
          if (canEdit) openDrawer();
        },
      },
      runWorkflow: {
        shortcut: { key: "Enter", ctrl: true },
        handler: () => {
          if (canRun && canExecute) {
            setIsRunDialogOpen(true);
          }
        },
      },
      toggleShortcuts: {
        shortcut: { key: "?" },
        handler: () => {
          if (isShortcutsOpen) {
            closeShortcuts();
          } else {
            openShortcuts();
          }
        },
      },
      closeDialogs: {
        shortcut: { key: "Escape" },
        handler: () => {
          if (isShortcutsOpen) {
            closeShortcuts();
          } else if (isScenarioDialogOpen) {
            closeScenarios();
          } else if (isLogsOpen) {
            closeLogs();
          } else if (isDrawerOpen) {
            closeDrawer();
          } else if (isNodeConfigOpen) {
            closeNodeConfig();
          }
        },
      },
    },
    true,
  );

  // Show loading state while hydrating
  if (!hydrated || !isBuilderExperienceReady) {
    return (
      <output
        className="flex h-screen flex-col gap-4 p-4 sm:p-6"
        aria-label="Loading workflow builder"
      >
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="min-h-0 flex-1" />
      </output>
    );
  }

  // Show not found if workflow doesn't exist after hydration
  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Workflow not found</p>
          <p className="text-xs text-muted-foreground">ID: {workflowId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full">
      <ReactFlowProvider>
        {authoringMode === "guided" ? (
          <GuidedWorkflowWorkspace
            workflowId={workflowId}
            workflowName={workflow.name}
            provenance={workflow.provenance}
            nodes={nodes}
            edges={edges}
            canEdit={canEdit}
            canRun={canLaunchWorkflow}
            runDisabledReason={runDisabledReason}
            isExecuting={isExecuting}
            onAddService={openDrawer}
            onEditService={openNodeConfig}
            onRemoveService={setServicePendingRemoval}
            scenarios={runnableScenarios}
            onRun={() => setIsRunDialogOpen(true)}
            onViewActiveRun={liveExecution ? openActiveRun : undefined}
            authoringMode={authoringMode}
            onAuthoringModeChange={setAuthoringMode}
            checklist={guidedChecklist}
            showChecklist={!checklistDismissed}
            onDismissChecklist={dismissChecklist}
            onShowChecklist={showGuidedChecklist}
            activeStage={guidedStage}
            onStageChange={setGuidedStage}
            onSaveConnection={saveGuidedEdge}
            onConfirmConnection={updateEdge}
            onDeleteConnection={deleteEdge}
            validationErrors={displayedValidationErrors}
          />
        ) : (
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connectNodes}
            onNodeDoubleClick={(_, node) => openNodeConfig(node)}
            onEdgeClick={(_, edge) => setEditingEdgeId(edge.id)}
            onExecute={() => setIsRunDialogOpen(true)}
            onOpenDrawer={openDrawer}
            onOpenScenarios={openScenarios}
            onOpenLogs={openActiveRun}
            onOpenShortcuts={openShortcuts}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenVersions={() => setIsVersionsOpen(true)}
            authoringMode={authoringMode}
            onAuthoringModeChange={setAuthoringMode}
            onShowChecklist={showGuidedChecklist}
            isExecuting={isExecuting}
            canExecute={canLaunchWorkflow}
            runDisabledReason={runDisabledReason}
            canEdit={canEdit}
            hasActiveExecution={!!liveExecution}
            reviewEdgeCount={reviewEdgeCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedNodeId={selectedArchitectureNodeId}
            onSelectedNodeChange={setSelectedArchitectureNodeId}
            onTidyLayout={tidyLayout}
            focusedServiceNames={focusedScenarioServices}
            onClearScenarioFocus={() => setFocusedScenarioServices(null)}
            workflowStats={workflowStats}
          />
        )}

        <AlertDialog
          open={Boolean(servicePendingRemoval)}
          onOpenChange={(open) => {
            if (!open) setServicePendingRemoval(null);
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {servicePendingRemoval?.data.label}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The service and its {serviceRemovalImpact?.connectedEdges ?? 0}{" "}
                attached connection
                {(serviceRemovalImpact?.connectedEdges ?? 0) === 1 ? "" : "s"}{" "}
                will be removed. {serviceRemovalImpact?.referencedTests ?? 0}{" "}
                scenario step
                {(serviceRemovalImpact?.referencedTests ?? 0) === 1 ? "" : "s"}{" "}
                across {serviceRemovalImpact?.referencedScenarios ?? 0} scenario
                {(serviceRemovalImpact?.referencedScenarios ?? 0) === 1
                  ? ""
                  : "s"}{" "}
                will stay in place and be flagged for repair.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmServiceRemoval}
              >
                Remove service
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {canEdit ? (
          <EdgeConfigDialog
            edge={editingEdge}
            nodes={nodes}
            onClose={() => setEditingEdgeId(null)}
            onSave={updateEdge}
          />
        ) : null}

        {canEdit ? (
          <NodeDrawer
            currentWorkflowName={workflow.name}
            isOpen={isDrawerOpen}
            onClose={closeDrawer}
            onAddNode={handleAddNode}
            onWorkflowNameChange={(name) =>
              updateWorkflowName(workflow.id, name)
            }
          />
        ) : null}

        {canEdit ? (
          <NodeConfigDialog
            workflowId={workflowId}
            isOpen={isNodeConfigOpen}
            node={selectedNode}
            nodes={nodes}
            onClose={closeNodeConfig}
            onSave={updateNode}
          />
        ) : null}

        <ScenarioDialog
          open={isScenarioDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              openScenarios();
            } else {
              closeScenarios();
            }
          }}
          workflowId={workflowId}
          nodes={nodes}
          onFocusServices={(serviceNames) => {
            setFocusedScenarioServices(serviceNames);
            setSelectedArchitectureNodeId(null);
          }}
          canEdit={canEdit}
        />

        <RunWorkflowDialog
          open={isRunDialogOpen}
          onOpenChange={setIsRunDialogOpen}
          nodes={nodes}
          scenarios={runnableScenarios}
          isExecuting={isExecuting}
          validationErrors={displayedValidationErrors}
          onRun={execute}
        />

        <WorkflowLogsDrawer
          open={isLogsOpen}
          onOpenChange={closeLogs}
          execution={activeExecution}
          realtimeConnected={isRunnerRealtimeConnected}
          lastActivityAt={runnerLastActivityAt}
          onCancel={cancelActiveExecution}
        />

        <ShortcutsDialog
          open={isShortcutsOpen}
          onOpenChange={closeShortcuts}
          shortcuts={shortcuts.map((s) => ({
            id: s.id,
            shortcut: s.shortcut,
            description: getShortcutDescription(s.id),
          }))}
        />

        <ExecutionHistory
          workflowId={workflowId}
          open={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          canEdit={canEdit}
        />

        <WorkflowVersionsDialog
          open={isVersionsOpen}
          onOpenChange={setIsVersionsOpen}
          workflowId={workflowId}
          projectId={workflow.projectId}
          workflowVersion={workflow.version}
          canEdit={canEdit}
        />
      </ReactFlowProvider>
    </div>
  );
};
