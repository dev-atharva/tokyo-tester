import { describe, expect, test } from "bun:test";
import type { FlowNode, ServiceType } from "../types/react-flow-cots";
import {
  inferEdgeData,
  invalidateRoutesForMovedNodes,
  normalizeEdge,
} from "./edge-model";

function node(id: string, type: ServiceType): FlowNode {
  return {
    id,
    type: "serviceNode",
    position: { x: 0, y: 0 },
    data: {
      label: id,
      service: { type, env: [], ports: [], initScripts: [] },
    },
  };
}

describe("edge model", () => {
  test("infers actual data direction for stores and queues", () => {
    expect(
      inferEdgeData(node("db", "postgres"), node("api", "generic")),
    ).toEqual({
      relation: "reads",
      readiness: "target_requires_source",
    });
    expect(
      inferEdgeData(node("api", "generic"), node("queue", "kafka")),
    ).toEqual({
      relation: "publishes",
      readiness: "source_requires_target",
    });
    expect(
      inferEdgeData(node("queue", "rabbitmq"), node("worker", "generic")),
    ).toEqual({
      relation: "consumes",
      readiness: "target_requires_source",
    });
  });

  test("normalizes a legacy edge without changing its direction", () => {
    expect(
      normalizeEdge({ id: "legacy", source: "a", target: "b" } as never),
    ).toMatchObject({
      source: "a",
      target: "b",
      type: "dataFlow",
      data: {
        relation: "calls",
        readiness: "source_requires_target",
        needsReview: true,
      },
    });
  });

  test("invalidates routes only for edges connected to moved nodes", () => {
    const route = [{ x: 1, y: 2 }];
    const edges = [
      {
        id: "connected",
        source: "api",
        target: "db",
        data: {
          relation: "writes" as const,
          readiness: "source_requires_target" as const,
          layoutPoints: route,
        },
      },
      {
        id: "untouched",
        source: "worker",
        target: "queue",
        data: {
          relation: "publishes" as const,
          readiness: "source_requires_target" as const,
          layoutPoints: route,
        },
      },
    ];

    const next = invalidateRoutesForMovedNodes(edges, new Set(["api"]));
    expect(next[0]?.data?.layoutPoints).toBeUndefined();
    expect(next[1]?.data?.layoutPoints).toEqual(route);
  });
});
