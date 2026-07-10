import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import Database from "better-sqlite3";
import { createInitialAdmin, createUser } from "@/modules/auth/server/service";
import {
  addUsersToProject,
  createProject,
  ensurePersonalProject,
  listProjectMembers,
  listProjectsForUser,
  removeUserFromProject,
  updateProjectMemberRole,
} from "./service";

let tempDir = "";
let dbPath = "";

function resetDb() {
  const cached = globalThis.__tokyoTesterDb;
  if (cached?.type === "sqlite") cached.client.close();
  globalThis.__tokyoTesterDb = undefined;
}

describe("workspace roles", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), ".tmp-project-test-"));
    dbPath = join(tempDir, "projects.db");
    process.env.DB_TYPE = "sqlite";
    process.env.DB_PATH = dbPath;
    resetDb();
    const db = new Database(dbPath);
    const folder = resolve(process.cwd(), "src/db/migrations/sqlite");
    for (const name of readdirSync(folder)
      .filter((item) => item.endsWith(".sql"))
      .sort()) {
      db.exec(readFileSync(resolve(folder, name), "utf8"));
    }
    db.close();
  });

  afterEach(() => {
    resetDb();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates exactly one immutable personal workspace", async () => {
    const admin = await createInitialAdmin({
      email: "admin@example.com",
      name: "Admin",
      password: "strong-password",
    });
    const first = await ensurePersonalProject(admin.id);
    const second = await ensurePersonalProject(admin.id);
    assert.equal(first.id, second.id);
    await assert.rejects(
      addUsersToProject(first.id, ["another-user"]),
      /Personal workspaces cannot have additional members/,
    );
    await assert.rejects(
      updateProjectMemberRole(first.id, admin.id, "runner"),
      /Personal workspace ownership cannot be changed/,
    );
  });

  test("defaults new team members to runner and preserves a final owner", async () => {
    const admin = await createInitialAdmin({
      email: "admin@example.com",
      name: "Admin",
      password: "strong-password",
    });
    const teammate = await createUser({
      email: "runner@example.com",
      name: "Runner",
      password: "strong-password",
      role: "normal",
    });
    const project = await createProject("Team", admin.id);
    await addUsersToProject(project.id, [teammate.id]);
    const adminWorkspaces = await listProjectsForUser(admin.id, admin.role);
    assert.deepEqual(
      adminWorkspaces.map((workspace) => workspace.id).sort(),
      [project.id, (await ensurePersonalProject(admin.id)).id].sort(),
    );
    let members = await listProjectMembers(project.id);
    assert.equal(
      members.find((member) => member.id === teammate.id)?.projectRole,
      "runner",
    );
    await assert.rejects(
      removeUserFromProject(project.id, admin.id),
      /final team owner cannot be removed/,
    );
    await updateProjectMemberRole(project.id, teammate.id, "owner");
    await removeUserFromProject(project.id, admin.id);
    members = await listProjectMembers(project.id);
    assert.deepEqual(
      members.map((member) => member.id),
      [teammate.id],
    );
  });
});
