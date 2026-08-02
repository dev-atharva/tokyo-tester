import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { GuidedWorkflowPage } from "./support/workflow-page";

type RetryRunState = "retrying" | "recovered" | "exhausted";

const attemptOne = {
	attempt: 1,
	outcome: "failed",
	duration_ms: 18,
	failure_class: "transient_transport",
	failure_code: "TEST_TRANSPORT_CONNECTION_RESET",
	message: "peer connection reset during response read",
	retry_scheduled: true,
};

const retryDiagnostic = {
	code: "TEST_TRANSPORT_CONNECTION_RESET",
	source: "undetermined",
	confidence: "unknown",
	stage: "execution",
	summary: "The connection reset continued after one safe retry.",
	scenarioId: "scenario-retry",
	testId: "test-transient-health",
	testName: "Transient health check",
	serviceNames: ["Test API"],
	evidence: [
		{
			kind: "test_result",
			serviceName: "Test API",
			message: "Attempt 1: peer connection reset during response read",
		},
		{
			kind: "test_result",
			serviceName: "Test API",
			message: "Attempt 2: peer connection reset during response read",
		},
	],
};

function retryEvent(
	workflowRunId: string,
	projectId: string,
	activityStatus: "retrying" | "passed" | "failed",
	sequence: number,
) {
	return {
		workflowRunId,
		projectId,
		workflowId: "workflow-retry",
		scenarioId: "scenario-retry",
		scenarioName: "Transient transport",
		message:
			activityStatus === "retrying"
				? "Retrying transient health check after a typed connection reset"
				: activityStatus === "passed"
					? "Transient health check passed on attempt 2"
					: "Transient health check failed after attempt 2",
		status: activityStatus === "failed" ? "failed" : "running",
		stage: "execution",
		kind: "test",
		activityStatus,
		serviceName: "Test API",
		serviceNames: ["Test API"],
		testId: "test-transient-health",
		testName: "Transient health check",
		attempt: 2,
		maxAttempts: 2,
		retryReason: "TEST_TRANSPORT_CONNECTION_RESET",
		diagnostic: activityStatus === "failed" ? retryDiagnostic : undefined,
		timestamp: Date.now() + sequence,
		sequence,
	};
}

function retrySnapshot(
	state: RetryRunState,
	workflowRunId: string,
	projectId: string,
) {
	const timestamp = new Date().toISOString();
	const workflowStatus =
		state === "retrying"
			? "running"
			: state === "recovered"
				? "completed"
				: "failed";
	const scenarioStatus = workflowStatus;
	const attempts =
		state === "recovered"
			? [attemptOne, { attempt: 2, outcome: "passed", duration_ms: 7 }]
			: [
					attemptOne,
					{
						attempt: 2,
						outcome: "failed",
						duration_ms: 21,
						failure_class: "transient_transport",
						failure_code: "TEST_TRANSPORT_CONNECTION_RESET",
						message: "peer connection reset during response read",
					},
				];
	const resultData = {
		passed: state === "recovered",
		message:
			state === "recovered"
				? "Recovered after one transient connection interruption"
				: "Connection reset persisted after retry",
		duration_ms: attempts.reduce(
			(total, attempt) => total + attempt.duration_ms,
			0,
		),
		attempts,
		recovered_after_retry: state === "recovered",
		...(state === "exhausted" ? { diagnostic: retryDiagnostic } : {}),
	};

	return {
		workflowRun: {
			id: workflowRunId,
			project_id: projectId,
			workflow_id: "workflow-retry",
			status: workflowStatus,
			summary: {
				status: workflowStatus,
				retriedTests: state === "retrying" ? 0 : 1,
				...(state === "exhausted"
					? { diagnostics: [retryDiagnostic] }
					: {}),
			},
			logs: [],
			started_at: timestamp,
			completed_at: state === "retrying" ? null : timestamp,
			metadata: { scenario_run_ids: ["session-retry"] },
			version: 1,
			created_at: timestamp,
			updated_at: timestamp,
			user_id: "e2e-user",
			client_id: "e2e-client",
			is_deleted: false,
		},
		scenarioRuns: [
			{
				id: "session-retry",
				project_id: projectId,
				workflow_run_id: workflowRunId,
				workflow_id: "workflow-retry",
				scenario_id: "scenario-retry",
				scenario_name: "Transient transport",
				status: scenarioStatus,
				result:
					state === "exhausted" ? { diagnostics: [retryDiagnostic] } : {},
				phase: state === "retrying" ? "execution" : "aggregation",
				started_at: timestamp,
				completed_at: state === "retrying" ? null : timestamp,
				version: 1,
				created_at: timestamp,
				updated_at: timestamp,
				user_id: "e2e-user",
				client_id: "e2e-client",
				is_deleted: false,
			},
		],
		testResults:
			state === "retrying"
				? []
				: [
						{
							id: "result-retry",
							project_id: projectId,
							session_id: "session-retry",
							workflow_run_id: workflowRunId,
							workflow_id: "workflow-retry",
							scenario_id: "scenario-retry",
							scenario_name: "Transient transport",
							test_name: "Transient health check",
							test_type: "http",
							status: state === "recovered" ? "passed" : "failed",
							result_data: resultData,
							container_logs: {},
							duration_ms: resultData.duration_ms,
							executed_at: timestamp,
							created_at: timestamp,
							updated_at: timestamp,
							client_id: "e2e-client",
							user_id: "e2e-user",
							is_deleted: false,
						},
					],
		executionDefinition: {
			workflowRevisionId: "revision-retry",
			revisionNumber: 4,
			workflowVersion: 9,
			workflow: {
				id: "workflow-retry",
				name: "Retry evidence workflow",
				description: "A deterministic browser fixture for retry states",
				nodes: [
					{
						id: "service-test-api",
						type: "service",
						position: { x: 0, y: 0 },
						data: {
							label: "Test API",
							service: {
								type: "generic",
								image: "tokyo-test-api:latest",
								ports: [],
								env: [],
							},
						},
					},
				],
				edges: [],
			},
			scenarios: [
				{
					id: "scenario-retry",
					name: "Transient transport",
					description: "A connection reset is retried once",
					tests: [
						{
							id: "test-transient-health",
							name: "Transient health check",
							type: "http",
							targetServices: ["Test API"],
							retryPolicy: { mode: "transient" },
							httpConfig: {
								method: "GET",
								path: "/fault/reset-once",
								port: "8080",
								expectedStatus: 200,
							},
						},
					],
					testOrder: ["test-transient-health"],
				},
			],
		},
	};
}

async function installRetryRunFixture(
	page: Page,
	initialState: RetryRunState,
) {
	const workflowRunId = `run-${randomUUID()}`;
	const projectId = `project-${randomUUID()}`;
	let state = initialState;

	await page.route(
		`**/api/v1/workflow-runs/${workflowRunId}**`,
		async (route) => {
			const url = new URL(route.request().url());
			if (url.pathname.endsWith("/events")) {
				await route.fulfill({
					status: 200,
					headers: {
						"content-type": "text/event-stream",
						"cache-control": "no-cache",
					},
					body: ": browser fixture connected\n\n",
				});
				return;
			}
			if (url.pathname.endsWith("/logs")) {
				const events = [retryEvent(workflowRunId, projectId, "retrying", 1)];
				if (state === "recovered") {
					events.push(retryEvent(workflowRunId, projectId, "passed", 2));
				} else if (state === "exhausted") {
					events.push(retryEvent(workflowRunId, projectId, "failed", 2));
				}
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						events: events
							.map((event, index) => ({
								id: index + 1,
								workflow_run_id: workflowRunId,
								event_type: "workflowlog",
								payload: JSON.stringify(event),
								created_at: new Date().toISOString(),
							}))
							.reverse(),
						hasMore: false,
					}),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(retrySnapshot(state, workflowRunId, projectId)),
			});
		},
	);

	return {
		url: `/workflow/workflow-retry/runs/${workflowRunId}?projectId=${projectId}`,
		setState(next: RetryRunState) {
			state = next;
		},
	};
}

test("Guided and Expert authoring enforce explicit retry acknowledgement", async ({
	page,
}) => {
	const workflow = new GuidedWorkflowPage(page);
	await workflow.createWorkflow(`Retry policy ${randomUUID()}`);
	await workflow.addApplicationService("tokyo-test-api:latest", "Test API");
	await workflow.addHttpScenario("Safe transport retry", "/health", 200);

	await expect(
		page.getByText(
			"Tokyo Tester retries one safe transient connection failure. Assertions and timeouts still fail immediately.",
		),
	).toBeVisible();

	await page.getByRole("button", { name: "Expert mode" }).click();
	await page.getByRole("button", { name: "Open scenarios" }).click();
	await page.getByRole("button", { name: "Configure", exact: true }).click();
	await page
		.getByRole("button", { name: "Check application health", exact: true })
		.click();
	await expect(page.getByText("Reliability", { exact: true })).toBeVisible();
	await expect(page.getByLabel("Retry behavior")).toContainText(
		"Automatic transient retry",
	);

	await page.getByLabel("Method").click();
	await page.getByRole("option", { name: "POST", exact: true }).click();
	const acknowledgement = page.getByRole("checkbox", {
		name: "Retry once; I confirm this operation is idempotent",
	});
	await expect(acknowledgement).toBeVisible();
	await expect(acknowledgement).not.toBeChecked();
	await expect(
		page.getByText(/cannot duplicate writes, messages, or other side effects/),
	).toBeVisible();

	await acknowledgement.check();
	await expect(acknowledgement).toBeChecked();
	await page.getByLabel("Method").click();
	await page.getByRole("option", { name: "PATCH", exact: true }).click();
	await expect(acknowledgement).not.toBeChecked();
	await acknowledgement.check();

	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Guided mode" }).click();
	await workflow.openStage("Review");
	await expect(
		page.getByText(
			"1 state-changing test has an Expert idempotency confirmation and may run twice after a transient transport failure.",
		),
	).toBeVisible();

	await page.getByRole("button", { name: "Expert mode" }).click();
	await page.getByRole("button", { name: "Open scenarios" }).click();
	await page.getByRole("button", { name: "Configure", exact: true }).click();
	await page
		.getByRole("button", { name: "Check application health", exact: true })
		.click();
	await page.getByLabel("Retry behavior").click();
	await page.getByRole("option", { name: "Never retry", exact: true }).click();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Guided mode" }).click();
	await workflow.openStage("Scenarios");
	await page
		.getByRole("button", { name: "Check application health", exact: true })
		.click();
	await expect(
		page.getByText(
			"Automatic retry is disabled. Switch to Expert mode to edit this policy.",
		),
	).toBeVisible();
});

test("the cockpit transitions from retrying to recovered and survives refresh", async ({
	page,
}) => {
	const fixture = await installRetryRunFixture(page, "retrying");
	await page.goto(fixture.url);

	const testResult = page.getByTestId("test-result");
	await expect(testResult).toHaveAttribute("data-status", "running");
	await expect(testResult).toContainText("Attempt 2 of 2");
	await expect(testResult).toContainText("Transient health check");

	fixture.setState("recovered");
	await page.getByRole("button", { name: "Refresh", exact: true }).click();
	await expect(testResult).toHaveAttribute("data-status", "passed");
	await expect(testResult).toContainText("Passed after retry");
	await expect(testResult).toContainText(
		"Recovered from one transient connection interruption.",
	);
	const recoveredBadge = testResult.locator(
		'[aria-live="polite"][aria-atomic="true"]',
	);
	await expect(recoveredBadge).toContainText("Passed after retry");
	await expect(recoveredBadge.locator("svg")).toHaveCount(1);

	await page.reload();
	await expect(page.getByTestId("workflow-run-status")).toHaveAttribute(
		"data-status",
		"completed",
	);
	await expect(page.getByTestId("test-result")).toContainText(
		"Passed after retry",
	);

	await page.getByRole("button", { name: "Expert mode" }).click();
	await expect(page.getByTestId("test-result")).toContainText(
		"#1 TEST_TRANSPORT_CONNECTION_RESET 18ms · #2 passed 7ms",
	);
});

test("the cockpit preserves exhausted attempt evidence and non-color failure cues", async ({
	page,
}) => {
	const fixture = await installRetryRunFixture(page, "exhausted");
	await page.goto(fixture.url);

	const testResult = page.getByTestId("test-result");
	await expect(testResult).toHaveAttribute("data-status", "failed");
	await expect(testResult).toContainText("Failed after 2 attempts");
	await expect(testResult).toContainText(
		"The transient interruption continued after one retry.",
	);
	const failedBadge = testResult.locator(
		'[aria-live="polite"][aria-atomic="true"]',
	);
	await expect(failedBadge).toContainText("Failed after 2 attempts");
	await expect(failedBadge.locator("svg")).toHaveCount(1);

	const diagnostic = page.getByTestId("execution-diagnostic");
	await expect(diagnostic).toHaveAttribute(
		"data-diagnostic-code",
		"TEST_TRANSPORT_CONNECTION_RESET",
	);
	await expect(diagnostic).toHaveAttribute("data-source", "undetermined");
	await expect(diagnostic).toContainText("unknown confidence");
	await expect(diagnostic).toContainText("Attempt 1: peer connection reset");
	await expect(diagnostic).toContainText("Attempt 2: peer connection reset");

	await page.getByRole("button", { name: "Expert mode" }).click();
	await expect(testResult).toContainText(
		"#1 TEST_TRANSPORT_CONNECTION_RESET 18ms · #2 TEST_TRANSPORT_CONNECTION_RESET 21ms",
	);
	await expect(diagnostic).toContainText("TEST_TRANSPORT_CONNECTION_RESET");
});
