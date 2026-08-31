-- CreateIndex
CREATE INDEX "favorites_userId_createdAt_idx" ON "favorites"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_createdAt_idx" ON "ledger_entries"("createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_account_createdAt_idx" ON "ledger_entries"("account", "createdAt");

-- CreateIndex
CREATE INDEX "listings_ownerId_deletedAt_createdAt_idx" ON "listings"("ownerId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "listings_status_deletedAt_categoryId_createdAt_idx" ON "listings"("status", "deletedAt", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "listings_status_deletedAt_price_idx" ON "listings"("status", "deletedAt", "price");

-- CreateIndex
CREATE INDEX "orders_buyerId_createdAt_idx" ON "orders"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_sellerId_createdAt_idx" ON "orders"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "users_deletedAt_createdAt_idx" ON "users"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "verification_requests_userId_createdAt_idx" ON "verification_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_requests_status_createdAt_idx" ON "verification_requests"("status", "createdAt");
