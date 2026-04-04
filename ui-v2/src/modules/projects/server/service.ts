import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import type {
  ProjectMemberUser,
  ProjectMembership,
  ProjectSummary,
} from "../types";

function toIsoString(value: Date | number | string | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return new Date().toISOString();
}

function mapProject(record: Record<string, unknown>): ProjectSummary {
  return {
    id: String(record.id),
    name: String(record.name),
    createdBy: String(record.createdBy),
    createdAt: toIsoString(
      (record.createdAt as Date | number | string | undefined) ?? null,
    ),
    updatedAt: toIsoString(
      (record.updatedAt as Date | number | string | undefined) ?? null,
    ),
  };
}

export async function listProjectsForUser(
  userId: string,
  role?: string | null,
): Promise<ProjectMembership[]> {
  const connection = getDb();

  if (connection.type === "postgres") {
    const rows =
      role === "admin"
        ? await connection.db.select().from(connection.tables.projects)
        : await connection.db
            .select({
              id: connection.tables.projects.id,
              name: connection.tables.projects.name,
              createdBy: connection.tables.projects.createdBy,
              createdAt: connection.tables.projects.createdAt,
              updatedAt: connection.tables.projects.updatedAt,
            })
            .from(connection.tables.projects)
            .innerJoin(
              connection.tables.projectMembers,
              eq(
                connection.tables.projects.id,
                connection.tables.projectMembers.projectId,
              ),
            )
            .where(eq(connection.tables.projectMembers.userId, userId));

    return rows
      .map((row) => mapProject(row as Record<string, unknown>))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  const projectRows =
    role === "admin"
      ? connection.db.select().from(connection.tables.projects).all()
      : connection.db
          .select({
            id: connection.tables.projects.id,
            name: connection.tables.projects.name,
            createdBy: connection.tables.projects.createdBy,
            createdAt: connection.tables.projects.createdAt,
            updatedAt: connection.tables.projects.updatedAt,
          })
          .from(connection.tables.projects)
          .innerJoin(
            connection.tables.projectMembers,
            eq(
              connection.tables.projects.id,
              connection.tables.projectMembers.projectId,
            ),
          )
          .where(eq(connection.tables.projectMembers.userId, userId))
          .all();

  return projectRows
    .map((row) => mapProject(row as Record<string, unknown>))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createProject(
  name: string,
  adminUserId: string,
): Promise<ProjectSummary> {
  const connection = getDb();
  const now = new Date();
  const projectId = randomUUID();

  if (connection.type === "postgres") {
    const result = await connection.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(connection.tables.projects)
        .values({
          id: projectId,
          name: name.trim(),
          createdBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(connection.tables.projectMembers).values({
        projectId,
        userId: adminUserId,
        createdAt: now,
      });

      return inserted[0];
    });

    return mapProject(result as Record<string, unknown>);
  }

  connection.client.transaction(() => {
    connection.db
      .insert(connection.tables.projects)
      .values({
        id: projectId,
        name: name.trim(),
        createdBy: adminUserId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    connection.db
      .insert(connection.tables.projectMembers)
      .values({
        projectId,
        userId: adminUserId,
        createdAt: now,
      })
      .run();
  })();

  return {
    id: projectId,
    name: name.trim(),
    createdBy: adminUserId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMemberUser[]> {
  const connection = getDb();

  if (connection.type === "postgres") {
    const rows = await connection.db
      .select({
        id: connection.tables.users.id,
        email: connection.tables.users.email,
        name: connection.tables.users.name,
        role: connection.tables.users.role,
        isActive: connection.tables.users.isActive,
      })
      .from(connection.tables.projectMembers)
      .innerJoin(
        connection.tables.users,
        eq(connection.tables.projectMembers.userId, connection.tables.users.id),
      )
      .where(eq(connection.tables.projectMembers.projectId, projectId));

    return rows.sort((left, right) => left.email.localeCompare(right.email));
  }

  const rows = connection.db
    .select({
      id: connection.tables.users.id,
      email: connection.tables.users.email,
      name: connection.tables.users.name,
      role: connection.tables.users.role,
      isActive: connection.tables.users.isActive,
    })
    .from(connection.tables.projectMembers)
    .innerJoin(
      connection.tables.users,
      eq(connection.tables.projectMembers.userId, connection.tables.users.id),
    )
    .where(eq(connection.tables.projectMembers.projectId, projectId))
    .all();

  return rows
    .map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
    .sort((left, right) => left.email.localeCompare(right.email));
}

export async function addUsersToProject(
  projectId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  const connection = getDb();
  const now = new Date();

  if (connection.type === "postgres") {
    const members = userIds.map((userId) => ({
      projectId,
      userId,
      createdAt: now,
    }));

    await connection.db
      .insert(connection.tables.projectMembers)
      .values(members)
      .onConflictDoNothing();
    return;
  }

  for (const userId of userIds) {
    connection.db
      .insert(connection.tables.projectMembers)
      .values({
        projectId,
        userId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

export async function removeUserFromProject(
  projectId: string,
  userId: string,
): Promise<void> {
  const connection = getDb();

  if (connection.type === "postgres") {
    await connection.db
      .delete(connection.tables.projectMembers)
      .where(
        and(
          eq(connection.tables.projectMembers.projectId, projectId),
          eq(connection.tables.projectMembers.userId, userId),
        ),
      );
    return;
  }

  connection.db
    .delete(connection.tables.projectMembers)
    .where(
      and(
        eq(connection.tables.projectMembers.projectId, projectId),
        eq(connection.tables.projectMembers.userId, userId),
      ),
    )
    .run();
}

export async function userHasProjectAccess(
  userId: string,
  projectId: string,
  role?: string | null,
): Promise<boolean> {
  if (role === "admin") {
    return true;
  }

  const projects = await listProjectsForUser(userId, role);
  return projects.some((project) => project.id === projectId);
}

export async function listUnassignedUsersForProject(
  projectId: string,
): Promise<ProjectMemberUser[]> {
  const connection = getDb();
  const members = await listProjectMembers(projectId);
  const memberIds = new Set(members.map((member) => member.id));

  if (connection.type === "postgres") {
    const rows = await connection.db.select().from(connection.tables.users);
    return rows
      .filter((row) => !memberIds.has(row.id))
      .map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        isActive: row.isActive,
      }))
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  const rows = connection.db.select().from(connection.tables.users).all();
  return rows
    .filter((row) => !memberIds.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      role: String(row.role),
      isActive: Boolean(row.isActive),
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}
