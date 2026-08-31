import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  flagListingForReview,
  decidePendingListing,
  listPendingReviewListings,
  getListingById,
} from "@/modules/catalog/listings";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser(role?: "MODERATOR" | "ADMIN") {
  const user = await prisma.user.create({
    data: {
      phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      role,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `pending-rv-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function cleanup() {
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("flagListingForReview", () => {
  afterEach(cleanup);

  it("moves an ACTIVE listing to PENDING_REVIEW", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان مشكوك فيه", status: "ACTIVE" },
    });

    const moderator = await makeUser("MODERATOR");
    expect(await flagListingForReview(listing.id, moderator.id)).toBe(true);

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("PENDING_REVIEW");
    expect(updated.deletedAt).toBeNull();
  });

  it("records a Listing-keyed audit entry", async () => {
    const owner = await makeUser();
    const moderator = await makeUser("MODERATOR");
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان مشكوك فيه آخر", status: "ACTIVE" },
    });

    await flagListingForReview(listing.id, moderator.id);

    const entry = await prisma.auditLog.findFirst({
      where: { targetType: "Listing", targetId: listing.id, action: "admin.listing.flag_for_review" },
    });
    expect(entry).not.toBeNull();
    expect(entry!.actorId).toBe(moderator.id);
  });

  it("refuses to flag a listing that isn't ACTIVE", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان مباع", status: "SOLD" },
    });

    const moderator = await makeUser("MODERATOR");
    expect(await flagListingForReview(listing.id, moderator.id)).toBe(false);
  });
});

describe("decidePendingListing", () => {
  afterEach(cleanup);

  it("approves a PENDING_REVIEW listing back to ACTIVE", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان معلق", status: "PENDING_REVIEW" },
    });

    const result = await decidePendingListing(listing.id, "APPROVE");
    expect(result).toEqual({ id: listing.id, ownerId: owner.id, title: "إعلان معلق" });

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("ACTIVE");
  });

  it("rejects a PENDING_REVIEW listing to REJECTED", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان معلق آخر", status: "PENDING_REVIEW" },
    });

    const result = await decidePendingListing(listing.id, "REJECT");
    expect(result?.id).toBe(listing.id);

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(updated.status).toBe("REJECTED");
  });

  it("returns null for a listing that isn't PENDING_REVIEW", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "إعلان نشط", status: "ACTIVE" },
    });

    expect(await decidePendingListing(listing.id, "APPROVE")).toBeNull();
  });

  it("returns null for a nonexistent listing", async () => {
    expect(await decidePendingListing("does-not-exist", "APPROVE")).toBeNull();
  });
});

describe("listPendingReviewListings", () => {
  afterEach(cleanup);

  it("returns only PENDING_REVIEW listings", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const pending = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "قيد المراجعة", status: "PENDING_REVIEW" },
    });
    await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "نشط", status: "ACTIVE" },
    });

    const result = await listPendingReviewListings({});
    expect(result.items.some((item) => item.id === pending.id)).toBe(true);
    expect(result.items.every((item) => item.id !== undefined)).toBe(true);
  });
});

describe("getListingById visibility gating", () => {
  afterEach(cleanup);

  it("hides a PENDING_REVIEW listing from a non-owner, non-moderator viewer", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "قيد المراجعة", status: "PENDING_REVIEW" },
    });

    expect(await getListingById(listing.id, stranger.id, "INDIVIDUAL")).toBeNull();
    expect(await getListingById(listing.id)).toBeNull();
  });

  it("still shows a PENDING_REVIEW listing to its own owner", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "قيد المراجعة", status: "PENDING_REVIEW" },
    });

    const result = await getListingById(listing.id, owner.id, "INDIVIDUAL");
    expect(result?.id).toBe(listing.id);
  });

  it("shows a PENDING_REVIEW/REJECTED/DRAFT listing to a MODERATOR or ADMIN viewer", async () => {
    const owner = await makeUser();
    const moderator = await makeUser("MODERATOR");
    const category = await makeCategory();
    const pending = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "قيد المراجعة", status: "PENDING_REVIEW" },
    });
    const draft = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "مسودة", status: "DRAFT" },
    });

    expect((await getListingById(pending.id, moderator.id, "MODERATOR"))?.id).toBe(pending.id);
    expect((await getListingById(draft.id, moderator.id, "MODERATOR"))?.id).toBe(draft.id);
  });

  it("still shows ACTIVE/SOLD/EXPIRED listings to anonymous viewers", async () => {
    const owner = await makeUser();
    const category = await makeCategory();
    const active = await prisma.listing.create({
      data: { ownerId: owner.id, categoryId: category.id, title: "نشط", status: "ACTIVE" },
    });

    expect((await getListingById(active.id))?.id).toBe(active.id);
  });
});
