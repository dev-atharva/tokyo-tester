CREATE TABLE IF NOT EXISTS "workflow_run_intent" (
  "id" TEXT PRIMARY KEY,
  "principalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "workflowId" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('bundle', 'existing')),
  "state" TEXT NOT NULL DEFAULT 'awaiting-human' CHECK ("state" IN ('awaiting-human', 'submitting', 'submitted', 'cancelled', 'expired')),
  "requestHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "requiredSecretRefs" TEXT NOT NULL,
  "selectionSummary" TEXT NOT NULL,
  "workflowRunId" TEXT,
  "claimId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_run_intent_request_idx"
  ON "workflow_run_intent" ("principalId", "projectId", "operation", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "workflow_run_intent_human_idx"
  ON "workflow_run_intent" ("userId", "projectId", "id");
CREATE INDEX IF NOT EXISTS "workflow_run_intent_expiry_idx"
  ON "workflow_run_intent" ("state", "expiresAt");
