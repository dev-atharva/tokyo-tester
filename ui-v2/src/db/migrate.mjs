import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import postgres from "postgres";

function getDatabaseConfig() {
  const type = process.env.DB_TYPE?.trim() || "mysql";
  if (type !== "mysql" && type !== "postgres") {
    throw new Error(`Unsupported DB_TYPE=${type}; expected mysql or postgres`);
  }

  return {
    type,
    databaseUrl: process.env.DATABASE_URL,
  };
}

async function main() {
  const database = getDatabaseConfig();

  if (!database.databaseUrl) {
    throw new Error(`DATABASE_URL must be set when DB_TYPE=${database.type}`);
  }

  const folder =
    database.type === "postgres"
      ? "./src/db/migrations/postgres"
      : "./src/db/migrations/mysql";
  const absoluteFolder = resolve(process.cwd(), folder);
  const migrations = readdirSync(absoluteFolder)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(resolve(absoluteFolder, name), "utf8"),
    }));

  if (database.type === "postgres") {
    const client = postgres(database.databaseUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS "_ui_schema_migration" (
        "name" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    for (const migration of migrations) {
      const applied = await client`
        SELECT 1 FROM "_ui_schema_migration" WHERE "name" = ${migration.name}
      `;
      if (applied.length > 0) continue;
      await client.begin(async (sql) => {
        await sql.unsafe(migration.sql);
        await sql`
          INSERT INTO "_ui_schema_migration" ("name") VALUES (${migration.name})
        `;
      });
    }
    await client.end();
    return;
  }

  const client = await mysql.createConnection({
    uri: database.databaseUrl,
    multipleStatements: true,
  });
  await client.query(`
    CREATE TABLE IF NOT EXISTS \`_ui_schema_migration\` (
      \`name\` VARCHAR(255) PRIMARY KEY,
      \`appliedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const migration of migrations) {
    const [applied] = await client.query(
      "SELECT 1 FROM `_ui_schema_migration` WHERE `name` = ?",
      [migration.name],
    );
    if (Array.isArray(applied) && applied.length > 0) continue;
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO `_ui_schema_migration` (`name`) VALUES (?)",
      [migration.name],
    );
  }
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
