import type { UserRole } from "./constants";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  passwordHash: string | null;
}

export interface CreateInitialAdminInput {
  email: string;
  name: string;
  password: string;
}

export interface AuthActionState {
  error: string | null;
  redirectTo?: string | null;
}
