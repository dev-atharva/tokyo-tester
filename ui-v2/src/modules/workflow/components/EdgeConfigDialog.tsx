"use client";

import { IconArrowsExchange } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EDGE_READINESS_OPTIONS, EDGE_RELATIONS } from "../lib/edge-model";
import type {
  EdgeData,
  EdgeReadiness,
  EdgeRelation,
  FlowEdge,
  FlowNode,
} from "../types/react-flow-cots";

interface EdgeConfigDialogProps {
  edge: FlowEdge | null;
  nodes: FlowNode[];
  onClose: () => void;
  onSave: (edgeId: string, data: EdgeData) => void;
}

const readinessLabels: Record<EdgeReadiness, string> = {
  none: "No startup prerequisite",
  source_requires_target: "Start target first",
  target_requires_source: "Start source first",
};

const relationLabels: Record<EdgeRelation, string> = {
  calls: "Calls or sends a request",
  reads: "Reads data",
  writes: "Writes data",
  publishes: "Publishes a message",
  consumes: "Consumes a message",
};

export function EdgeConfigDialog({
  edge,
  nodes,
  onClose,
  onSave,
}: EdgeConfigDialogProps) {
  const [data, setData] = useState<EdgeData | null>(edge?.data ?? null);
  useEffect(() => setData(edge?.data ?? null), [edge]);

  if (!edge || !data) return null;
  const source = nodes.find((node) => node.id === edge.source)?.data.label;
  const target = nodes.find((node) => node.id === edge.target)?.data.label;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/10 p-1.5 text-primary">
              <IconArrowsExchange className="size-4" />
            </div>
            <DialogTitle>Data flow</DialogTitle>
          </div>
          <DialogDescription>
            {source || "Source"} → {target || "Target"}. The arrow describes
            data movement; readiness controls startup order separately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edge-relation">Relationship</Label>
            <select
              id="edge-relation"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={data.relation}
              onChange={(event) =>
                setData({
                  ...data,
                  relation: event.target.value as EdgeRelation,
                })
              }
            >
              {EDGE_RELATIONS.map((relation) => (
                <option key={relation} value={relation}>
                  {relationLabels[relation]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edge-protocol">Technology or protocol</Label>
            <input
              id="edge-protocol"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              placeholder="HTTP, AMQP, PostgreSQL…"
              value={data.protocol || ""}
              onChange={(event) =>
                setData({ ...data, protocol: event.target.value })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edge-label">Optional label</Label>
            <input
              id="edge-label"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              placeholder="Uses relationship name by default"
              value={data.label || ""}
              onChange={(event) =>
                setData({ ...data, label: event.target.value })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edge-description">Plain-language description</Label>
            <textarea
              id="edge-description"
              className="min-h-18 resize-none rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="What information moves here, and why?"
              value={data.description || ""}
              onChange={(event) =>
                setData({ ...data, description: event.target.value })
              }
            />
          </div>

          <details className="rounded-lg border bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium">
              Execution details
            </summary>
            <div className="mt-3 grid gap-2">
              <Label htmlFor="edge-readiness">Startup order</Label>
              <select
                id="edge-readiness"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={data.readiness}
                onChange={(event) =>
                  setData({
                    ...data,
                    readiness: event.target.value as EdgeReadiness,
                  })
                }
              >
                {EDGE_READINESS_OPTIONS.map((readiness) => (
                  <option key={readiness} value={readiness}>
                    {readinessLabels[readiness]}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                This controls container startup only. It does not change the
                direction of the data-flow arrow.
              </p>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(edge.id, data);
              onClose();
            }}
          >
            Confirm flow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
