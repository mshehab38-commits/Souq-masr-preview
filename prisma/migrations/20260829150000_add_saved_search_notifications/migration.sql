-- CreateTable
CREATE TABLE "saved_search_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_search_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_search_notifications_listingId_idx" ON "saved_search_notifications"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_search_notifications_userId_listingId_key" ON "saved_search_notifications"("userId", "listingId");

-- AddForeignKey
ALTER TABLE "saved_search_notifications" ADD CONSTRAINT "saved_search_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_search_notifications" ADD CONSTRAINT "saved_search_notifications_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
