import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseWorkflowBundle } from "../lib/workflow-bundle";

function loadBundle(name: string) {
  return parseWorkflowBundle(
    readFileSync(resolve(process.cwd(), "..", name), "utf8"),
  );
}

describe("complex payment workflow bundles", () => {
  test("imports the passing full-provider fixture", () => {
    const bundle = loadBundle("test-payment-platform.json");
    expect(bundle.scenarios).toHaveLength(2);
    expect(
      new Set(bundle.workflow.nodes.map((node) => String(node.data.service.type))),
    ).toEqual(
      new Set([
        "generic",
        "postgres",
        "mysql",
        "mariadb",
        "redis",
        "memcached",
        "mongodb",
        "rabbitmq",
        "kafka",
      ]),
    );
  });

  test("imports the deliberately partial-failure fixture", () => {
    const bundle = loadBundle("test-payment-resilience.json");
    expect(bundle.scenarios.map((scenario) => scenario.name)).toEqual([
      "Healthy baseline",
      "Assertion failure continues",
      "Provisioning failure diagnostics",
    ]);
  });
});
