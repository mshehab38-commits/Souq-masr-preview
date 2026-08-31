import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getVerificationRequests } from "@/modules/identity/verification";

const createdUserIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeRequest(userId: string) {
  return prisma.verificationRequest.create({
    data: { userId, type: "INDIVIDUAL_SELLER" },
  });
}

async function cleanup() {
  await prisma.verificationRequest.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
}

describe("getVerificationRequests", () => {
  afterEach(cleanup);

  it("paginates results and reports accurate totals", async () => {
    const user = await makeUser();
    for (let i = 0; i < 5; i++) {
      await makeRequest(user.id);
    }

    const firstPage = await getVerificationRequests(user.id, { limit: 2, page: 1 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.totalCount).toBe(5);
    expect(firstPage.totalPages).toBe(3);
    expect(firstPage.page).toBe(1);

    const lastPage = await getVerificationRequests(user.id, { limit: 2, page: 3 });
    expect(lastPage.items).toHaveLength(1);
  });

  it("never returns another user's verification requests", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await makeRequest(other.id);

    const result = await getVerificationRequests(user.id, {});
    expect(result.items).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });

  it("clamps an out-of-range limit to the maximum", async () => {
    const user = await makeUser();
    await makeRequest(user.id);

    const result = await getVerificationRequests(user.id, { limit: 10_000 });
    expect(result.items).toHaveLength(1);
  });
});
