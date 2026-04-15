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
  const sql = readdirSync(absoluteFolder)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => readFileSync(resolve(absoluteFolder, entry), "utf8"))
    .join("\n\n");

  if (database.type === "postgres") {
    const client = postgres(database.databaseUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
    await client.unsafe(sql);
    await client.end();
    return;
  }

  const client = new Database(database.sqlitePath);
  client.pragma("journal_mode = WAL");
  client.exec(sql);
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
