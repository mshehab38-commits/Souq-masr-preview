import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getPlatformSettings, updatePlatformSettings } from "@/modules/settings/settings";

const createdUserIds: string[] = [];

async function makeAdmin() {
  const user = await prisma.user.create({
    data: {
      phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      role: "ADMIN",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("settings module", () => {
  afterEach(async () => {
    // Reset the singleton back to its fail-open (unconfigured) state so
    // other test files never inherit a limit/bearer this suite set.
    await prisma.platformSettings.updateMany({
      where: { id: "singleton" },
      data: {
        freeListingActiveLimit: null,
        paymentProcessingFeeBearer: null,
        requirePrePublishReview: false,
        updatedBy: null,
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  it("lazily creates the singleton row with every financial field null (fail-open, never an invented default)", async () => {
    const settings = await getPlatformSettings();
    expect(settings.id).toBe("singleton");
    expect(settings.freeListingActiveLimit).toBeNull();
    expect(settings.paymentProcessingFeeBearer).toBeNull();
  });

  it("defaults requirePrePublishReview to false for a never-configured singleton (a real default, not fail-open null)", async () => {
    const settings = await getPlatformSettings();
    expect(settings.requirePrePublishReview).toBe(false);
  });

  it("lets an admin turn requirePrePublishReview on independently of other settings", async () => {
    const admin = await makeAdmin();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 10 });
    const updated = await updatePlatformSettings(admin.id, { requirePrePublishReview: true });
    expect(updated.requirePrePublishReview).toBe(true);
    expect(updated.freeListingActiveLimit).toBe(10);
  });

  it("returns the same singleton row on repeated reads, not a new one each time", async () => {
    const first = await getPlatformSettings();
    const second = await getPlatformSettings();
    expect(first.id).toBe(second.id);
    const count = await prisma.platformSettings.count();
    expect(count).toBe(1);
  });

  it("lets an admin set the free-listing limit and records who changed it", async () => {
    const admin = await makeAdmin();
    const updated = await updatePlatformSettings(admin.id, { freeListingActiveLimit: 5 });
    expect(updated.freeListingActiveLimit).toBe(5);
    expect(updated.updatedBy).toBe(admin.id);
  });

  it("lets an admin explicitly clear a previously-set value back to null", async () => {
    const admin = await makeAdmin();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 5 });
    const cleared = await updatePlatformSettings(admin.id, { freeListingActiveLimit: null });
    expect(cleared.freeListingActiveLimit).toBeNull();
  });

  it("sets the payment processing fee bearer independently of the listing limit", async () => {
    const admin = await makeAdmin();
    await updatePlatformSettings(admin.id, { freeListingActiveLimit: 10 });
    const updated = await updatePlatformSettings(admin.id, { paymentProcessingFeeBearer: "SELLER" });
    expect(updated.paymentProcessingFeeBearer).toBe("SELLER");
    expect(updated.freeListingActiveLimit).toBe(10);
  });
});
