import { describe, expect, test } from "bun:test";
import type {
  FlowEdge,
  FlowNode,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import {
  createClonedWorkflowBundle,
  createWorkflowBundle,
  materializeWorkflowBundle,
  parseWorkflowBundle,
} from "./workflow-bundle";

const nodes: FlowNode[] = [
  {
    id: "node-1",
    position: { x: 0, y: 0 },
    type: "service",
    data: {
      label: "api",
      service: {
        type: "generic",
        image: "ghcr.io/example/api:latest",
        env: [],
        ports: [],
        initScripts: [],
      },
    },
  },
];

const edges: FlowEdge[] = [];

const tests: ScenarioTestDefinition[] = [
  {
    id: "test-1",
    name: "health check",
    type: "http",
    targetServices: ["api"],
    httpConfig: {
      method: "GET",
      path: "/health",
      port: "8080",
      expectedStatus: 200,
    },
  },
  {
    id: "test-2",
    name: "delay",
    type: "delay",
    targetServices: ["api"],
    dependsOnTestIds: ["test-1"],
    delayConfig: {
      durationMs: 100,
    },
  },
];

describe("workflow bundle", () => {
  test("exports and parses a workflow bundle", () => {
    const bundle = createWorkflowBundle(
      {
        name: "Smoke Tests",
        description: "demo",
        nodes,
        edges,
      },
      [
        {
          name: "Happy path",
          description: "checks health",
          tests,
          testOrder: ["test-1", "test-2"],
        },
      ],
    );

    const parsed = parseWorkflowBundle(JSON.stringify(bundle));

    expect(parsed.workflow.name).toBe("Smoke Tests");
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0]?.testOrder).toEqual(["test-1", "test-2"]);
  });

  test("materializes imported bundles with new test ids", () => {
    const bundle = createWorkflowBundle(
      {
        name: "Smoke Tests",
        description: "demo",
        nodes,
        edges,
      },
      [
        {
          name: "Happy path",
          description: "checks health",
          tests,
          testOrder: ["test-1", "test-2"],
        },
      ],
    );

    const imported = materializeWorkflowBundle(bundle, ["Smoke Tests"]);

    expect(imported.workflow.name).toBe("Smoke Tests 2");
    expect(imported.scenarios[0]?.tests[0]?.id).not.toBe("test-1");
    expect(imported.scenarios[0]?.testOrder).toHaveLength(2);
    expect(imported.scenarios[0]?.tests[1]?.dependsOnTestIds).toHaveLength(1);
    expect(imported.scenarios[0]?.testOrder[0]).toBe(
      imported.scenarios[0]?.tests[0]?.id,
    );
  });

  test("creates clone names with copy suffix", () => {
    const cloned = createClonedWorkflowBundle(
      {
        name: "Smoke Tests",
        description: "",
        nodes,
        edges,
      },
      [
        {
          name: "Happy path",
          description: "checks health",
          tests,
          testOrder: ["test-1", "test-2"],
        },
      ],
      ["Smoke Tests", "Smoke Tests Copy"],
    );

    expect(cloned.workflow.name).toBe("Smoke Tests Copy 2");
  });

  test("rejects unsupported schema versions", () => {
    expect(() =>
      parseWorkflowBundle(
        JSON.stringify({
          schemaVersion: 3,
          kind: "cots.workflow-bundle",
          workflow: { name: "bad", nodes, edges },
          scenarios: [
            { name: "scenario", tests, testOrder: ["test-1", "test-2"] },
          ],
        }),
      ),
    ).toThrow("Unsupported workflow bundle schema version");
  });

  test("migrates version 1 edges and marks them for review", () => {
    const parsed = parseWorkflowBundle(
      JSON.stringify({
        schemaVersion: 1,
        kind: "cots.workflow-bundle",
        workflow: {
          name: "legacy",
          nodes: [
            ...nodes,
            {
              id: "node-2",
              position: { x: 200, y: 0 },
              type: "serviceNode",
              data: {
                label: "cache",
                service: { type: "redis", env: [], ports: [], initScripts: [] },
              },
            },
          ],
          edges: [{ id: "old", source: "node-1", target: "node-2" }],
        },
        scenarios: [
          { name: "scenario", tests, testOrder: ["test-1", "test-2"] },
        ],
      }),
    );

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.workflow.edges[0]?.data).toEqual({
      relation: "calls",
      readiness: "source_requires_target",
      needsReview: true,
    });
  });

  test("ignores non-serializable node callbacks during export", () => {
    const bundle = createWorkflowBundle(
      {
        name: "Callback Workflow",
        description: "",
        nodes: [
          {
            ...nodes[0],
            data: {
              ...nodes[0].data,
              onDelete: () => {},
            },
          },
        ],
        edges,
      },
      [
        {
          name: "Happy path",
          description: "checks health",
          tests,
          testOrder: ["test-1", "test-2"],
        },
      ],
    );

    expect(bundle.workflow.nodes[0]?.data.onDelete).toBeUndefined();
  });

  test("does not export transient layout presentation data", () => {
    const bundle = createWorkflowBundle(
      {
        name: "Layout",
        description: "",
        nodes,
        edges: [
          {
            id: "edge",
            source: "node-1",
            target: "node-1",
            data: {
              relation: "calls",
              readiness: "none",
              showLabel: true,
              layoutPoints: [{ x: 1, y: 2 }],
            },
          },
        ],
      },
      [
        {
          name: "Happy path",
          description: "",
          tests,
          testOrder: ["test-1", "test-2"],
        },
      ],
    );

    expect(bundle.workflow.edges[0]?.data?.showLabel).toBeUndefined();
    expect(bundle.workflow.edges[0]?.data?.layoutPoints).toBeUndefined();
  });

  test("round-trips guided connection metadata for the expert graph", () => {
    const connection: FlowEdge = {
      id: "guided-edge",
      source: "node-1",
      target: "node-2",
      type: "dataFlow",
      data: {
        relation: "writes",
        readiness: "source_requires_target",
        protocol: "PostgreSQL",
        description: "Stores completed orders",
      },
    };
    const bundle = createWorkflowBundle(
      {
        name: "Guided workflow",
        nodes: [
          ...nodes,
          {
            ...nodes[0],
            id: "node-2",
            data: {
              ...nodes[0].data,
              label: "database",
              service: {
                type: "postgres",
                env: [],
                ports: [],
                initScripts: [],
              },
            },
          },
        ],
        edges: [connection],
      },
      [
        {
          name: "Connection round trip",
          description: "",
          tests,
          testOrder: ["test-1", "test-2"],
        },
      ],
    );

    const parsed = parseWorkflowBundle(JSON.stringify(bundle));
    expect(parsed.workflow.edges[0]).toMatchObject(connection);
    expect(parsed.workflow.edges[0]?.data?.needsReview).toBeUndefined();
  });
});
