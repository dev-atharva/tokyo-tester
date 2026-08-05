import { describe, expect, test } from "bun:test";
import type { WorkflowExecution } from "../stores/execution.store.sync";
import type { Workflow } from "../stores/workflow.store.sync";
import type {
  FlowEdge,
  FlowNode,
  Scenario,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import {
  getServiceRemovalImpact,
  removeServiceFromGraph,
  resolveWorkflowListState,
  summarizeWorkflowCard,
  summarizeWorkflowList,
} from "./workflow-presentation";

describe("workflow presentation", () => {
  test("derives list and card summaries with the latest execution", () => {
    const workflows = [workflow("workflow-1", 2), workflow("workflow-2", 1)];
    const scenarios = [
      scenario("scenario-1", "workflow-1", []),
      scenario("scenario-2", "workflow-2", []),
    ];
    const executions = [
      execution("run-old", "workflow-1", 100, "failed"),
      execution("run-new", "workflow-1", 200, "completed"),
      execution("run-other", "workflow-2", 300, "running"),
    ];

    expect(summarizeWorkflowList(workflows, scenarios, executions)).toEqual({
      workflows: 2,
      services: 3,
      scenarios: 2,
      executions: 3,
    });
    expect(
      summarizeWorkflowCard(workflows[0] as Workflow, scenarios, executions),
    ).toMatchObject({
      services: 2,
      scenarios: 1,
      executions: 2,
      latestExecution: { workflowRunId: "run-new", status: "completed" },
    });
  });

  test("distinguishes every workflow-list presentation state", () => {
    expect(
      resolveWorkflowListState({
        isReady: false,
        hasProject: true,
        canEdit: true,
        workflowCount: 2,
      }),
    ).toBe("loading");
    expect(
      resolveWorkflowListState({
        isReady: true,
        hasProject: false,
        canEdit: false,
        workflowCount: 0,
      }),
    ).toBe("no-project");
    expect(
      resolveWorkflowListState({
        isReady: true,
        hasProject: true,
        canEdit: true,
        workflowCount: 0,
      }),
    ).toBe("empty-editable");
    expect(
      resolveWorkflowListState({
        isReady: true,
        hasProject: true,
        canEdit: false,
        workflowCount: 0,
      }),
    ).toBe("empty-readonly");
    expect(
      resolveWorkflowListState({
        isReady: true,
        hasProject: true,
        canEdit: true,
        workflowCount: 1,
      }),
    ).toBe("populated");
  });

  test("counts service references across scenario configuration fields", () => {
    const redis = serviceNode("redis-node", "Shared Redis");
    const tests: ScenarioTestDefinition[] = [
      testDefinition("target", { targetServices: ["shared_redis"] }),
      testDefinition("cache", {
        cacheConfig: {
          service: "Shared Redis",
          cacheType: "redis",
          operation: "ping",
        },
      }),
      testDefinition("document", {
        documentConfig: {
          service: "other",
          database: "test",
          collection: "items",
          operation: "count_documents",
        },
      }),
      testDefinition("queue", {
        queueConfig: {
          service: "redis-node",
          brokerType: "kafka",
          operation: "list_topics",
        },
      }),
    ];
    const scenarios = [scenario("scenario-1", "workflow-1", tests)];
    const edges = [
      edge("edge-1", "app", redis.id),
      edge("edge-2", redis.id, "worker"),
    ];

    expect(getServiceRemovalImpact(redis, edges, scenarios)).toEqual({
      connectedEdges: 2,
      referencedTests: 3,
      referencedScenarios: 1,
    });
  });

  test("removes a service and attached edges without mutating scenarios", () => {
    const app = serviceNode("app", "App");
    const redis = serviceNode("redis", "Redis");
    const scenarios = [
      scenario("scenario-1", "workflow-1", [
        testDefinition("cache", { targetServices: ["redis"] }),
      ]),
    ];
    const before = structuredClone(scenarios);
    const result = removeServiceFromGraph(
      [app, redis],
      [edge("edge-1", app.id, redis.id)],
      redis.id,
    );

    expect(result.nodes.map((node) => node.id)).toEqual(["app"]);
    expect(result.edges).toEqual([]);
    expect(scenarios).toEqual(before);
  });
});

function workflow(id: string, serviceCount: number): Workflow {
  return {
    id,
    projectId: "project-1",
    name: id,
    description: "",
    nodes: Array.from({ length: serviceCount }, (_, index) =>
      serviceNode(`${id}-service-${index}`, `Service ${index}`),
    ),
    edges: [],
    customTestOrder: {},
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_id: "user-1",
    client_id: "client-1",
    is_deleted: false,
  };
}

function scenario(
  id: string,
  workflowId: string,
  tests: ScenarioTestDefinition[],
): Scenario {
  return {
    id,
    projectId: "project-1",
    workflowId,
    name: id,
    executionModel: "legacy-tests",
    tests,
    testOrder: tests.map((item) => item.id),
    steps: [],
    stepOrder: [],
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_id: "user-1",
    client_id: "client-1",
    is_deleted: false,
  };
}

function execution(
  workflowRunId: string,
  workflowId: string,
  startedAt: number,
  status: WorkflowExecution["status"],
): WorkflowExecution {
  return {
    workflowRunId,
    projectId: "project-1",
    workflowId,
    status,
    logs: [],
    startedAt,
    scenarioRunIds: [],
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_id: "user-1",
    client_id: "client-1",
    is_deleted: false,
  };
}

function serviceNode(id: string, label: string): FlowNode {
  return {
    id,
    type: "serviceNode",
    position: { x: 0, y: 0 },
    data: { label, service: { type: "generic", image: "example:latest" } },
  };
}

function edge(id: string, source: string, target: string): FlowEdge {
  return { id, source, target, type: "dataFlow" };
}

function testDefinition(
  id: string,
  overrides: Partial<ScenarioTestDefinition>,
): ScenarioTestDefinition {
  return {
    id,
    name: id,
    type: "http",
    targetServices: [],
    ...overrides,
  };
}
