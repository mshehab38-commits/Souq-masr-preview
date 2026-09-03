import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listAuditLogs } from "@/lib/audit";

const createdUserIds: string[] = [];
const createdLogIds: string[] = [];

// Unique per test run, so parallel test files never see each other's rows
// (this codebase's DB is shared across parallel test files — see
// CLAUDE.md Section 10 on race conditions in the test suite).
const runId = Math.random().toString(36).slice(2);
function actionFor(name: string) {
  return `test.audit.${runId}.${name}`;
}

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeLog(overrides: {
  action: string;
  actorId?: string;
  actorType?: "USER" | "SYSTEM";
  targetType?: string;
  createdAt?: Date;
}) {
  const log = await prisma.auditLog.create({
    data: {
      action: overrides.action,
      actorId: overrides.actorId,
      actorType: overrides.actorType ?? "USER",
      targetType: overrides.targetType,
      createdAt: overrides.createdAt,
    },
  });
  createdLogIds.push(log.id);
  return log;
}

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { id: { in: createdLogIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdLogIds.length = 0;
  createdUserIds.length = 0;
}

describe("listAuditLogs", () => {
  afterEach(cleanup);

  it("paginates and reports correct totals", async () => {
    for (let i = 0; i < 3; i++) {
      await makeLog({ action: actionFor(`pagination.${i}`) });
    }

    const result = await listAuditLogs({ action: actionFor("pagination"), limit: 2, page: 1 });
    expect(result.items).toHaveLength(2);
    expect(result.totalCount).toBe(3);
    expect(result.totalPages).toBe(2);

    const secondPage = await listAuditLogs({ action: actionFor("pagination"), limit: 2, page: 2 });
    expect(secondPage.items).toHaveLength(1);
  });

  it("orders newest first by default", async () => {
    const older = await makeLog({ action: actionFor("order"), createdAt: new Date(Date.now() - 60_000) });
    const newer = await makeLog({ action: actionFor("order"), createdAt: new Date() });

    const result = await listAuditLogs({ action: actionFor("order") });
    expect(result.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  it("filters by action as a case-insensitive substring match", async () => {
    const match = await makeLog({ action: actionFor("Settings.Update") });
    await makeLog({ action: actionFor("shipping_rate.upsert") });

    const result = await listAuditLogs({ action: actionFor("settings.update").toLowerCase() });
    expect(result.items.map((item) => item.id)).toEqual([match.id]);
  });

  it("filters by targetType with an exact match", async () => {
    const match = await makeLog({ action: actionFor("target.a"), targetType: "PlatformSettings" });
    await makeLog({ action: actionFor("target.b"), targetType: "ShippingCompany" });

    const result = await listAuditLogs({ action: actionFor("target"), targetType: "PlatformSettings" });
    expect(result.items.map((item) => item.id)).toEqual([match.id]);
  });

  it("joins the actor's name/phone when actorId is set", async () => {
    const user = await makeUser();
    const log = await makeLog({ action: actionFor("actor.present"), actorId: user.id });

    const result = await listAuditLogs({ action: actionFor("actor.present") });
    expect(result.items[0]?.id).toBe(log.id);
    expect(result.items[0]?.actor?.phone).toBe(user.phone);
  });

  it("returns a null actor for a SYSTEM-initiated entry with no actorId", async () => {
    await makeLog({ action: actionFor("actor.system"), actorType: "SYSTEM" });

    const result = await listAuditLogs({ action: actionFor("actor.system") });
    expect(result.items[0]?.actor).toBeNull();
    expect(result.items[0]?.actorType).toBe("SYSTEM");
  });
});
