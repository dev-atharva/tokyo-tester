CREATE TABLE IF NOT EXISTS "project" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "project_member" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY ("projectId", "userId"),
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_created_by_idx" ON "project"("createdBy");
CREATE INDEX IF NOT EXISTS "project_member_user_idx" ON "project_member"("userId");
