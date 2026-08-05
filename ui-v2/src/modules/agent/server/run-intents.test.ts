import { afterEach, describe, expect, test } from "bun:test";
import type { DatabaseConnection } from "@/db";
import { mysqlRunIntents } from "@/db/schema/mysql";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";
import {
  bundleRunIntentDetails,
  claimRunIntent,
  createRunIntent,
  existingRunIntentDetails,
  publicRunIntent,
  RUN_INTENT_TTL_MS,
  runIntentHandoffURL,
} from "./run-intents";

const originalAuthURL = process.env.AUTH_URL;
const originalDatabase = globalThis.__tokyoTesterDb;
afterEach(() => {
  if (originalAuthURL === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = originalAuthURL;
  globalThis.__tokyoTesterDb = originalDatabase;
});

function installMemoryIntentDatabase() {
  let row: Record<string, unknown> | undefined;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (row ? [{ ...row }] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        ignore: async () => {
          if (!row) row = { ...values };
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (!row) return;
          if (
            values.state === "submitting" &&
            (row.state !== "awaiting-human" ||
              new Date(String(row.expiresAt)).getTime() <= Date.now())
          ) {
            return;
          }
          row = { ...row, ...values };
        },
      }),
    }),
  };
  globalThis.__tokyoTesterDb = {
    type: "mysql",
    db,
    client: {},
    tables: { runIntents: mysqlRunIntents },
  } as DatabaseConnection;
}

describe("agent run intents", () => {
  test("derives a sorted distinct secret-free selection from exact bundle scenarios", () => {
    const bundle = {
      schemaVersion: 3,
      kind: "cots.workflow-bundle",
      workflow: { name: "Shop", nodes: [], edges: [] },
      scenarios: [
        {
          name: "Login",
          executionModel: "journey",
          tests: [],
          testOrder: [],
          steps: [
            {
              id: "fill-password",
              name: "Fill password",
              kind: "action",
              action: {
                operation: "fill",
                locator: { strategy: "label", value: "Password" },
                value: { source: "run-secret", secretRef: "PASSWORD" },
              },
            },
            {
              id: "fill-user",
              name: "Fill user",
              kind: "action",
              action: {
                operation: "fill",
                locator: { strategy: "label", value: "User" },
                value: { source: "run-secret", secretRef: "ACCOUNT" },
              },
            },
          ],
          stepOrder: ["fill-password", "fill-user"],
        },
        {
          name: "Smoke",
          executionModel: "legacy-tests",
          tests: [],
          testOrder: [],
        },
      ],
    } satisfies WorkflowBundle;
    const details = bundleRunIntentDetails(bundle, "workflow-1", ["Login"]);
    expect(details.requiredSecretRefs).toEqual(["ACCOUNT", "PASSWORD"]);
    expect(details.selectionSummary.scenarioNames).toEqual(["Login"]);
    expect(JSON.stringify(details)).not.toContain('"value"');
  });

  test("derives refs from persisted exact scenario selection", () => {
    const details = existingRunIntentDetails(
      { id: "workflow-1", name: "Shop" },
      [
        {
          id: "scenario-1",
          project_id: "project-1",
          workflow_id: "workflow-1",
          name: "Login",
          execution_model: "journey",
          tests_config: [],
          test_order: [],
          steps_config: [
            {
              id: "fill",
              name: "Fill",
              kind: "action",
              action: {
                operation: "fill",
                locator: { strategy: "label", value: "Password" },
                value: { source: "run-secret", secretRef: "PASSWORD" },
              },
            },
          ],
          step_order: ["fill"],
          version: 7,
          created_at: "2026-08-03T00:00:00Z",
          updated_at: "2026-08-03T00:00:00Z",
          user_id: "user-1",
          client_id: "client-1",
          is_deleted: false,
        },
      ],
    );
    expect(details.requiredSecretRefs).toEqual(["PASSWORD"]);
    expect(details.selectionSummary.scenarioIds).toEqual(["scenario-1"]);
  });

  test("uses a public dedicated handoff URL and a fixed 15-minute TTL", () => {
    process.env.AUTH_URL = "https://tokyo.example/base";
    expect(runIntentHandoffURL("intent/unsafe")).toBe(
      "https://tokyo.example/run-intents/intent%2Funsafe",
    );
    expect(RUN_INTENT_TTL_MS).toBe(15 * 60_000);
  });

  test("reuses one idempotent intent and allows only one atomic claimant", async () => {
    installMemoryIntentDatabase();
    const identity = {
      tokenId: "principal-1",
      userId: "user-1",
      projectId: "project-1",
      scopes: ["read", "workflow:write", "run"] as const,
    };
    const input = {
      identity: { ...identity, scopes: [...identity.scopes] },
      workflowId: "workflow-1",
      idempotencyKey: "stable-intent-key",
      payload: {
        operation: "existing" as const,
        workflowId: "workflow-1",
        expectedWorkflowVersion: 1,
        expectedScenarioVersions: { "scenario-1": 2 },
      },
      requiredSecretRefs: ["PASSWORD"],
      selectionSummary: {
        operation: "existing" as const,
        workflowId: "workflow-1",
        workflowName: "Shop",
        scenarioIds: ["scenario-1"],
        scenarioNames: ["Login"],
      },
      now: new Date(),
    };
    const first = await createRunIntent(input);
    const retry = await createRunIntent(input);
    expect(retry.id).toBe(first.id);
    expect(first.expiresAt.getTime() - first.createdAt.getTime()).toBe(
      RUN_INTENT_TTL_MS,
    );
    expect(publicRunIntent(first).selection.projectId).toBe("project-1");

    const claims = await Promise.all([
      claimRunIntent("user-1", first.id),
      claimRunIntent("user-1", first.id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
});
