import { defineConfig } from "drizzle-kit";

const dbType =
  process.env.DB_TYPE === "postgres"
    ? "postgresql"
    : process.env.DB_TYPE === "mysql"
      ? "mysql"
      : "sqlite";

export default defineConfig({
  schema:
    dbType === "postgresql"
      ? "./src/db/schema/postgres.ts"
      : dbType === "mysql"
        ? "./src/db/schema/mysql.ts"
        : "./src/db/schema/sqlite.ts",
  out:
    dbType === "postgresql"
      ? "./src/db/migrations/postgres"
      : dbType === "mysql"
        ? "./src/db/migrations/mysql"
        : "./src/db/migrations/sqlite",
  dialect: dbType,
  dbCredentials:
    dbType === "postgresql"
      ? {
          url: process.env.DATABASE_URL || "",
        }
      : dbType === "mysql"
        ? {
            url: process.env.DATABASE_URL || "",
          }
        : {
            url: process.env.DB_PATH || "./data/tokyo-tester-auth.db",
          },
});
