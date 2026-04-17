import { put } from '@vercel/blob'
import { NextRequest } from 'next/server'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export async function POST(req: NextRequest) {
  const body = await req.json()
  const blob = body.blob
  const tokenPayload = JSON.parse(body.tokenPayload || '{}')

  const { originalName, pathname, uuid } = tokenPayload
  const metaKey = `meta/${uuid}.json`

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const meta = {
    key: pathname,
    metaKey,
    blobUrl: blob.url,
    originalName: originalName || 'file',
    size: blob.size || 0,
    uploadedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }

  await put(metaKey, JSON.stringify(meta), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
  })

  return Response.json({ ok: true })
}