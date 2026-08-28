// Seam only: Phase 3 adds the R2-backed implementation, so later modules never import an SDK directly.
export interface StorageProvider {
  getUploadUrl(key: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}

export function getStorageProvider(): StorageProvider {
  throw new Error("StorageProvider is not implemented until Phase 3 (media pipeline).");
}
