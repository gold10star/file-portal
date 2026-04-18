import { list, put, del } from '@vercel/blob'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

// GET - list all sheets or get one sheet
export async function GET(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    try {
      const { blobs } = await list({ prefix: `sheets/${id}.json` })
      if (!blobs.length) return new Response('Not found', { status: 404 })
      const res = await fetch(blobs[0].url, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
      })
      return Response.json(await res.json())
    } catch (err: any) {
      return new Response('Error: ' + err.message, { status: 500 })
    }
  }

  try {
    const { blobs } = await list({ prefix: 'sheets/' })
    const sheets = await Promise.all(blobs.map(async blob => {
      try {
        const res = await fetch(blob.url, {
          cache: 'no-store',
          headers: { 'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
        })
        const sheet = await res.json()
        return { id: sheet.id, name: sheet.name, updatedAt: sheet.updatedAt, tabCount: sheet.tabs?.length || 0 }
      } catch { return null }
    }))
    return Response.json(sheets.filter(Boolean).sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
  } catch (err: any) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}

// POST - create or update sheet
export async function POST(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const { id, name, tabs } = body
  if (!id) return new Response('Missing id', { status: 400 })

  const sheet = {
    id,
    name: name || 'Untitled Sheet',
    tabs: tabs || [],
    updatedAt: new Date().toISOString()
  }

  await put(`sheets/${id}.json`, JSON.stringify(sheet), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json'
  })

  return Response.json({ success: true })
}

// DELETE - delete a sheet
export async function DELETE(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  try {
    const { blobs } = await list({ prefix: `sheets/${id}.json` })
    if (blobs.length) await del(blobs[0].url)
    return Response.json({ success: true })
  } catch (err: any) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}
