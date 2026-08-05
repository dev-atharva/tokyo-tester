import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import type { ScenarioData } from "@/modules/sync/sync-types";
import type {
  ScenarioStep,
  WorkflowBundle,
  WorkflowBundleScenario,
} from "@/modules/workflow/types/react-flow-cots";
import type { AgentIdentity } from "./auth";

export const RUN_INTENT_TTL_MS = 15 * 60_000;

export type RunIntentState =
  | "awaiting-human"
  | "submitting"
  | "submitted"
  | "cancelled"
  | "expired";

export type RunIntentPayload =
  | {
      operation: "bundle";
      bundle: WorkflowBundle;
      scenarioNames?: string[];
    }
  | {
      operation: "existing";
      workflowId: string;
      scenarioIds?: string[];
      expectedWorkflowVersion: number;
      expectedScenarioVersions: Record<string, number>;
    };

export interface RunIntentSelectionSummary {
  operation: "bundle" | "existing";
  workflowId: string;
  workflowName: string;
  scenarioIds: string[];
  scenarioNames: string[];
}

export interface RunIntentRecord {
  id: string;
  principalId: string;
  userId: string;
  projectId: string;
  workflowId: string;
  operation: "bundle" | "existing";
  state: RunIntentState;
  requestHash: string;
  idempotencyKey: string;
  payload: RunIntentPayload;
  requiredSecretRefs: string[];
  selectionSummary: RunIntentSelectionSummary;
  workflowRunId: string | null;
  claimId: string | null;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

function parseJSON<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function fromRow(row: Record<string, unknown>): RunIntentRecord {
  return {
    id: String(row.id),
    principalId: String(row.principalId),
    userId: String(row.userId),
    projectId: String(row.projectId),
    workflowId: String(row.workflowId),
    operation: row.operation as "bundle" | "existing",
    state: row.state as RunIntentState,
    requestHash: String(row.requestHash),
    idempotencyKey: String(row.idempotencyKey),
    payload: parseJSON<RunIntentPayload>(row.payload),
    requiredSecretRefs: parseJSON<string[]>(row.requiredSecretRefs),
    selectionSummary: parseJSON<RunIntentSelectionSummary>(
      row.selectionSummary,
    ),
    workflowRunId: row.workflowRunId ? String(row.workflowRunId) : null,
    claimId: row.claimId ? String(row.claimId) : null,
    createdAt: toDate(row.createdAt),
    expiresAt: toDate(row.expiresAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedRefs(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const refs = new Set<string>();
  for (const candidate of steps) {
    const step = candidate as ScenarioStep;
    if (
      step?.kind === "action" &&
      step.action?.operation === "fill" &&
      step.action.value?.source === "run-secret" &&
      step.action.value.secretRef.trim()
    ) {
      refs.add(step.action.value.secretRef);
    }
  }
  return [...refs].sort();
}

function selectBundleScenarios(
  bundle: WorkflowBundle,
  scenarioNames?: string[],
): WorkflowBundleScenario[] {
  if (scenarioNames === undefined) return bundle.scenarios;
  if (
    scenarioNames.length === 0 ||
    new Set(scenarioNames).size !== scenarioNames.length
  ) {
    throw new Error(
      "scenarioNames must contain at least one unique scenario name.",
    );
  }
  return scenarioNames.map((name) => {
    const matches = bundle.scenarios.filter(
      (scenario) => scenario.name === name,
    );
    if (matches.length === 0) throw new Error(`Unknown scenario name: ${name}`);
    if (matches.length > 1)
      throw new Error(`Scenario name is ambiguous: ${name}`);
    return matches[0];
  });
}

export function bundleRunIntentDetails(
  bundle: WorkflowBundle,
  workflowId: string,
  scenarioNames?: string[],
): {
  requiredSecretRefs: string[];
  selectionSummary: RunIntentSelectionSummary;
} {
  const scenarios = selectBundleScenarios(bundle, scenarioNames);
  return {
    requiredSecretRefs: [
      ...new Set(
        scenarios.flatMap((scenario) => normalizedRefs(scenario.steps)),
      ),
    ].sort(),
    selectionSummary: {
      operation: "bundle",
      workflowId,
      workflowName: bundle.workflow.name,
      scenarioIds: [],
      scenarioNames: scenarios.map((scenario) => scenario.name),
    },
  };
}

export function existingRunIntentDetails(
  workflow: { id: string; name: string },
  scenarios: ScenarioData[],
): {
  requiredSecretRefs: string[];
  selectionSummary: RunIntentSelectionSummary;
} {
  return {
    requiredSecretRefs: [
      ...new Set(
        scenarios.flatMap((scenario) => normalizedRefs(scenario.steps_config)),
      ),
    ].sort(),
    selectionSummary: {
      operation: "existing",
      workflowId: workflow.id,
      workflowName: workflow.name,
      scenarioIds: scenarios.map((scenario) => scenario.id),
      scenarioNames: scenarios.map((scenario) => scenario.name),
    },
  };
}

export function runIntentHandoffURL(id: string) {
  const configured =
    process.env.TOKYO_TESTER_PUBLIC_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000";
  const url = new URL(configured);
  url.pathname = `/run-intents/${encodeURIComponent(id)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function rowsFor(where: unknown): Promise<RunIntentRecord[]> {
  const connection = getDb();
  const rows = await connection.db
    .select()
    .from(connection.tables.runIntents)
    .where(where)
    .limit(1);
  return rows.map((row: Record<string, unknown>) => fromRow(row));
}

async function expireIfNeeded(intent: RunIntentRecord | null) {
  if (
    !intent ||
    intent.state !== "awaiting-human" ||
    intent.expiresAt.getTime() > Date.now()
  ) {
    return intent;
  }
  const connection = getDb();
  const now = new Date();
  await connection.db
    .update(connection.tables.runIntents)
    .set({ state: "expired", updatedAt: now })
    .where(
      and(
        eq(connection.tables.runIntents.id, intent.id),
        eq(connection.tables.runIntents.state, "awaiting-human"),
        lte(connection.tables.runIntents.expiresAt, now),
      ),
    );
  return (
    (await rowsFor(eq(connection.tables.runIntents.id, intent.id)))[0] ?? null
  );
}

export async function createRunIntent(input: {
  identity: AgentIdentity;
  workflowId: string;
  idempotencyKey: string;
  payload: RunIntentPayload;
  requiredSecretRefs: string[];
  selectionSummary: RunIntentSelectionSummary;
  now?: Date;
}): Promise<RunIntentRecord> {
  if (input.requiredSecretRefs.length === 0) {
    throw new Error("A run intent requires at least one run-secret reference.");
  }
  const connection = getDb();
  const table = connection.tables.runIntents;
  const requestHash = stableHash({
    projectId: input.identity.projectId,
    workflowId: input.workflowId,
    payload: input.payload,
    requiredSecretRefs: input.requiredSecretRefs,
  });
  const existing = (
    await rowsFor(
      and(
        eq(table.principalId, input.identity.tokenId),
        eq(table.projectId, input.identity.projectId),
        eq(table.operation, input.payload.operation),
        eq(table.idempotencyKey, input.idempotencyKey),
      ),
    )
  )[0];
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error(
        "The idempotency key is already bound to a different run selection.",
      );
    }
    return (await expireIfNeeded(existing)) ?? existing;
  }
  const now = input.now ?? new Date();
  const id = `intent-${stableHash({
    principalId: input.identity.tokenId,
    projectId: input.identity.projectId,
    operation: input.payload.operation,
    idempotencyKey: input.idempotencyKey,
  }).slice(0, 40)}`;
  const values = {
    id,
    principalId: input.identity.tokenId,
    userId: input.identity.userId,
    projectId: input.identity.projectId,
    workflowId: input.workflowId,
    operation: input.payload.operation,
    state: "awaiting-human" as const,
    requestHash,
    idempotencyKey: input.idempotencyKey,
    payload: JSON.stringify(input.payload),
    requiredSecretRefs: JSON.stringify(input.requiredSecretRefs),
    selectionSummary: JSON.stringify(input.selectionSummary),
    workflowRunId: null,
    claimId: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + RUN_INTENT_TTL_MS),
    updatedAt: now,
  };
  if (connection.type === "postgres") {
    await connection.db.insert(table).values(values).onConflictDoNothing();
  } else {
    await connection.db.insert(table).values(values).ignore();
  }
  const created = (
    await rowsFor(
      and(
        eq(table.principalId, input.identity.tokenId),
        eq(table.projectId, input.identity.projectId),
        eq(table.operation, input.payload.operation),
        eq(table.idempotencyKey, input.idempotencyKey),
      ),
    )
  )[0];
  if (!created || created.requestHash !== requestHash) {
    throw new Error(
      "The idempotency key is already bound to a different run selection.",
    );
  }
  return created;
}

export async function getRunIntentForAgent(
  identity: AgentIdentity,
  id: string,
) {
  const connection = getDb();
  const table = connection.tables.runIntents;
  const intent = (
    await rowsFor(
      and(
        eq(table.id, id),
        eq(table.principalId, identity.tokenId),
        eq(table.userId, identity.userId),
        eq(table.projectId, identity.projectId),
      ),
    )
  )[0];
  return expireIfNeeded(intent ?? null);
}

export async function getRunIntentForHuman(userId: string, id: string) {
  const connection = getDb();
  const table = connection.tables.runIntents;
  const intent = (
    await rowsFor(and(eq(table.id, id), eq(table.userId, userId)))
  )[0];
  return expireIfNeeded(intent ?? null);
}

export async function claimRunIntent(userId: string, id: string) {
  const intent = await getRunIntentForHuman(userId, id);
  if (!intent || intent.state !== "awaiting-human") return null;
  const connection = getDb();
  const table = connection.tables.runIntents;
  const now = new Date();
  const claimId = randomUUID();
  await connection.db
    .update(table)
    .set({ state: "submitting", claimId, updatedAt: now })
    .where(
      and(
        eq(table.id, id),
        eq(table.userId, userId),
        eq(table.state, "awaiting-human"),
        gt(table.expiresAt, now),
      ),
    );
  const claimed = (await rowsFor(eq(table.id, id)))[0];
  return claimed?.claimId === claimId ? claimed : null;
}

export async function completeRunIntent(
  id: string,
  claimId: string,
  workflowRunId: string,
) {
  const connection = getDb();
  const table = connection.tables.runIntents;
  await connection.db
    .update(table)
    .set({
      state: "submitted",
      workflowRunId,
      claimId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(table.id, id),
        eq(table.state, "submitting"),
        eq(table.claimId, claimId),
      ),
    );
}

export async function cancelClaimedRunIntent(id: string, claimId: string) {
  const connection = getDb();
  const table = connection.tables.runIntents;
  await connection.db
    .update(table)
    .set({ state: "cancelled", claimId: null, updatedAt: new Date() })
    .where(
      and(
        eq(table.id, id),
        eq(table.state, "submitting"),
        eq(table.claimId, claimId),
      ),
    );
}

export async function cancelAwaitingRunIntent(userId: string, id: string) {
  const connection = getDb();
  const table = connection.tables.runIntents;
  await connection.db
    .update(table)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(table.id, id),
        eq(table.userId, userId),
        eq(table.state, "awaiting-human"),
      ),
    );
}

export function publicRunIntent(intent: RunIntentRecord) {
  return {
    kind: "human_input_required" as const,
    runIntentId: intent.id,
    status: intent.state,
    handoffUrl: runIntentHandoffURL(intent.id),
    requiredSecretRefs: intent.requiredSecretRefs,
    createdAt: intent.createdAt.toISOString(),
    expiresAt: intent.expiresAt.toISOString(),
    selection: { ...intent.selectionSummary, projectId: intent.projectId },
    ...(intent.workflowRunId ? { workflowRunId: intent.workflowRunId } : {}),
  };
}
