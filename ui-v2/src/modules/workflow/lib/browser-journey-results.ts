import type { ExecutionDiagnostic } from "../types/react-flow-cots";

export type JourneyOutcome = "passed" | "failed" | "interrupted";
export type JourneyStepOutcome =
  | "passed"
  | "failed"
  | "skipped"
  | "interrupted";
export type JourneyEvidenceStatus =
  | "available"
  | "suppressed"
  | "unavailable"
  | "not-captured"
  | "expired";

export interface JourneyArtifactReference {
  artifactId: string;
  kind: "screenshot" | "trace";
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt: string;
}

export interface JourneyEvidenceSlot {
  status: JourneyEvidenceStatus;
  reason?: string;
  artifact?: JourneyArtifactReference;
}

export interface BrowserJourneyResult {
  schemaVersion: 1;
  kind: "browser-journey";
  scenarioId: string;
  outcome: JourneyOutcome;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  finalLocation?: { path: string; queryKeys?: string[] };
  steps: Array<{
    stepId: string;
    sequence: number;
    name: string;
    kind: "action" | "assertion" | "control";
    operation: string;
    outcome: JourneyStepOutcome;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    diagnosticId?: string;
    skipReason?:
      | "prior-step-failed"
      | "journey-interrupted"
      | "journey-not-started";
  }>;
  diagnostics: ExecutionDiagnostic[];
  evidence: {
    screenshot: JourneyEvidenceSlot;
    trace: JourneyEvidenceSlot;
  };
}

export interface BrowserJourneyParseResult {
  result?: BrowserJourneyResult;
  unsupportedVersion?: number;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseBrowserJourneyResult(
  value: unknown,
  scenarioId?: string,
): BrowserJourneyParseResult {
  const seen = new Set<unknown>();
  const visit = (candidate: unknown): BrowserJourneyParseResult => {
    if (!candidate || seen.has(candidate)) return {};
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const parsed = visit(item);
        if (parsed.result || parsed.unsupportedVersion !== undefined)
          return parsed;
      }
      return {};
    }
    const record = recordValue(candidate);
    if (!record) return {};
    if (record.kind === "browser-journey") {
      if (record.schemaVersion !== 1) {
        return {
          unsupportedVersion:
            typeof record.schemaVersion === "number"
              ? record.schemaVersion
              : -1,
        };
      }
      if (
        (!scenarioId || record.scenarioId === scenarioId) &&
        typeof record.scenarioId === "string" &&
        Array.isArray(record.steps) &&
        record.evidence &&
        typeof record.evidence === "object"
      ) {
        return { result: record as unknown as BrowserJourneyResult };
      }
      return {};
    }
    for (const key of ["journey", "scenarioResults", "result", "results"]) {
      const parsed = visit(record[key]);
      if (parsed.result || parsed.unsupportedVersion !== undefined)
        return parsed;
    }
    return {};
  };
  return visit(value);
}

export function journeyOutcomeCounts(result: BrowserJourneyResult) {
  const steps = { passed: 0, failed: 0, skipped: 0, interrupted: 0 };
  for (const step of result.steps) steps[step.outcome]++;
  return steps;
}

export function describeEvidenceSlot(slot: JourneyEvidenceSlot): string {
  if (slot.status === "available") return "Available";
  if (slot.status === "suppressed" && slot.reason === "secret-bearing") {
    return "Suppressed because this journey used a run secret";
  }
  if (slot.status === "not-captured" && slot.reason === "success-policy") {
    return "Not captured for successful journeys";
  }
  if (slot.status === "expired") return "Expired under the retention policy";
  if (slot.reason === "limit-exceeded")
    return "Unavailable: evidence limit exceeded";
  if (slot.reason === "storage-failed") return "Unavailable: storage failed";
  if (slot.reason === "capture-failed") return "Unavailable: capture failed";
  return slot.status.replaceAll("-", " ");
}
