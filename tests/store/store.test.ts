import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createStore,
  updateStore,
  getStoreByOwnerId,
  getStoreBySlug,
  listStorePublicListings,
} from "@/modules/store/store";

const createdUserIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdStoreIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { phone: `+2010${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeCategory() {
  const category = await prisma.category.create({
    data: { slug: `store-test-${Math.random().toString(36).slice(2)}`, nameAr: "قسم", nameEn: "Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("store module", () => {
  afterEach(async () => {
    await prisma.listing.deleteMany({ where: { ownerId: { in: createdUserIds } } });
    await prisma.store.deleteMany({ where: { id: { in: createdStoreIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
    createdCategoryIds.length = 0;
    createdStoreIds.length = 0;
  });

  it("creates a store for a seller who doesn't have one yet", async () => {
    const owner = await makeUser();
    const result = await createStore(owner.id, { name: "متجر أحمد" });
    expect(result.success).toBe(true);
    if (result.success) createdStoreIds.push(result.storeId);

    const fetched = await getStoreByOwnerId(owner.id);
    expect(fetched?.name).toBe("متجر أحمد");
  });

  it("rejects creating a second store for the same owner", async () => {
    const owner = await makeUser();
    const first = await createStore(owner.id, { name: "المتجر الأول" });
    expect(first.success).toBe(true);
    if (first.success) createdStoreIds.push(first.storeId);

    const second = await createStore(owner.id, { name: "المتجر الثاني" });
    expect(second).toEqual({ success: false, error: "already_exists" });
  });

  it("updates the caller's own store", async () => {
    const owner = await makeUser();
    const created = await createStore(owner.id, { name: "الاسم القديم" });
    expect(created.success).toBe(true);
    if (created.success) createdStoreIds.push(created.storeId);

    const result = await updateStore(owner.id, { name: "الاسم الجديد" });
    expect(result).toEqual({ success: true });

    const fetched = await getStoreByOwnerId(owner.id);
    expect(fetched?.name).toBe("الاسم الجديد");
  });

  it("reports not_found when updating a store that doesn't exist", async () => {
    const owner = await makeUser();
    const result = await updateStore(owner.id, { name: "لا يوجد متجر" });
    expect(result).toEqual({ success: false, error: "not_found" });
  });

  it("looks up a store by its public slug, including the owner's verification status", async () => {
    const owner = await makeUser();
    const created = await createStore(owner.id, { name: "متجر عام" });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdStoreIds.push(created.storeId);

    const fetched = await getStoreBySlug(created.slug);
    expect(fetched?.name).toBe("متجر عام");
    expect(fetched?.owner.id).toBe(owner.id);
  });

  it("returns null for a slug that doesn't exist", async () => {
    const fetched = await getStoreBySlug("does-not-exist-slug");
    expect(fetched).toBeNull();
  });

  it("lists only the owner's ACTIVE listings on the storefront, paginated", async () => {
    const owner = await makeUser();
    const category = await makeCategory();

    await prisma.listing.createMany({
      data: [
        { ownerId: owner.id, categoryId: category.id, title: "نشط ١", status: "ACTIVE" },
        { ownerId: owner.id, categoryId: category.id, title: "نشط ٢", status: "ACTIVE" },
        { ownerId: owner.id, categoryId: category.id, title: "مسودة", status: "DRAFT" },
        { ownerId: owner.id, categoryId: category.id, title: "مباع", status: "SOLD" },
      ],
    });

    const result = await listStorePublicListings(owner.id, 1, 20);
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.title).sort()).toEqual(["نشط ١", "نشط ٢"].sort());
  });
});
