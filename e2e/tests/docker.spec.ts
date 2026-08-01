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

test("new users can create and run the MockServer workflow template", async ({
	page,
}, testInfo) => {
	const workflow = new GuidedWorkflowPage(page);
	await page.goto("/workflow");
	await expect(page.getByTestId("workflow-list")).toHaveAttribute(
		"data-hydrated",
		"true",
	);
	await expect(
		page.getByText("No workflows yet", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Browse templates", exact: true }),
	).toBeVisible();

	const favicon = await page.request.get("/favicon.ico");
	expect(favicon.ok()).toBeTruthy();
	expect(favicon.headers()["content-type"]).toContain("image");
	expect((await favicon.body()).byteLength).toBeGreaterThan(500);

	await page
		.getByRole("button", { name: "Browse templates", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Start from a workflow template" }),
	).toBeVisible();
	await expect(page.getByTestId("workflow-template-card")).toHaveCount(3);
	const mockTemplate = page.locator(
		'[data-testid="workflow-template-card"][data-template-id="mock-api-contract"]',
	);
	await expect(
		mockTemplate.getByText("Mock API contract", { exact: true }),
	).toBeVisible();
	await mockTemplate.getByRole("button", { name: "Use template" }).click();

	await expect(page).toHaveURL(/\/workflow\/[^/]+$/);
	await expect(
		page.getByText("Mock API", { exact: true }).first(),
	).toBeVisible();
	const guidedRailSpread = async () => {
		const guidedRails = await page
			.getByTestId("guided-layout-rail")
			.evaluateAll((elements) =>
				elements
					.filter((element) => {
						const rect = element.getBoundingClientRect();
						return rect.width > 0 && rect.height > 0;
					})
					.map((element) => {
						const rect = element.getBoundingClientRect();
						return {
							left: Math.round(rect.left),
							right: Math.round(rect.right),
						};
					}),
			);
		return {
			left:
				Math.max(...guidedRails.map((rail) => rail.left)) -
				Math.min(...guidedRails.map((rail) => rail.left)),
			right:
				Math.max(...guidedRails.map((rail) => rail.right)) -
				Math.min(...guidedRails.map((rail) => rail.right)),
		};
	};
	await expect
		.poll(async () => (await guidedRailSpread()).left)
		.toBeLessThanOrEqual(1);
	await expect
		.poll(async () => (await guidedRailSpread()).right)
		.toBeLessThanOrEqual(16);
	for (const flatSurface of [
		page.getByTestId("guided-header"),
		page.getByTestId("guided-footer"),
	]) {
		await expect(flatSurface).toHaveCSS("box-shadow", "none");
	}
	const activeGuidedStage = page.getByRole("tab", { name: "Services" });
	await expect(activeGuidedStage).toHaveCSS(
		"background-color",
		"rgba(0, 0, 0, 0)",
	);
	const activeStageIndicator = activeGuidedStage.getByTestId(
		"guided-stage-indicator",
	);
	await expect(activeStageIndicator).toHaveCSS("opacity", "1");
	const activeStageAlignment = await activeGuidedStage.evaluate((stage) => {
		const indicator = stage.querySelector<HTMLElement>(
			'[data-testid="guided-stage-indicator"]',
		);
		const stageList = stage.parentElement;
		if (!indicator || !stageList) return Number.POSITIVE_INFINITY;
		const listRect = stageList.getBoundingClientRect();
		const stageRect = stage.getBoundingClientRect();
		const indicatorRect = indicator.getBoundingClientRect();
		return Math.max(
			Math.abs(listRect.top - stageRect.top),
			Math.abs(listRect.bottom - stageRect.bottom),
			Math.abs(stageRect.left - indicatorRect.left),
			Math.abs(stageRect.right - indicatorRect.right),
			Math.abs(stageRect.bottom - indicatorRect.bottom),
		);
	});
	expect(activeStageAlignment).toBeLessThanOrEqual(1);
	await workflow.openStage("Scenarios");
	await expect(
		page.getByText("Mock API returns the configured user", { exact: true }),
	).toBeVisible();
	for (const scenarioSurface of [
		page.getByTestId("guided-scenario-list"),
		page.getByTestId("guided-scenario-details"),
	]) {
		await expect(scenarioSurface).toHaveCSS("border-radius", "0px");
		await expect(scenarioSurface).toHaveCSS("box-shadow", "none");
	}
	await workflow.openStage("Review");
	const reviewCenterDelta = await page
		.getByTestId("guided-review-panel")
		.evaluate((panel) => {
			const rail = panel.closest('[data-testid="guided-layout-rail"]');
			if (!rail) return Number.POSITIVE_INFINITY;
			const panelRect = panel.getBoundingClientRect();
			const railRect = rail.getBoundingClientRect();
			return Math.abs(
				panelRect.left +
					panelRect.width / 2 -
					(railRect.left + railRect.width / 2),
			);
		});
	expect(reviewCenterDelta).toBeLessThanOrEqual(1);

	await workflow.sync();
	await workflow.openRunDialog();
	const payload = await captureWorkflowRun(page, () => workflow.submitRun());
	await expect(page).toHaveURL(
		new RegExp(
			`/workflow/${payload.workflowId}/runs/${payload.workflowRunId}\\?projectId=`,
		),
	);
	await expect(page.getByTestId("workflow-run-cockpit")).toBeVisible();
	await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
	const firstLane = page.getByTestId("scenario-run-lane").first();
	await firstLane.focus();
	await page.keyboard.press("Enter");
	await expect(firstLane).toHaveAttribute("aria-pressed", "true");
	const snapshot = await waitForTerminalRun(page, payload, testInfo);
	expect(snapshot.workflowRun.status).toBe("completed");
	expect(snapshot.testResults.map((result) => result.status)).toEqual([
		"passed",
	]);
	await expectRunResultsInUi(page, 1);

	const durableRunUrl = page.url();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.reload();
	await expect(page).toHaveURL(durableRunUrl);
	await expect(page.getByTestId("workflow-run-cockpit")).toHaveAttribute(
		"data-motion",
		"disabled",
	);
	await expectRunResultsInUi(page, 1);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		)
		.toBe(true);

	await page.getByRole("link", { name: "Back to workflow" }).click();
	await expect(page).toHaveURL(new RegExp(`/workflow/${payload.workflowId}$`));
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole("button", { name: "Expert mode" }).click();
	await page.getByTitle("Execution history").click();
	await page
		.locator(
			`[data-testid="execution-history-run"][data-workflow-run-id="${payload.workflowRunId}"]`,
		)
		.click();
	await page.getByRole("button", { name: "Open run" }).click();
	await expect(page).toHaveURL(durableRunUrl);
	await expectRunResultsInUi(page, 1);
	await expectPersistedExecution(page, "Mock API Contract");
	await expectDockerRunCleaned(payload.workflowRunId);
});

test("submission errors stay in the run dialog and do not create a cockpit route", async ({
	page,
}) => {
	const workflow = new GuidedWorkflowPage(page);
	await workflow.createWorkflow(`Rejected run ${randomUUID()}`);
	await workflow.addApplicationService("tokyo-test-api:latest", "Test API");
	await workflow.addHttpScenario("Health submission", "/health", 200);
	await workflow.sync();
	await workflow.openRunDialog();
	const builderUrl = page.url();

	await page.route("**/api/v1/workflow-runs", async (route) => {
		if (route.request().method() === "POST") {
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ error: "Runner admission unavailable" }),
			});
			return;
		}
		await route.continue();
	});
	await workflow.submitRun();

	await expect(page).toHaveURL(builderUrl);
	await expect(
		page.getByRole("heading", { name: "Review and run in Docker" }),
	).toBeVisible();
	await expect(page.getByText("Runner admission unavailable")).toBeVisible();
	await expect(page.getByTestId("workflow-run-cockpit")).toHaveCount(0);
});

test("a failed service test opens typed diagnostic evidence in guided and expert modes", async ({
	page,
}, testInfo) => {
	const workflow = new GuidedWorkflowPage(page);
	await workflow.createWorkflow(`E2E diagnostic ${randomUUID()}`);
	await workflow.addApplicationService("tokyo-test-api:latest", "Test API");
	await workflow.addHttpScenario("Unexpected health status", "/health", 503);
	await workflow.sync();
	await workflow.openRunDialog();

	const payload = await captureWorkflowRun(page, () => workflow.submitRun());
	const snapshot = await waitForTerminalRun(page, payload, testInfo);
	expect(snapshot.workflowRun.status).toMatch(/failed/);

	await expect(page.getByTestId("workflow-run-status")).toHaveAttribute(
		"data-status",
		/failed/,
		{ timeout: 30_000 },
	);
	await expect(page.getByTestId("test-result")).toHaveAttribute(
		"data-status",
		"failed",
	);
	const diagnostic = page.getByTestId("execution-diagnostic");
	await expect(diagnostic).toHaveAttribute(
		"data-source",
		"service_environment",
	);
	await expect(diagnostic).toContainText("Likely source: Service environment");
	await expect(diagnostic).toContainText("Unexpected health status");
	await expect(
		page.getByRole("log", { name: "Workflow run raw logs" }),
	).toBeVisible();

	const diagnosticCode = await diagnostic.getAttribute("data-diagnostic-code");
	await page.getByRole("button", { name: "Expert mode" }).click();
	await expect(page.getByTestId("execution-diagnostic")).toHaveAttribute(
		"data-diagnostic-code",
		diagnosticCode || "TEST_EXECUTION_ERROR",
	);
	await expect(page.getByTestId("test-result")).toHaveCount(1);
	await expectDockerRunCleaned(payload.workflowRunId);
});

test("guided service removal preserves scenario repairs and persists from a template", async ({
	page,
}) => {
	const workflow = new GuidedWorkflowPage(page);
	await page.goto("/workflow");
	await expect(page.getByTestId("workflow-list")).toHaveAttribute(
		"data-hydrated",
		"true",
	);

	await expect(
		page.getByRole("button", { name: "Templates", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Templates", exact: true }).click();
	const stateTemplate = page.locator(
		'[data-testid="workflow-template-card"][data-template-id="postgres-redis-state"]',
	);
	await stateTemplate.getByRole("button", { name: "Use template" }).click();

	await expect(page).toHaveURL(/\/workflow\/[^/]+$/);
	const redisCard = page.locator(
		'[data-testid="guided-service-card"][data-service-name="Redis"]',
	);
	await expect(redisCard).toBeVisible();
	await redisCard.getByRole("button", { name: "Remove Redis" }).click();

	const removalDialog = page.getByRole("alertdialog");
	await expect(
		removalDialog.getByRole("heading", { name: "Remove Redis?" }),
	).toBeVisible();
	await expect(removalDialog).toContainText("0 attached connections");
	await expect(removalDialog).toContainText("2 scenario steps");
	await expect(removalDialog).toContainText("1 scenario");
	await removalDialog
		.getByRole("button", { name: "Remove service", exact: true })
		.click();

	await expect(redisCard).toHaveCount(0);
	await expect(
		page.getByText('references unknown service "redis"').first(),
	).toBeVisible();
	await workflow.openStage("Scenarios");
	await expect(
		page.getByText("Store a value in Redis", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Read the value from Redis", { exact: true }),
	).toBeVisible();

	await workflow.sync();
	await page.reload();
	await expect(page.getByTestId("guided-workspace")).toBeVisible();
	await expect(redisCard).toHaveCount(0);
	await workflow.openStage("Scenarios");
	await expect(
		page.getByText("Store a value in Redis", { exact: true }),
	).toBeVisible();

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole("tab", { name: "Services" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Review" })).toBeVisible();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.reload();
	await expect(page.getByTestId("guided-workspace")).toHaveCSS(
		"animation-name",
		"none",
	);

	await page.goto("/workflow");
	const savedCard = page.locator(
		'[data-testid="workflow-card"][data-workflow-name="PostgreSQL and Redis State"]',
	);
	await expect(savedCard).toHaveAttribute("data-service-count", "1");
	await expect(savedCard).toHaveAttribute("data-scenario-count", "1");
	await expect(savedCard).toHaveAttribute("data-latest-status", "not-run");
	await expect(page.getByTestId("workflow-summary-workflows")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Templates", exact: true }),
	).toBeVisible();
});

test("guided onboarding explains setup and remembers the selected builder mode", async ({
	page,
}) => {
	const workflow = new GuidedWorkflowPage(page);
	await workflow.createWorkflow(`Guided onboarding ${randomUUID()}`);

	const checklist = page.getByTestId("guided-checklist");
	await expect(checklist).toBeVisible();
	await expect(page.getByTestId("guided-checklist-services")).toHaveAttribute(
		"data-status",
		"pending",
	);
	await expect(
		page.getByTestId("guided-checklist-connections"),
	).toHaveAttribute("data-status", "optional");
	await expect(page.getByTestId("guided-checklist-scenarios")).toHaveAttribute(
		"data-status",
		"pending",
	);

	await workflow.addApplicationService("tokyo-test-api:latest", "Test API");
	const servicesDocumentation = page.getByRole("link", {
		name: "Configure services",
		exact: true,
	});
	await expect(servicesDocumentation).toHaveAttribute("target", "_blank");
	await expect(page.getByTestId("guided-checklist-services")).toHaveAttribute(
		"data-status",
		"complete",
	);
	await expect(
		page.getByTestId("guided-checklist-connections"),
	).toHaveAttribute("data-status", "optional");

	await workflow.addHttpScenario("Health is observable", "/health", 200);
	await expect(page.getByTestId("guided-checklist-scenarios")).toHaveAttribute(
		"data-status",
		"complete",
	);
	await expect(page.getByTestId("guided-checklist-review")).toHaveAttribute(
		"data-status",
		"ready",
	);

	await page.getByRole("button", { name: "Dismiss setup checklist" }).click();
	await expect(checklist).toHaveCount(0);
	await page.getByRole("button", { name: "Help", exact: true }).click();
	await page
		.getByRole("menuitem", { name: "Show setup checklist", exact: true })
		.click();
	await expect(checklist).toBeVisible();

	await page.getByRole("button", { name: "Expert mode" }).click();
	await expect(
		page.getByRole("button", { name: "Expert mode" }),
	).toHaveAttribute("aria-pressed", "true");
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Expert mode" }),
	).toHaveAttribute("aria-pressed", "true");

	await page.goto("/workflow");
	await expect(page.getByTestId("workflow-list")).toHaveAttribute(
		"data-hydrated",
		"true",
	);
	await page.getByRole("button", { name: "New Workflow", exact: true }).click();
	await expect(page).toHaveURL(/\/workflow\/[^/]+$/);
	await expect(
		page.getByRole("button", { name: "Expert mode" }),
	).toHaveAttribute("aria-pressed", "true");

	await page.getByRole("button", { name: "Guided mode" }).click();
	await expect(page.getByTestId("guided-workspace")).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Guided mode" }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByTestId("guided-checklist")).toBeVisible();

	await page.setViewportSize({ width: 390, height: 844 });
	const modeHelp = page.locator('[data-help-topic="builder modes"]');
	await modeHelp.focus();
	await expect(
		page.getByText(/Guided organizes the same workflow into recommended steps/),
	).toBeVisible();
});

test("guided application and Redis workflow executes, persists, and cleans up through Docker", async ({
	page,
}, testInfo) => {
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

test("authenticated custom registry image with nested repository path executes and cleans up", async ({
	page,
}, testInfo) => {
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
	expect(snapshot.testResults.map((result) => result.status)).toEqual([
		"passed",
	]);
	await expectRunResultsInUi(page, 1);
	await expectDockerRunCleaned(payload.workflowRunId);
});

test("agent setup verifies MCP, skill download, origin protection, and revocation", async ({
	page,
	request,
}) => {
	await page.goto("/agent-setup");
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

	const skill = await page.request.get("/downloads/tokyo-tester-skill.tar.gz");
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
	const validationReceipt =
		validated.result.structuredContent.validationReceipt;
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
	await expect(
		page.getByText("No active tokens for this workspace."),
	).toBeVisible();
	const revoked = await request.post("http://127.0.0.1:3190/mcp", mcpRequest);
	expect(revoked.status()).toBe(401);
	expect(revoked.headers()["www-authenticate"]).toContain("Bearer");
});
