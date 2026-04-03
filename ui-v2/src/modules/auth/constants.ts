export const USER_ROLES = ["admin", "normal"] as const;

export type KnownUserRole = (typeof USER_ROLES)[number];
export type UserRole = string;

export const DEFAULT_USER_ROLE: KnownUserRole = "normal";
export const ADMIN_USER_ROLE: KnownUserRole = "admin";

export function isKnownUserRole(role: string): role is KnownUserRole {
  return USER_ROLES.includes(role as KnownUserRole);
}
