CREATE TABLE IF NOT EXISTS "agent_token" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "agent_token_user_idx" ON "agent_token"("userId");
CREATE INDEX IF NOT EXISTS "agent_token_project_idx" ON "agent_token"("projectId");
