"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addUsersToProject,
  removeUserFromProject,
  updateProjectMemberRole,
  userHasProjectPermission,
} from "./server/service";
import type { ProjectRole } from "./types";

async function requireMemberManager(projectId: string) {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await userHasProjectPermission(
      session.user.id,
      projectId,
      "manage",
      session.user.role,
    ))
  ) {
    throw new Error("You do not have permission to manage this team.");
  }
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

export async function addTeamMembersAction(formData: FormData) {
  const projectId = value(formData, "projectId");
  await requireMemberManager(projectId);
  const userIds = formData
    .getAll("userIds")
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  await addUsersToProject(projectId, userIds, "runner");
  revalidatePath(`/projects/${projectId}/members`);
}

export async function updateTeamMemberRoleAction(formData: FormData) {
  const projectId = value(formData, "projectId");
  const userId = value(formData, "userId");
  const role = value(formData, "projectRole") as ProjectRole;
  await requireMemberManager(projectId);
  if (!(["owner", "editor", "runner"] as string[]).includes(role)) {
    throw new Error("Invalid project role.");
  }
  await updateProjectMemberRole(projectId, userId, role);
  revalidatePath(`/projects/${projectId}/members`);
}

export async function removeTeamMemberAction(formData: FormData) {
  const projectId = value(formData, "projectId");
  const userId = value(formData, "userId");
  await requireMemberManager(projectId);
  await removeUserFromProject(projectId, userId);
  revalidatePath(`/projects/${projectId}/members`);
}
