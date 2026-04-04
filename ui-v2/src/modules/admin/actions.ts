"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/modules/auth/server/guards";
import { createUser, normalizeEmail, setUserActiveState } from "@/modules/auth/server/service";
import type { AdminActionState } from "@/modules/admin/state";
import {
  addUsersToProject,
  createProject,
  removeUserFromProject,
} from "@/modules/projects/server/service";

function readTrimmedString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createUserAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminSession();

    const email = normalizeEmail(readTrimmedString(formData, "email"));
    const name = readTrimmedString(formData, "name");
    const password = readTrimmedString(formData, "password");
    const role = readTrimmedString(formData, "role") || "normal";

    if (!email || !name || password.length < 8) {
      return {
        error: "Name, email, and a password of at least 8 characters are required.",
        success: null,
      };
    }

    await createUser({
      email,
      name,
      password,
      role,
      isActive: true,
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/projects");

    return {
      error: null,
      success: `Created ${email} successfully.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create the user.",
      success: null,
    };
  }
}

export async function toggleUserActiveAction(formData: FormData) {
  try {
    await requireAdminSession();

    const userId = readTrimmedString(formData, "userId");
    const nextState = readTrimmedString(formData, "nextState") === "active";

    if (!userId) {
      return;
    }

    await setUserActiveState(userId, nextState);
    revalidatePath("/admin/users");
    revalidatePath("/admin/projects");
  } catch (error) {
    console.error("[Admin] Failed to toggle user state:", error);
  }
}

export async function createProjectAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const session = await requireAdminSession();
    const name = readTrimmedString(formData, "name");

    if (!name) {
      return {
        error: "Project name is required.",
        success: null,
      };
    }

    await createProject(name, session.user.id);
    revalidatePath("/admin/projects");

    return {
      error: null,
      success: `Created ${name} successfully.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create the project.",
      success: null,
    };
  }
}

export async function addProjectMembersAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminSession();
    const projectId = readTrimmedString(formData, "projectId");
    const selectedUsers = formData.getAll("userIds").filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

    if (!projectId || selectedUsers.length === 0) {
      return {
        error: "Project and at least one user are required.",
        success: null,
      };
    }

    await addUsersToProject(projectId, selectedUsers);
    revalidatePath("/admin/projects");

    return {
      error: null,
      success: `Added ${selectedUsers.length} member${selectedUsers.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to add members.",
      success: null,
    };
  }
}

export async function removeProjectMemberAction(formData: FormData) {
  try {
    await requireAdminSession();
    const projectId = readTrimmedString(formData, "projectId");
    const userId = readTrimmedString(formData, "userId");

    if (!projectId || !userId) {
      return;
    }

    await removeUserFromProject(projectId, userId);
    revalidatePath("/admin/projects");
  } catch (error) {
    console.error("[Admin] Failed to remove project member:", error);
  }
}
