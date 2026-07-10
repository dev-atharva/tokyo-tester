import { afterEach, describe, expect, test } from "bun:test";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";
import type { AgentIdentity } from "./auth";
import { redactSensitive, runBundle } from "./service";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const identity: AgentIdentity = {
  tokenId: "token-1",
  userId: "user-1",
  projectId: "project-1",
  scopes: ["read", "workflow:write", "run"],
};
const bundle: WorkflowBundle = {
  schemaVersion: 2,
  kind: "cots.workflow-bundle",
  workflow: {
    name: "Agent smoke",
    nodes: [
      {
        id: "api",
        position: { x: 0, y: 0 },
        data: { label: "api", service: { type: "generic", image: "api:test" } },
        type: "serviceNode",
      },
    ],
    edges: [],
  },
  scenarios: [
    {
      name: "Smoke",
      tests: [
        {
          id: "wait",
          name: "wait",
          type: "delay",
          targetServices: ["api"],
          delayConfig: { durationMs: 1 },
        },
      ],
      testOrder: ["wait"],
    },
  ],
};

describe("agent service", () => {
  test("derives stable workflow and run ids from the idempotency key", async () => {
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return Response.json(
        body.workflowRunId ? { status: "pending" } : { success: true },
        { status: body.workflowRunId ? 202 : 200 },
      );
    }) as typeof fetch;
    const first = await runBundle(identity, bundle, "same-request");
    const second = await runBundle(identity, bundle, "same-request");
    expect(first.workflowId).toBe(second.workflowId);
    expect(first.workflowRunId).toBe(second.workflowRunId);
  });

  test("redacts nested credentials from diagnostics", () => {
    expect(
      redactSensitive({
        password: "p",
        nested: { registryToken: "t", ok: "visible" },
      }),
    ).toEqual({
      password: "[REDACTED]",
      nested: { registryToken: "[REDACTED]", ok: "visible" },
    });
  });
});
