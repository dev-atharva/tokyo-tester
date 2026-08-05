import { describe, expect, test } from "bun:test";
import type { Scenario } from "../types/react-flow-cots";
import { deriveRequiredRunSecretRefs } from "./run-secrets";

describe("run-secret reference derivation", () => {
  test("returns sorted distinct references from the exact scenario selection", () => {
    const scenarios = [
      journey("one", ["PASSWORD", "API_TOKEN"]),
      journey("two", ["PASSWORD"]),
    ];
    expect(deriveRequiredRunSecretRefs(scenarios)).toEqual([
      "API_TOKEN",
      "PASSWORD",
    ]);
    expect(deriveRequiredRunSecretRefs([scenarios[1]])).toEqual(["PASSWORD"]);
  });

  test("ignores literals and legacy tests", () => {
    const scenario = journey("one", []);
    scenario.steps = [
      {
        id: "literal",
        name: "Literal",
        kind: "action",
        action: {
          operation: "fill",
          locator: { strategy: "label", value: "Name" },
          value: { source: "literal", value: "Atharva" },
        },
      },
    ];
    expect(deriveRequiredRunSecretRefs([scenario])).toEqual([]);
    expect(
      deriveRequiredRunSecretRefs([
        { ...scenario, executionModel: "legacy-tests" },
      ]),
    ).toEqual([]);
  });
});

function journey(id: string, refs: string[]): Scenario {
  return {
    id,
    projectId: "project",
    workflowId: "workflow",
    name: id,
    executionModel: "journey",
    tests: [],
    testOrder: [],
    environment: {
      driver: "browser",
      browser: { targetService: "web", targetPort: "3000" },
    },
    steps: refs.map((secretRef, index) => ({
      id: `step-${index}`,
      name: secretRef,
      kind: "action" as const,
      action: {
        operation: "fill" as const,
        locator: { strategy: "label" as const, value: secretRef },
        value: { source: "run-secret" as const, secretRef },
      },
    })),
    stepOrder: refs.map((_, index) => `step-${index}`),
    version: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    user_id: "user",
    client_id: "client",
    is_deleted: false,
  };
}
