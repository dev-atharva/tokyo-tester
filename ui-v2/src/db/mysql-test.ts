import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

export async function resetMySQLTestDatabase(databaseUrl: string) {
  const cached = globalThis.__tokyoTesterDb;
  if (cached) {
    await cached.client.end();
    globalThis.__tokyoTesterDb = undefined;
  }

  const connection = await mysql.createConnection({
    uri: databaseUrl,
    multipleStatements: true,
  });
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  const [tables] = await connection.query<mysql.RowDataPacket[]>("SHOW TABLES");
  for (const row of tables) {
    const tableName = String(Object.values(row)[0]).replaceAll("`", "``");
    await connection.query(`DROP TABLE \`${tableName}\``);
  }
  await connection.query("SET FOREIGN_KEY_CHECKS = 1");

  const folder = resolve(process.cwd(), "src/db/migrations/mysql");
  for (const name of readdirSync(folder)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    await connection.query(readFileSync(resolve(folder, name), "utf8"));
  }
  await connection.end();
}

export async function closeMySQLTestDatabase() {
  const cached = globalThis.__tokyoTesterDb;
  if (cached) {
    await cached.client.end();
    globalThis.__tokyoTesterDb = undefined;
  }
}
