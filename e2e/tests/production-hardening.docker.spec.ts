import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  cancelRunnerWorkflow,
  cancelRunsBestEffort,
  cloneWorkflowRun,
  makeDelayWorkflowRun,
  runnerBaseURL,
  submitRunnerWorkflow,
  waitForRunnerStatus,
  type HardeningWorkflowRun,
  type WorkflowSubmission,
} from "./support/hardening";
import {
  captureWorkflowRun,
  waitForTerminalRun,
} from "./support/run";
import {
  expectDockerRunCleaned,
  inspectWorkflowContainerLimits,
  openWorkflowEventStream,
  restartDockerRunner,
} from "./support/system";
import { GuidedWorkflowPage } from "./support/workflow-page";

test.describe.serial("production hardening", () => {
  test("durable admission limits and persistent request-rate limits reject overload with retry guidance", async ({
    request,
  }) => {
    const projectId = `admission-project-${randomUUID()}`;
    const source = makeDelayWorkflowRun({
      durationMs: 30_000,
      projectId,
      userId: `blocker-${randomUUID()}`,
    });
    const tracked: HardeningWorkflowRun[] = [source];

    try {
      const blocker = await submitRunnerWorkflow(request, source);
      expect(blocker.response.status()).toBe(202);
      await waitForRunnerStatus(request, source, /^running$/);

      const firstUser = `queued-user-${randomUUID()}`;
      const queuedOne = cloneWorkflowRun(source, { userId: firstUser });
      const queuedTwo = cloneWorkflowRun(source, { userId: firstUser });
      tracked.push(queuedOne, queuedTwo);
      expect((await submitRunnerWorkflow(request, queuedOne)).response.status()).toBe(202);
      expect((await submitRunnerWorkflow(request, queuedTwo)).response.status()).toBe(202);

      const userOverflow = cloneWorkflowRun(source, { userId: firstUser });
      const rejectedUser = await submitRunnerWorkflow(request, userOverflow);
      expect(rejectedUser.response.status()).toBe(429);
      expect(rejectedUser.response.headers()["retry-after"]).toMatch(/^\d+$/);
      expect(rejectedUser.body).toMatchObject({
        code: "queue_limit",
        scope: "user",
        limit: 2,
      });

      const thirdQueued = cloneWorkflowRun(source, {
        userId: `second-queued-user-${randomUUID()}`,
      });
      tracked.push(thirdQueued);
      expect((await submitRunnerWorkflow(request, thirdQueued)).response.status()).toBe(202);

      const serverOverflow = cloneWorkflowRun(source, {
        userId: `third-queued-user-${randomUUID()}`,
      });
      const rejectedServer = await submitRunnerWorkflow(request, serverOverflow);
      expect(rejectedServer.response.status()).toBe(503);
      expect(rejectedServer.response.headers()["retry-after"]).toBe("60");
      expect(rejectedServer.body).toMatchObject({
        code: "queue_limit",
        scope: "server",
        limit: 3,
      });

      for (const queued of [queuedOne, queuedTwo, thirdQueued]) {
        const cancelled = await cancelRunnerWorkflow(request, queued);
        expect(cancelled.status()).toBe(202);
        await waitForRunnerStatus(request, queued, /^cancelled$/);
      }
      await cancelRunnerWorkflow(request, source);
      await waitForRunnerStatus(request, source, /^cancelled$/);
      await expectDockerRunCleaned(source.workflowRunId);

      const rateBlocker = cloneWorkflowRun(source, {
        userId: `rate-blocker-${randomUUID()}`,
      });
      tracked.push(rateBlocker);
      expect((await submitRunnerWorkflow(request, rateBlocker)).response.status()).toBe(202);
      await waitForRunnerStatus(request, rateBlocker, /^running$/);

      const rateUser = `rate-user-${randomUUID()}`;
      for (let index = 0; index < 3; index += 1) {
        const accepted = cloneWorkflowRun(source, { userId: rateUser });
        tracked.push(accepted);
        expect((await submitRunnerWorkflow(request, accepted)).response.status()).toBe(202);
        expect((await cancelRunnerWorkflow(request, accepted)).status()).toBe(202);
        await waitForRunnerStatus(request, accepted, /^cancelled$/);
      }

      const rateOverflow = cloneWorkflowRun(source, { userId: rateUser });
      const rejectedRate = await submitRunnerWorkflow(request, rateOverflow);
      expect(rejectedRate.response.status()).toBe(429);
      expect(rejectedRate.response.headers()["retry-after"]).toMatch(/^\d+$/);
      expect(rejectedRate.body).toMatchObject({
        code: "queue_limit",
        scope: "user_rate",
        limit: 3,
      });
    } finally {
      await cancelRunsBestEffort(request, tracked);
    }
  });

  test("historical p50/p90 estimates include queue wait after five completed samples", async ({
    request,
  }) => {
    const projectId = `eta-project-${randomUUID()}`;
    const source = makeDelayWorkflowRun({
      durationMs: 250,
      projectId,
      userId: `eta-user-${randomUUID()}`,
    });
    const tracked: HardeningWorkflowRun[] = [];

    try {
      for (let index = 0; index < 5; index += 1) {
        const sample = cloneWorkflowRun(source, {
          userId: `eta-sample-${index}-${randomUUID()}`,
        });
        tracked.push(sample);
        expect((await submitRunnerWorkflow(request, sample)).response.status()).toBe(202);
        const snapshot = await waitForRunnerStatus(request, sample, /^completed$/);
        expect(snapshot.workflowRun.status).toBe("completed");
        await expectDockerRunCleaned(sample.workflowRunId);
      }

      const blocker = cloneWorkflowRun(source, {
        durationMs: 30_000,
        userId: `eta-blocker-${randomUUID()}`,
      });
      tracked.push(blocker);
      expect((await submitRunnerWorkflow(request, blocker)).response.status()).toBe(202);
      await waitForRunnerStatus(request, blocker, /^running$/);

      const firstQueued = cloneWorkflowRun(source, {
        userId: `eta-queued-one-${randomUUID()}`,
      });
      const secondQueued = cloneWorkflowRun(source, {
        userId: `eta-queued-two-${randomUUID()}`,
      });
      tracked.push(firstQueued, secondQueued);
      const firstSubmission = await submitRunnerWorkflow(request, firstQueued);
      const secondSubmission = await submitRunnerWorkflow(request, secondQueued);
      expect(firstSubmission.response.status()).toBe(202);
      expect(secondSubmission.response.status()).toBe(202);

      const queue = (secondSubmission.body as WorkflowSubmission).queue;
      expect(queue).toMatchObject({
        status: "pending",
        position: 2,
        workerConcurrency: 1,
      });
      expect(queue?.estimatedRun?.sampleSize).toBe(5);
      expect(queue?.estimatedRun?.p50Seconds).toBeGreaterThan(0);
      expect(queue?.estimatedRun?.p90Seconds).toBeGreaterThanOrEqual(
        queue?.estimatedRun?.p50Seconds ?? 0,
      );
      expect(queue?.estimatedWait?.p50Seconds).toBeGreaterThan(0);
      expect(queue?.estimatedTotal?.p50Seconds).toBeGreaterThan(
        queue?.estimatedRun?.p50Seconds ?? 0,
      );
    } finally {
      await cancelRunsBestEffort(request, tracked);
    }
  });

  test("runner restart recovers the lease, resumes SSE from its cursor, and preserves paginated logs", async ({
    request,
  }) => {
    test.slow();
    const payload = makeDelayWorkflowRun({
      durationMs: 8_000,
      userId: `recovery-user-${randomUUID()}`,
    });
    let stream: ReturnType<typeof openWorkflowEventStream> | undefined;

    try {
      expect((await submitRunnerWorkflow(request, payload)).response.status()).toBe(202);
      await waitForRunnerStatus(request, payload, /^running$/);
      const activeStream = openWorkflowEventStream(
        `${runnerBaseURL}/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}/events?projectId=${encodeURIComponent(payload.projectId)}`,
      );
      stream = activeStream;
      await expect
        .poll(() => activeStream.ids.length, { timeout: 20_000 })
        .toBeGreaterThan(0);

      await restartDockerRunner();
      await Promise.race([
        activeStream.closed,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("SSE stream stayed open across runner restart")), 20_000),
        ),
      ]);
      const replayAfter = Math.max(...activeStream.ids);

      const replay = await request.get(
        `${runnerBaseURL}/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}/events?projectId=${encodeURIComponent(payload.projectId)}&after=${replayAfter}`,
        { timeout: 90_000 },
      );
      expect(replay.status()).toBe(200);
      const replayBody = await replay.text();
      const replayedIds = [...replayBody.matchAll(/^id: (\d+)$/gm)].map(
        (match) => Number.parseInt(match[1] ?? "", 10),
      );
      expect(replayedIds.length).toBeGreaterThan(0);
      expect(Math.min(...replayedIds)).toBeGreaterThan(replayAfter);
      expect(replayBody).toContain("event: workflowlog");
      expect(replayBody).toContain("Workflow run complete: 1/1 scenarios passed");
      expect(replayBody).toContain('"status":"completed"');

      const terminal = await waitForRunnerStatus(request, payload, /^completed$/);
      expect(terminal.workflowRun.status).toBe("completed");

      const firstPageResponse = await request.get(
        `${runnerBaseURL}/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}/logs?projectId=${encodeURIComponent(payload.projectId)}&limit=2`,
      );
      expect(firstPageResponse.status()).toBe(200);
      const firstPage = (await firstPageResponse.json()) as {
        events: Array<{ id: number }>;
        hasMore: boolean;
        nextBefore: number;
      };
      expect(firstPage.events).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextBefore).toBe(firstPage.events[1]?.id);

      const secondPageResponse = await request.get(
        `${runnerBaseURL}/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}/logs?projectId=${encodeURIComponent(payload.projectId)}&limit=2&before=${firstPage.nextBefore}`,
      );
      const secondPage = (await secondPageResponse.json()) as {
        events: Array<{ id: number }>;
      };
      expect(secondPage.events.length).toBeGreaterThan(0);
      expect(secondPage.events[0]?.id).toBeLessThan(firstPage.nextBefore);
      expect(
        secondPage.events.some((event) =>
          firstPage.events.some((first) => first.id === event.id),
        ),
      ).toBe(false);
      await expectDockerRunCleaned(payload.workflowRunId);
    } finally {
      stream?.abort();
      await cancelRunsBestEffort(request, [payload]);
    }
  });

  test("the live UI cancels a running workflow and Docker enforces CPU, memory, and PID limits", async ({
    page,
  }, testInfo) => {
    const workflow = new GuidedWorkflowPage(page);
    await workflow.createWorkflow(`E2E Resource Guard ${randomUUID()}`);
    await workflow.addApplicationService("tokyo-test-api:latest", "Test API");
    await workflow.addHttpScenario("Cancelable resource guard", "/health", 200, {
      status: "healthy",
      role: "fault-lab",
    });
    await workflow.sync();
    await workflow.openRunDialog();

    await page.route("**/api/v1/workflow-runs/authorize", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const authorization = route.request().postDataJSON() as {
        request: HardeningWorkflowRun;
        runSecrets: Array<{ secretRef: string; value: string }>;
      };
      const body = authorization.request;
      const scenario = body.scenarios[0];
      if (!scenario) throw new Error("E2E workflow has no scenario to extend.");
      const delayId = `cancel-delay-${randomUUID()}`;
      scenario.tests.push({
        id: delayId,
        name: "Hold resources until cancellation",
        type: "delay",
        targetServices: ["test_api"],
        delayConfig: { durationMs: 30_000 },
      });
      scenario.testOrder.push(delayId);
      await route.continue({
        postData: JSON.stringify({ ...authorization, request: body }),
        headers: {
          ...route.request().headers(),
          "content-type": "application/json",
        },
      });
    });

    const payload = await captureWorkflowRun(page, () => workflow.submitRun());
    await expect(page.getByTestId("workflow-run-cockpit")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("scenario-run-lane").first()).toHaveAttribute(
      "data-status",
      /pending|running/,
      { timeout: 30_000 },
    );

    const limits = await inspectWorkflowContainerLimits(payload.workflowRunId);
    expect(limits).toEqual({
      memory: 384 * 1024 * 1024,
      memorySwap: 384 * 1024 * 1024,
      nanoCpus: 350_000_000,
      pidsLimit: 128,
    });

    await page.getByRole("button", { name: "Cancel run" }).click();
    await expect(page.getByTestId("workflow-run-status")).toHaveAttribute(
      "data-status",
      "cancelled",
      { timeout: 60_000 },
    );
    const snapshot = await waitForTerminalRun(page, payload, testInfo);
    expect(snapshot.workflowRun.status).toBe("cancelled");
    await expectDockerRunCleaned(payload.workflowRunId);
  });
});
