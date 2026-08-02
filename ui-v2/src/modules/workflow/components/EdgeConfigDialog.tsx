"use client";

import { IconArrowsExchange } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
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

        <FieldGroup className="py-2">
          <Field>
            <FieldLabel>Relationship</FieldLabel>
            <Select
              value={data.relation}
              onValueChange={(value) =>
                setData({
                  ...data,
                  relation: (value ?? "calls") as EdgeRelation,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {EDGE_RELATIONS.map((relation) => (
                    <SelectItem key={relation} value={relation}>
                      {relationLabels[relation]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="edge-protocol">
              Technology or protocol
            </FieldLabel>
            <Input
              id="edge-protocol"
              placeholder="HTTP, AMQP, PostgreSQL…"
              value={data.protocol || ""}
              onChange={(event) =>
                setData({ ...data, protocol: event.target.value })
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edge-label">Optional label</FieldLabel>
            <Input
              id="edge-label"
              placeholder="Uses relationship name by default"
              value={data.label || ""}
              onChange={(event) =>
                setData({ ...data, label: event.target.value })
              }
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edge-description">
              Plain-language description
            </FieldLabel>
            <Textarea
              id="edge-description"
              className="min-h-18 resize-none"
              placeholder="What information moves here, and why?"
              value={data.description || ""}
              onChange={(event) =>
                setData({ ...data, description: event.target.value })
              }
            />
          </Field>

          <Collapsible>
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              Advanced startup behavior
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Field>
                <FieldLabel>Startup order</FieldLabel>
                <Select
                  value={data.readiness}
                  onValueChange={(value) =>
                    setData({
                      ...data,
                      readiness: (value ?? "none") as EdgeReadiness,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {EDGE_READINESS_OPTIONS.map((readiness) => (
                        <SelectItem key={readiness} value={readiness}>
                          {readinessLabels[readiness]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  This controls container startup only. It does not change the
                  direction of the data-flow arrow.
                </FieldDescription>
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </FieldGroup>

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
