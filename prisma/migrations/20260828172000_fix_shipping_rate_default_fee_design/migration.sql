-- AlterTable
ALTER TABLE "shipping_companies" ADD COLUMN     "defaultFlatFee" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "shipping_rates" ALTER COLUMN "governorateId" SET NOT NULL,
ALTER COLUMN "flatFee" SET NOT NULL;

