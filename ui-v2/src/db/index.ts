import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleMySQL } from "drizzle-orm/mysql2";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import mysql from "mysql2/promise";
import postgres from "postgres";
import { assertDatabaseConfig } from "./env";
import {
  mysqlAccounts,
  mysqlAgentTokens,
  mysqlProjectMembers,
  mysqlProjects,
  mysqlSessions,
  mysqlUsers,
  mysqlVerificationTokens,
} from "./schema/mysql";
import {
  pgAccounts,
  pgAgentTokens,
  pgProjectMembers,
  pgProjects,
  pgSessions,
  pgUsers,
  pgVerificationTokens,
} from "./schema/postgres";
import {
  sqliteAccounts,
  sqliteAgentTokens,
  sqliteProjectMembers,
  sqliteProjects,
  sqliteSessions,
  sqliteUsers,
  sqliteVerificationTokens,
} from "./schema/sqlite";

export type DatabaseConnection = {
  type: "sqlite" | "postgres" | "mysql";
  // Drizzle exposes incompatible structural types for each SQL dialect; callers branch by `type`.
  // biome-ignore lint/suspicious/noExplicitAny: The app stores a dialect-specific Drizzle instance behind the discriminant.
  db: any;
  // biome-ignore lint/suspicious/noExplicitAny: SQLite, postgres-js, and mysql2 clients do not share a useful common interface.
  client: any;
  // biome-ignore lint/suspicious/noExplicitAny: Table objects come from dialect-specific schema modules.
  tables: any;
};

declare global {
  // eslint-disable-next-line no-var
  var __tokyoTesterDb: DatabaseConnection | undefined;
}

export function getDb(): DatabaseConnection {
  if (globalThis.__tokyoTesterDb) {
    return globalThis.__tokyoTesterDb;
  }

  const config = assertDatabaseConfig();

  if (config.type === "postgres") {
    const databaseUrl = config.databaseUrl;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be set when DB_TYPE=postgres");
    }

    const client = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });

    const db = drizzlePostgres(client);

    globalThis.__tokyoTesterDb = {
      type: "postgres",
      db,
      client,
      tables: {
        users: pgUsers,
        projects: pgProjects,
        projectMembers: pgProjectMembers,
        accounts: pgAccounts,
        agentTokens: pgAgentTokens,
        sessions: pgSessions,
        verificationTokens: pgVerificationTokens,
      },
    };

    return globalThis.__tokyoTesterDb;
  }

  if (config.type === "mysql") {
    const databaseUrl = config.databaseUrl;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be set when DB_TYPE=mysql");
    }

    const client = mysql.createPool({ uri: databaseUrl });
    // biome-ignore lint/suspicious/noExplicitAny: drizzle-orm/mysql2's overload is narrower than mysql2's promise pool type here.
    const db = drizzleMySQL(client as any);

    globalThis.__tokyoTesterDb = {
      type: "mysql",
      db,
      client,
      tables: {
        users: mysqlUsers,
        projects: mysqlProjects,
        projectMembers: mysqlProjectMembers,
        accounts: mysqlAccounts,
        agentTokens: mysqlAgentTokens,
        sessions: mysqlSessions,
        verificationTokens: mysqlVerificationTokens,
      },
    };

    return globalThis.__tokyoTesterDb;
  }

  const client = new Database(config.sqlitePath);
  client.pragma("journal_mode = WAL");
  const db = drizzleSqlite(client);

  globalThis.__tokyoTesterDb = {
    type: "sqlite",
    db,
    client,
    tables: {
      users: sqliteUsers,
      projects: sqliteProjects,
      projectMembers: sqliteProjectMembers,
      accounts: sqliteAccounts,
      agentTokens: sqliteAgentTokens,
      sessions: sqliteSessions,
      verificationTokens: sqliteVerificationTokens,
    },
  };

  return globalThis.__tokyoTesterDb;
}
