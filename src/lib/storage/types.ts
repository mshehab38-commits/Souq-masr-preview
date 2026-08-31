export interface UploadTarget {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
}

export interface StorageProvider {
  getUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getObjectSize(key: string): Promise<number>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
