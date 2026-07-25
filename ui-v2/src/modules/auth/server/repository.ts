import { eq, sql } from "drizzle-orm";
import { type DatabaseConnection, getDb } from "@/db";
import type { AuthUser, UserListItem } from "../types";

type UserRow = Record<string, unknown> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

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
  const result = await connection.db
    .select({ count: sql<number>`count(*)` })
    .from(connection.tables.users);

  return Number(result[0]?.count ?? 0);
}

export async function countUsers(): Promise<number> {
  return countUsersWithConnection(getDb());
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const connection = getDb();

  const rows = await connection.db
    .select()
    .from(connection.tables.users)
    .where(eq(connection.tables.users.email, email))
    .limit(1);

  return mapUser(rows[0] as Record<string, unknown> | undefined);
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const connection = getDb();

  const rows = await connection.db
    .select()
    .from(connection.tables.users)
    .where(eq(connection.tables.users.id, id))
    .limit(1);

  return mapUser(rows[0] as Record<string, unknown> | undefined);
}

export async function listUsers(): Promise<UserListItem[]> {
  const connection = getDb();

  const rows = await connection.db.select().from(connection.tables.users);

  return rows
    .map((row: UserRow) => ({
      ...(mapUser(row as Record<string, unknown>) as AuthUser),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    .sort((left: UserListItem, right: UserListItem) =>
      String(left.email).localeCompare(String(right.email)),
    );
}

export async function updateUserTimestamp(id: string): Promise<void> {
  const connection = getDb();

  await connection.db
    .update(connection.tables.users)
    .set({ updatedAt: new Date() })
    .where(eq(connection.tables.users.id, id));
}

export async function updateUserStatus(
  id: string,
  isActive: boolean,
): Promise<void> {
  const connection = getDb();
  const payload = { isActive, updatedAt: new Date() };

  await connection.db
    .update(connection.tables.users)
    .set(payload)
    .where(eq(connection.tables.users.id, id));
}

export { countUsersWithConnection };
