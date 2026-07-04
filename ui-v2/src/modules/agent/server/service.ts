import { createHash } from "node:crypto";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";
import type { AgentIdentity } from "./auth";

const RUNNER_BASE_URL = process.env.COTS_API_BASE_URL || "http://runner:8080";

function stableId(prefix: string, ...parts: string[]) {
  const value = createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 32);
  return `${prefix}-${value}`;
}

async function runnerRequest(path: string, init?: RequestInit) {
  return fetch(new URL(path, `${RUNNER_BASE_URL.replace(/\/$/, "")}/`), {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

export async function validateBundle(bundle: unknown) {
  return runnerRequest("/api/v1/workflow-bundles/validate", {
    method: "POST",
    body: JSON.stringify(bundle),
  });
}

export async function getCapabilities() {
  return runnerRequest("/api/v1/workflow-bundles/capabilities");
}

export async function importBundle(
  identity: AgentIdentity,
  bundle: WorkflowBundle,
  idempotencyKey: string,
) {
  const now = new Date().toISOString();
  const clientId = `agent:${identity.tokenId}`;
  const workflowId = stableId("wf", identity.projectId, idempotencyKey);
  const scenarios = bundle.scenarios.map((scenario, index) => ({
    ...scenario,
    id: stableId("scenario", workflowId, String(index)),
  }));
  const changes = [
    {
      entity_type: "workflow",
      entity_id: workflowId,
      change_type: "insert",
      client_time: now,
      client_version: 1,
      data: {
        id: workflowId,
        project_id: identity.projectId,
        name: bundle.workflow.name,
        description: bundle.workflow.description ?? "",
        nodes_config: bundle.workflow.nodes,
        edges_config: bundle.workflow.edges,
        metadata: {
          importedBy: "agent",
          bundleSchemaVersion: bundle.schemaVersion,
        },
        version: 1,
        created_at: now,
        updated_at: now,
        user_id: identity.userId,
        client_id: clientId,
        is_deleted: false,
      },
    },
    ...scenarios.map((scenario) => ({
      entity_type: "scenario",
      entity_id: scenario.id,
      change_type: "insert",
      client_time: now,
      client_version: 1,
      data: {
        id: scenario.id,
        project_id: identity.projectId,
        workflow_id: workflowId,
        name: scenario.name,
        description: scenario.description ?? "",
        tests_config: scenario.tests,
        test_order: scenario.testOrder,
        metadata: { importedBy: "agent" },
        version: 1,
        created_at: now,
        updated_at: now,
        user_id: identity.userId,
        client_id: clientId,
        is_deleted: false,
      },
    })),
  ];
  const response = await runnerRequest("/api/v1/sync/batch", {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      user_id: identity.userId,
      project_id: identity.projectId,
      timestamp: now,
      changes,
    }),
  });
  return { response, workflowId, scenarios, clientId };
}

export async function runBundle(
  identity: AgentIdentity,
  bundle: WorkflowBundle,
  idempotencyKey: string,
) {
  const imported = await importBundle(identity, bundle, idempotencyKey);
  if (!imported.response.ok)
    return {
      response: imported.response,
      workflowId: imported.workflowId,
      workflowRunId: "",
    };
  const workflowRunId = stableId("run", identity.projectId, idempotencyKey);
  const body = {
    workflowRunId,
    projectId: identity.projectId,
    workflowId: imported.workflowId,
    workflowName: bundle.workflow.name,
    nodes: bundle.workflow.nodes,
    edges: bundle.workflow.edges,
    scenarios: imported.scenarios.map((scenario, index) => ({
      id: scenario.id,
      scenarioRunId: stableId("scenario-run", workflowRunId, String(index)),
      projectId: identity.projectId,
      name: scenario.name,
      description: scenario.description ?? "",
      tests: scenario.tests,
      testOrder: scenario.testOrder,
      user_id: identity.userId,
      client_id: imported.clientId,
    })),
    userId: identity.userId,
    clientId: imported.clientId,
    executionOptions: { continueOnFailure: true },
  };
  return {
    response: await runnerRequest("/api/v1/workflow-runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    workflowId: imported.workflowId,
    workflowRunId,
  };
}

export async function getRun(identity: AgentIdentity, workflowRunId: string) {
  const query = new URLSearchParams({ projectId: identity.projectId });
  return runnerRequest(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}?${query}`,
  );
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      /password|token|secret|authorization|cookie/i.test(key)
        ? "[REDACTED]"
        : redactSensitive(child),
    ]),
  );
}
