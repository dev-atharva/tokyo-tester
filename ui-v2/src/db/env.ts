export type DatabaseType = "postgres" | "mysql";

export interface DatabaseConfig {
  type: DatabaseType;
  databaseUrl?: string;
}

export function getDatabaseConfig(): DatabaseConfig {
  const configuredType = process.env.DB_TYPE?.trim() || "mysql";
  if (configuredType !== "mysql" && configuredType !== "postgres") {
    throw new Error(
      `Unsupported DB_TYPE=${configuredType}; expected mysql or postgres`,
    );
  }

  return {
    type: configuredType,
    databaseUrl: process.env.DATABASE_URL,
  };
}

export function assertDatabaseConfig(
  config = getDatabaseConfig(),
): DatabaseConfig {
  if (!config.databaseUrl) {
    throw new Error(`DATABASE_URL must be set when DB_TYPE=${config.type}`);
  }

  return config;
}
