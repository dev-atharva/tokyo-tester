import { describe, expect, test } from "bun:test";
import { translateWorkflowGraphToServiceGraph } from "@/modules/utils/scenario-translator";
import {
  materializeWorkflowBundle,
  parseWorkflowBundle,
  validateWorkflowBundle,
} from "./workflow-bundle";
import { WORKFLOW_TEMPLATES } from "./workflow-templates";

describe("workflow templates", () => {
  test("ships four runnable, valid starters", () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(4);
    for (const template of WORKFLOW_TEMPLATES) {
      expect(() => validateWorkflowBundle(template.bundle)).not.toThrow();
      expect(template.bundle.scenarios.length).toBeGreaterThan(0);
      const scenario = template.bundle.scenarios[0];
      expect(
        scenario?.executionModel === "journey"
          ? scenario.steps?.length
          : scenario?.tests.length,
      ).toBeGreaterThan(0);
    }
  });

  test("provides a runnable browser checkout journey with a human secret", () => {
    const template = WORKFLOW_TEMPLATES.find(
      (candidate) => candidate.id === "browser-checkout-journey",
    );
    if (!template) throw new Error("Browser journey template is missing");

    const scenario = template.bundle.scenarios[0];
    expect(template.bundle.schemaVersion).toBe(3);
    expect(template.bundle.workflow.nodes[0]?.data.service.env).toContainEqual({
      id: "browser-fixture-role",
      key: "APP_ROLE",
      value: "fault-lab",
    });
    expect(scenario).toMatchObject({
      executionModel: "journey",
      environment: {
        driver: "browser",
        browser: {
          targetService: "browser_fixture",
          targetPort: "8080",
        },
      },
      stepOrder: ["open-checkout", "enter-password", "confirm-checkout"],
    });
    expect(scenario?.steps?.[1]).toMatchObject({
      kind: "action",
      action: {
        operation: "fill",
        locator: { strategy: "label", value: "Checkout password" },
        value: { source: "run-secret", secretRef: "checkout.password" },
      },
    });

    const materialized = materializeWorkflowBundle(template.bundle, []);
    const importedScenario = materialized.scenarios[0];
    expect(importedScenario?.steps?.map((step) => step.id)).not.toEqual(
      scenario?.steps?.map((step) => step.id),
    );
    expect(importedScenario?.stepOrder).toEqual(
      importedScenario?.steps?.map((step) => step.id),
    );
  });

  test("materializes templates with unique names and fresh test ids", () => {
    const template = WORKFLOW_TEMPLATES[1];
    if (!template) throw new Error("MockServer template is missing");
    const originalTestId = template.bundle.scenarios[0]?.tests[0]?.id;
    const materialized = materializeWorkflowBundle(template.bundle, [
      template.bundle.workflow.name,
    ]);
    expect(materialized.workflow.name).toBe(
      `${template.bundle.workflow.name} 2`,
    );
    expect(materialized.scenarios[0]?.tests[0]?.id).not.toBe(originalTestId);
    expect(materialized.scenarios[0]?.testOrder[0]).toBe(
      materialized.scenarios[0]?.tests[0]?.id,
    );
  });

  test("round-trips MockServer configuration through bundle JSON", () => {
    const template = WORKFLOW_TEMPLATES.find(
      (candidate) => candidate.id === "mock-api-contract",
    );
    if (!template) throw new Error("MockServer template is missing");
    const parsed = parseWorkflowBundle(JSON.stringify(template.bundle));
    expect(parsed.workflow.nodes[0]?.data.service.mockServer).toEqual(
      template.bundle.workflow.nodes[0]?.data.service.mockServer,
    );
  });

  test("regenerates dependency ids while preserving scenario order", () => {
    const template = WORKFLOW_TEMPLATES.find(
      (candidate) => candidate.id === "postgres-redis-state",
    );
    if (!template) throw new Error("PostgreSQL and Redis template is missing");
    const materialized = materializeWorkflowBundle(template.bundle, []);
    const scenario = materialized.scenarios[0];
    const setTest = scenario?.tests.find(
      (test) => test.name === "Store a value in Redis",
    );
    const getTest = scenario?.tests.find(
      (test) => test.name === "Read the value from Redis",
    );
    if (!setTest || !getTest)
      throw new Error("Redis template tests are missing");
    expect(setTest.id).not.toBe("redis-set");
    expect(getTest.dependsOnTestIds).toEqual([setTest.id]);
    expect(scenario?.testOrder).toEqual(scenario?.tests.map((test) => test.id));
  });

  test("translates the MockServer expectation into the execution DTO", () => {
    const template = WORKFLOW_TEMPLATES.find(
      (candidate) => candidate.id === "mock-api-contract",
    );
    if (!template) throw new Error("MockServer template is missing");
    const graph = translateWorkflowGraphToServiceGraph(
      template.bundle.workflow.nodes,
      template.bundle.workflow.edges,
    );
    expect(graph.services[0]).toMatchObject({
      type: "mockserver",
      image: "mockserver/mockserver:5.15.0",
      mockserver_expectations: [
        {
          id: "user-by-id",
          request: { method: "GET", path: "/api/users/42" },
          response: { status_code: 200 },
        },
      ],
    });
  });
});
