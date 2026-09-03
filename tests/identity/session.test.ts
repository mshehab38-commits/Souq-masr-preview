import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createSession, getSessionUser, destroySession, generateCsrfToken } from "@/modules/identity/session";

const createdUserIds: string[] = [];

function randomPhone() {
  return `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

async function makeUser(overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({ data: { phone: randomPhone(), ...overrides } });
  createdUserIds.push(user.id);
  return user;
}

async function cleanup() {
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
}

describe("createSession / getSessionUser", () => {
  afterEach(cleanup);

  it("creates a real session row and returns a token with a ~30 day expiry", async () => {
    const user = await makeUser();
    const { token, expiresAt } = await createSession(user.id, {});

    expect(token.length).toBeGreaterThan(0);
    const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(29);
    expect(daysUntilExpiry).toBeLessThan(31);

    const row = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(row).not.toBeNull();
    expect(row?.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it("resolves the user for a valid, unexpired, unrevoked session token", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});

    const resolved = await getSessionUser(token);
    expect(resolved?.id).toBe(user.id);
  });

  it("returns null for an unknown/garbage token", async () => {
    expect(await getSessionUser("this-token-does-not-exist")).toBeNull();
  });

  it("returns null for undefined input", async () => {
    expect(await getSessionUser(undefined)).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null for a revoked session", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null when the underlying user has deletedAt set", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null when the underlying user's status is SUSPENDED", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });

    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null when the underlying user's status is BANNED", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});
    await prisma.user.update({ where: { id: user.id }, data: { status: "BANNED" } });

    expect(await getSessionUser(token)).toBeNull();
  });
});

describe("destroySession", () => {
  afterEach(cleanup);

  it("revokes the session so a subsequent lookup with the same token returns null", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, {});
    expect(await getSessionUser(token)).not.toBeNull();

    await destroySession(token);

    expect(await getSessionUser(token)).toBeNull();
    const row = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(row?.revokedAt).not.toBeNull();
  });
});

describe("generateCsrfToken", () => {
  it("returns a non-empty base64url string", () => {
    const token = generateCsrfToken();
    expect(token.length).toBeGreaterThan(0);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different value on each call", () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
});
