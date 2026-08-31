import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { pruneExpiredAuthRows } from "@/jobs/auth-row-pruning";

const createdUserIds: string[] = [];
const createdOtpPhones: string[] = [];

function randomPhone() {
  return `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

async function makeUser() {
  const user = await prisma.user.create({ data: { phone: randomPhone() } });
  createdUserIds.push(user.id);
  return user;
}

async function makeOtpCode(overrides: Record<string, unknown> = {}) {
  const phone = randomPhone();
  createdOtpPhones.push(phone);
  return prisma.otpCode.create({
    data: { phone, codeHash: "hash", expiresAt: new Date(Date.now() + 60_000), ...overrides },
  });
}

async function makeSession(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.session.create({
    data: {
      userId,
      tokenHash: `hash-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    },
  });
}

describe("pruneExpiredAuthRows", () => {
  afterEach(async () => {
    await prisma.otpCode.deleteMany({ where: { phone: { in: createdOtpPhones } } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdOtpPhones.length = 0;
  });

  it("deletes an expired OtpCode but leaves a live one untouched", async () => {
    const expired = await makeOtpCode({ expiresAt: new Date(Date.now() - 60_000) });
    const live = await makeOtpCode();

    const result = await pruneExpiredAuthRows();
    expect(result.otpCodes).toBeGreaterThanOrEqual(1);

    expect(await prisma.otpCode.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.otpCode.findUnique({ where: { id: live.id } })).not.toBeNull();
  });

  it("deletes an expired Session but leaves a live one untouched", async () => {
    const user = await makeUser();
    const expired = await makeSession(user.id, { expiresAt: new Date(Date.now() - 60_000) });
    const live = await makeSession(user.id);

    const result = await pruneExpiredAuthRows();
    expect(result.sessions).toBeGreaterThanOrEqual(1);

    expect(await prisma.session.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: live.id } })).not.toBeNull();
  });
});
