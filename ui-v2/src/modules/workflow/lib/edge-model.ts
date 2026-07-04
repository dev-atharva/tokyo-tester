import type {
  EdgeData,
  EdgeReadiness,
  EdgeRelation,
  FlowEdge,
  FlowNode,
} from "../types/react-flow-cots";

export const EDGE_RELATIONS: EdgeRelation[] = [
  "calls",
  "reads",
  "writes",
  "publishes",
  "consumes",
];

export const EDGE_READINESS_OPTIONS: EdgeReadiness[] = [
  "none",
  "source_requires_target",
  "target_requires_source",
];

const queueTypes = new Set(["kafka", "rabbitmq"]);
const storeTypes = new Set([
  "postgres",
  "mysql",
  "mariadb",
  "redis",
  "memcached",
  "mongodb",
]);

export function defaultReadiness(relation: EdgeRelation): EdgeReadiness {
  return relation === "reads" || relation === "consumes"
    ? "target_requires_source"
    : "source_requires_target";
}

export function inferEdgeData(source: FlowNode, target: FlowNode): EdgeData {
  const sourceType = source.data.service.type;
  const targetType = target.data.service.type;
  let relation: EdgeRelation = "calls";

  if (queueTypes.has(sourceType) && targetType === "generic") {
    relation = "consumes";
  } else if (sourceType === "generic" && queueTypes.has(targetType)) {
    relation = "publishes";
  } else if (storeTypes.has(sourceType) && targetType === "generic") {
    relation = "reads";
  } else if (sourceType === "generic" && storeTypes.has(targetType)) {
    relation = "writes";
  }

  return { relation, readiness: defaultReadiness(relation) };
}

export function normalizeEdge(edge: FlowEdge, legacy = false): FlowEdge {
  const migrated = legacy || !edge.data?.relation || !edge.data?.readiness;
  const relation = EDGE_RELATIONS.includes(edge.data?.relation as EdgeRelation)
    ? (edge.data?.relation as EdgeRelation)
    : "calls";
  const readiness = EDGE_READINESS_OPTIONS.includes(
    edge.data?.readiness as EdgeReadiness,
  )
    ? (edge.data?.readiness as EdgeReadiness)
    : "source_requires_target";

  return {
    ...edge,
    type: "dataFlow",
    data: {
      relation,
      readiness,
      label: edge.data?.label,
      description: edge.data?.description,
      protocol: edge.data?.protocol,
      needsReview: migrated || edge.data?.needsReview || undefined,
      showLabel: edge.data?.showLabel,
      layoutPoints: edge.data?.layoutPoints,
    },
  };
}

export function normalizeEdges(edges: FlowEdge[], legacy = false): FlowEdge[] {
  return edges.map((edge) =>
    normalizeEdge(
      edge,
      legacy || !edge.data?.relation || !edge.data?.readiness,
    ),
  );
}

export function relationLabel(data?: EdgeData): string {
  return data?.label?.trim() || data?.relation || "calls";
}

export function invalidateRoutesForMovedNodes(
  edges: FlowEdge[],
  movedNodeIds: ReadonlySet<string>,
): FlowEdge[] {
  if (movedNodeIds.size === 0) return edges;
  return edges.map((edge) =>
    movedNodeIds.has(edge.source) || movedNodeIds.has(edge.target)
      ? {
          ...edge,
          data: edge.data
            ? { ...edge.data, layoutPoints: undefined }
            : edge.data,
        }
      : edge,
  );
}
