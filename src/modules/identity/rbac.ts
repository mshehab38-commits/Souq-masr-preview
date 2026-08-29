import type { UserRole } from "@prisma/client";
import { getCurrentUser } from "./session";

export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role);
}

// Shared guard for admin-only API routes (settings, subscription plans,
// shipping configuration, and future admin surfaces) so each route doesn't
// re-implement the same role check.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, ["ADMIN"])) return null;
  return user;
}

// Broader guard for moderation surfaces (reports queue, verification
// review, browsing the user directory) that a MODERATOR should be able to
// reach without full ADMIN authority. Routes that change a user's
// status/role stay behind `requireAdmin()` specifically — this guard is
// intentionally the looser of the two.
export async function requireModerator() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, ["ADMIN", "MODERATOR"])) return null;
  return user;
}
