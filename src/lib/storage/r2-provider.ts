import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, UploadTarget } from "./types";

export interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicCdnUrl: string;
}

export class R2StorageProvider implements StorageProvider {
  private client: S3Client;

  constructor(private config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async getUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 300 });
    return { method: "PUT", url, headers: { "Content-Type": contentType } };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object not found: ${key}`);
    return Buffer.from(bytes);
  }

  async getObjectSize(key: string): Promise<number> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    return result.ContentLength ?? 0;
  }

  getPublicUrl(key: string): string {
    return `${this.config.publicCdnUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
