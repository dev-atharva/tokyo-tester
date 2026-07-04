import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge } from "elkjs/lib/elk-api";
import type {
  EdgeData,
  FlowEdge,
  FlowNode,
  ServiceType,
} from "../types/react-flow-cots";

export type ArchitectureRole = "application" | "data" | "messaging";

export interface ArchitectureStatement {
  edgeId: string;
  text: string;
  protocol?: string;
  readiness?: string;
}

export const ROLE_META: Record<
  ArchitectureRole,
  { label: string; description: string }
> = {
  application: {
    label: "Application services",
    description: "APIs, workers, and business services",
  },
  data: {
    label: "Data and cache",
    description: "Databases, documents, and cached state",
  },
  messaging: {
    label: "Messaging and events",
    description: "Queues, brokers, and event streams",
  },
};

const messagingTypes = new Set<ServiceType>(["kafka", "rabbitmq"]);

export function architectureRole(type: ServiceType): ArchitectureRole {
  if (type === "generic") return "application";
  if (messagingTypes.has(type)) return "messaging";
  return "data";
}

export function friendlyName(value: string): string {
  const preferred: Record<string, string> = {
    api: "API",
    mysql: "MySQL",
    mariadb: "MariaDB",
    mongodb: "MongoDB",
    rabbitmq: "RabbitMQ",
    kafka: "Kafka",
    redis: "Redis",
    postgres: "Postgres",
    memcached: "Memcached",
  };
  return value
    .split(/[_-]+/)
    .map(
      (word) =>
        preferred[word.toLowerCase()] ||
        `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

export function inferredProtocol(type: ServiceType): string | undefined {
  const protocols: Partial<Record<ServiceType, string>> = {
    postgres: "PostgreSQL",
    mysql: "MySQL",
    mariadb: "MariaDB",
    redis: "Redis",
    memcached: "Memcached",
    mongodb: "MongoDB",
    rabbitmq: "AMQP",
    kafka: "Kafka protocol",
  };
  return protocols[type];
}

export function describeArchitectureNode(
  selected: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
): ArchitectureStatement[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const statements = edges
    .filter(
      (edge) => edge.source === selected.id || edge.target === selected.id,
    )
    .map((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return null;
      const isSource = edge.source === selected.id;
      const other = friendlyName(
        (isSource ? target : source).data.label ||
          (isSource ? target : source).id,
      );
      const relation = edge.data?.relation || "calls";
      const text = relationshipSentence(relation, isSource, other);
      const readiness = readinessSentence(edge, selected, source, target);
      const otherNode = isSource ? target : source;
      const protocol =
        edge.data?.protocol || inferredProtocol(otherNode.data.service.type);
      return { edgeId: edge.id, text, protocol, readiness };
    })
    .filter(Boolean);
  return statements as ArchitectureStatement[];
}

function relationshipSentence(
  relation: EdgeData["relation"],
  isSource: boolean,
  other: string,
): string {
  const sentences = {
    calls: isSource ? `Calls ${other}` : `Receives calls from ${other}`,
    reads: isSource ? `Provides data to ${other}` : `Reads from ${other}`,
    writes: isSource
      ? `Writes data to ${other}`
      : `Receives data from ${other}`,
    publishes: isSource
      ? `Publishes messages to ${other}`
      : `Receives published messages from ${other}`,
    consumes: isSource
      ? `Delivers messages to ${other}`
      : `Consumes messages from ${other}`,
  };
  return sentences[relation];
}

function readinessSentence(
  edge: FlowEdge,
  selected: FlowNode,
  source: FlowNode,
  target: FlowNode,
): string | undefined {
  if (edge.data?.readiness === "none") return undefined;
  if (
    (edge.data?.readiness === "source_requires_target" &&
      selected.id === source.id) ||
    (edge.data?.readiness === "target_requires_source" &&
      selected.id === target.id)
  ) {
    const dependency = selected.id === source.id ? target : source;
    return `Starts after ${friendlyName(dependency.data.label)}`;
  }
  return undefined;
}

const NODE_WIDTH = 184;
const NODE_HEIGHT = 92;

export async function layoutArchitecture(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  try {
    return await layoutWithElk(nodes, edges);
  } catch (error) {
    if (typeof window !== "undefined") {
      console.warn(
        "ELK layout unavailable; using deterministic role layout",
        error,
      );
    }
    return layoutByRole(nodes, edges);
  }
}

async function layoutWithElk(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  const elk = new ELK();
  const roleOrder: Record<ArchitectureRole, number> = {
    application: 0,
    data: 1,
    messaging: 2,
  };
  const graph = await elk.layout({
    id: "architecture",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.partitioning.activate": "true",
      "elk.spacing.nodeNode": "90",
      "elk.layered.spacing.nodeNodeBetweenLayers": "190",
      "elk.layered.spacing.edgeNodeBetweenLayers": "60",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: {
        "elk.partitioning.partition": String(
          roleOrder[architectureRole(node.data.service.type)],
        ),
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  const layoutNodes = new Map(
    graph.children?.map((node) => [node.id, node]) || [],
  );
  const layoutEdges = new Map(
    graph.edges?.map((edge) => [edge.id, edge as ElkExtendedEdge]) || [],
  );

  return {
    nodes: nodes.map((node) => {
      const layoutNode = layoutNodes.get(node.id);
      return layoutNode
        ? {
            ...node,
            position: { x: layoutNode.x || 0, y: layoutNode.y || 0 },
          }
        : node;
    }),
    edges: edges.map((edge) => {
      const section = layoutEdges.get(edge.id)?.sections?.[0];
      const layoutPoints = section
        ? [section.startPoint, ...(section.bendPoints || []), section.endPoint]
        : undefined;
      return {
        ...edge,
        data: { ...edge.data, layoutPoints },
      } as FlowEdge;
    }),
  };
}

function layoutByRole(
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const columns: Record<ArchitectureRole, number> = {
    application: 0,
    data: 480,
    messaging: 960,
  };
  const counts: Record<ArchitectureRole, number> = {
    application: 0,
    data: 0,
    messaging: 0,
  };
  const layoutNodes = nodes.map((node) => {
    const role = architectureRole(node.data.service.type);
    const row = counts[role]++;
    return { ...node, position: { x: columns[role], y: row * 160 } };
  });
  const positions = new Map(
    layoutNodes.map((node) => [node.id, node.position]),
  );
  const layoutEdges = edges.map((edge) => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return edge;
    const start = { x: source.x + NODE_WIDTH, y: source.y + NODE_HEIGHT / 2 };
    const end = { x: target.x, y: target.y + NODE_HEIGHT / 2 };
    const middleX = (start.x + end.x) / 2;
    return {
      ...edge,
      data: {
        ...edge.data,
        layoutPoints: [
          start,
          { x: middleX, y: start.y },
          { x: middleX, y: end.y },
          end,
        ],
      },
    } as FlowEdge;
  });
  return { nodes: layoutNodes, edges: layoutEdges };
}

export function architectureBounds(nodes: FlowNode[]) {
  return (["application", "data", "messaging"] as ArchitectureRole[])
    .map((role) => {
      const roleNodes = nodes.filter(
        (node) => architectureRole(node.data.service.type) === role,
      );
      if (roleNodes.length === 0) return null;
      const left = Math.min(...roleNodes.map((node) => node.position.x)) - 48;
      const top = Math.min(...roleNodes.map((node) => node.position.y)) - 68;
      const right =
        Math.max(
          ...roleNodes.map(
            (node) => node.position.x + (node.measured?.width || NODE_WIDTH),
          ),
        ) + 48;
      const bottom =
        Math.max(
          ...roleNodes.map(
            (node) => node.position.y + (node.measured?.height || NODE_HEIGHT),
          ),
        ) + 48;
      return { role, left, top, width: right - left, height: bottom - top };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}
