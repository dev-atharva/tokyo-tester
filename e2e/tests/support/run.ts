import { expect, type Page, type TestInfo } from "@playwright/test";

export interface WorkflowRunPayload {
	workflowRunId: string;
	workflowRevisionId?: string;
	projectId: string;
	workflowId: string;
	executionOptions?: { continueOnFailure?: boolean };
	registrySecrets?: Record<
		string,
		{
			url?: string;
			auth_type?: string;
			username?: string;
			password?: string;
			token?: string;
		}
	>;
}

export interface WorkflowRunSnapshot {
	workflowRun: { id: string; status: string };
	scenarioRuns: Array<{ id: string; status: string }>;
	testResults: Array<{ id: string; test_name: string; status: string }>;
	queue?: WorkflowQueueInfo;
}

export interface WorkflowTimeEstimate {
	p50Seconds: number;
	p90Seconds: number;
	sampleSize: number;
}

export interface WorkflowQueueInfo {
	status: string;
	position: number;
	workerConcurrency: number;
	estimatedRun?: WorkflowTimeEstimate;
	estimatedWait?: WorkflowTimeEstimate;
	estimatedTotal?: WorkflowTimeEstimate;
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
	const safePayload = {
		...payload,
		registrySecrets: payload.registrySecrets
			? Object.fromEntries(
					Object.entries(payload.registrySecrets).map(([service, registry]) => [
						service,
						{
							...registry,
							password: registry.password ? "[REDACTED]" : undefined,
							token: registry.token ? "[REDACTED]" : undefined,
						},
					]),
				)
			: undefined,
	};
	await testInfo.attach("workflow-run-payload", {
		body: JSON.stringify(safePayload, null, 2),
		contentType: "application/json",
	});
	await testInfo.attach("workflow-run-snapshot", {
		body: JSON.stringify(latest, null, 2),
		contentType: "application/json",
	});
	return latest;
}

export async function expectRunResultsInUi(page: Page, passedCount: number) {
	await expect(page.getByTestId("workflow-run-cockpit")).toHaveCSS(
		"overflow-y",
		"auto",
	);
	await expect(page.getByTestId("workflow-run-status")).toHaveAttribute(
		"data-status",
		"completed",
		{ timeout: 30_000 },
	);
	const lanes = page.getByTestId("scenario-run-lane");
	const laneCount = await lanes.count();
	let visiblePassedResults = 0;
	for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
		const lane = lanes.nth(laneIndex);
		await expect(lane).toHaveAttribute("data-status", "completed");
		for (const stage of await lane.getByTestId("scenario-stage").all()) {
			await expect(stage).toHaveAttribute("data-state", "complete");
		}

		await lane.click();
		const visibleResults = page.getByTestId("test-result");
		const visibleCount = await visibleResults.count();
		visiblePassedResults += visibleCount;
		for (const result of await visibleResults.all()) {
			await expect(result).toHaveAttribute("data-status", "passed");
		}
		for (const activeState of [
			"queued",
			"provisioning",
			"ready",
			"testing",
			"cleaning",
		]) {
			await expect(
				page.locator(
					`[data-testid="execution-service-node"][data-status="${activeState}"]`,
				),
			).toHaveCount(0);
		}
	}
	expect(visiblePassedResults).toBe(passedCount);
	const activity = page.getByTestId("workflow-run-activity");
	await activity.scrollIntoViewIfNeeded();
	await expect(activity).toBeInViewport();
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
