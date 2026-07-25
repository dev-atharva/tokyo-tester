import { randomUUID } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import type {
  ProjectAction,
  ProjectKind,
  ProjectMembership,
  ProjectMemberUser,
  ProjectRole,
  ProjectSummary,
} from "../types";

const ROLE_ACTIONS: Record<ProjectRole, ProjectAction[]> = {
  owner: ["view", "edit", "run", "manage"],
  editor: ["view", "edit", "run"],
  runner: ["view", "run"],
};

export function allowedActionsForRole(role: ProjectRole): ProjectAction[] {
  return [...ROLE_ACTIONS[role]];
}

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
    kind: (record.kind as ProjectKind | undefined) ?? "team",
    createdBy: String(record.createdBy),
    createdAt: toIsoString(
      (record.createdAt as Date | number | string | undefined) ?? null,
    ),
    updatedAt: toIsoString(
      (record.updatedAt as Date | number | string | undefined) ?? null,
    ),
  };
}

function mapMembership(
  record: Record<string, unknown>,
  platformRole?: string | null,
): ProjectMembership {
  const projectRole =
    platformRole === "admin"
      ? "owner"
      : ((record.projectRole as ProjectRole | undefined) ?? "editor");
  return {
    ...mapProject(record),
    projectRole,
    allowedActions: allowedActionsForRole(projectRole),
  };
}

function sortMemberships(projects: ProjectMembership[]) {
  return projects.sort((left: ProjectMembership, right: ProjectMembership) => {
    if (left.kind !== right.kind) return left.kind === "personal" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export async function listProjectsForUser(
  userId: string,
  role?: string | null,
): Promise<ProjectMembership[]> {
  const connection = getDb();

  const rows =
    role === "admin"
      ? await connection.db
          .select()
          .from(connection.tables.projects)
          .where(
            or(
              eq(connection.tables.projects.kind, "team"),
              eq(connection.tables.projects.createdBy, userId),
            ),
          )
      : await connection.db
          .select({
            id: connection.tables.projects.id,
            name: connection.tables.projects.name,
            kind: connection.tables.projects.kind,
            createdBy: connection.tables.projects.createdBy,
            createdAt: connection.tables.projects.createdAt,
            updatedAt: connection.tables.projects.updatedAt,
            projectRole: connection.tables.projectMembers.role,
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

  return sortMemberships(
    rows.map((row: Record<string, unknown>) => mapMembership(row, role)),
  );
}

export async function createProject(
  name: string,
  adminUserId: string,
): Promise<ProjectSummary> {
  const connection = getDb();
  const now = new Date();
  const projectId = randomUUID();

  if (connection.type === "postgres") {
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction types are dialect-specific and selected at runtime.
    const result = await connection.db.transaction(async (tx: any) => {
      const inserted = await tx
        .insert(connection.tables.projects)
        .values({
          id: projectId,
          name: name.trim(),
          kind: "team",
          createdBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(connection.tables.projectMembers).values({
        projectId,
        userId: adminUserId,
        role: "owner",
        createdAt: now,
      });

      return inserted[0];
    });

    return mapProject(result as Record<string, unknown>);
  }

  if (connection.type === "mysql") {
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction types are dialect-specific and selected at runtime.
    const result = await connection.db.transaction(async (tx: any) => {
      await tx.insert(connection.tables.projects).values({
        id: projectId,
        name: name.trim(),
        kind: "team",
        createdBy: adminUserId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(connection.tables.projectMembers).values({
        projectId,
        userId: adminUserId,
        role: "owner",
        createdAt: now,
      });

      const rows = await tx
        .select()
        .from(connection.tables.projects)
        .where(eq(connection.tables.projects.id, projectId))
        .limit(1);

      return rows[0];
    });

    return mapProject(result as Record<string, unknown>);
  }

  throw new Error("Unsupported database type");
}

export async function ensurePersonalProject(
  userId: string,
): Promise<ProjectMembership> {
  const connection = getDb();
  const now = new Date();

  const findExisting = async () => {
    const rows = await connection.db
      .select()
      .from(connection.tables.projects)
      .where(
        and(
          eq(connection.tables.projects.createdBy, userId),
          eq(connection.tables.projects.kind, "personal"),
        ),
      )
      .limit(1);
    return rows[0];
  };

  let project = await findExisting();
  if (!project) {
    const projectId = randomUUID();
    const values = {
      id: projectId,
      name: "Personal",
      kind: "personal" as const,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    if (connection.type === "postgres") {
      await connection.db
        .insert(connection.tables.projects)
        .values(values)
        .onConflictDoNothing();
    } else if (connection.type === "mysql") {
      await connection.db
        .insert(connection.tables.projects)
        .values(values)
        .onDuplicateKeyUpdate({
          set: { id: sql`${connection.tables.projects.id}` },
        });
    }
    project = await findExisting();
  }

  if (!project) throw new Error("Unable to create personal workspace");
  const membership = {
    projectId: project.id,
    userId,
    role: "owner" as const,
    createdAt: now,
  };
  if (connection.type === "postgres") {
    await connection.db
      .insert(connection.tables.projectMembers)
      .values(membership)
      .onConflictDoUpdate({
        target: [
          connection.tables.projectMembers.projectId,
          connection.tables.projectMembers.userId,
        ],
        set: { role: "owner" },
      });
  } else if (connection.type === "mysql") {
    await connection.db
      .insert(connection.tables.projectMembers)
      .values(membership)
      .onDuplicateKeyUpdate({
        set: { role: "owner" },
      });
  }
  return mapMembership(
    { ...(project as Record<string, unknown>), projectRole: "owner" },
    null,
  );
}

export async function getProject(
  projectId: string,
): Promise<ProjectSummary | null> {
  const connection = getDb();
  const row = (
    await connection.db
      .select()
      .from(connection.tables.projects)
      .where(eq(connection.tables.projects.id, projectId))
      .limit(1)
  )[0];
  return row ? mapProject(row as Record<string, unknown>) : null;
}

export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMemberUser[]> {
  const connection = getDb();

  const rows = await connection.db
    .select({
      id: connection.tables.users.id,
      email: connection.tables.users.email,
      name: connection.tables.users.name,
      role: connection.tables.users.role,
      projectRole: connection.tables.projectMembers.role,
      isActive: connection.tables.users.isActive,
    })
    .from(connection.tables.projectMembers)
    .innerJoin(
      connection.tables.users,
      eq(connection.tables.projectMembers.userId, connection.tables.users.id),
    )
    .where(eq(connection.tables.projectMembers.projectId, projectId));

  return rows.sort((left: ProjectMemberUser, right: ProjectMemberUser) =>
    left.email.localeCompare(right.email),
  );
}

export async function addUsersToProject(
  projectId: string,
  userIds: string[],
  projectRole: ProjectRole = "runner",
): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  const connection = getDb();
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.kind === "personal") {
    throw new Error("Personal workspaces cannot have additional members");
  }
  const now = new Date();

  if (connection.type === "postgres") {
    const members = userIds.map((userId) => ({
      projectId,
      userId,
      role: projectRole,
      createdAt: now,
    }));

    await connection.db
      .insert(connection.tables.projectMembers)
      .values(members)
      .onConflictDoNothing();
    return;
  }

  if (connection.type === "mysql") {
    for (const userId of userIds) {
      await connection.db
        .insert(connection.tables.projectMembers)
        .values({
          projectId,
          userId,
          role: projectRole,
          createdAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            userId: sql`${connection.tables.projectMembers.userId}`,
          },
        });
    }
    return;
  }

  throw new Error("Unsupported database type");
}

export async function removeUserFromProject(
  projectId: string,
  userId: string,
): Promise<void> {
  const connection = getDb();
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.kind === "personal") {
    throw new Error("Personal workspace ownership cannot be changed");
  }
  const members = await listProjectMembers(projectId);
  const target = members.find((member) => member.id === userId);
  if (
    target?.projectRole === "owner" &&
    members.filter((member) => member.projectRole === "owner").length <= 1
  ) {
    throw new Error("The final team owner cannot be removed");
  }

  await connection.db
    .delete(connection.tables.projectMembers)
    .where(
      and(
        eq(connection.tables.projectMembers.projectId, projectId),
        eq(connection.tables.projectMembers.userId, userId),
      ),
    );
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  projectRole: ProjectRole,
): Promise<void> {
  const connection = getDb();
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.kind === "personal") {
    throw new Error("Personal workspace ownership cannot be changed");
  }
  const members = await listProjectMembers(projectId);
  const target = members.find((member) => member.id === userId);
  if (!target) throw new Error("Project member not found");
  if (
    target.projectRole === "owner" &&
    projectRole !== "owner" &&
    members.filter((member) => member.projectRole === "owner").length <= 1
  ) {
    throw new Error("The final team owner cannot be demoted");
  }
  const where = and(
    eq(connection.tables.projectMembers.projectId, projectId),
    eq(connection.tables.projectMembers.userId, userId),
  );
  await connection.db
    .update(connection.tables.projectMembers)
    .set({ role: projectRole })
    .where(where);
}

export async function getProjectMembership(
  userId: string,
  projectId: string,
  platformRole?: string | null,
): Promise<ProjectMembership | null> {
  if (platformRole === "admin") {
    const project = await getProject(projectId);
    return project
      ? {
          ...project,
          projectRole: "owner",
          allowedActions: allowedActionsForRole("owner"),
        }
      : null;
  }
  const projects = await listProjectsForUser(userId, platformRole);
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function userHasProjectPermission(
  userId: string,
  projectId: string,
  action: ProjectAction,
  platformRole?: string | null,
): Promise<boolean> {
  const membership = await getProjectMembership(
    userId,
    projectId,
    platformRole,
  );
  return membership?.allowedActions.includes(action) ?? false;
}

export async function userHasProjectAccess(
  userId: string,
  projectId: string,
  role?: string | null,
): Promise<boolean> {
  return userHasProjectPermission(userId, projectId, "view", role);
}

export async function listUnassignedUsersForProject(
  projectId: string,
): Promise<ProjectMemberUser[]> {
  const connection = getDb();
  const members = await listProjectMembers(projectId);
  const memberIds = new Set(members.map((member) => member.id));

  const rows = await connection.db.select().from(connection.tables.users);
  return rows
    .filter((row: Record<string, unknown>) => !memberIds.has(String(row.id)))
    .map((row: Record<string, unknown>) => ({
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      role: String(row.role),
      isActive: Boolean(row.isActive),
    }))
    .sort((left: ProjectMemberUser, right: ProjectMemberUser) =>
      left.email.localeCompare(right.email),
    );
}
