import { list, del, head } from '@vercel/blob'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

export async function GET() {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const { blobs } = await list({ prefix: 'meta/' })
  const now = Date.now()
  const files = []

  for (const blob of blobs) {
    try {
      const info = await head(blob.url)
      const res = await fetch(info.downloadUrl, { cache: 'no-store' })
      if (!res.ok) continue
      const meta = await res.json()

      if (new Date(meta.expiresAt).getTime() < now) {
        try { await del(meta.blobUrl) } catch {}
        try { await del(blob.url) } catch {}
        continue
      }

      files.push({
        key: meta.key,
        metaKey: meta.metaKey,
        originalName: meta.originalName,
        size: meta.size,
        uploadedAt: meta.uploadedAt,
        expiresAt: meta.expiresAt,
      })
    } catch {}
  }

  files.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  return Response.json(files)
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  const metaKey = req.nextUrl.searchParams.get('metaKey')
  if (!key || !metaKey) return new Response('Missing key or metaKey', { status: 400 })

  try {
    const { blobs } = await list({ prefix: metaKey })
    if (blobs.length > 0) {
      const info = await head(blobs[0].url)
      const metaRes = await fetch(info.downloadUrl, { cache: 'no-store' })
      if (metaRes.ok) {
        const meta = await metaRes.json()
        try { await del(meta.blobUrl) } catch {}
      }
      try { await del(blobs[0].url) } catch {}
    }
    return new Response('OK', { status: 200 })
  } catch (err: any) {
    return new Response('Delete failed: ' + (err.message || 'error'), { status: 500 })
  }
}