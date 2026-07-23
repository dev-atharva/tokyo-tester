import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DatabaseType = "sqlite" | "postgres" | "mysql";

export interface DatabaseConfig {
  type: DatabaseType;
  sqlitePath: string;
  databaseUrl?: string;
}

export function getDatabaseConfig(): DatabaseConfig {
  const type =
    process.env.DB_TYPE === "postgres"
      ? "postgres"
      : process.env.DB_TYPE === "mysql"
        ? "mysql"
        : "sqlite";
  const configuredSqlitePath =
    process.env.DB_PATH || "./data/tokyo-tester-auth.db";
  const sqlitePath =
    configuredSqlitePath === ":memory:"
      ? configuredSqlitePath
      : resolve(configuredSqlitePath);

  if (type === "sqlite" && sqlitePath !== ":memory:") {
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
  if (
    (config.type === "postgres" || config.type === "mysql") &&
    !config.databaseUrl
  ) {
    throw new Error(`DATABASE_URL must be set when DB_TYPE=${config.type}`);
  }

  return config;
}
