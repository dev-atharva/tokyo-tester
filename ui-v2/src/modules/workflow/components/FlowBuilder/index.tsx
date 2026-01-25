"use client";

import React, { useMemo, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ServiceNode } from "../ServiceNode";
import { FlowCanvas } from "./FlowCanvas";
import { NodeDrawer } from "../NodeDrawer";
import { NodeConfigDialog } from "../NodeConfigDialog";
import { WorkflowLogsDrawer } from "../WorkflowLogsDrawer";
import { ShortcutsDialog } from "../KeyboardShortCutsDialog";
import { ExecutionHistory } from "../ExecutionHistory";

import { useWorkflowGraph } from "../../hooks/useWorkflowGraph";
import { useWorkflowExecution } from "../../hooks/useWorkflowExecution";
import { useRealtimeLogs } from "../../hooks/useRealtimeLogs";
import { useTestOrderManager } from "../../hooks/useTestOrderManager";
import { useUIStore } from "../../stores/ui.store";
import { useExecutionStore } from "../../stores/execution.store.sync";
import { useWorkflowStore } from "../../stores/workflow.store.sync";
import {
  useKeyboardShortcuts,
  getShortcutDescription,
} from "../../hooks/useKeyboardShortcuts";

import {
  createGenericServiceNode,
  createMariaDbNode,
  createMySqlNode,
  createPostgresNode,
} from "@/modules/utils/node-factory";

interface FlowBuilderProps {
  workflowId: string;
  onWorkflowStart?: (sessionId: string) => void;
  onWorkComplete?: (results: any) => void;
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
  const activeExecution = useExecutionStore((s) => s.getActiveExecution());
  const hydrated = useWorkflowStore((s) => s.hydrated);

  // UI State
  const {
    isDrawerOpen,
    isNodeConfigOpen,
    isLogsOpen,
    isShortcutsOpen,
    selectedNode,
    openDrawer,
    closeDrawer,
    openNodeConfig,
    closeNodeConfig,
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

  // Test order management
  const { customTestOrder, updateTestOrder } = useTestOrderManager(workflowId);

  // Execution
  const { execute, isExecuting, canExecute } = useWorkflowExecution({
    workflowId,
    workflowName: workflow?.name || "",
    nodes,
    edges,
    customTestOrder,
    onStart: onWorkflowStart,
    onComplete: onWorkComplete,
    onError,
  });

  // Realtime logs
  useRealtimeLogs({
    onComplete: onWorkComplete,
    onError,
  });

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
  }, [workflow?.id, deleteNode, setNodes]);

  // Add service node helper
  const handleAddNode = (
    type: "postgres" | "redis" | "mysql" | "mariadb" | "generic",
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
        case "generic":
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
          onNodeDoubleClick={(_, node) => openNodeConfig(node as any)}
          onExecute={execute}
          onOpenDrawer={openDrawer}
          onOpenLogs={openLogs}
          onOpenShortcuts={openShortcuts}
          onOpenHistory={() => setIsHistoryOpen(true)}
          isExecuting={isExecuting}
          canExecute={canExecute}
          hasActiveExecution={!!activeExecution}
        />

        <NodeDrawer
          workflowId={workflow.id}
          currentWorkflowName={workflow.name}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          onAddNode={handleAddNode}
          onWorkflowNameChange={(name) => updateWorkflowName(workflow.id, name)}
          nodes={nodes}
          onTestOrderChange={updateTestOrder}
          customTestOrder={customTestOrder}
        />

        <NodeConfigDialog
          isOpen={isNodeConfigOpen}
          node={selectedNode}
          nodes={nodes}
          onClose={closeNodeConfig}
          onSave={updateNode}
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
