import { Injectable } from '@nestjs/common';
import { Client } from 'minio';

@Injectable()
export class StorageService {
  private readonly bucket = process.env.MINIO_BUCKET || 'shakechat-uploads';
  private ready?: Promise<void>;
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: (process.env.MINIO_USE_SSL || 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'shakechat',
    secretKey: process.env.MINIO_SECRET_KEY || 'change-me-now',
  });

  private ensureBucket() {
    if (!this.ready) this.ready = (async () => {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) await this.client.makeBucket(this.bucket);
    })();
    return this.ready;
  }

  async put(objectKey: string, buffer: Buffer, size: number, mimeType: string) {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, objectKey, buffer, size, { 'Content-Type': mimeType });
  }

  async remove(objectKey: string) {
    await this.ensureBucket().catch(() => undefined);
    await this.client.removeObject(this.bucket, objectKey).catch(() => undefined);
  }

  async url(objectKey: string) {
    await this.ensureBucket();
    return this.client.presignedGetObject(this.bucket, objectKey, 60 * 60);
  }
}
