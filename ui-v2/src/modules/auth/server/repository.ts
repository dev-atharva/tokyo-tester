import { eq, sql } from "drizzle-orm";
import { type DatabaseConnection, getDb } from "@/db";
import type { AuthUser } from "../types";

function mapUser(record: Record<string, unknown> | undefined): AuthUser | null {
  if (!record) {
    return null;
  }

  return {
    id: String(record.id),
    email: String(record.email),
    name: record.name ? String(record.name) : null,
    role: String(record.role ?? "normal"),
    isActive: Boolean(record.isActive),
    passwordHash: record.passwordHash ? String(record.passwordHash) : null,
  };
}

async function countUsersWithConnection(
  connection: DatabaseConnection,
): Promise<number> {
  if (connection.type === "postgres") {
    const result = await connection.db
      .select({ count: sql<number>`count(*)` })
      .from(connection.tables.users);

    return Number(result[0]?.count ?? 0);
  }

  const result = connection.db
    .select({ count: sql<number>`count(*)` })
    .from(connection.tables.users)
    .get();

  return Number(result?.count ?? 0);
}

export async function countUsers(): Promise<number> {
  return countUsersWithConnection(getDb());
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const connection = getDb();

  if (connection.type === "postgres") {
    const rows = await connection.db
      .select()
      .from(connection.tables.users)
      .where(eq(connection.tables.users.email, email))
      .limit(1);

    return mapUser(rows[0] as Record<string, unknown> | undefined);
  }

  const row = connection.db
    .select()
    .from(connection.tables.users)
    .where(eq(connection.tables.users.email, email))
    .get();

  return mapUser(row as Record<string, unknown> | undefined);
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const connection = getDb();

  if (connection.type === "postgres") {
    const rows = await connection.db
      .select()
      .from(connection.tables.users)
      .where(eq(connection.tables.users.id, id))
      .limit(1);

    return mapUser(rows[0] as Record<string, unknown> | undefined);
  }

  const row = connection.db
    .select()
    .from(connection.tables.users)
    .where(eq(connection.tables.users.id, id))
    .get();

  return mapUser(row as Record<string, unknown> | undefined);
}

export async function updateUserTimestamp(id: string): Promise<void> {
  const connection = getDb();

  if (connection.type === "postgres") {
    await connection.db
      .update(connection.tables.users)
      .set({ updatedAt: new Date() })
      .where(eq(connection.tables.users.id, id));
    return;
  }

  connection.db
    .update(connection.tables.users)
    .set({ updatedAt: new Date() })
    .where(eq(connection.tables.users.id, id))
    .run();
}

export { countUsersWithConnection };
