import { createHash } from "node:crypto";
import type {
  ScenarioData,
  SyncPullResponse,
  WorkflowData,
} from "@/modules/sync/sync-types";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";
import type { AgentIdentity } from "./auth";

const RUNNER_BASE_URL = process.env.COTS_API_BASE_URL || "http://runner:8080";

export function stableId(prefix: string, ...parts: string[]) {
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
      client_version: 0,
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
      client_version: 0,
      data: {
        id: scenario.id,
        project_id: identity.projectId,
        workflow_id: workflowId,
        name: scenario.name,
        description: scenario.description ?? "",
        execution_model: scenario.executionModel ?? "legacy-tests",
        tests_config: scenario.tests ?? [],
        test_order: scenario.testOrder ?? [],
        environment_config: scenario.environment ?? null,
        steps_config: scenario.steps ?? [],
        step_order: scenario.stepOrder ?? [],
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
  scenarioNames?: string[],
  runSecrets?: Array<{ secretRef: string; value: string }>,
) {
  const imported = await importBundle(identity, bundle, idempotencyKey);
  if (!imported.response.ok)
    return {
      response: imported.response,
      workflowId: imported.workflowId,
      workflowRunId: "",
    };
  const workflowRunId = stableId("run", identity.projectId, idempotencyKey);
  let scenarioIndexes = bundle.scenarios.map((_, index) => index);
  if (scenarioNames !== undefined) {
    if (
      scenarioNames.length === 0 ||
      new Set(scenarioNames).size !== scenarioNames.length
    ) {
      throw new Error(
        "scenarioNames must contain at least one unique scenario name.",
      );
    }
    scenarioIndexes = scenarioNames.map((name) => {
      const matches = bundle.scenarios
        .map((scenario, index) => ({ scenario, index }))
        .filter(({ scenario }) => scenario.name === name);
      if (matches.length === 0)
        throw new Error(`Unknown scenario name: ${name}`);
      if (matches.length > 1)
        throw new Error(`Scenario name is ambiguous: ${name}`);
      return matches[0].index;
    });
  }
  const body = {
    workflowRunId,
    projectId: identity.projectId,
    workflowId: imported.workflowId,
    workflowName: bundle.workflow.name,
    nodes: bundle.workflow.nodes,
    edges: bundle.workflow.edges,
    scenarios: scenarioIndexes.map((index) => {
      const scenario = imported.scenarios[index];
      const common = {
        id: scenario.id,
        scenarioRunId: stableId("scenario-run", workflowRunId, scenario.id),
        projectId: identity.projectId,
        name: scenario.name,
        description: scenario.description ?? "",
        executionModel: scenario.executionModel ?? "legacy-tests",
        user_id: identity.userId,
        client_id: imported.clientId,
      };
      return common.executionModel === "journey"
        ? {
            ...common,
            environment: scenario.environment,
            steps: scenario.steps ?? [],
            stepOrder: scenario.stepOrder ?? [],
          }
        : {
            ...common,
            tests: scenario.tests ?? [],
            testOrder: scenario.testOrder ?? [],
          };
    }),
    userId: identity.userId,
    clientId: imported.clientId,
    executionOptions: { continueOnFailure: true },
  };
  return {
    response: await runnerRequest(
      runSecrets === undefined
        ? "/api/v1/workflow-runs"
        : "/api/v1/workflow-runs/authorize",
      {
        method: "POST",
        body: JSON.stringify(
          runSecrets === undefined ? body : { request: body, runSecrets },
        ),
      },
    ),
    workflowId: imported.workflowId,
    workflowRunId,
  };
}

async function pullWorkspace(
  identity: AgentIdentity,
): Promise<SyncPullResponse> {
  const clientId = encodeURIComponent(`agent-read:${identity.tokenId}`);
  const query = new URLSearchParams({
    userId: identity.userId,
    projectId: identity.projectId,
  });
  const response = await runnerRequest(
    `/api/v1/sync/pull/${clientId}?${query}`,
  );
  if (!response.ok) {
    throw new Error(`Unable to read workflows (${response.status}).`);
  }
  return (await response.json()) as SyncPullResponse;
}

export async function listWorkflows(identity: AgentIdentity) {
  const data = await pullWorkspace(identity);
  const scenarios = (data.scenarios ?? []).filter(
    (scenario) => !scenario.is_deleted,
  );
  return (data.workflows ?? [])
    .filter(
      (workflow) =>
        !workflow.is_deleted && workflow.project_id === identity.projectId,
    )
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description ?? "",
      scenarioCount: scenarios.filter(
        (scenario) => scenario.workflow_id === workflow.id,
      ).length,
      updatedAt: workflow.updated_at,
    }));
}

export async function getExistingWorkflow(
  identity: AgentIdentity,
  workflowId: string,
): Promise<{ workflow: WorkflowData; scenarios: ScenarioData[] } | null> {
  const data = await pullWorkspace(identity);
  const workflow = (data.workflows ?? []).find(
    (item) =>
      item.id === workflowId &&
      item.project_id === identity.projectId &&
      !item.is_deleted,
  );
  if (!workflow) return null;
  const scenarios = (data.scenarios ?? []).filter(
    (scenario) =>
      scenario.workflow_id === workflowId &&
      scenario.project_id === identity.projectId &&
      !scenario.is_deleted,
  );
  return { workflow, scenarios };
}

export async function runExistingWorkflow(
  identity: AgentIdentity,
  workflowId: string,
  idempotencyKey: string,
  scenarioIds?: string[],
  options?: {
    runSecrets?: Array<{ secretRef: string; value: string }>;
    expectedWorkflowVersion?: number;
    expectedScenarioVersions?: Record<string, number>;
  },
) {
  const existing = await getExistingWorkflow(identity, workflowId);
  if (!existing) throw new Error("Workflow not found in this project.");
  if (
    options?.expectedWorkflowVersion !== undefined &&
    existing.workflow.version !== options.expectedWorkflowVersion
  ) {
    throw new Error(
      "The workflow changed after this run intent was created. Create a new run intent.",
    );
  }
  let scenarios = existing.scenarios;
  if (scenarioIds !== undefined) {
    if (
      scenarioIds.length === 0 ||
      new Set(scenarioIds).size !== scenarioIds.length
    ) {
      throw new Error(
        "scenarioIds must contain at least one unique scenario ID.",
      );
    }
    const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
    scenarios = scenarioIds.map((id) => {
      const scenario = byId.get(id);
      if (!scenario)
        throw new Error(
          `Scenario ${id} is stale or belongs to another workflow.`,
        );
      return scenario;
    });
  }
  if (scenarios.length === 0)
    throw new Error("Workflow has no scenarios to run.");
  for (const scenario of scenarios) {
    const expected = options?.expectedScenarioVersions?.[scenario.id];
    if (expected !== undefined && scenario.version !== expected) {
      throw new Error(
        "A selected scenario changed after this run intent was created. Create a new run intent.",
      );
    }
  }

  const workflowRunId = stableId(
    "run",
    identity.projectId,
    workflowId,
    idempotencyKey,
  );
  const clientId = `agent:${identity.tokenId}`;
  const body = {
    workflowRunId,
    projectId: identity.projectId,
    workflowId,
    workflowName: existing.workflow.name,
    nodes: existing.workflow.nodes_config,
    edges: existing.workflow.edges_config,
    scenarios: scenarios.map((scenario) => {
      const executionModel = scenario.execution_model ?? "legacy-tests";
      const common = {
        id: scenario.id,
        scenarioRunId: stableId("scenario-run", workflowRunId, scenario.id),
        projectId: identity.projectId,
        name: scenario.name,
        description: scenario.description ?? "",
        executionModel,
        user_id: identity.userId,
        client_id: clientId,
      };
      return executionModel === "journey"
        ? {
            ...common,
            environment: scenario.environment_config,
            steps: scenario.steps_config ?? [],
            stepOrder: scenario.step_order ?? [],
          }
        : {
            ...common,
            tests: scenario.tests_config,
            testOrder: scenario.test_order,
          };
    }),
    userId: identity.userId,
    clientId,
    executionOptions: { continueOnFailure: true },
  };
  const response = await runnerRequest(
    options?.runSecrets === undefined
      ? "/api/v1/workflow-runs"
      : "/api/v1/workflow-runs/authorize",
    {
      method: "POST",
      body: JSON.stringify(
        options?.runSecrets === undefined
          ? body
          : { request: body, runSecrets: options.runSecrets },
      ),
    },
  );
  return {
    response,
    workflowRunId,
    scenarioIds: scenarios.map((scenario) => scenario.id),
  };
}

export async function selectExistingWorkflowScenarios(
  identity: AgentIdentity,
  workflowId: string,
  scenarioIds?: string[],
) {
  const existing = await getExistingWorkflow(identity, workflowId);
  if (!existing) throw new Error("Workflow not found in this project.");
  let scenarios = existing.scenarios;
  if (scenarioIds !== undefined) {
    if (
      scenarioIds.length === 0 ||
      new Set(scenarioIds).size !== scenarioIds.length
    ) {
      throw new Error(
        "scenarioIds must contain at least one unique scenario ID.",
      );
    }
    const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
    scenarios = scenarioIds.map((id) => {
      const scenario = byId.get(id);
      if (!scenario) {
        throw new Error(
          `Scenario ${id} is stale or belongs to another workflow.`,
        );
      }
      return scenario;
    });
  }
  if (scenarios.length === 0)
    throw new Error("Workflow has no scenarios to run.");
  return { ...existing, scenarios };
}

export async function getRun(identity: AgentIdentity, workflowRunId: string) {
  const query = new URLSearchParams({ projectId: identity.projectId });
  return runnerRequest(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}?${query}`,
  );
}

export async function getRunArtifact(
  identity: AgentIdentity,
  workflowRunId: string,
  artifactId: string,
) {
  const query = new URLSearchParams({ projectId: identity.projectId });
  return runnerRequest(
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}/artifacts/${encodeURIComponent(artifactId)}?${query}`,
  );
}

function parseJSONValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function compactDiagnostic(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return {
    diagnosticId: item.diagnosticId,
    code: item.code,
    source: item.source,
    confidence: item.confidence,
    stage: item.stage,
    summary: item.summary,
    scenarioId: item.scenarioId,
    stepId: item.stepId,
    stepName: item.stepName,
    testId: item.testId,
    testName: item.testName,
    serviceNames: item.serviceNames,
    evidence: Array.isArray(item.evidence)
      ? item.evidence.slice(0, 4).map((entry) => {
          const evidence = entry as Record<string, unknown>;
          return {
            kind: evidence.kind,
            serviceName: evidence.serviceName,
            message: evidence.message,
          };
        })
      : undefined,
  };
}

function compactJourneyResult(value: unknown) {
  const parsed = parseJSONValue(value);
  if (!parsed || typeof parsed !== "object") return undefined;
  const item = parsed as Record<string, unknown>;
  if (item.kind !== "browser-journey") return undefined;
  const evidence =
    item.evidence && typeof item.evidence === "object"
      ? (item.evidence as Record<string, unknown>)
      : {};
  const compactSlot = (slot: unknown) => {
    if (!slot || typeof slot !== "object") return undefined;
    const record = slot as Record<string, unknown>;
    const artifact =
      record.artifact && typeof record.artifact === "object"
        ? (record.artifact as Record<string, unknown>)
        : undefined;
    return {
      status: record.status,
      reason: record.reason,
      ...(artifact
        ? {
            artifact: {
              artifactId: artifact.artifactId,
              kind: artifact.kind,
              contentType: artifact.contentType,
              sizeBytes: artifact.sizeBytes,
              sha256: artifact.sha256,
              createdAt: artifact.createdAt,
              expiresAt: artifact.expiresAt,
            },
          }
        : {}),
    };
  };
  return {
    schemaVersion: item.schemaVersion,
    kind: item.kind,
    scenarioId: item.scenarioId,
    outcome: item.outcome,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    durationMs: item.durationMs,
    finalLocation: item.finalLocation,
    steps: Array.isArray(item.steps)
      ? item.steps.map((step) => {
          const record = step as Record<string, unknown>;
          return {
            stepId: record.stepId,
            sequence: record.sequence,
            name: record.name,
            kind: record.kind,
            operation: record.operation,
            outcome: record.outcome,
            durationMs: record.durationMs,
            diagnosticId: record.diagnosticId,
            skipReason: record.skipReason,
          };
        })
      : [],
    diagnostics: Array.isArray(item.diagnostics)
      ? item.diagnostics.map(compactDiagnostic)
      : [],
    evidence: {
      screenshot: compactSlot(evidence.screenshot),
      trace: compactSlot(evidence.trace),
    },
  };
}

export function compactRunDiagnostics(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const root = value as Record<string, unknown>;
  const workflowRun =
    root.workflowRun && typeof root.workflowRun === "object"
      ? (root.workflowRun as Record<string, unknown>)
      : {};
  const scenarioRuns = Array.isArray(root.scenarioRuns)
    ? root.scenarioRuns
    : [];
  const testResults = Array.isArray(root.testResults) ? root.testResults : [];
  return redactSensitive({
    workflowRun: {
      id: workflowRun.id,
      status: workflowRun.status,
      summary: parseJSONValue(workflowRun.summary),
      error: workflowRun.error,
      startedAt: workflowRun.started_at,
      completedAt: workflowRun.completed_at,
      updatedAt: workflowRun.updated_at,
    },
    scenarioRuns: scenarioRuns.map((scenario) => {
      const item = scenario as Record<string, unknown>;
      return {
        id: item.id,
        scenarioId: item.scenario_id,
        scenarioName: item.scenario_name,
        status: item.status,
        phase: item.phase,
        error: item.error,
        journey: compactJourneyResult(item.result),
      };
    }),
    failedTests: testResults
      .map((test) => test as Record<string, unknown>)
      .filter((test) => test.status === "failed")
      .map((test) => {
        const result = parseJSONValue(test.result_data);
        const record =
          result && typeof result === "object"
            ? (result as Record<string, unknown>)
            : {};
        return {
          id: test.id,
          scenarioId: test.scenario_id,
          scenarioName: test.scenario_name,
          testName: test.test_name,
          testType: test.test_type,
          status: test.status,
          durationMs: test.duration_ms,
          diagnostic: compactDiagnostic(record.diagnostic),
        };
      }),
  });
}

export function listWorkflowRevisions(
  identity: AgentIdentity,
  workflowId: string,
) {
  const query = new URLSearchParams({ projectId: identity.projectId });
  return runnerRequest(
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions?${query}`,
  );
}

export function createWorkflowRevision(
  identity: AgentIdentity,
  workflowId: string,
  message?: string,
) {
  return runnerRequest(
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions`,
    {
      method: "POST",
      body: JSON.stringify({
        projectId: identity.projectId,
        userId: identity.userId,
        message,
      }),
    },
  );
}

export function restoreWorkflowRevision(
  identity: AgentIdentity,
  workflowId: string,
  revisionId: string,
  expectedVersion: number,
) {
  return runnerRequest(
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    {
      method: "POST",
      body: JSON.stringify({
        projectId: identity.projectId,
        userId: identity.userId,
        expectedVersion,
      }),
    },
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
