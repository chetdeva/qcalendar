import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Where uploaded files live when they are not in the database. Access control stays in the service; the bucket is private. */
export interface FileStore {
  put(key: string, contentType: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export interface S3Config { bucket: string; endpoint?: string; region?: string; accessKeyId: string; secretAccessKey: string }

/** Any S3-compatible store: Cloudflare R2 (endpoint https://<account>.r2.cloudflarestorage.com, region "auto") or Amazon S3 (no endpoint). */
export function s3Files(c: S3Config): FileStore {
  const s3 = new S3Client({ endpoint: c.endpoint, region: c.region ?? 'auto', credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
  return {
    async put(key, contentType, bytes) {
      await s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: bytes, ContentType: contentType }));
    },
    async get(key) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
        return Buffer.from(await r.Body!.transformToByteArray());
      } catch (e) {
        if ((e as { name?: string }).name === 'NoSuchKey') return null;
        throw e;
      }
    },
  };
}
