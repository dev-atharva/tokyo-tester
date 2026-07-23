import { expect, type Page, type TestInfo } from "@playwright/test";

export interface WorkflowRunPayload {
  workflowRunId: string;
  projectId: string;
  workflowId: string;
  executionOptions?: { continueOnFailure?: boolean };
}

export interface WorkflowRunSnapshot {
  workflowRun: { id: string; status: string };
  scenarioRuns: Array<{ id: string; status: string }>;
  testResults: Array<{ id: string; test_name: string; status: string }>;
}

export async function captureWorkflowRun(
  page: Page,
  submit: () => Promise<void>,
): Promise<WorkflowRunPayload> {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/workflow-runs",
  );
  await submit();
  const request = await requestPromise;
  return request.postDataJSON() as WorkflowRunPayload;
}

export async function waitForTerminalRun(
  page: Page,
  payload: WorkflowRunPayload,
  testInfo: TestInfo,
): Promise<WorkflowRunSnapshot> {
  let latest: WorkflowRunSnapshot | undefined;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}?projectId=${encodeURIComponent(payload.projectId)}`,
        );
        if (!response.ok()) return `http-${response.status()}`;
        latest = (await response.json()) as WorkflowRunSnapshot;
        return latest.workflowRun.status;
      },
      { timeout: 8 * 60_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toMatch(/^(completed|failed|partial_failed|cleanup_failed|cancelled)$/);

  if (!latest) throw new Error("Runner reached no observable state.");
  await testInfo.attach("workflow-run-payload", {
    body: JSON.stringify(payload, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("workflow-run-snapshot", {
    body: JSON.stringify(latest, null, 2),
    contentType: "application/json",
  });
  return latest;
}

export async function expectRunResultsInUi(page: Page, passedCount: number) {
  await expect(page.getByTestId("workflow-run-status")).toHaveAttribute(
    "data-status",
    "completed",
    { timeout: 30_000 },
  );
  await expect(page.getByTestId("test-result")).toHaveCount(passedCount);
  for (const result of await page.getByTestId("test-result").all()) {
    await expect(result).toHaveAttribute("data-status", "passed");
  }
}

export async function expectPersistedExecution(
  page: Page,
  workflowName: string,
) {
  await page.goto("/workflow");
  const card = page
    .getByTestId("workflow-card")
    .filter({ has: page.getByText(workflowName, { exact: true }) });
  await expect(card).toContainText("1 execution");
  await page.reload();
  await expect(card).toContainText("1 execution");
}
