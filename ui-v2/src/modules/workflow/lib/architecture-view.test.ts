import { describe, expect, test } from "bun:test";
import type { FlowEdge, FlowNode, ServiceType } from "../types/react-flow-cots";
import {
  architectureRole,
  describeArchitectureNode,
  friendlyName,
  layoutArchitecture,
} from "./architecture-view";

function node(id: string, type: ServiceType): FlowNode {
  return {
    id,
    type: "serviceNode",
    position: { x: 0, y: 0 },
    data: {
      label: id,
      service: {
        type,
        image: type === "generic" ? "example:latest" : undefined,
        env: [],
        ports: [],
        initScripts: [],
      },
    },
  };
}

const nodes = [
  node("payment_api", "generic"),
  node("ledger_postgres", "postgres"),
  node("events_kafka", "kafka"),
];
const edges: FlowEdge[] = [
  {
    id: "write",
    source: "payment_api",
    target: "ledger_postgres",
    type: "dataFlow",
    data: { relation: "writes", readiness: "source_requires_target" },
  },
  {
    id: "publish",
    source: "payment_api",
    target: "events_kafka",
    type: "dataFlow",
    data: { relation: "publishes", readiness: "source_requires_target" },
  },
];

describe("architecture view", () => {
  test("classifies services into understandable roles", () => {
    expect(architectureRole("generic")).toBe("application");
    expect(architectureRole("postgres")).toBe("data");
    expect(architectureRole("kafka")).toBe("messaging");
    expect(friendlyName("payment_api")).toBe("Payment API");
  });

  test("turns edges into plain-language statements", () => {
    const statements = describeArchitectureNode(nodes[0], nodes, edges);
    expect(statements.map((statement) => statement.text)).toEqual([
      "Writes data to Ledger Postgres",
      "Publishes messages to Events Kafka",
    ]);
    expect(statements[0]?.readiness).toBe("Starts after Ledger Postgres");
  });

  test("lays out role partitions and produces routed edges", async () => {
    const layout = await layoutArchitecture(nodes, edges);
    const positions = Object.fromEntries(
      layout.nodes.map((item) => [item.id, item.position]),
    );

    expect(positions.payment_api.x).toBeLessThan(positions.ledger_postgres.x);
    expect(positions.ledger_postgres.x).toBeLessThan(positions.events_kafka.x);
    expect(layout.edges.every((edge) => edge.data?.layoutPoints?.length)).toBe(
      true,
    );
  });
});
