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

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
}

export interface UserListItem extends AuthUser {
  createdAt?: Date | number | null;
  updatedAt?: Date | number | null;
}

export interface AuthActionState {
  error: string | null;
  redirectTo?: string | null;
}
