import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorkflowRunInput } from "./react-flow-cots";

describe("WorkflowRunInput contract", () => {
  test("accepts the shared runner fixture", async () => {
    const fixture = JSON.parse(
      await readFile(
        resolve(process.cwd(), "../contracts/workflow-run-input.json"),
        "utf8",
      ),
    ) as WorkflowRunInput;

    expect(fixture.workflowRunId).toBe("run-contract-1");
    expect(fixture.scenarios[0]?.scenarioRunId).toBe("scenario-run-1");
    expect(fixture.registrySecrets?.api_service?.auth_type).toBe("basic");
  });
});
