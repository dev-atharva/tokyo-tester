"use client";

import {
  IconArrowRight,
  IconCheck,
  IconEdit,
  IconPlus,
  IconRoute,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { suggestConnections } from "../lib/connection-suggestions";
import {
  defaultReadiness,
  EDGE_READINESS_OPTIONS,
  EDGE_RELATIONS,
} from "../lib/edge-model";
import type {
  EdgeData,
  EdgeReadiness,
  EdgeRelation,
  FlowEdge,
  FlowNode,
} from "../types/react-flow-cots";

interface ConnectionDraft {
  edgeId?: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  readiness: EdgeReadiness;
  protocol: string;
}

interface GuidedConnectionsProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  canEdit: boolean;
  onSave: (definition: {
    edgeId?: string;
    source: string;
    target: string;
    data: Partial<EdgeData>;
  }) => void;
  onConfirm: (edgeId: string, data: EdgeData) => void;
  onDelete: (edgeId: string) => void;
}

const relationLabels: Record<EdgeRelation, string> = {
  calls: "calls",
  reads: "reads from",
  writes: "writes to",
  publishes: "publishes to",
  consumes: "consumes from",
};

const readinessLabels: Record<EdgeReadiness, string> = {
  none: "No startup requirement",
  source_requires_target: "Start the destination first",
  target_requires_source: "Start the source first",
};

function newDraft(nodes: FlowNode[]): ConnectionDraft {
  const source =
    nodes.find((node) => node.data.service.type === "generic") ?? nodes[0];
  const target = nodes.find((node) => node.id !== source?.id);
  return {
    source: source?.id ?? "",
    target: target?.id ?? "",
    relation: "calls",
    readiness: "source_requires_target",
    protocol: "",
  };
}

export function GuidedConnections({
  nodes,
  edges,
  canEdit,
  onSave,
  onConfirm,
  onDelete,
}: GuidedConnectionsProps) {
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const suggestions = useMemo(
    () => suggestConnections(nodes, edges),
    [edges, nodes],
  );
  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const saveDraft = () => {
    if (!draft?.source || !draft.target || draft.source === draft.target)
      return;
    onSave({
      edgeId: draft.edgeId,
      source: draft.source,
      target: draft.target,
      data: {
        relation: draft.relation,
        readiness: draft.readiness,
        protocol: draft.protocol.trim() || undefined,
      },
    });
    setDraft(null);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">How services work together</h2>
          <p className="text-sm text-muted-foreground">
            Review the information moving between services. These connections
            are the same ones shown in the expert graph.
          </p>
        </div>
        {canEdit && nodes.length > 1 ? (
          <Button onClick={() => setDraft(newDraft(nodes))}>
            <IconPlus data-icon="inline-start" />
            Add connection
          </Button>
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconSparkles />
              <CardTitle className="text-sm">Suggested connections</CardTitle>
              <Badge variant="secondary">{suggestions.length}</Badge>
            </div>
            <CardDescription>
              Nothing is added to the workflow until you confirm it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {suggestions.map((suggestion) => {
              const source = nodeMap.get(suggestion.source);
              const target = nodeMap.get(suggestion.target);
              return (
                <div
                  key={suggestion.id}
                  className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {source?.data.label}{" "}
                      {relationLabels[suggestion.data.relation]}{" "}
                      {target?.data.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.reason}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onSave({
                          source: suggestion.source,
                          target: suggestion.target,
                          data: suggestion.data,
                        })
                      }
                    >
                      <IconCheck data-icon="inline-start" />
                      Accept
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {draft.edgeId ? "Edit connection" : "Add connection"}
            </CardTitle>
            <CardDescription>
              Read the sentence from left to right. You can change startup
              behavior separately under Advanced.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-3 lg:grid-cols-[1fr_180px_1fr]">
                <Field>
                  <FieldLabel>Source service</FieldLabel>
                  <Select
                    value={draft.source}
                    onValueChange={(source) =>
                      setDraft((current) =>
                        current
                          ? { ...current, source: source ?? "" }
                          : current,
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {nodes.map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            {node.data.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Relationship</FieldLabel>
                  <Select
                    value={draft.relation}
                    onValueChange={(relation) => {
                      const next = (relation ?? "calls") as EdgeRelation;
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              relation: next,
                              readiness: defaultReadiness(next),
                            }
                          : current,
                      );
                    }}
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
                <Field
                  data-invalid={draft.source === draft.target || undefined}
                >
                  <FieldLabel>Destination service</FieldLabel>
                  <Select
                    value={draft.target}
                    onValueChange={(target) =>
                      setDraft((current) =>
                        current
                          ? { ...current, target: target ?? "" }
                          : current,
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={draft.source === draft.target}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {nodes.map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            {node.data.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {draft.source === draft.target ? (
                    <FieldDescription>
                      Choose a different destination service.
                    </FieldDescription>
                  ) : null}
                </Field>
              </div>

              <Collapsible>
                <CollapsibleTrigger
                  render={<Button variant="ghost" size="sm" />}
                >
                  Advanced connection details
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="guided-connection-protocol">
                        Technology or protocol
                      </FieldLabel>
                      <Input
                        id="guided-connection-protocol"
                        value={draft.protocol}
                        placeholder="HTTP, PostgreSQL, AMQP"
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? { ...current, protocol: event.target.value }
                              : current,
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Startup behavior</FieldLabel>
                      <Select
                        value={draft.readiness}
                        onValueChange={(readiness) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  readiness: (readiness ??
                                    "none") as EdgeReadiness,
                                }
                              : current,
                          )
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
                    </Field>
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !draft.source || !draft.target || draft.source === draft.target
              }
              onClick={saveDraft}
            >
              Save connection
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {edges.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 border border-dashed p-6 text-center">
          <IconRoute />
          <div>
            <p className="text-sm font-medium">No confirmed connections yet</p>
            <p className="text-xs text-muted-foreground">
              Add how services communicate so the expert graph and export stay
              accurate.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            const data = edge.data ?? {
              relation: "calls" as const,
              readiness: "source_requires_target" as const,
            };
            return (
              <Card key={edge.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                        <span>{source?.data.label ?? edge.source}</span>
                        <IconArrowRight />
                        <span>{target?.data.label ?? edge.target}</span>
                      </CardTitle>
                      <CardDescription>
                        {relationLabels[data.relation]}
                        {data.protocol ? ` via ${data.protocol}` : ""}
                      </CardDescription>
                    </div>
                    {data.needsReview ? (
                      <Badge variant="secondary">Review</Badge>
                    ) : (
                      <Badge variant="outline">Confirmed</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardFooter className="justify-end gap-2">
                  {data.needsReview && canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onConfirm(edge.id, data)}
                    >
                      <IconCheck data-icon="inline-start" />
                      Confirm
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Edit connection"
                        onClick={() =>
                          setDraft({
                            edgeId: edge.id,
                            source: edge.source,
                            target: edge.target,
                            relation: data.relation,
                            readiness: data.readiness,
                            protocol: data.protocol ?? "",
                          })
                        }
                      >
                        <IconEdit />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete connection"
                        onClick={() => onDelete(edge.id)}
                      >
                        <IconTrash />
                      </Button>
                    </>
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
