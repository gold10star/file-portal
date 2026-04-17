import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3 = new S3Client({
  endpoint: `https://${process.env.B2_ENDPOINT}`,
  region: 'us-east-005',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APP_KEY!,
  },
})

export const BUCKET = process.env.B2_BUCKET!

export async function uploadToB2(key: string, body: ReadableStream | Buffer | string, contentType: string) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body as any,
    ContentType: contentType,
  }))
}

export async function getSignedDownloadUrl(key: string, filename: string) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  }), { expiresIn: 300 }) // 5 min expiry
}

export async function getSignedUploadUrl(key: string, contentType: string) {
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 }) // 5 min expiry
}

export async function deleteFromB2(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export async function listB2Objects(prefix: string) {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }))
  return res.Contents || []
}

export async function getFromB2(key: string): Promise<string> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return res.Body?.transformToString() || ''
}