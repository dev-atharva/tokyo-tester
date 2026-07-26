import { execFile } from "node:child_process";
import http from "node:http";
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

export interface WorkflowContainerLimits {
  memory: number;
  memorySwap: number;
  nanoCpus: number;
  pidsLimit: number;
}

export async function inspectWorkflowContainerLimits(
  workflowRunId: string,
): Promise<WorkflowContainerLimits> {
  let containerId = "";
  await expect
    .poll(async () => {
      containerId = await output("docker", [
        "ps",
        "-q",
        "--filter",
        `label=cots.workflow_run_id=${workflowRunId}`,
      ]);
      return containerId;
    }, { timeout: 60_000 })
    .not.toBe("");

  const raw = await output("docker", [
    "inspect",
    "--format",
    "{{json .HostConfig}}",
    containerId.split("\n")[0] ?? "",
  ]);
  const hostConfig = JSON.parse(raw) as {
    Memory: number;
    MemorySwap: number;
    NanoCpus: number;
    PidsLimit: number;
  };
  return {
    memory: hostConfig.Memory,
    memorySwap: hostConfig.MemorySwap,
    nanoCpus: hostConfig.NanoCpus,
    pidsLimit: hostConfig.PidsLimit,
  };
}

export async function restartDockerRunner() {
  const containerId = await output("docker", [
    "ps",
    "-q",
    "--filter",
    "label=com.docker.compose.project=tokyo-tester-e2e-docker",
    "--filter",
    "label=com.docker.compose.service=runner",
  ]);
  if (!containerId) throw new Error("Docker E2E runner container was not found.");
  await output("docker", ["restart", containerId.split("\n")[0] ?? ""]);
  await expect
    .poll(async () => {
      try {
        return (await fetch("http://127.0.0.1:3180/health")).status;
      } catch {
        return 0;
      }
    }, { timeout: 60_000, intervals: [500, 1_000, 2_000] })
    .toBe(200);
}

export interface SSECapture {
  ids: number[];
  body: string;
  closed: Promise<void>;
  abort: () => void;
}

export function openWorkflowEventStream(url: string): SSECapture {
  const ids: number[] = [];
  let body = "";
  let pending = "";
  let request: http.ClientRequest | undefined;
  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  request = http.get(url, (response) => {
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      body += chunk;
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^id: (\d+)\r?$/.exec(line);
        if (!match) continue;
        const id = Number.parseInt(match[1] ?? "", 10);
        if (Number.isFinite(id)) ids.push(id);
      }
    });
    response.on("close", resolveClosed);
    response.on("end", resolveClosed);
    response.on("error", resolveClosed);
  });
  request.on("error", resolveClosed);

  return {
    ids,
    get body() {
      return body;
    },
    closed,
    abort: () => request?.destroy(),
  };
}
