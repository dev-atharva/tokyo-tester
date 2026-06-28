import { describe, expect, test } from "bun:test";
import { buildRunnerUrl } from "./runner-proxy";

describe("runner proxy", () => {
  test("targets the private runner and preserves replay query parameters", () => {
    const target = buildRunnerUrl(
      "/api/v1/workflow-runs/run-1/events",
      "?after=42",
      "http://runner:8080/",
    );

    expect(target.toString()).toBe(
      "http://runner:8080/api/v1/workflow-runs/run-1/events?after=42",
    );
  });
});
