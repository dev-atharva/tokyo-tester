CREATE TABLE IF NOT EXISTS "agent_token" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "scopes" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "agent_token_user_idx" ON "agent_token"("userId");
CREATE INDEX IF NOT EXISTS "agent_token_project_idx" ON "agent_token"("projectId");
