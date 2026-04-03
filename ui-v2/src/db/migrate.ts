import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "./index";

async function main() {
  const database = getDb();
  const folder =
    database.type === "postgres"
      ? "./src/db/migrations/postgres/001_auth.sql"
      : "./src/db/migrations/sqlite/001_auth.sql";

  const sql = readFileSync(resolve(process.cwd(), folder), "utf8");

  if (database.type === "postgres") {
    await database.client.unsafe(sql);
    await database.client.end();
    return;
  }

  database.client.exec(sql);
  database.client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
