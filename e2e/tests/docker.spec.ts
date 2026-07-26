import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  captureWorkflowRun,
  expectPersistedExecution,
  expectRunResultsInUi,
  waitForTerminalRun,
} from "./support/run";
import { expectDockerRunCleaned } from "./support/system";
import { GuidedWorkflowPage } from "./support/workflow-page";

test("guided application and Redis workflow executes, persists, and cleans up through Docker", async ({ page }, testInfo) => {
  const workflowName = `E2E Docker Journey ${testInfo.repeatEachIndex + 1}`;
  const workflow = new GuidedWorkflowPage(page);

  await workflow.createWorkflow(workflowName);
  await workflow.addApplicationService("tokyo-test-api:latest", "Test API");
  await workflow.addRedisService();
  await workflow.addRedisRoundTripScenario("Redis round trip journey");
  await workflow.addHttpScenario("Application health journey", "/health", 200, {
    status: "healthy",
    role: "fault-lab",
  });
  await workflow.sync();
  await workflow.openRunDialog();

  const payload = await captureWorkflowRun(page, () => workflow.submitRun());

  const snapshot = await waitForTerminalRun(page, payload, testInfo);
  expect(snapshot.workflowRun.status).toBe("completed");
  expect(snapshot.testResults).toHaveLength(3);
  expect(snapshot.testResults.map((result) => result.status)).toEqual([
    "passed",
    "passed",
    "passed",
  ]);
  await expectRunResultsInUi(page, 3);
  await expectPersistedExecution(page, workflowName);
  await expectDockerRunCleaned(payload.workflowRunId);
});

test("authenticated custom registry image with nested repository path executes and cleans up", async ({ page }, testInfo) => {
  const workflowName = `E2E Private Registry ${testInfo.repeatEachIndex + 1}`;
  const workflow = new GuidedWorkflowPage(page);

  await workflow.createWorkflow(workflowName);
  await workflow.addApplicationService("team/platform/api:e2e", "Private API");
  await workflow.configureCustomRegistry(
    "Private API",
    "127.0.0.1:5100",
    "e2e-runner",
    "tokyo-e2e-registry-password",
    "127.0.0.1:5100/team/platform/api:e2e",
  );
  await workflow.addHttpScenario("Private application health", "/health", 200, {
    status: "healthy",
    role: "fault-lab",
  });
  await workflow.sync();
  await workflow.openRunDialog();

  const payload = await captureWorkflowRun(page, () => workflow.submitRun());
  expect(payload.registrySecrets?.private_api).toMatchObject({
    url: "127.0.0.1:5100",
    auth_type: "basic",
    username: "e2e-runner",
  });
  expect(payload.registrySecrets?.private_api?.password).toBe(
    "tokyo-e2e-registry-password",
  );

  const snapshot = await waitForTerminalRun(page, payload, testInfo);
  expect(snapshot.workflowRun.status).toBe("completed");
  expect(snapshot.testResults.map((result) => result.status)).toEqual(["passed"]);
  await expectRunResultsInUi(page, 1);
  await expectDockerRunCleaned(payload.workflowRunId);
});

test("agent setup verifies MCP, skill download, origin protection, and revocation", async ({
  page,
  request,
}) => {
  await page.goto("/docs");
  const createToken = page.getByRole("button", {
    name: "Create token",
    exact: true,
  });
  await expect(createToken).toBeEnabled();
  await createToken.click();

  const tokenDisplay = page.getByText(/^tt_pat_[A-Za-z0-9_-]+$/).first();
  await expect(tokenDisplay).toBeVisible();
  const token = (await tokenDisplay.textContent())?.trim();
  expect(token).toMatch(/^tt_pat_[A-Za-z0-9_-]+$/);

  const skill = await page.request.get(
    "/downloads/tokyo-tester-skill.tar.gz",
  );
  expect(skill.ok()).toBeTruthy();
  expect((await skill.body()).byteLength).toBeGreaterThan(500);

  await page.getByRole("button", { name: "Test connection safely" }).click();
  await expect(page.getByText("MCP connection verified")).toBeVisible();

  const mcpRequest = {
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "tokyo_list_projects", arguments: {} },
    },
    headers: {
      Authorization: `Bearer ${token}`,
      "MCP-Protocol-Version": "2025-11-25",
    },
  };
  const forbiddenOrigin = await request.post("http://127.0.0.1:3190/mcp", {
    ...mcpRequest,
    headers: { ...mcpRequest.headers, Origin: "https://attacker.example" },
  });
  expect(forbiddenOrigin.status()).toBe(403);

  const bundle = {
    schemaVersion: 2,
    kind: "cots.workflow-bundle",
    workflow: {
      name: `MCP receipt ${randomUUID()}`,
      nodes: [
        {
          id: "test-api",
          data: {
            label: "Test API",
            service: { type: "generic", image: "tokyo-test-api:latest" },
          },
        },
      ],
      edges: [],
    },
    scenarios: [
      {
        name: "Health check",
        tests: [
          {
            id: "health",
            name: "API is healthy",
            type: "http",
            targetServices: ["test_api"],
            httpConfig: {
              method: "GET",
              path: "/health",
              port: "3000",
              expectedStatus: 200,
            },
          },
        ],
        testOrder: ["health"],
      },
    ],
  };
  const callMcp = async (id: number, name: string, arguments_: object) => {
    const response = await request.post("http://127.0.0.1:3190/mcp", {
      data: {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: arguments_ },
      },
      headers: mcpRequest.headers,
    });
    expect(response.status()).toBe(200);
    return (await response.json()) as {
      result: {
        isError: boolean;
        structuredContent: Record<string, unknown>;
      };
    };
  };
  const validated = await callMcp(2, "tokyo_validate_workflow", { bundle });
  expect(validated.result.isError).toBe(false);
  expect(validated.result.structuredContent.valid).toBe(true);
  const normalizedBundle = validated.result.structuredContent.bundle;
  const validationReceipt = validated.result.structuredContent.validationReceipt;
  expect(typeof validationReceipt).toBe("string");

  const rejectedMutation = await callMcp(3, "tokyo_import_workflow", {
    bundle: { ...(normalizedBundle as object), kind: "tampered.bundle" },
    validationReceipt,
    idempotencyKey: `tampered-${randomUUID()}`,
  });
  expect(rejectedMutation.result.isError).toBe(true);
  expect(String(rejectedMutation.result.structuredContent.error)).toContain(
    "does not match",
  );

  const imported = await callMcp(4, "tokyo_import_workflow", {
    bundle: normalizedBundle,
    validationReceipt,
    idempotencyKey: `validated-${randomUUID()}`,
  });
  expect(imported.result.isError).toBe(false);
  expect(imported.result.structuredContent.workflowId).toBeTruthy();

  await page.getByRole("button", { name: "Revoke Coding agent" }).click();
  await expect(page.getByText("No active tokens for this workspace.")).toBeVisible();
  const revoked = await request.post("http://127.0.0.1:3190/mcp", mcpRequest);
  expect(revoked.status()).toBe(401);
  expect(revoked.headers()["www-authenticate"]).toContain("Bearer");
});
