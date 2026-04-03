import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DatabaseType = "sqlite" | "postgres";

export interface DatabaseConfig {
  type: DatabaseType;
  sqlitePath: string;
  databaseUrl?: string;
}

export function getDatabaseConfig(): DatabaseConfig {
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

export function assertDatabaseConfig(
  config = getDatabaseConfig(),
): DatabaseConfig {
  if (config.type === "postgres" && !config.databaseUrl) {
    throw new Error("DATABASE_URL must be set when DB_TYPE=postgres");
  }

  return config;
}
