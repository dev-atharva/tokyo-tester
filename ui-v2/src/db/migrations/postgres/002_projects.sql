CREATE TABLE IF NOT EXISTS "project" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "project_member" (
  "projectId" TEXT NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("projectId", "userId")
);

CREATE INDEX IF NOT EXISTS "project_created_by_idx" ON "project"("createdBy");
CREATE INDEX IF NOT EXISTS "project_member_user_idx" ON "project_member"("userId");
