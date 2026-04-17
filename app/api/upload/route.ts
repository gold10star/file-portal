import { put } from '@vercel/blob'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export const maxDuration = 60

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth())) {
    return new Response('Unauthorized', { status: 401 })
  }

  const originalName = decodeURIComponent(req.nextUrl.searchParams.get('filename') || 'file')
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : ''
  const uuid = crypto.randomUUID()
  const storageKey = `uploads/${uuid}${ext}`
  const metaKey = `meta/${uuid}.json`

  const contentType = req.headers.get('content-type') || 'application/octet-stream'
  const fileSize = Number(req.headers.get('x-file-size') || req.headers.get('content-length') || 0)

  if (fileSize > 100 * 1024 * 1024) {
    return new Response('File too large', { status: 413 })
  }

  try {
    const blob = await put(storageKey, req.body!, {
      access: 'public',
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
      size: fileSize || 0,
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await put(metaKey, JSON.stringify(meta), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    })

    return Response.json({ success: true, name: originalName })
  } catch (err: any) {
    console.error('Upload error:', err)
    return new Response('Upload failed: ' + (err.message || 'Unknown error'), { status: 500 })
  }
}