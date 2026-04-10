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
          schemaVersion: 2,
          kind: "cots.workflow-bundle",
          workflow: { name: "bad", nodes, edges },
          scenarios: [
            { name: "scenario", tests, testOrder: ["test-1", "test-2"] },
          ],
        }),
      ),
    ).toThrow("Unsupported workflow bundle schema version");
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
});
