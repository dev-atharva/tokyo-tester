import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import type {
  WorkflowQueueInfo,
  WorkflowRunPayload,
  WorkflowRunSnapshot,
} from "./run";

export const runnerBaseURL = "http://127.0.0.1:3180";

interface DelayWorkflowOptions {
  durationMs: number;
  projectId?: string;
  workflowId?: string;
  scenarioId?: string;
  userId?: string;
  workflowName?: string;
}

interface DelayTestDefinition {
  id: string;
  name: string;
  type: "delay";
  targetServices: string[];
  delayConfig: { durationMs: number };
}

export interface HardeningWorkflowRun extends WorkflowRunPayload {
  workflowName: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  scenarios: Array<{
    id: string;
    scenarioRunId: string;
    projectId: string;
    name: string;
    tests: DelayTestDefinition[];
    testOrder: string[];
    user_id: string;
    client_id: string;
  }>;
  userId: string;
  clientId: string;
}

export interface WorkflowSubmission {
  workflowRunId: string;
  status: string;
  created: boolean;
  queue?: WorkflowQueueInfo;
}

export function makeDelayWorkflowRun(
  options: DelayWorkflowOptions,
): HardeningWorkflowRun {
  const projectId = options.projectId ?? `e2e-project-${randomUUID()}`;
  const workflowId = options.workflowId ?? `e2e-workflow-${randomUUID()}`;
  const scenarioId = options.scenarioId ?? `e2e-scenario-${randomUUID()}`;
  const userId = options.userId ?? `e2e-user-${randomUUID()}`;
  const testId = `delay-${randomUUID()}`;
  return {
    workflowRunId: `e2e-run-${randomUUID()}`,
    projectId,
    workflowId,
    workflowName: options.workflowName ?? "Production hardening E2E",
    nodes: [
      {
        id: "test-api",
        data: {
          label: "Test API",
          service: {
            type: "generic",
            image: "tokyo-test-api:latest",
            ports: [{ id: "http", hostPort: "", containerPort: "8080" }],
          },
        },
      },
    ],
    edges: [],
    scenarios: [
      {
        id: scenarioId,
        scenarioRunId: `e2e-scenario-run-${randomUUID()}`,
        projectId,
        name: "Durable delay",
        tests: [
          {
            id: testId,
            name: "Keep the workflow active",
            type: "delay",
            targetServices: ["test_api"],
            delayConfig: { durationMs: options.durationMs },
          },
        ],
        testOrder: [testId],
        user_id: userId,
        client_id: "production-hardening-e2e",
      },
    ],
    userId,
    clientId: "production-hardening-e2e",
    executionOptions: { continueOnFailure: true },
  };
}

export function cloneWorkflowRun(
  source: HardeningWorkflowRun,
  overrides: { durationMs?: number; userId?: string } = {},
): HardeningWorkflowRun {
  const clone = structuredClone(source);
  clone.workflowRunId = `e2e-run-${randomUUID()}`;
  clone.workflowRevisionId = undefined;
  clone.userId = overrides.userId ?? source.userId;
  clone.scenarios = clone.scenarios.map((scenario) => ({
    ...scenario,
    scenarioRunId: `e2e-scenario-run-${randomUUID()}`,
    user_id: clone.userId,
    tests: scenario.tests.map((definition) => ({
      ...definition,
      delayConfig: {
        durationMs: overrides.durationMs ?? definition.delayConfig.durationMs,
      },
    })),
  }));
  return clone;
}

export async function submitRunnerWorkflow(
  request: APIRequestContext,
  payload: HardeningWorkflowRun,
): Promise<{ response: APIResponse; body: WorkflowSubmission | Record<string, unknown> }> {
  const response = await request.post(`${runnerBaseURL}/api/v1/workflow-runs`, {
    data: payload,
  });
  return {
    response,
    body: (await response.json()) as WorkflowSubmission | Record<string, unknown>,
  };
}

export async function cancelRunnerWorkflow(
  request: APIRequestContext,
  payload: Pick<HardeningWorkflowRun, "workflowRunId" | "projectId">,
) {
  return request.delete(
    `${runnerBaseURL}/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}?projectId=${encodeURIComponent(payload.projectId)}`,
  );
}

export async function waitForRunnerStatus(
  request: APIRequestContext,
  payload: Pick<HardeningWorkflowRun, "workflowRunId" | "projectId">,
  expected: RegExp,
  timeout = 90_000,
): Promise<WorkflowRunSnapshot> {
  let latest: WorkflowRunSnapshot | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${runnerBaseURL}/api/v1/workflow-runs/${encodeURIComponent(payload.workflowRunId)}?projectId=${encodeURIComponent(payload.projectId)}`,
        );
        if (!response.ok()) return `http-${response.status()}`;
        latest = (await response.json()) as WorkflowRunSnapshot;
        return latest.workflowRun.status;
      },
      { timeout, intervals: [500, 1_000, 2_000] },
    )
    .toMatch(expected);
  if (!latest) throw new Error("Workflow run produced no observable snapshot.");
  return latest;
}

export async function cancelRunsBestEffort(
  request: APIRequestContext,
  payloads: HardeningWorkflowRun[],
) {
  await Promise.all(
    payloads.map((payload) =>
      cancelRunnerWorkflow(request, payload).catch(() => undefined),
    ),
  );
}
