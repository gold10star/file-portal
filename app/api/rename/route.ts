import { NextRequest } from 'next/server'
import { list, put, del } from '@vercel/blob'
import { cookies } from 'next/headers'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const { metaKey, displayName } = await req.json()
  if (!metaKey || !displayName) return new Response('Missing fields', { status: 400 })

  try {
    const { blobs } = await list({ prefix: metaKey })
    if (!blobs.length) return new Response('Not found', { status: 404 })

    const metaRes = await fetch(blobs[0].url, {
      cache: 'no-store',
      headers: { 'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
    })
    if (!metaRes.ok) return new Response('Metadata error', { status: 500 })

    const meta = await metaRes.json()
    meta.displayName = displayName

    await del(blobs[0].url)
    await put(metaKey, JSON.stringify(meta), {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    })

    return Response.json({ success: true })
  } catch (err: any) {
    return new Response('Rename failed: ' + err.message, { status: 500 })
  }
}
