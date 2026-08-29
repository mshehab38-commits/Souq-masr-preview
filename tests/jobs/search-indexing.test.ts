import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { indexListingJob } from "@/jobs/search-indexing";
import { createSavedSearch } from "@/modules/search/service";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `job-idx-cat-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function cleanup() {
  await prisma.savedSearchNotification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.savedSearch.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
  createdCategoryIds.length = 0;
}

describe("indexListingJob", () => {
  afterEach(cleanup);

  it("indexes the listing's searchText, then notifies matching saved searches using it", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: seller.id, categoryId: category.id, title: "دراجة هوائية للبيع", status: "ACTIVE" },
    });
    // A free-text saved search that can only match once searchText exists —
    // proves indexing runs before the match check, not just that both ran.
    await createSavedSearch(buyer.id, "دراجات", { q: "دراجة" });

    await indexListingJob({ listingId: listing.id });

    const updated = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    // buildSearchText normalizes Arabic (e.g. taa marbuta ة → ه), so assert
    // against the normalized form rather than the original title's spelling.
    expect(updated.searchText).toContain("دراجه");

    const notification = await prisma.notification.findFirst({
      where: { userId: buyer.id, type: "SAVED_SEARCH_MATCH" },
    });
    expect(notification).not.toBeNull();
  });

  it("a second run for the same listing (e.g. a title/description edit re-queuing indexing) does not re-notify", async () => {
    const seller = await makeUser();
    const buyer = await makeUser();
    const category = await makeCategory();
    const listing = await prisma.listing.create({
      data: { ownerId: seller.id, categoryId: category.id, title: "دراجة هوائية للبيع", status: "ACTIVE" },
    });
    await createSavedSearch(buyer.id, "دراجات", { category: category.slug });

    await indexListingJob({ listingId: listing.id });
    await indexListingJob({ listingId: listing.id });

    const count = await prisma.notification.count({
      where: { userId: buyer.id, type: "SAVED_SEARCH_MATCH" },
    });
    expect(count).toBe(1);
  });
});
