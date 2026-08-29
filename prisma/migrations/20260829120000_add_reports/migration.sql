-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('LISTING', 'USER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'PROHIBITED_ITEM', 'FRAUD_SCAM', 'MISLEADING', 'OFFENSIVE_CONTENT', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTION_TAKEN', 'DISMISSED');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "listingId" TEXT,
    "targetUserId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_listingId_idx" ON "reports"("listingId");

-- CreateIndex
CREATE INDEX "reports_targetUserId_idx" ON "reports"("targetUserId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CheckConstraint: a report targets exactly one of listingId/targetUserId,
-- matching targetType. Prisma can't express this (it can't enforce
-- "exactly one of two nullable columns" natively), so it's hand-appended
-- here, mirroring the ShippingRate integrity fix documented in
-- docs/DECISIONS.md.
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_consistency_check" CHECK (
  ("targetType" = 'LISTING' AND "listingId" IS NOT NULL AND "targetUserId" IS NULL) OR
  ("targetType" = 'USER' AND "targetUserId" IS NOT NULL AND "listingId" IS NULL)
);
