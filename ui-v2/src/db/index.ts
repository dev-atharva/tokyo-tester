import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertDatabaseConfig } from "./env";
import {
  pgAccounts,
  pgSessions,
  pgUsers,
  pgVerificationTokens,
} from "./schema/postgres";
import {
  sqliteAccounts,
  sqliteSessions,
  sqliteUsers,
  sqliteVerificationTokens,
} from "./schema/sqlite";

type SqliteDatabase = ReturnType<typeof drizzleSqlite>;
type PostgresDatabase = ReturnType<typeof drizzlePostgres>;

type SqliteConnection = {
  type: "sqlite";
  db: SqliteDatabase;
  client: InstanceType<typeof Database>;
  tables: {
    users: typeof sqliteUsers;
    accounts: typeof sqliteAccounts;
    sessions: typeof sqliteSessions;
    verificationTokens: typeof sqliteVerificationTokens;
  };
};

type PostgresConnection = {
  type: "postgres";
  db: PostgresDatabase;
  client: postgres.Sql;
  tables: {
    users: typeof pgUsers;
    accounts: typeof pgAccounts;
    sessions: typeof pgSessions;
    verificationTokens: typeof pgVerificationTokens;
  };
};

export type DatabaseConnection = SqliteConnection | PostgresConnection;

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
        accounts: pgAccounts,
        sessions: pgSessions,
        verificationTokens: pgVerificationTokens,
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
      accounts: sqliteAccounts,
      sessions: sqliteSessions,
      verificationTokens: sqliteVerificationTokens,
    },
  };

  return globalThis.__tokyoTesterDb;
}
