"use client";

import {
  Background,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconLoader2,
  IconServer,
} from "@tabler/icons-react";
import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sanitizeName } from "@/modules/utils/scenario-translator";
import {
  executionNodePosition,
  type ServiceExecutionState,
} from "../lib/workflow-run-events";
import type { FlowEdge, FlowNode } from "../types/react-flow-cots";

type ExecutionServiceNode = Node<
  {
    label: string;
    technology: string;
    state: ServiceExecutionState;
    observed: boolean;
  },
  "executionService"
>;

const stateLabel: Record<ServiceExecutionState, string> = {
  queued: "Queued",
  provisioning: "Provisioning",
  ready: "Ready",
  testing: "Under test",
  cleaning: "Cleaning up",
  complete: "Complete",
  failed: "Failed",
};

function StateIcon({ state }: { state: ServiceExecutionState }) {
  if (state === "failed") return <IconAlertTriangle aria-hidden="true" />;
  if (state === "complete" || state === "ready") {
    return <IconCheck aria-hidden="true" />;
  }
  if (state === "provisioning" || state === "testing" || state === "cleaning") {
    return <IconLoader2 className="run-spin" aria-hidden="true" />;
  }
  return <IconClock aria-hidden="true" />;
}

const ExecutionServiceNodeView = memo(
  ({ data, selected }: NodeProps<ExecutionServiceNode>) => (
    <div
      data-testid="execution-service-node"
      data-service-name={data.label}
      data-status={data.state}
      className={cn(
        "relative w-52 border bg-card p-3 shadow-sm transition-[border-color,box-shadow,transform]",
        selected && "border-primary ring-2 ring-primary/20",
        data.state === "failed" &&
          "border-destructive ring-2 ring-destructive/15",
        (data.state === "provisioning" || data.state === "testing") &&
          "run-active-node border-primary/70",
      )}
    >
      <span className="sr-only">
        {data.label}: {stateLabel[data.state]}
      </span>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="flex items-start gap-3">
        <div className="border bg-muted/50 p-2 text-muted-foreground">
          <IconServer className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{data.label}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {data.technology}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
        <Badge
          variant={data.state === "failed" ? "destructive" : "outline"}
          className="gap-1"
        >
          <StateIcon state={data.state} />
          {stateLabel[data.state]}
        </Badge>
        {data.observed ? (
          <span className="text-[10px] text-muted-foreground">observed at</span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  ),
);

ExecutionServiceNodeView.displayName = "ExecutionServiceNodeView";

const nodeTypes = { executionService: ExecutionServiceNodeView };

export function ExecutionServiceMap({
  nodes,
  edges,
  serviceStates,
  observedServices,
  motionEnabled,
  selectedService,
  onSelectService,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  serviceStates: Record<string, ServiceExecutionState>;
  observedServices: string[];
  motionEnabled: boolean;
  selectedService?: string;
  onSelectService: (serviceName: string) => void;
}) {
  const observed = useMemo(
    () => new Set(observedServices.map((name) => sanitizeName(name))),
    [observedServices],
  );
  const executionNodes = useMemo<ExecutionServiceNode[]>(
    () =>
      nodes.map((node, index) => {
        const label = node.data.label || node.id;
        const normalizedLabel = sanitizeName(label);
        const state =
          serviceStates[label] ??
          serviceStates[node.id] ??
          serviceStates[normalizedLabel] ??
          "queued";
        return {
          id: node.id,
          type: "executionService",
          position: executionNodePosition(node.position, index),
          selected: selectedService === label,
          data: {
            label,
            technology: node.data.service.type,
            state,
            observed: observed.has(normalizedLabel),
          },
        };
      }),
    [nodes, observed, selectedService, serviceStates],
  );
  const executionEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated:
          motionEnabled &&
          executionNodes.some(
            (node) =>
              (node.id === edge.source || node.id === edge.target) &&
              (node.data.state === "testing" ||
                node.data.state === "provisioning"),
          ),
        label: edge.data?.showLabel ? edge.data.label : undefined,
        style: { strokeWidth: 1.5 },
      })),
    [edges, executionNodes, motionEnabled],
  );

  if (nodes.length === 0) {
    return (
      <div className="grid min-h-72 place-items-center border border-dashed bg-muted/20 text-sm text-muted-foreground">
        The immutable run revision has no services.
      </div>
    );
  }

  return (
    <section
      className="h-80 border bg-background/70"
      aria-label="Service lifecycle map"
    >
      <ReactFlow
        nodes={executionNodes}
        edges={executionEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.35}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelectService(node.data.label)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} />
      </ReactFlow>
    </section>
  );
}
