import { describe, expect, test } from "bun:test";
import type {
  FlowNode,
  Scenario,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import {
  browserTargetOptions,
  describeScenarioStep,
  journeyStepOperation,
  orderedScenarioSteps,
  orderedScenarioTests,
  scenarioServiceNames,
  scenarioSummary,
  TEST_INTENT_LABELS,
  validateBrowserJourney,
} from "./scenario-journey";

const http: ScenarioTestDefinition = {
  id: "http",
  name: "submit payment",
  type: "http",
  targetServices: ["payment_api"],
  httpConfig: {
    method: "POST",
    path: "/payments",
    port: "8080",
    expectedStatus: 202,
  },
};
const database: ScenarioTestDefinition = {
  id: "database",
  name: "payment stored",
  type: "database",
  targetServices: ["ledger_postgres"],
};

describe("scenario journey", () => {
  test("uses friendly intent labels", () => {
    expect(TEST_INTENT_LABELS.http).toBe("Call an API");
    expect(TEST_INTENT_LABELS.database).toBe("Check stored data");
  });

  test("keeps explicit order and appends missing steps safely", () => {
    expect(
      orderedScenarioTests({
        tests: [http, database],
        testOrder: ["database"],
      }).map((step) => step.id),
    ).toEqual(["database", "http"]);
  });

  test("describes steps and scope in plain language", () => {
    expect(describeScenarioStep(http)).toBe(
      "POST /payments on Payment API and expect 202",
    );
    expect(scenarioServiceNames({ tests: [http, database] })).toEqual([
      "payment_api",
      "ledger_postgres",
    ]);
    expect(scenarioSummary({ tests: [http, database] })).toBe(
      "This journey calls application APIs and verifies stored data across 2 services.",
    );
  });

  test("orders browser steps and exposes their operation", () => {
    const navigate = {
      id: "navigate",
      name: "Open checkout",
      kind: "action" as const,
      action: { operation: "navigate" as const, path: "/checkout" },
    };
    const visible = {
      id: "visible",
      name: "Checkout is visible",
      kind: "assertion" as const,
      assertion: {
        operation: "visible" as const,
        locator: {
          strategy: "role" as const,
          role: "heading",
          name: "Checkout",
        },
      },
    };
    expect(
      orderedScenarioSteps({
        steps: [navigate, visible],
        stepOrder: ["visible"],
      }).map((step) => step.id),
    ).toEqual(["visible", "navigate"]);
    expect(journeyStepOperation(visible)).toBe("visible");
  });

  test("validates the browser target and accessibility-first locator fields", () => {
    const node = {
      id: "web",
      data: {
        label: "Store Front",
        service: {
          type: "generic",
          ports: [{ id: "http", hostPort: "", containerPort: "3000" }],
        },
      },
    } as FlowNode;
    const scenario = {
      name: "Checkout",
      executionModel: "journey",
      environment: {
        driver: "browser",
        browser: { targetService: "store_front", targetPort: "3000" },
      },
      steps: [
        {
          id: "click",
          name: "Submit order",
          kind: "action",
          action: {
            operation: "click",
            locator: { strategy: "role", role: "button", name: "" },
          },
        },
      ],
      stepOrder: ["click"],
    } satisfies Pick<
      Scenario,
      "name" | "executionModel" | "environment" | "steps" | "stepOrder"
    >;

    expect(browserTargetOptions([node])).toEqual([
      { service: "store_front", label: "Store Front", ports: ["3000"] },
    ]);
    const invalid = validateBrowserJourney(scenario, [node]);
    expect(invalid.valid).toBe(false);
    expect(invalid.byField["steps.click.locator.name"]).toContain(
      "accessible name",
    );

    scenario.steps[0] = {
      ...scenario.steps[0],
      action: {
        operation: "click",
        locator: { strategy: "role", role: "button", name: "Place order" },
      },
    };
    expect(validateBrowserJourney(scenario, [node]).valid).toBe(true);
  });

  test("requires a secret reference without accepting a secret value", () => {
    const scenario = {
      name: "Login",
      executionModel: "journey" as const,
      environment: {
        driver: "browser" as const,
        browser: { targetService: "app", targetPort: "80" },
      },
      steps: [
        {
          id: "password",
          name: "Fill password",
          kind: "action" as const,
          action: {
            operation: "fill" as const,
            locator: { strategy: "label" as const, value: "Password" },
            value: { source: "run-secret" as const, secretRef: "" },
          },
        },
      ],
      stepOrder: ["password"],
    };
    const node = {
      id: "app",
      data: {
        label: "app",
        service: {
          type: "nginx",
          ports: [{ id: "http", hostPort: "", containerPort: "80" }],
        },
      },
    } as FlowNode;
    expect(
      validateBrowserJourney(scenario, [node]).byField[
        "steps.password.value.secretRef"
      ],
    ).toContain("run-secret reference");
  });

  test("accepts an empty durable fill value and a zero timeout", () => {
    const scenario = {
      name: "Clear search",
      executionModel: "journey" as const,
      environment: {
        driver: "browser" as const,
        browser: { targetService: "app", targetPort: "80" },
      },
      steps: [
        {
          id: "clear-search",
          name: "Clear search",
          kind: "action" as const,
          timeoutMs: 0,
          action: {
            operation: "fill" as const,
            locator: { strategy: "label" as const, value: "Search" },
            value: { source: "literal" as const, value: "" },
          },
        },
      ],
      stepOrder: ["clear-search"],
    };
    const node = {
      id: "app",
      data: {
        label: "app",
        service: {
          type: "nginx",
          ports: [{ id: "http", hostPort: "", containerPort: "80" }],
        },
      },
    } as FlowNode;

    expect(validateBrowserJourney(scenario, [node]).valid).toBe(true);
  });
});
