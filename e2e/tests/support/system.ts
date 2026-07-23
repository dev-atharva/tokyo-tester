import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect } from "@playwright/test";

const execFileAsync = promisify(execFile);
async function output(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout.trim();
}

export async function expectDockerRunCleaned(workflowRunId: string) {
  await expect
    .poll(async () => {
      const containers = await output("docker", [
        "ps",
        "-aq",
        "--filter",
        `label=cots.workflow_run_id=${workflowRunId}`,
      ]);
      const networks = await output("docker", [
        "network",
        "ls",
        "-q",
        "--filter",
        `label=cots.workflow_run_id=${workflowRunId}`,
      ]);
      return `${containers}${networks}`;
    }, { timeout: 60_000 })
    .toBe("");
}
