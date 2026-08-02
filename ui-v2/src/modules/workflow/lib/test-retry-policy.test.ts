import { describe, expect, test } from "bun:test";
import type { ScenarioTestDefinition } from "../types/react-flow-cots";
import {
  clearStaleIdempotencyConfirmation,
  guidedRetryDescription,
  isAutomaticallyRetrySafe,
} from "./test-retry-policy";

function http(
  method: NonNullable<ScenarioTestDefinition["httpConfig"]>["method"],
) {
  return {
    id: "http",
    name: "HTTP",
    type: "http",
    targetServices: ["api"],
    httpConfig: { method, path: "/", port: "8080" },
  } satisfies ScenarioTestDefinition;
}

describe("test retry policy", () => {
  test("only classifies conservative read operations as automatically safe", () => {
    expect(isAutomaticallyRetrySafe(http("GET"))).toBe(true);
    expect(isAutomaticallyRetrySafe(http("HEAD"))).toBe(true);
    expect(isAutomaticallyRetrySafe(http("POST"))).toBe(false);
    expect(
      isAutomaticallyRetrySafe({
        id: "cache",
        name: "Cache",
        type: "cache",
        targetServices: ["redis"],
        cacheConfig: { service: "redis", cacheType: "redis", operation: "get" },
      }),
    ).toBe(true);
  });

  test("clears idempotency confirmation when the operation changes", () => {
    const previous = {
      ...http("POST"),
      retryPolicy: {
        mode: "transient",
        idempotencyConfirmed: true,
      },
    } satisfies ScenarioTestDefinition;
    const next = clearStaleIdempotencyConfirmation(previous, http("PATCH"));
    expect(next.retryPolicy).toEqual({ mode: "transient" });
  });

  test("guided copy distinguishes safe, unsafe, and delay behavior", () => {
    expect(guidedRetryDescription(http("GET"))).toContain(
      "retries one safe transient",
    );
    expect(guidedRetryDescription(http("POST"))).toContain(
      "not automatically retried",
    );
    expect(
      guidedRetryDescription({
        id: "delay",
        name: "delay",
        type: "delay",
        targetServices: [],
        delayConfig: { durationMs: 100 },
      }),
    ).toBe("Delay steps are never retried.");
  });
});
