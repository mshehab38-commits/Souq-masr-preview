-- CreateEnum
CREATE TYPE "CategoryCommerceDefault" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'ADMIN_REVIEW');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "commerceDefault" "CategoryCommerceDefault" NOT NULL DEFAULT 'NOT_ELIGIBLE';

