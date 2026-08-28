import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } from "@/lib/cookie-names";

export { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME };
const SESSION_TTL_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt, userAgent: meta.userAgent, ipAddress: meta.ip },
  });

  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.deletedAt || session.user.status !== "ACTIVE") return null;

  return session.user;
}

export async function destroySession(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}

export function generateCsrfToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return getSessionUser(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function assertCsrf(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}
