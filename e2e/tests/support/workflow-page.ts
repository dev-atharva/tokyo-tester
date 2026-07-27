import { expect, type Page } from "@playwright/test";

export class GuidedWorkflowPage {
  constructor(readonly page: Page) {}

  async createWorkflow(name: string) {
    await this.page.goto("/workflow");
    await expect(this.page.getByTestId("workflow-list")).toHaveAttribute(
      "data-hydrated",
      "true",
    );
    const emptyState = this.page.getByText("No workflows yet", { exact: true });
    const workflowCard = this.page.getByTestId("workflow-card").first();
    await emptyState.or(workflowCard).waitFor({ state: "visible" });
    await this.page
      .getByRole("button", { name: "New Workflow", exact: true })
      .click();
    await expect(this.page).toHaveURL(/\/workflow\/[^/]+$/);
    await expect(this.page.getByText("Guided", { exact: true })).toBeVisible();

    await this.page.getByRole("button", { name: "Add service" }).click();
    await this.page.getByRole("button", { name: "Edit", exact: true }).click();
    await this.page.getByPlaceholder("Enter the workflow name").fill(name);
    await this.page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(this.page.getByPlaceholder("Enter the workflow name")).toHaveValue(name);
  }

  async addRedisService() {
    await this.ensureServiceDrawer();
    await this.page.getByRole("button", { name: /^Redis/ }).click();
    await this.page.keyboard.press("Escape");
    await expect(this.page.getByText("Redis", { exact: true }).first()).toBeVisible();
  }

  async addApplicationService(image: string, label: string) {
    await this.ensureServiceDrawer();
    await this.page.getByRole("button", { name: /^Application/ }).click();
    await this.page.keyboard.press("Escape");
    await this.page.getByTitle("Edit Application").click();
    const labelInput = this.page.getByLabel("Label");
    if ((await labelInput.inputValue()) !== label) {
      await labelInput.fill(label);
    }
    await this.page.getByLabel("Docker Image").fill(image);
    await this.page
      .getByRole("button", { name: "Advanced runtime settings" })
      .click();
    const environmentVariables = this.page
      .getByRole("heading", { name: "Environment Variables" })
      .locator("..", { has: this.page.getByRole("button", { name: "Add" }) });
    await environmentVariables.getByRole("button", { name: "Add" }).click();
    await this.page.getByLabel("Environment variable 1 key").fill("APP_ROLE");
    await this.page
      .getByLabel("Environment variable 1 value")
      .fill("fault-lab");
    await this.page.getByRole("button", { name: "Save changes" }).click();
    await expect(this.page.getByText(label, { exact: true })).toBeVisible();
  }

  async configureCustomRegistry(
    serviceLabel: string,
    registryHost: string,
    username: string,
    password: string,
    expectedResolvedImage: string,
  ) {
    await this.page.getByTitle(`Edit ${serviceLabel}`).click();
    await this.page.getByRole("tab", { name: "Registry", exact: true }).click();
    await this.page.getByRole("checkbox").check();
    await this.page.getByLabel("Registry host").fill(registryHost);
    await this.page.getByLabel("Username").fill(username);
    await this.page.getByLabel("Password or pull token").fill(password);
    await expect(this.page.getByText(expectedResolvedImage, { exact: true })).toBeVisible();
    await this.page.getByRole("button", { name: "Save changes" }).click();
  }

  async addRedisRoundTripScenario(name: string) {
    await this.openStage("Scenarios");
    await this.page.getByRole("button", { name: "New Scenario" }).click();
    await this.page.getByLabel("Scenario Name").fill(name);
    await this.page
      .getByRole("button", { name: "Redis round trip", exact: true })
      .click();
    await expect(this.page.getByText("Store a run-scoped Redis value")).toBeVisible();
    await expect(this.page.getByText("Read the Redis value")).toBeVisible();
  }

  async addHttpScenario(
    name: string,
    path: string,
    expectedStatus: number,
    expectedBody?: Record<string, unknown>,
  ) {
    await this.openStage("Scenarios");
    await this.page.getByRole("button", { name: "New Scenario" }).click();
    await this.page.getByLabel("Scenario Name").fill(name);
    await this.page.getByRole("button", { name: "Add test" }).click();
    const pathInput = this.page.getByLabel("Path");
    await pathInput.fill("");
    await expect(pathInput).toHaveValue("");
    await pathInput.fill(path);
    const portInput = this.page.getByLabel("Port");
    await portInput.fill("");
    await expect(portInput).toHaveValue("");
    await portInput.fill("8080");
    const expectedStatusInput = this.page.getByLabel("Expected Status");
    await expectedStatusInput.fill("");
    await expect(expectedStatusInput).toHaveValue("");
    await expectedStatusInput.fill(String(expectedStatus));
    if (expectedBody) {
      await this.page.getByLabel("Expected Body Mode").click();
      await this.page
        .getByRole("option", { name: "JSON partial", exact: true })
        .click();
      const expectedBodyEditor = this.page.getByLabel("Expected Body JSON");
      await expectedBodyEditor.fill("{");
      await expect(expectedBodyEditor).toHaveValue("{");
      await expect(
        this.page.getByText("Enter valid JSON to save this field."),
      ).toBeVisible();
      await expectedBodyEditor.fill(JSON.stringify(expectedBody, null, 2));
      await expect(
        this.page.getByText("Enter valid JSON to save this field."),
      ).toBeHidden();
    }
  }

  async sync() {
    await this.page.getByRole("button", { name: "Sync Now" }).click();
    const status = this.page.getByTestId("sync-status");
    await expect
      .poll(async () => ({
        status: await status.getAttribute("data-status"),
        queue: await status.getAttribute("data-queue-size"),
      }))
      .toEqual({ status: "healthy", queue: "0" });
  }

  async openRunDialog() {
    await this.page.getByTestId("guided-run-workflow").click();
    await expect(
      this.page.getByRole("heading", { name: "Review and run in Docker" }),
    ).toBeVisible();
  }

  async submitRun() {
    await this.page.getByTestId("submit-workflow-run").click();
  }

  async openStage(name: "Services" | "Connections" | "Scenarios" | "Review") {
    await this.page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
  }

  private async ensureServiceDrawer() {
    const workflowSetup = this.page.getByRole("heading", { name: "Workflow Setup" });
    if (!(await workflowSetup.isVisible().catch(() => false))) {
      await this.openStage("Services");
      await this.page.getByRole("button", { name: "Add service" }).click();
    }
    await expect(workflowSetup).toBeVisible();
  }
}
