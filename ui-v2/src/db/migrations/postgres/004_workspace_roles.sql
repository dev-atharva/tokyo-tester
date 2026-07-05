ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'team' CHECK ("kind" IN ('personal', 'team'));
ALTER TABLE "project_member" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'editor' CHECK ("role" IN ('owner', 'editor', 'runner'));

UPDATE "project_member"
SET "role" = 'owner'
FROM "project"
WHERE "project"."id" = "project_member"."projectId"
  AND "project"."createdBy" = "project_member"."userId";

CREATE UNIQUE INDEX IF NOT EXISTS "project_personal_owner_idx"
ON "project"("createdBy") WHERE "kind" = 'personal';
CREATE INDEX IF NOT EXISTS "project_member_role_idx"
ON "project_member"("projectId", "role");
