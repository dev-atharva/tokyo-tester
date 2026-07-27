import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  closeMySQLTestDatabase,
  resetMySQLTestDatabase,
} from "@/db/mysql-test";
import { hashPassword, verifyPassword } from "./password";
import { countUsers, createInitialAdmin, verifyPasswordLogin } from "./service";

const databaseUrl =
  process.env.UI_AUTH_TEST_DATABASE_URL ??
  "mysql://root:tokyo-test-root-password@127.0.0.1:33306/ui_auth_test";

describe("auth service", () => {
  beforeEach(async () => {
    process.env.DB_TYPE = "mysql";
    process.env.DATABASE_URL = databaseUrl;
    await resetMySQLTestDatabase(databaseUrl);
  });

  afterEach(async () => {
    await closeMySQLTestDatabase();
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
    const { getDb } = await import("@/db");
    const connection = getDb();
    const [rows] = await connection.client.query(
      `SELECT p.kind, pm.role FROM project p
       JOIN project_member pm ON pm.projectId = p.id
       WHERE p.createdBy = ? AND p.kind = 'personal'`,
      [user.id],
    );
    const personal = (rows as Array<{ kind: string; role: string }>)[0];
    assert.deepEqual(personal, { kind: "personal", role: "owner" });

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
