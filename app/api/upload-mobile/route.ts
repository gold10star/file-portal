import { NextRequest } from 'next/server'
import { getSignedUploadUrl } from '@/lib/b2'
import crypto from 'crypto'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.MOBILE_UPLOAD_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  const filename = decodeURIComponent(req.nextUrl.searchParams.get('filename') || 'file')
  const contentType = req.nextUrl.searchParams.get('contentType') || 'application/octet-stream'
  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : ''
  const uuid = crypto.randomUUID()
  const fileKey = `uploads/${uuid}${ext}`
  const metaKey = `meta/${uuid}.json`

  const uploadUrl = await getSignedUploadUrl(fileKey, contentType)

  return Response.json({
    uploadUrl,
    fileKey,
    metaKey,
    uuid,
    originalName: filename,
  })
}

export async function POST(req: NextRequest) {
  // Called after upload completes to save metadata
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.MOBILE_UPLOAD_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { fileKey, metaKey, uuid, originalName, size } = await req.json()

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const meta = {
    key: fileKey,
    metaKey,
    originalName,
    size: size || 0,
    uploadedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    storage: 'b2',
  }

  const { uploadToB2 } = await import('@/lib/b2')
  await uploadToB2(metaKey, JSON.stringify(meta), 'application/json')

  return Response.json({ success: true })
}