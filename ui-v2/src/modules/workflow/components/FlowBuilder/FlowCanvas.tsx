"use client";

import {
  IconAlertTriangle,
  IconHistory,
  IconGitBranch,
  IconKeyboard,
  IconLayoutBoardSplit,
  IconListDetails,
  IconPlus,
  IconRun,
  IconSitemap,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";
import {
  Background,
  Controls,
  type EdgeMouseHandler,
  MarkerType,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import type React from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SyncStatusIndicator } from "@/modules/sync/SyncProvider";
import type { FlowEdge, FlowNode } from "../../types/react-flow-cots";
import { ArchitectureBackdrop } from "./ArchitectureBackdrop";
import { ArchitectureLegend } from "./ArchitectureLegend";
import { ArchitectureStoryPanel } from "./ArchitectureStoryPanel";
import { DataFlowEdge } from "./DataFlowEdge";

const edgeTypes = { dataFlow: DataFlowEdge };

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeTypes: NodeTypes;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: OnConnect;
  onNodeDoubleClick: NodeMouseHandler<FlowNode>;
  onEdgeClick: EdgeMouseHandler<FlowEdge>;
  onExecute: () => void;
  onOpenDrawer: () => void;
  onOpenScenarios: () => void;
  onOpenLogs: () => void;
  onOpenShortcuts: () => void;
  onOpenHistory: () => void;
  onOpenVersions: () => void;
  isExecuting: boolean;
  canExecute: boolean;
  canEdit: boolean;
  hasActiveExecution: boolean;
  reviewEdgeCount: number;
  viewMode: "overview" | "detail";
  onViewModeChange: (mode: "overview" | "detail") => void;
  selectedNodeId: string | null;
  onSelectedNodeChange: (nodeId: string | null) => void;
  onTidyLayout: () => Promise<unknown>;
  focusedServiceNames: string[] | null;
  onClearScenarioFocus: () => void;
  workflowStats: { services: number; scenarios: number; steps: number };
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  nodeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDoubleClick,
  onEdgeClick,
  onExecute,
  onOpenDrawer,
  onOpenScenarios,
  onOpenLogs,
  onOpenShortcuts,
  onOpenHistory,
  onOpenVersions,
  isExecuting,
  canExecute,
  canEdit,
  hasActiveExecution,
  reviewEdgeCount,
  viewMode,
  onViewModeChange,
  selectedNodeId,
  onSelectedNodeChange,
  onTidyLayout,
  focusedServiceNames,
  onClearScenarioFocus,
  workflowStats,
}) => {
  const { fitView } = useReactFlow();
  const activeNodeIds = useMemo(() => {
    if (selectedNodeId) {
      const ids = new Set([selectedNodeId]);
      for (const edge of edges) {
        if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
      }
      return ids;
    }
    if (!focusedServiceNames?.length) return null;
    const focused = new Set(focusedServiceNames);
    return new Set(
      nodes
        .filter((node) => focused.has(normalizeServiceName(node.data.label)))
        .map((node) => node.id),
    );
  }, [edges, focusedServiceNames, nodes, selectedNodeId]);
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          opacity: activeNodeIds && !activeNodeIds.has(node.id) ? 0.16 : 1,
          transition: "opacity 180ms ease",
        },
      })),
    [activeNodeIds, nodes],
  );
  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const relation = edge.data?.relation || "calls";
        const connected = selectedNodeId
          ? edge.source === selectedNodeId || edge.target === selectedNodeId
          : activeNodeIds
            ? activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target)
            : true;
        const color =
          relation === "calls"
            ? "#0ea5e9"
            : relation === "reads" || relation === "writes"
              ? "#10b981"
              : "#f59e0b";
        const dashed = relation === "reads" || relation === "consumes";
        return {
          ...edge,
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: {
            ...edge.style,
            stroke: color,
            strokeWidth: connected && selectedNodeId ? 2.5 : 1.75,
            strokeDasharray: dashed ? "7 5" : undefined,
            opacity: connected ? (selectedNodeId ? 0.95 : 0.34) : 0.06,
            transition: "opacity 180ms ease, stroke-width 180ms ease",
          },
          data: {
            ...edge.data,
            relation,
            readiness: edge.data?.readiness || "source_requires_target",
            showLabel:
              viewMode === "detail" ||
              Boolean((selectedNodeId || activeNodeIds) && connected),
          },
        };
      }),
    [activeNodeIds, edges, selectedNodeId, viewMode],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const defaultEdgeOptions = {
    type: "dataFlow",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      strokeWidth: 2,
      stroke: "var(--foreground)",
    },
  };
  return (
    <ReactFlow<FlowNode, FlowEdge>
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeClick={(_, node) => onSelectedNodeChange(node.id)}
      onEdgeClick={onEdgeClick}
      onPaneClick={() => onSelectedNodeChange(null)}
      nodesDraggable={canEdit}
      nodesConnectable={canEdit}
      edgesReconnectable={canEdit}
      deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      snapToGrid
      snapGrid={[15, 15]}
      proOptions={{
        hideAttribution: true,
      }}
    >
      <Background gap={20} size={1.5} />
      {viewMode === "overview" ? (
        <ArchitectureBackdrop nodes={displayNodes} />
      ) : null}
      <Controls showInteractive={false} />

      {/* Top Left Toolbar */}
      <Panel position="top-left">
        <div className="flex flex-col items-start gap-2">
          <SyncStatusIndicator />
          <div className="rounded-md border bg-background/95 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm">
            <span className="font-semibold text-foreground">
              {workflowStats.services}
            </span>{" "}
            services ·{" "}
            <span className="font-semibold text-foreground">
              {workflowStats.scenarios}
            </span>{" "}
            journeys ·{" "}
            <span className="font-semibold text-foreground">
              {workflowStats.steps}
            </span>{" "}
            checks
          </div>
          {reviewEdgeCount > 0 ? (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-background/95 px-2.5 py-1.5 text-xs text-amber-700 shadow-sm dark:text-amber-300">
              <IconAlertTriangle className="size-3.5" />
              {reviewEdgeCount} migrated edge
              {reviewEdgeCount === 1 ? "" : "s"} need review
            </div>
          ) : null}
          {focusedServiceNames?.length ? (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-background/95 px-2.5 py-1.5 text-xs shadow-sm">
              <span className="font-medium">Scenario focus</span>
              <span className="text-muted-foreground">
                {focusedServiceNames.length} services
              </span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={onClearScenarioFocus}
              >
                Reset
              </button>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel position="top-center">
        <div className="flex items-center gap-1 rounded-lg border bg-background/92 p-1 shadow-md backdrop-blur-sm">
          <Button
            size="sm"
            variant={viewMode === "overview" ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => onViewModeChange("overview")}
          >
            <IconLayoutBoardSplit className="mr-1.5 size-4" />
            Overview
          </Button>
          <Button
            size="sm"
            variant={viewMode === "detail" ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => onViewModeChange("detail")}
          >
            <IconListDetails className="mr-1.5 size-4" />
            Detail
          </Button>
          {canEdit ? <div className="mx-1 h-5 w-px bg-border" /> : null}
          {canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={async () => {
                await onTidyLayout();
                requestAnimationFrame(() =>
                  fitView({ padding: 0.16, duration: 500 }),
                );
              }}
            >
              <IconSparkles className="mr-1.5 size-4" />
              Tidy layout
            </Button>
          ) : null}
        </div>
      </Panel>

      {/* Top Right Toolbar */}
      <Panel className="flex gap-2" position="top-right">
        {canEdit ? (
          <Button
            className="cursor-pointer shadow-md"
            variant="ghost"
            size="icon"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (?)"
          >
            <IconKeyboard className="size-4" />
          </Button>
        ) : null}

        <Button
          className="cursor-pointer shadow-md"
          variant="ghost"
          size="icon"
          onClick={onOpenHistory}
          title="Execution history"
        >
          <IconHistory className="size-4" />
        </Button>

        <Button
          className="cursor-pointer shadow-md"
          variant="ghost"
          size="icon"
          onClick={onOpenVersions}
          title="Workflow versions"
        >
          <IconGitBranch className="size-4" />
        </Button>

        <Button
          className="cursor-pointer shadow-md"
          variant="secondary"
          onClick={onOpenScenarios}
          title="Open scenario configuration"
        >
          <IconSitemap className="mr-2 size-4" />
          Scenarios
        </Button>

        <Button
          className="cursor-pointer shadow-md"
          variant="secondary"
          onClick={onOpenLogs}
          disabled={!hasActiveExecution}
          title="View execution logs (Ctrl+L)"
        >
          <IconTerminal2 className="mr-2 size-4" />
          Logs
        </Button>

        {canEdit ? (
          <Button
            className="cursor-pointer shadow-md"
            onClick={onOpenDrawer}
            title="Add node (Ctrl+N)"
          >
            <IconPlus className="mr-2 size-4" />
            Add Node
          </Button>
        ) : null}
      </Panel>

      {/* Bottom Center Execute Button */}
      <Panel position="bottom-center">
        <Button
          disabled={!canExecute}
          className="cursor-pointer shadow-lg px-6 h-10 font-semibold"
          onClick={onExecute}
          title="Run workflow (Ctrl+Enter)"
        >
          <IconRun className="mr-2 size-4" />
          {isExecuting ? "Running..." : "Run Workflow"}
        </Button>
      </Panel>

      <Panel position="bottom-left">
        <ArchitectureLegend />
      </Panel>

      {selectedNode ? (
        <Panel position="bottom-right">
          <ArchitectureStoryPanel
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            onClose={() => onSelectedNodeChange(null)}
          />
        </Panel>
      ) : null}
    </ReactFlow>
  );
};

function normalizeServiceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
