import { PrismaClient, Prisma } from "@prisma/client";
import { governorates } from "./geo-data";
import { categories } from "./category-data";

const prisma = new PrismaClient();

function toInputJson(options: unknown): Prisma.InputJsonValue | undefined {
  return options === undefined ? undefined : (options as Prisma.InputJsonValue);
}

async function seedGeo() {
  for (const gov of governorates) {
    const governorate = await prisma.governorate.upsert({
      where: { slug: gov.slug },
      update: { nameAr: gov.nameAr, nameEn: gov.nameEn },
      create: { slug: gov.slug, nameAr: gov.nameAr, nameEn: gov.nameEn },
    });

    for (const city of gov.cities) {
      await prisma.city.upsert({
        where: { governorateId_slug: { governorateId: governorate.id, slug: city.slug } },
        update: { nameAr: city.nameAr, nameEn: city.nameEn },
        create: {
          slug: city.slug,
          nameAr: city.nameAr,
          nameEn: city.nameEn,
          governorateId: governorate.id,
        },
      });
    }
  }
}

async function seedCategories() {
  for (const [index, cat] of categories.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
        icon: cat.icon,
        sortOrder: index,
        commerceDefault: cat.commerceDefault,
      },
      create: {
        slug: cat.slug,
        nameAr: cat.nameAr,
        nameEn: cat.nameEn,
        icon: cat.icon,
        sortOrder: index,
        commerceDefault: cat.commerceDefault,
      },
    });

    for (const [attrIndex, attr] of cat.attributes.entries()) {
      await prisma.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: category.id, key: attr.key } },
        update: {
          labelAr: attr.labelAr,
          labelEn: attr.labelEn,
          type: attr.type,
          options: toInputJson(attr.options),
          required: attr.required ?? false,
          sortOrder: attrIndex,
        },
        create: {
          categoryId: category.id,
          key: attr.key,
          labelAr: attr.labelAr,
          labelEn: attr.labelEn,
          type: attr.type,
          options: toInputJson(attr.options),
          required: attr.required ?? false,
          sortOrder: attrIndex,
        },
      });
    }
  }
}

async function main() {
  await seedGeo();
  await seedCategories();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
