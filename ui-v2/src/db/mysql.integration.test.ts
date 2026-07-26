import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import mysql from "mysql2/promise";
import {
  authenticateAgentRequest,
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
} from "@/modules/agent/server/auth";
import {
  countUsers,
  createInitialAdmin,
  createUser,
  verifyPasswordLogin,
} from "@/modules/auth/server/service";
import {
  addUsersToProject,
  createProject,
  listProjectMembers,
} from "@/modules/projects/server/service";

const mysqlTestUrl = process.env.UI_MYSQL_TEST_DATABASE_URL;

async function resetDbCache() {
  const cached = globalThis.__tokyoTesterDb;
  if (cached?.type === "mysql") {
    await cached.client.end();
  }
  globalThis.__tokyoTesterDb = undefined;
}

async function resetMySQLSchema(databaseUrl: string) {
  const client = mysql.createPool({
    uri: databaseUrl,
    multipleStatements: true,
  });
  await client.query("SET FOREIGN_KEY_CHECKS = 0");
  await client.query(`
    DROP TABLE IF EXISTS
      \`agent_token\`,
      \`project_member\`,
      \`account\`,
      \`session\`,
      \`verificationToken\`,
      \`project\`,
      \`user\`,
      \`_ui_schema_migration\`
  `);
  await client.query("SET FOREIGN_KEY_CHECKS = 1");

  const migrationDir = resolve(process.cwd(), "src/db/migrations/mysql");
  await client.query(`
    CREATE TABLE IF NOT EXISTS \`_ui_schema_migration\` (
      \`name\` VARCHAR(255) PRIMARY KEY,
      \`appliedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const name of readdirSync(migrationDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    await client.query(readFileSync(resolve(migrationDir, name), "utf8"));
    await client.query(
      "INSERT INTO `_ui_schema_migration` (`name`) VALUES (?)",
      [name],
    );
  }
  await client.end();
}

describe("mysql database integration", { skip: !mysqlTestUrl }, () => {
  beforeEach(async () => {
    if (!mysqlTestUrl) {
      return;
    }
    process.env.DB_TYPE = "mysql";
    process.env.DATABASE_URL = mysqlTestUrl;
    await resetDbCache();
    await resetMySQLSchema(mysqlTestUrl);
  });

  afterEach(async () => {
    await resetDbCache();
  });

  test("supports auth, projects, and agent tokens", async () => {
    const admin = await createInitialAdmin({
      email: "admin@example.com",
      name: "Admin",
      password: "strong-password",
    });
    assert.equal(admin.role, "admin");
    assert.equal(await countUsers(), 1);
    assert.equal(
      (await verifyPasswordLogin("ADMIN@example.com", "strong-password"))
        ?.email,
      "admin@example.com",
    );

    const teammate = await createUser({
      email: "runner@example.com",
      name: "Runner",
      password: "strong-password",
      role: "normal",
    });
    const project = await createProject("Team", admin.id);
    await addUsersToProject(project.id, [teammate.id]);
    const members = await listProjectMembers(project.id);
    assert.equal(
      members.find((member) => member.id === teammate.id)?.projectRole,
      "runner",
    );

    const token = await createAgentToken({
      name: "CI",
      userId: admin.id,
      projectId: project.id,
      scopes: ["read", "run"],
      expiresAt: new Date(Date.now() + 60_000),
    });
    const identity = await authenticateAgentRequest(
      new Request("http://localhost", {
        headers: { authorization: `Bearer ${token.token}` },
      }) as never,
      ["read", "run"],
    );
    assert.equal(identity?.userId, admin.id);
    assert.equal(identity?.projectId, project.id);
    const listed = await listAgentTokens(admin.id);
    assert.equal(listed[0]?.id, token.id);
    assert.ok(listed[0]?.lastUsedAt);

    await revokeAgentToken(admin.id, token.id);
    const revokedIdentity = await authenticateAgentRequest(
      new Request("http://localhost", {
        headers: { authorization: `Bearer ${token.token}` },
      }) as never,
      "read",
    );
    assert.equal(revokedIdentity, null);
    assert.ok((await listAgentTokens(admin.id))[0]?.revokedAt);
  });
});
