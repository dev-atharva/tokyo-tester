"use client";

import {
  IconHistory,
  IconKeyboard,
  IconPlus,
  IconRun,
  IconSitemap,
  IconTerminal2,
} from "@tabler/icons-react";
import type React from "react";
import {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  Panel,
  ReactFlow,
} from "reactflow";
import { Button } from "@/components/ui/button";
import { SyncStatusIndicator } from "@/modules/sync/SyncProvider";

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeDoubleClick: NodeMouseHandler;
  onExecute: () => void;
  onOpenDrawer: () => void;
  onOpenScenarios: () => void;
  onOpenLogs: () => void;
  onOpenShortcuts: () => void;
  onOpenHistory: () => void;
  isExecuting: boolean;
  canExecute: boolean;
  hasActiveExecution: boolean;
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDoubleClick,
  onExecute,
  onOpenDrawer,
  onOpenScenarios,
  onOpenLogs,
  onOpenShortcuts,
  onOpenHistory,
  isExecuting,
  canExecute,
  hasActiveExecution,
}) => {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDoubleClick={onNodeDoubleClick}
      fitView
      snapToGrid
      snapGrid={[10, 10]}
      proOptions={{
        hideAttribution: true,
      }}
    >
      <Background />
      <Controls />

      {/* Top Left Toolbar */}
      <Panel position="top-left">
        <SyncStatusIndicator />
      </Panel>

      {/* Top Right Toolbar */}
      <Panel className="flex gap-2" position="top-right">
        <Button
          className="cursor-pointer"
          variant="ghost"
          size="icon"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts (?)"
        >
          <IconKeyboard className="size-4" />
        </Button>

        <Button
          className="cursor-pointer"
          variant="ghost"
          size="icon"
          onClick={onOpenHistory}
          title="Execution history"
        >
          <IconHistory className="size-4" />
        </Button>

        <Button
          className="cursor-pointer"
          variant="secondary"
          onClick={onOpenScenarios}
          title="Open scenario configuration"
        >
          <IconSitemap className="mr-2 size-4" />
          Scenarios
        </Button>

        <Button
          className="cursor-pointer"
          variant="secondary"
          onClick={onOpenLogs}
          disabled={!hasActiveExecution}
          title="View execution logs (Ctrl+L)"
        >
          <IconTerminal2 className="mr-2 size-4" />
          Logs
        </Button>

        <Button
          className="cursor-pointer"
          onClick={onOpenDrawer}
          title="Add node (Ctrl+N)"
        >
          <IconPlus />
          Add Node
        </Button>
      </Panel>

      {/* Bottom Center Execute Button */}
      <Panel position="bottom-center">
        <Button
          disabled={!canExecute}
          className="cursor-pointer"
          onClick={onExecute}
          title="Run workflow (Ctrl+Enter)"
        >
          <IconRun />
          {isExecuting ? "Running..." : "Run"}
        </Button>
      </Panel>
    </ReactFlow>
  );
};
