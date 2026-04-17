import { list } from '@vercel/blob'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export const maxDuration = 60

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return new Response('Missing key', { status: 400 })

  try {
    const filename = key.split('/').pop() || ''
    const uuid = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename

    const { blobs } = await list({ prefix: `meta/${uuid}` })
    if (!blobs.length) return new Response('File not found', { status: 404 })

    // Fetch meta using token in header
    const metaRes = await fetch(blobs[0].url, {
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}`
      }
    })
    if (!metaRes.ok) return new Response('Metadata error', { status: 500 })

    const meta = await metaRes.json()

    if (new Date(meta.expiresAt).getTime() < Date.now()) {
      return new Response('File expired', { status: 410 })
    }

    // Fetch actual file using token in header
    const fileRes = await fetch(meta.blobUrl, {
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}`
      }
    })
    if (!fileRes.ok) return new Response('File fetch failed', { status: 502 })

    const headers = new Headers()
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`)
    headers.set('Content-Type', fileRes.headers.get('content-type') || 'application/octet-stream')
    headers.set('Cache-Control', 'no-store')

    return new Response(fileRes.body, { status: 200, headers })
  } catch (err: any) {
    console.error('Download error:', err)
    return new Response('Download failed', { status: 500 })
  }
}