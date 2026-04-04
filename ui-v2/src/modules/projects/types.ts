export interface ProjectSummary {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMembership extends ProjectSummary {
  memberCount?: number;
}

export interface ProjectMemberUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
}
