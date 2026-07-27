import { defineConfig } from "drizzle-kit";

const configuredType = process.env.DB_TYPE?.trim() || "mysql";
if (configuredType !== "mysql" && configuredType !== "postgres") {
  throw new Error(
    `Unsupported DB_TYPE=${configuredType}; expected mysql or postgres`,
  );
}
const dbType = configuredType === "postgres" ? "postgresql" : "mysql";

export default defineConfig({
  schema:
    dbType === "postgresql"
      ? "./src/db/schema/postgres.ts"
      : "./src/db/schema/mysql.ts",
  out:
    dbType === "postgresql"
      ? "./src/db/migrations/postgres"
      : "./src/db/migrations/mysql",
  dialect: dbType,
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
