import type { UserRole } from "@prisma/client";

export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role);
}
