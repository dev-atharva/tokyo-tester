import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import postgres from "postgres";

function getDatabaseConfig() {
  const type = process.env.DB_TYPE === "postgres" ? "postgres" : "sqlite";
  const sqlitePath = resolve(
    process.env.DB_PATH || "./data/tokyo-tester-auth.db",
  );

  if (type === "sqlite") {
    mkdirSync(dirname(sqlitePath), { recursive: true });
  }

  return {
    type,
    sqlitePath,
    databaseUrl: process.env.DATABASE_URL,
  };
}

async function main() {
  const database = getDatabaseConfig();

  if (database.type === "postgres" && !database.databaseUrl) {
    throw new Error("DATABASE_URL must be set when DB_TYPE=postgres");
  }

  const folder =
    database.type === "postgres"
      ? "./src/db/migrations/postgres"
      : "./src/db/migrations/sqlite";
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

  const client = new Database(database.sqlitePath);
  client.pragma("journal_mode = WAL");
  client.exec(`
    CREATE TABLE IF NOT EXISTS "_ui_schema_migration" (
      "name" TEXT PRIMARY KEY,
      "appliedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  const isApplied = client.prepare(
    'SELECT 1 FROM "_ui_schema_migration" WHERE "name" = ?',
  );
  const markApplied = client.prepare(
    'INSERT INTO "_ui_schema_migration" ("name") VALUES (?)',
  );
  for (const migration of migrations) {
    if (isApplied.get(migration.name)) continue;
    client.transaction(() => {
      client.exec(migration.sql);
      markApplied.run(migration.name);
    })();
  }
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
