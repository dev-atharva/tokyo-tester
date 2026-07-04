"use client";

import {
  IconArrowRight,
  IconClockHour4,
  IconTopologyStar3,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  architectureRole,
  describeArchitectureNode,
  friendlyName,
  inferredProtocol,
  ROLE_META,
} from "../../lib/architecture-view";
import type { FlowEdge, FlowNode } from "../../types/react-flow-cots";

interface ArchitectureStoryPanelProps {
  node: FlowNode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  onClose: () => void;
}

export function ArchitectureStoryPanel({
  node,
  nodes,
  edges,
  onClose,
}: ArchitectureStoryPanelProps) {
  const role = architectureRole(node.data.service.type);
  const statements = describeArchitectureNode(node, nodes, edges);
  const readiness = statements.filter((statement) => statement.readiness);
  const technology =
    node.data.service.type === "generic"
      ? node.data.service.image
      : inferredProtocol(node.data.service.type);

  return (
    <aside className="w-80 overflow-hidden rounded-xl border bg-card/97 shadow-xl backdrop-blur-md">
      <header className="border-b bg-muted/25 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {ROLE_META[role].label}
            </p>
            <h2 className="mt-1 text-base font-semibold">
              {friendlyName(node.data.label)}
            </h2>
          </div>
          <Button
            aria-label="Close service explanation"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={onClose}
          >
            <IconX className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {node.data.description || ROLE_META[role].description}
        </p>
        {technology ? (
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">
            {technology}
          </p>
        ) : null}
      </header>

      <div className="max-h-80 overflow-auto p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <IconTopologyStar3 className="size-4 text-primary" />
          <h3 className="text-xs font-semibold">How it fits into the system</h3>
        </div>
        {statements.length ? (
          <ul className="space-y-1">
            {statements.map((statement) => (
              <li
                key={statement.edgeId}
                className="flex items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-muted/40"
              >
                <IconArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="leading-relaxed">
                  {statement.text}
                  {statement.protocol ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      via {statement.protocol}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            This service has no data-flow relationships yet.
          </p>
        )}

        {readiness.length ? (
          <details className="mt-3 border-t pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
              <IconClockHour4 className="size-3.5" />
              Execution details
            </summary>
            <ul className="mt-2 space-y-1 pl-7 text-[11px] text-muted-foreground">
              {readiness.map((statement) => (
                <li key={statement.edgeId}>{statement.readiness}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </aside>
  );
}
