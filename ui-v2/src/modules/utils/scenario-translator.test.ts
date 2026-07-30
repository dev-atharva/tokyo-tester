import { describe, expect, test } from "bun:test";
import type {
  EdgeReadiness,
  FlowEdge,
  FlowNode,
  ScenarioTestDefinition,
  ServiceType,
} from "../workflow/types/react-flow-cots";
import {
  buildNodeMap,
  buildServiceDependencies,
  translateScenarioToExecutionBundle,
  translateWorkflowGraphToServiceGraph,
  validateWorkflowGraph,
} from "./scenario-translator";

function node(id: string, type: ServiceType, envValue?: string): FlowNode {
  return {
    id,
    type: "serviceNode",
    position: { x: 0, y: 0 },
    data: {
      label: id,
      service: {
        type,
        image: type === "generic" ? "example:latest" : undefined,
        env: envValue
          ? [{ id: "env", key: "DEPENDENCY", value: envValue }]
          : [],
        ports: [],
        initScripts: [],
      },
    },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  readiness: EdgeReadiness,
): FlowEdge {
  return {
    id,
    source,
    target,
    type: "dataFlow",
    data: { relation: "calls", readiness },
  };
}

const scenarioTest: ScenarioTestDefinition = {
  id: "test",
  name: "health",
  type: "http",
  targetServices: ["app"],
  httpConfig: { method: "GET", path: "/", port: "8080", expectedStatus: 200 },
};

describe("readiness translation", () => {
  test("allows data cycles when the readiness graph is acyclic", () => {
    const nodes = [node("app", "generic"), node("db", "postgres")];
    const edges = [
      edge("write", "app", "db", "source_requires_target"),
      edge("read", "db", "app", "target_requires_source"),
    ];

    expect(validateWorkflowGraph(nodes, edges).valid).toBe(true);
    expect(
      buildServiceDependencies(nodes, edges, buildNodeMap(nodes)).get("app"),
    ).toEqual(["db"]);
  });

  test("rejects readiness cycles", () => {
    const nodes = [node("app", "generic"), node("db", "postgres")];
    const result = validateWorkflowGraph(nodes, [
      edge("one", "app", "db", "source_requires_target"),
      edge("two", "db", "app", "source_requires_target"),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain("Circular dependencies");
  });

  test("requires readiness for runtime references", () => {
    const nodes = [
      node("app", "generic", `\${db.host}`),
      node("db", "postgres"),
    ];
    const result = validateWorkflowGraph(nodes, [
      edge("flow", "app", "db", "none"),
    ]);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) =>
        error.message.includes("without a readiness"),
      ),
    ).toBe(true);
  });

  test("selects only test targets and their readiness closure", () => {
    const nodes = [
      node("app", "generic"),
      node("db", "postgres"),
      node("unused", "redis"),
    ];
    const graph = translateWorkflowGraphToServiceGraph(nodes, [
      edge("dependency", "app", "db", "source_requires_target"),
      edge("data-only", "app", "unused", "none"),
    ]);
    const translated = translateScenarioToExecutionBundle(graph, {
      id: "scenario",
      name: "scenario",
      tests: [scenarioTest],
      testOrder: ["test"],
    });

    expect(translated.services.map((service) => service.name).sort()).toEqual([
      "app",
      "db",
    ]);
  });

  test("validates and translates service-owned MockServer expectations", () => {
    const mock = node("mock-api", "mockserver");
    mock.data.service.mockServer = {
      expectations: [
        {
          id: "health",
          request: { method: "GET", path: "/health" },
          response: { statusCode: 200, body: "ready" },
        },
      ],
    };
    expect(validateWorkflowGraph([mock], []).valid).toBe(true);
    expect(
      translateWorkflowGraphToServiceGraph([mock], []).services[0]
        ?.mockserver_expectations,
    ).toEqual([
      {
        id: "health",
        request: { method: "GET", path: "/health" },
        response: { status_code: 200, body: "ready" },
      },
    ]);

    const expectation = mock.data.service.mockServer.expectations[0];
    if (!expectation) throw new Error("MockServer expectation is missing");
    expectation.request.path = "health";
    expect(validateWorkflowGraph([mock], []).valid).toBe(false);
  });
});
