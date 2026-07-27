import { describe, expect, test } from "bun:test";
import type { FlowEdge, FlowNode } from "../types/react-flow-cots";
import { suggestConnections } from "./connection-suggestions";

function node(
  id: string,
  label: string,
  type: FlowNode["data"]["service"]["type"],
  envValue?: string,
) {
  return {
    id,
    position: { x: 0, y: 0 },
    type: "serviceNode",
    data: {
      label,
      service: {
        type,
        env: envValue ? [{ id: `${id}-env`, key: "URL", value: envValue }] : [],
        ports: [],
        initScripts: [],
      },
    },
  } as FlowNode;
}

describe("suggestConnections", () => {
  test("suggests referenced services without persisting them", () => {
    const suggestions = suggestConnections(
      [
        node("api", "Orders API", "generic", "$" + "{orders_db.host}"),
        node("db", "Orders DB", "postgres"),
      ],
      [],
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      source: "api",
      target: "db",
      data: { relation: "writes", readiness: "source_requires_target" },
    });
  });

  test("suggests infrastructure for a single application and deduplicates existing edges", () => {
    const nodes = [
      node("api", "API", "generic"),
      node("db", "DB", "postgres"),
      node("cache", "Cache", "redis"),
    ];
    const edges = [
      {
        id: "existing",
        source: "api",
        target: "db",
        data: { relation: "writes", readiness: "source_requires_target" },
      },
    ] as FlowEdge[];

    expect(suggestConnections(nodes, edges).map((item) => item.target)).toEqual(
      ["cache"],
    );
  });

  test("does not guess ownership when multiple applications are present", () => {
    const suggestions = suggestConnections(
      [
        node("orders", "Orders API", "generic"),
        node("billing", "Billing API", "generic"),
        node("db", "DB", "postgres"),
      ],
      [],
    );

    expect(suggestions).toEqual([]);
  });
});
