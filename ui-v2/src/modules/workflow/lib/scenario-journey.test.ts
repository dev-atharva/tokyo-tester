import { describe, expect, test } from "bun:test";
import type { ScenarioTestDefinition } from "../types/react-flow-cots";
import {
  describeScenarioStep,
  orderedScenarioTests,
  scenarioServiceNames,
  scenarioSummary,
  TEST_INTENT_LABELS,
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
});
