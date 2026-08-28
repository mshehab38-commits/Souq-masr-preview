import { randomBytes } from "node:crypto";

// Store names are frequently Arabic and don't reduce to a meaningful ASCII
// slug, so we keep whatever ASCII/digit segment exists (for readability when
// there is one) and always append a short random suffix rather than trying
// to resolve collisions by incrementing a counter — a fixed-length random
// suffix keeps slug generation a single insert-and-retry-on-conflict
// operation instead of a read-then-write race.
function baseSlugFrom(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return ascii.length > 0 ? ascii : "store";
}

export function generateStoreSlug(name: string): string {
  const suffix = randomBytes(4).toString("hex");
  return `${baseSlugFrom(name)}-${suffix}`;
}
