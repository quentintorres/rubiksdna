import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "./env";

/**
 * Object storage (Cloudflare R2, S3-compatible). Raw uploads, Parquet
 * feature matrices, and rendered report PDFs all live here, keyed under the
 * owning organization so a key alone never crosses tenants.
 */
let cached: S3Client | null = null;

function r2(): S3Client {
  if (cached) return cached;
  const env = serverEnv();
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

export const objectKeys = {
  rawUpload: (orgId: string, fileId: string, filename: string) =>
    `orgs/${orgId}/raw/${fileId}/${encodeURIComponent(filename)}`,
  featureMatrix: (orgId: string, sampleId: string, pipelineVersion: string) =>
    `orgs/${orgId}/features/${sampleId}/${pipelineVersion}.parquet`,
  reportPdf: (orgId: string, reportId: string) => `orgs/${orgId}/reports/${reportId}.pdf`,
  exportArchive: (orgId: string, exportId: string) => `orgs/${orgId}/exports/${exportId}.zip`,
};

/** Signed PUT for browser-direct uploads; the file never transits our server. */
export async function signUpload(key: string, contentType: string, maxBytes: number) {
  const env = serverEnv();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: maxBytes > 0 ? undefined : undefined,
  });
  return getSignedUrl(r2(), command, { expiresIn: 15 * 60 });
}

export async function signDownload(key: string) {
  const env = serverEnv();
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
  return getSignedUrl(r2(), command, { expiresIn: 10 * 60 });
}

export async function getObjectText(key: string): Promise<string> {
  const env = serverEnv();
  const result = await r2().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  return (await result.Body?.transformToString()) ?? "";
}

export async function putObject(key: string, body: Buffer | string, contentType: string) {
  const env = serverEnv();
  await r2().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: typeof body === "string" ? Buffer.from(body) : body,
      ContentType: contentType,
    }),
  );
}
