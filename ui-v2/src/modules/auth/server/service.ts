import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ADMIN_USER_ROLE, DEFAULT_USER_ROLE, isKnownUserRole } from "../constants";
import type {
  AuthUser,
  CreateInitialAdminInput,
  CreateUserInput,
  UserListItem,
} from "../types";
import { hashPassword, verifyPassword } from "./password";
import {
  countUsers,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUserStatus,
} from "./repository";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isSetupComplete(): Promise<boolean> {
  return (await countUsers()) > 0;
}

export async function verifyPasswordLogin(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const user = await getUserByEmail(normalizeEmail(email));

  if (!user || !user.isActive) {
    return null;
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return null;
  }

  return user;
}

export async function createInitialAdmin(
  input: CreateInitialAdminInput,
): Promise<AuthUser> {
  const connection = getDb();
  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const now = new Date();

  if (connection.type === "postgres") {
    const user = await connection.db.transaction(async (tx) => {
      const existingUsers = await tx
        .select({ count: sql<number>`count(*)` })
        .from(connection.tables.users);

      if (Number(existingUsers[0]?.count ?? 0) > 0) {
        throw new Error("Initial setup has already been completed.");
      }

      const inserted = await tx
        .insert(connection.tables.users)
        .values({
          id: userId,
          email: normalizedEmail,
          name: input.name.trim(),
          passwordHash,
          role: ADMIN_USER_ROLE,
          isActive: true,
          setupCompletedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return inserted[0];
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      passwordHash: user.passwordHash,
    };
  }

  const user = connection.client.transaction(() => {
    const existingUsers = connection.client
      .prepare('SELECT count(*) as count FROM "user"')
      .get() as { count: number };

    if (Number(existingUsers.count ?? 0) > 0) {
      throw new Error("Initial setup has already been completed.");
    }

    connection.db
      .insert(connection.tables.users)
      .values({
        id: userId,
        email: normalizedEmail,
        name: input.name.trim(),
        passwordHash,
        role: ADMIN_USER_ROLE,
        isActive: true,
        setupCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return connection.db
      .select()
      .from(connection.tables.users)
      .where(eq(connection.tables.users.id, userId))
      .get();
  })();

  return {
    id: String(user.id),
    email: String(user.email),
    name: user.name ? String(user.name) : null,
    role: String(user.role),
    isActive: Boolean(user.isActive),
    passwordHash: user.passwordHash ? String(user.passwordHash) : null,
  };
}

export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  const connection = getDb();
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await getUserByEmail(normalizedEmail);

  if (existing) {
    throw new Error("A user with that email already exists.");
  }

  if (!isKnownUserRole(input.role)) {
    throw new Error("Unsupported user role.");
  }

  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const now = new Date();

  if (connection.type === "postgres") {
    const inserted = await connection.db
      .insert(connection.tables.users)
      .values({
        id: userId,
        email: normalizedEmail,
        name: input.name.trim(),
        passwordHash,
        role: input.role || DEFAULT_USER_ROLE,
        isActive: input.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const user = inserted[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      passwordHash: user.passwordHash,
    };
  }

  connection.db
    .insert(connection.tables.users)
    .values({
      id: userId,
      email: normalizedEmail,
      name: input.name.trim(),
      passwordHash,
      role: input.role || DEFAULT_USER_ROLE,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const user = await getUserById(userId);
  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
}

export async function setUserActiveState(
  userId: string,
  isActive: boolean,
): Promise<void> {
  await updateUserStatus(userId, isActive);
}

export async function getAllUsers(): Promise<UserListItem[]> {
  return listUsers();
}

export { countUsers, getUserByEmail, getUserById };
