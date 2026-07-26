ALTER TABLE "agent_token"
  ADD COLUMN "lastUsedAt" TIMESTAMPTZ NULL,
  ADD COLUMN "revokedAt" TIMESTAMPTZ NULL;

CREATE INDEX "agent_token_active_idx"
  ON "agent_token" ("userId", "projectId", "revokedAt", "expiresAt");
