"use client";

import { ReactFlowProvider } from "@xyflow/react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { useProjectContext } from "@/modules/projects/project-context";
import { useSyncContext } from "@/modules/sync/SyncProvider";
import {
  getShortcutDescription,
  useKeyboardShortcuts,
} from "../../hooks/useKeyboardShortcuts";
import { useRealtimeTestResults } from "../../hooks/useRealTimeTestReults";
import { useRealtimeLogs } from "../../hooks/useRealtimeLogs";
import { useWorkflowExecution } from "../../hooks/useWorkflowExecution";
import { useWorkflowGraph } from "../../hooks/useWorkflowGraph";
import { shouldPollExecutionFallback } from "../../lib/realtime-events";
import { createDefaultServiceNode } from "../../lib/workflow-defaults";
import { useExecutionStore } from "../../stores/execution.store.sync";
import { useScenarioStore } from "../../stores/scenario.store.sync";
import { useUIStore } from "../../stores/ui.store";
import { useWorkflowStore } from "../../stores/workflow.store.sync";
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
  const nodeTypes = useMemo(() => ({ serviceNode: ServiceNode }), []);

  // Stores
  const updateWorkflowName = useWorkflowStore((s) => s.updateWorkflowName);
  const activeWorkflowRunId = useExecutionStore((s) => s.activeWorkflowRunId);
  const executions = useExecutionStore((s) => s.executions);
  const scenariosMap = useScenarioStore((s) => s.scenarios);
  const hydrated = useWorkflowStore((s) => s.hydrated);
  const activeExecution = useMemo(
    () =>
      activeWorkflowRunId ? (executions[activeWorkflowRunId] ?? null) : null,
    [activeWorkflowRunId, executions],
  );
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
    openLogs,
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
  const [authoringMode, setAuthoringMode] = useState<"guided" | "expert">(
    "guided",
  );
  const [guidedStage, setGuidedStage] = useState<GuidedStage>("services");
  const { activeProject } = useProjectContext();
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

  // Realtime logs
  const { isConnected: isRunnerRealtimeConnected } = useRealtimeLogs({
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
  const handleAddNode = (
    type:
      | "postgres"
      | "redis"
      | "mysql"
      | "mariadb"
      | "generic"
      | "kafka"
      | "rabbitmq"
      | "mongodb",
  ) => {
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
          if (activeExecution) {
            openLogs();
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
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
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
            canRun={canRun && canExecute && queueSize === 0}
            isExecuting={isExecuting}
            onAddService={openDrawer}
            onEditService={openNodeConfig}
            onRun={() => setIsRunDialogOpen(true)}
            onOpenExpert={() => setAuthoringMode("expert")}
            activeStage={guidedStage}
            onStageChange={setGuidedStage}
            onSaveConnection={saveGuidedEdge}
            onConfirmConnection={updateEdge}
            onDeleteConnection={deleteEdge}
            validationErrors={validationResult?.errors}
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
            onOpenLogs={openLogs}
            onOpenShortcuts={openShortcuts}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenVersions={() => setIsVersionsOpen(true)}
            onOpenGuided={() => setAuthoringMode("guided")}
            isExecuting={isExecuting}
            canExecute={canRun && canExecute && queueSize === 0}
            canEdit={canEdit}
            hasActiveExecution={!!activeExecution}
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
          validationErrors={validationResult?.errors}
          onRun={execute}
        />

        <WorkflowLogsDrawer
          open={isLogsOpen}
          onOpenChange={closeLogs}
          execution={activeExecution}
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
