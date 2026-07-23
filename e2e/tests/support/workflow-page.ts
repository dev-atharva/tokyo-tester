import { expect, type Page } from "@playwright/test";

export class GuidedWorkflowPage {
  constructor(readonly page: Page) {}

  async createWorkflow(name: string) {
    await this.page.goto("/workflow");
    await this.page
      .getByRole("button", { name: "Create Workflow", exact: true })
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

  async addHttpScenario(name: string, path: string, expectedStatus: number) {
    await this.openStage("Scenarios");
    await this.page.getByRole("button", { name: "New Scenario" }).click();
    await this.page.getByLabel("Scenario Name").fill(name);
    await this.page.getByRole("button", { name: "Add test" }).click();
    await this.page.getByLabel("Path").fill(path);
    await this.page.getByLabel("Port").fill("8080");
    await this.page.getByLabel("Expected Status").fill(String(expectedStatus));
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
