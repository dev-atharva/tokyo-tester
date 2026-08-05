import { afterEach, describe, expect, test } from "bun:test";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";
import type { AgentIdentity } from "./auth";
import { compactRunDiagnostics, redactSensitive, runBundle } from "./service";

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

  test("keeps v2 execution on the unchanged non-secret runner endpoint", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      return Response.json(
        url.pathname.endsWith("/workflow-runs")
          ? { status: "pending" }
          : { success: true },
        { status: url.pathname.endsWith("/workflow-runs") ? 202 : 200 },
      );
    }) as typeof fetch;
    await runBundle(identity, bundle, "legacy-v2-key");
    expect(paths).toContain("/api/v1/workflow-runs");
    expect(paths).not.toContain("/api/v1/workflow-runs/authorize");
  });

  test("compacts browser diagnostics without logs, definitions, or traces bytes", () => {
    const result = compactRunDiagnostics({
      workflowRun: {
        id: "run-1",
        status: "failed",
        summary: '{"failedJourneys":1}',
        logs: '["huge"]',
      },
      executionDefinition: { nodes: [{ large: "source" }] },
      scenarioRuns: [
        {
          id: "scenario-run-1",
          scenario_id: "journey-1",
          scenario_name: "Login",
          status: "failed",
          result: JSON.stringify({
            schemaVersion: 1,
            kind: "browser-journey",
            outcome: "failed",
            finalLocation: { path: "/login", queryKeys: ["next"] },
            steps: [
              {
                stepId: "fill-password",
                sequence: 1,
                name: "Fill password",
                kind: "action",
                operation: "fill",
                outcome: "failed",
                diagnosticId: "diag-1",
              },
            ],
            diagnostics: [
              {
                diagnosticId: "diag-1",
                code: "visible_timeout",
                summary: "Element was not visible",
              },
            ],
            evidence: {
              screenshot: {
                status: "available",
                artifact: {
                  artifactId: "artifact-1",
                  kind: "screenshot",
                  contentType: "image/png",
                },
              },
              trace: { status: "available", artifact: { bytes: "zip" } },
            },
          }),
        },
      ],
      testResults: [],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("fill-password");
    expect(serialized).toContain("artifact-1");
    expect(serialized).not.toContain("huge");
    expect(serialized).not.toContain("source");
    expect(serialized).not.toContain("zip");
  });
});
