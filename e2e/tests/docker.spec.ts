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
