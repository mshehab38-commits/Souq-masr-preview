import { env } from "@/lib/env";
import { R2StorageProvider } from "./r2-provider";
import { LocalStorageProvider } from "./local-provider";
import type { StorageProvider } from "./types";

export type { StorageProvider, UploadTarget } from "./types";

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  // Gated on NODE_ENV, not just "are the vars set": outside production,
  // .env carries placeholder STORAGE_* values (needed only so `next build`,
  // which forces NODE_ENV=production, passes its own env validation) — they
  // are not real credentials and must never be used to talk to actual R2.
  if (
    env.NODE_ENV === "production" &&
    env.STORAGE_ENDPOINT &&
    env.STORAGE_BUCKET &&
    env.STORAGE_ACCESS_KEY_ID &&
    env.STORAGE_SECRET_ACCESS_KEY &&
    env.STORAGE_PUBLIC_CDN_URL
  ) {
    cached = new R2StorageProvider({
      endpoint: env.STORAGE_ENDPOINT,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      publicCdnUrl: env.STORAGE_PUBLIC_CDN_URL,
    });
  } else {
    cached = new LocalStorageProvider();
  }

  return cached;
}
