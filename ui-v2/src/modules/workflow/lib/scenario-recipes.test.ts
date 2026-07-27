import { describe, expect, test } from "bun:test";
import type { FlowNode } from "../types/react-flow-cots";
import { createScenarioRecipe } from "./scenario-recipes";

describe("scenario recipes", () => {
  test("creates an ordered Redis set/get journey with runtime-scoped keys", () => {
    const tests = createScenarioRecipe("redis-round-trip", [
      {
        id: "redis-node",
        data: { label: "Shared Redis", service: { type: "redis" } },
      } as FlowNode,
    ]);

    expect(tests.map((entry) => entry.cacheConfig?.operation)).toEqual([
      "set",
      "get",
    ]);
    expect(
      tests.every((entry) => entry.targetServices[0] === "shared_redis"),
    ).toBe(true);
    expect(tests[0].cacheConfig?.key).toContain(`\${tokyo.run_suffix}`);
  });

  test("uses the application container port for HTTP smoke checks", () => {
    const tests = createScenarioRecipe("http-smoke", [
      {
        id: "api-node",
        data: {
          label: "Orders API",
          service: {
            type: "generic",
            image: "orders:latest",
            ports: [{ id: "port", hostPort: "", containerPort: "8080" }],
          },
        },
      } as FlowNode,
    ]);
    expect(tests[0].httpConfig?.port).toBe("8080");
    expect(tests[0].targetServices).toEqual(["orders_api"]);
  });
});
