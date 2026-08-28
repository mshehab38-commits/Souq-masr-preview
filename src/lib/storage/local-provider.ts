import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { StorageProvider, UploadTarget } from "./types";

const BASE_DIR = path.resolve(process.cwd(), ".local-storage");

function resolveSafePath(key: string): string {
  const resolved = path.resolve(BASE_DIR, key);
  if (!resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error(`Refusing to resolve storage key outside the local storage root: ${key}`);
  }
  return resolved;
}

// Dev/test-only fallback: stores files on the local filesystem and serves
// them via app/api/uploads/local/[...path]/route.ts. Never used in
// production — that needs real R2 credentials (an owner-provided,
// production-credentials decision), see r2-provider.ts.
export class LocalStorageProvider implements StorageProvider {
  constructor() {
    logger.warn("Storage provider not configured — using local filesystem fallback (dev/test only)");
  }

  async getUploadTarget(key: string): Promise<UploadTarget> {
    return { method: "PUT", url: `${env.APP_URL}/api/uploads/local/${key}` };
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const filePath = resolveSafePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(resolveSafePath(key));
  }

  getPublicUrl(key: string): string {
    return `${env.APP_URL}/api/uploads/local/${key}`;
  }

  async delete(key: string): Promise<void> {
    await unlink(resolveSafePath(key)).catch(() => undefined);
  }
}
