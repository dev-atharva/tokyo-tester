"use client";

import { ReactFlowProvider } from "@xyflow/react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  createGenericServiceNode,
  createKafkaNode,
  createMariaDbNode,
  createMySqlNode,
  createPostgresNode,
  createRedisNode,
} from "@/modules/utils/node-factory";
import {
  getShortcutDescription,
  useKeyboardShortcuts,
} from "../../hooks/useKeyboardShortcuts";
import { useRealtimeTestResults } from "../../hooks/useRealTimeTestReults";
import { useRealtimeLogs } from "../../hooks/useRealtimeLogs";
import { useWorkflowExecution } from "../../hooks/useWorkflowExecution";
import { useWorkflowGraph } from "../../hooks/useWorkflowGraph";
import { useExecutionStore } from "../../stores/execution.store.sync";
import { useUIStore } from "../../stores/ui.store";
import { useWorkflowStore } from "../../stores/workflow.store.sync";
import { ExecutionHistory } from "../ExecutionHistory";
import { ShortcutsDialog } from "../KeyboardShortCutsDialog";
import { NodeConfigDialog } from "../NodeConfigDialog";
import { NodeDrawer } from "../NodeDrawer";
import { ScenarioDialog } from "../ScenarioDialog";
import { ServiceNode } from "../ServiceNode";
import { WorkflowLogsDrawer } from "../WorkflowLogsDrawer";
import { FlowCanvas } from "./FlowCanvas";

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
  const hydrated = useWorkflowStore((s) => s.hydrated);
  const activeExecution = useMemo(
    () =>
      activeWorkflowRunId ? executions[activeWorkflowRunId] ?? null : null,
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
  } = useWorkflowGraph(workflowId);

  // Execution
  const { execute, isExecuting, canExecute } = useWorkflowExecution({
    workflowId,
    workflowName: workflow?.name || "",
    nodes,
    edges,
    onStart: onWorkflowStart,
    onComplete: onWorkComplete,
    onError,
  });

  // Realtime logs
  useRealtimeLogs({
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

  // Inject delete handler into nodes
  useEffect(() => {
    if (!workflow) return;

    setNodes(
      workflow.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onDelete: deleteNode,
        },
      })),
    );
  }, [workflow?.id, deleteNode, setNodes, workflow]);

  // Add service node helper
  const handleAddNode = (
    type: "postgres" | "redis" | "mysql" | "mariadb" | "generic" | "kafka",
  ) => {
    const id = `${type}-${Date.now()}`;
    const position = {
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
    };

    const flowNode = (() => {
      switch (type) {
        case "postgres":
          return createPostgresNode(id, position, {
            label: "PostgreSQL",
            database: "testdb",
            user: "postgres",
            password: "postgres",
          });
        case "mysql":
          return createMySqlNode(id, position, {
            label: "MySQL",
            database: "testdb",
            user: "root",
            password: "root",
          });
        case "mariadb":
          return createMariaDbNode(id, position, {
            label: "MariaDB",
            database: "testdb",
            user: "root",
            password: "root",
          });
        case "redis":
          return createRedisNode(id, position, {
            label: "Redis",
            password: "",
            database: 0,
          });
        case "kafka":
          return createKafkaNode(id, position, {
            label: "Kafka",
            clusterId: "test-cluster",
          });
        default:
          return createGenericServiceNode(id, position, {
            label: "API Server",
            image: "nginx:alpine",
            ports: [{ host: "8080", container: "80" }],
          });
      }
    })();

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
        handler: openDrawer,
      },
      runWorkflow: {
        shortcut: { key: "Enter", ctrl: true },
        handler: () => {
          if (canExecute) {
            execute();
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
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connectNodes}
          onNodeDoubleClick={(_, node) => openNodeConfig(node)}
          onExecute={execute}
          onOpenDrawer={openDrawer}
          onOpenScenarios={openScenarios}
          onOpenLogs={openLogs}
          onOpenShortcuts={openShortcuts}
          onOpenHistory={() => setIsHistoryOpen(true)}
          isExecuting={isExecuting}
          canExecute={canExecute}
          hasActiveExecution={!!activeExecution}
        />

        <NodeDrawer
          currentWorkflowName={workflow.name}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          onAddNode={handleAddNode}
          onWorkflowNameChange={(name) => updateWorkflowName(workflow.id, name)}
        />

        <NodeConfigDialog
          isOpen={isNodeConfigOpen}
          node={selectedNode}
          nodes={nodes}
          onClose={closeNodeConfig}
          onSave={updateNode}
        />

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
        />
      </ReactFlowProvider>
    </div>
  );
};
