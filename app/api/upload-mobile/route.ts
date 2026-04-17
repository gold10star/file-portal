import { put } from '@vercel/blob'
import { NextRequest } from 'next/server'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export const maxDuration = 60
export const preferredRegion = 'auto'

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.MOBILE_UPLOAD_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  const originalName = decodeURIComponent(req.nextUrl.searchParams.get('filename') || 'file')
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : ''
  const uuid = crypto.randomUUID()
  const storageKey = `uploads/${uuid}${ext}`
  const metaKey = `meta/${uuid}.json`

  try {
    const contentType = req.headers.get('content-type') || 'application/octet-stream'
    const chunks: Uint8Array[] = []
    const reader = req.body!.getReader()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    
    const fileBuffer = Buffer.concat(chunks)
    const fileSize = fileBuffer.length

    const blob = await put(storageKey, fileBuffer, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
    })

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const meta = {
      key: storageKey,
      metaKey,
      blobUrl: blob.url,
      originalName,
      size: fileSize,
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await put(metaKey, JSON.stringify(meta), {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    })

    return Response.json({ success: true, name: originalName, size: fileSize })
  } catch (err: any) {
    console.error('Mobile upload error:', err)
    return new Response('Upload failed: ' + (err.message || 'Unknown'), { status: 500 })
  }
}