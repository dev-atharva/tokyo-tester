import { describe, expect, test } from "bun:test";
import {
  type BrowserJourneyResult,
  describeEvidenceSlot,
  journeyOutcomeCounts,
  parseBrowserJourneyResult,
} from "./browser-journey-results";

const result = {
  schemaVersion: 1,
  kind: "browser-journey",
  scenarioId: "checkout",
  outcome: "failed",
  startedAt: "2026-08-03T10:00:00Z",
  completedAt: "2026-08-03T10:00:04Z",
  durationMs: 4000,
  steps: [
    {
      stepId: "open",
      sequence: 0,
      name: "Open",
      kind: "action",
      operation: "navigate",
      outcome: "passed",
    },
    {
      stepId: "submit",
      sequence: 1,
      name: "Submit",
      kind: "action",
      operation: "click",
      outcome: "failed",
    },
    {
      stepId: "confirm",
      sequence: 2,
      name: "Confirm",
      kind: "assertion",
      operation: "visible",
      outcome: "skipped",
    },
  ],
  diagnostics: [],
  evidence: {
    screenshot: {
      status: "available",
      artifact: {
        artifactId: "shot",
        kind: "screenshot",
        contentType: "image/png",
        sizeBytes: 10,
        sha256: "abc",
        createdAt: "2026-08-03T10:00:04Z",
        expiresAt: "2026-09-02T10:00:04Z",
      },
    },
    trace: {
      status: "available",
      artifact: {
        artifactId: "trace",
        kind: "trace",
        contentType: "application/zip",
        sizeBytes: 20,
        sha256: "def",
        createdAt: "2026-08-03T10:00:04Z",
        expiresAt: "2026-09-02T10:00:04Z",
      },
    },
  },
} satisfies BrowserJourneyResult;

describe("browser journey results", () => {
  test("finds the durable aggregate nested in a scenario snapshot", () => {
    expect(
      parseBrowserJourneyResult({ journey: result }, "checkout").result,
    ).toEqual(result);
    expect(journeyOutcomeCounts(result)).toEqual({
      passed: 1,
      failed: 1,
      skipped: 1,
      interrupted: 0,
    });
  });

  test("fails closed for an unknown result schema", () => {
    expect(parseBrowserJourneyResult({ ...result, schemaVersion: 7 })).toEqual({
      unsupportedVersion: 7,
    });
  });

  test("explains secret suppression and success policy", () => {
    expect(
      describeEvidenceSlot({ status: "suppressed", reason: "secret-bearing" }),
    ).toContain("run secret");
    expect(
      describeEvidenceSlot({
        status: "not-captured",
        reason: "success-policy",
      }),
    ).toContain("successful");
  });
});
