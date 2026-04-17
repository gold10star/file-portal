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
    const metaPrefix = `meta/${uuid}`

    const { blobs } = await list({ prefix: metaPrefix })
    if (!blobs.length) return new Response('File not found', { status: 404 })

    const metaRes = await fetch(blobs[0].url, { cache: 'no-store' })
    if (!metaRes.ok) return new Response('Metadata error', { status: 500 })

    const meta = await metaRes.json()

    if (new Date(meta.expiresAt).getTime() < Date.now()) {
      return new Response('File expired', { status: 410 })
    }

    const fileRes = await fetch(meta.blobUrl, { cache: 'no-store' })
    if (!fileRes.ok) return new Response('File fetch failed', { status: 502 })

    const headers = new Headers()
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`)
    headers.set('Content-Type', fileRes.headers.get('content-type') || 'application/octet-stream')
    const cl = fileRes.headers.get('content-length')
    if (cl) headers.set('Content-Length', cl)
    headers.set('Cache-Control', 'no-store')

    return new Response(fileRes.body, { status: 200, headers })
  } catch (err: any) {
    return new Response('Download failed', { status: 500 })
  }
}