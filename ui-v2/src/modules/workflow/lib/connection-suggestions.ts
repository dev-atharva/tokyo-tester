import { sanitizeName } from "@/modules/utils/scenario-translator";
import type { EdgeData, FlowEdge, FlowNode } from "../types/react-flow-cots";
import { inferEdgeData } from "./edge-model";

export interface ConnectionSuggestion {
  id: string;
  source: string;
  target: string;
  data: EdgeData;
  reason: string;
}

const referencePattern = /\$\{([^}.]+)\.(?:host|port\.[^}]+|env\.[^}]+)\}/g;

function referencedServiceNames(node: FlowNode): Set<string> {
  const values = [
    ...(node.data.service.env ?? []).map((entry) => entry.value),
    ...(node.data.service.command ?? []),
  ];
  const names = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(referencePattern)) {
      if (match[1]) names.add(match[1]);
    }
  }
  return names;
}

function suggestionKey(source: string, target: string, data: EdgeData) {
  return `${source}:${data.relation}:${target}`;
}

export function suggestConnections(
  nodes: FlowNode[],
  edges: FlowEdge[],
): ConnectionSuggestion[] {
  const nodeByName = new Map(
    nodes.map((node) => [sanitizeName(node.data.label || node.id), node]),
  );
  const existing = new Set(
    edges.map((edge) =>
      suggestionKey(edge.source, edge.target, {
        relation: edge.data?.relation ?? "calls",
        readiness: edge.data?.readiness ?? "source_requires_target",
      }),
    ),
  );
  const suggestions = new Map<string, ConnectionSuggestion>();

  const addSuggestion = (
    source: FlowNode,
    target: FlowNode,
    reason: string,
  ) => {
    if (source.id === target.id) return;
    const data = inferEdgeData(source, target);
    const key = suggestionKey(source.id, target.id, data);
    if (existing.has(key) || suggestions.has(key)) return;
    suggestions.set(key, {
      id: key,
      source: source.id,
      target: target.id,
      data,
      reason,
    });
  };

  for (const source of nodes) {
    for (const name of referencedServiceNames(source)) {
      const target = nodeByName.get(name);
      if (target) {
        addSuggestion(
          source,
          target,
          "Referenced by this service's runtime configuration",
        );
      }
    }
  }

  const applications = nodes.filter(
    (node) => node.data.service.type === "generic",
  );
  if (applications.length === 1) {
    for (const dependency of nodes) {
      if (dependency.data.service.type !== "generic") {
        addSuggestion(
          applications[0],
          dependency,
          "Likely application dependency based on the service inventory",
        );
      }
    }
  }

  return [...suggestions.values()];
}
