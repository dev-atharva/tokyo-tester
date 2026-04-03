import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import Database from "better-sqlite3";
import { hashPassword, verifyPassword } from "./password";
import { countUsers, createInitialAdmin, verifyPasswordLogin } from "./service";

let tempDir = "";
let dbPath = "";

function resetDbCache() {
  const cached = (
    globalThis as { __tokyoTesterDb?: { type: string; client: unknown } }
  ).__tokyoTesterDb;

  if (cached?.type === "sqlite") {
    (cached.client as InstanceType<typeof Database>).close();
  }

  (globalThis as { __tokyoTesterDb?: unknown }).__tokyoTesterDb = undefined;
}

function runSqliteMigration(targetPath: string) {
  const database = new Database(targetPath);
  const migration = readFileSync(
    resolve(process.cwd(), "src/db/migrations/sqlite/001_auth.sql"),
    "utf8",
  );

  database.exec(migration);
  database.close();
}

describe("auth service", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), ".tmp-auth-test-"));
    dbPath = join(tempDir, "auth-test.db");
    process.env.DB_TYPE = "sqlite";
    process.env.DB_PATH = dbPath;
    resetDbCache();
    runSqliteMigration(dbPath);
  });

  afterEach(() => {
    resetDbCache();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("hashPassword and verifyPassword round-trip correctly", async () => {
    const password = "very-secure-password";
    const hash = await hashPassword(password);

    assert.match(hash, /^scrypt:/);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });

  test("createInitialAdmin only succeeds once", async () => {
    const user = await createInitialAdmin({
      email: "admin@example.com",
      name: "Admin",
      password: "strong-password",
    });

    assert.equal(user.email, "admin@example.com");
    assert.equal(user.role, "admin");
    assert.equal(await countUsers(), 1);

    await assert.rejects(
      createInitialAdmin({
        email: "second@example.com",
        name: "Second Admin",
        password: "another-strong-password",
      }),
      /Initial setup has already been completed\./,
    );
  });

  test("verifyPasswordLogin accepts valid credentials and rejects invalid ones", async () => {
    await createInitialAdmin({
      email: "admin@example.com",
      name: "Admin",
      password: "strong-password",
    });

    const validUser = await verifyPasswordLogin(
      "ADMIN@example.com",
      "strong-password",
    );
    const invalidPassword = await verifyPasswordLogin(
      "admin@example.com",
      "wrong-password",
    );
    const unknownUser = await verifyPasswordLogin(
      "missing@example.com",
      "strong-password",
    );

    assert.equal(validUser?.email, "admin@example.com");
    assert.equal(validUser?.role, "admin");
    assert.equal(invalidPassword, null);
    assert.equal(unknownUser, null);
  });
});
