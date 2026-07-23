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
  await workflow.addHttpScenario("Application health journey", "/health", 200);
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
