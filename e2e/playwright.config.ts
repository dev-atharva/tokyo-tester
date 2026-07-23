import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const target = process.env.E2E_TARGET ?? "docker";
if (target !== "docker") {
  throw new Error(`E2E_TARGET must be docker, received ${target}`);
}

const defaultBaseUrl = "http://127.0.0.1:3100";
const baseURL = process.env.E2E_BASE_URL ?? defaultBaseUrl;
const artifactRoot = path.resolve(
  process.env.E2E_ARTIFACT_DIR ?? path.join("artifacts", target),
);
const authFile = path.resolve(".auth", `${target}.json`);

export default defineConfig({
  testDir: "./tests",
  outputDir: path.join(artifactRoot, "test-results"),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["line"],
    ["html", { outputFolder: path.join(artifactRoot, "html"), open: "never" }],
    ["junit", { outputFile: path.join(artifactRoot, "junit.xml") }],
  ],
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `bun run stack:${target}`,
        url: `${baseURL}/api/health`,
        timeout: 10 * 60_000,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
        gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
      },
  projects: [
    {
      name: `${target}-setup`,
      testMatch: /auth\.setup\.ts/,
      repeatEach: 1,
      use: { ...devices["Desktop Chrome"], storageState: undefined },
    },
    {
      name: `${target}-chromium`,
      testMatch: new RegExp(`${target}\\.spec\\.ts$`),
      dependencies: [`${target}-setup`],
      repeatEach: Number.parseInt(process.env.E2E_REPEAT_EACH ?? "1", 10),
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
  ],
});

export { authFile, target };
