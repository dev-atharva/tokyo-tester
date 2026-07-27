import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { authFile, target } from "../playwright.config";

setup("create isolated administrator session", async ({ page }) => {
  const suffix = randomUUID();
  const email = `e2e-${target}-${suffix}@example.test`;
  const password = `Tokyo-${randomBytes(16).toString("hex")}`;

  await page.goto("/setup");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Display Name").fill("Tokyo E2E Admin");
  await page.getByLabel("Admin Email").fill(email);
  await page.getByLabel("Initial Password").fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByRole("button", { name: "Create Admin Account" }).click();

  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/workflow$/);

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
