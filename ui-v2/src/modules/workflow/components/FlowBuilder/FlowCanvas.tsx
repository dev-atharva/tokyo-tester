"use client";

import {
  IconAlertTriangle,
  IconGitBranch,
  IconHistory,
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
import type { AuthoringMode } from "../../lib/builder-experience";
import type { FlowEdge, FlowNode } from "../../types/react-flow-cots";
import { AuthoringModeControl } from "../AuthoringModeControl";
import { BuilderHelpMenu, DisabledActionHelp } from "../BuilderHelp";
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
  authoringMode: AuthoringMode;
  onAuthoringModeChange: (mode: AuthoringMode) => void;
  onShowChecklist: () => void;
  isExecuting: boolean;
  canExecute: boolean;
  runDisabledReason?: string;
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
  authoringMode,
  onAuthoringModeChange,
  onShowChecklist,
  isExecuting,
  canExecute,
  runDisabledReason,
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
      <Panel data-testid="expert-status-controls" position="top-left">
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
          <div className="flex items-center gap-1 border bg-background/95 p-1 shadow-sm">
            <AuthoringModeControl
              value={authoringMode}
              onValueChange={onAuthoringModeChange}
            />
            <BuilderHelpMenu onShowChecklist={onShowChecklist} />
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

      <Panel
        data-testid="expert-view-controls"
        className="hidden lg:block"
        position="top-center"
      >
        <div className="flex items-center gap-1 rounded-lg border bg-background/92 p-1 shadow-md backdrop-blur-sm">
          <Button
            aria-label="Architecture overview"
            title="Architecture overview"
            size="sm"
            variant={viewMode === "overview" ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => onViewModeChange("overview")}
          >
            <IconLayoutBoardSplit className="size-4 2xl:mr-1.5" />
            <span className="hidden 2xl:inline">Overview</span>
          </Button>
          <Button
            aria-label="Architecture detail"
            title="Architecture detail"
            size="sm"
            variant={viewMode === "detail" ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => onViewModeChange("detail")}
          >
            <IconListDetails className="size-4 2xl:mr-1.5" />
            <span className="hidden 2xl:inline">Detail</span>
          </Button>
          {canEdit ? <div className="mx-1 h-5 w-px bg-border" /> : null}
          {canEdit ? (
            <Button
              aria-label="Tidy layout"
              title="Tidy layout"
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
              <IconSparkles className="size-4 2xl:mr-1.5" />
              <span className="hidden 2xl:inline">Tidy layout</span>
            </Button>
          ) : null}
        </div>
      </Panel>

      {/* Top Right Toolbar */}
      <Panel
        data-testid="expert-action-controls"
        className="flex flex-col gap-1 sm:flex-row"
        position="top-right"
      >
        {canEdit ? (
          <Button
            className="cursor-pointer shadow-md"
            variant="ghost"
            size="icon"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
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
          aria-label="Execution history"
        >
          <IconHistory className="size-4" />
        </Button>

        <Button
          className="cursor-pointer shadow-md"
          variant="ghost"
          size="icon"
          onClick={onOpenVersions}
          title="Workflow versions"
          aria-label="Workflow versions"
        >
          <IconGitBranch className="size-4" />
        </Button>

        <Button
          className="cursor-pointer shadow-md"
          variant="secondary"
          onClick={onOpenScenarios}
          title="Open scenario configuration"
          aria-label="Open scenarios"
        >
          <IconSitemap className="size-4 2xl:mr-2" />
          <span className="hidden 2xl:inline">Scenarios</span>
        </Button>

        <Button
          className="cursor-pointer shadow-md"
          variant="secondary"
          onClick={onOpenLogs}
          disabled={!hasActiveExecution}
          title="View workflow run (Ctrl+L)"
          aria-label="View workflow run"
        >
          <IconTerminal2 className="size-4 2xl:mr-2" />
          <span className="hidden 2xl:inline">View run</span>
        </Button>

        {canEdit ? (
          <Button
            className="cursor-pointer shadow-md"
            onClick={onOpenDrawer}
            title="Add node (Ctrl+N)"
            aria-label="Add node"
          >
            <IconPlus className="size-4 2xl:mr-2" />
            <span className="hidden 2xl:inline">Add node</span>
          </Button>
        ) : null}
      </Panel>

      {/* Bottom Center Execute Button */}
      <Panel position="bottom-center">
        <DisabledActionHelp
          reason={!canExecute || isExecuting ? runDisabledReason : undefined}
        >
          <Button
            disabled={!canExecute}
            className="cursor-pointer px-6 shadow-lg"
            size="lg"
            onClick={onExecute}
            title="Run workflow (Ctrl+Enter)"
          >
            <IconRun data-icon="inline-start" />
            {isExecuting ? "Running..." : "Run Workflow"}
          </Button>
        </DisabledActionHelp>
      </Panel>

      <Panel className="hidden md:block" position="bottom-left">
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
