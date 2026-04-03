import { defineConfig } from "drizzle-kit";

const dbType = process.env.DB_TYPE === "postgres" ? "postgresql" : "sqlite";

export default defineConfig({
  schema:
    dbType === "postgresql"
      ? "./src/db/schema/postgres.ts"
      : "./src/db/schema/sqlite.ts",
  out:
    dbType === "postgresql"
      ? "./src/db/migrations/postgres"
      : "./src/db/migrations/sqlite",
  dialect: dbType,
  dbCredentials:
    dbType === "postgresql"
      ? {
          url: process.env.DATABASE_URL || "",
        }
      : {
          url: process.env.DB_PATH || "./data/tokyo-tester-auth.db",
        },
});
