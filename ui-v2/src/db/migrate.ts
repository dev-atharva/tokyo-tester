import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "./index";

async function main() {
  const database = getDb();
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
