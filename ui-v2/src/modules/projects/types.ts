export type ProjectKind = "personal" | "team";
export type ProjectRole = "owner" | "editor" | "runner";
export type ProjectAction = "view" | "edit" | "run" | "manage";

export interface ProjectSummary {
  id: string;
  name: string;
  kind: ProjectKind;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMembership extends ProjectSummary {
  memberCount?: number;
  projectRole: ProjectRole;
  allowedActions: ProjectAction[];
}

export interface ProjectMemberUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  projectRole?: ProjectRole;
  isActive: boolean;
}
