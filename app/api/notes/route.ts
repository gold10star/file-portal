import { list, put, del } from '@vercel/blob'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

// GET - list all notes or get one note
export async function GET(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    // Get single note
    try {
      const { blobs } = await list({ prefix: `notes/${id}.json` })
      if (!blobs.length) return new Response('Not found', { status: 404 })
      const res = await fetch(blobs[0].url, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
      })
      const note = await res.json()
      return Response.json(note)
    } catch (err: any) {
      return new Response('Error: ' + err.message, { status: 500 })
    }
  }

  // List all notes (metadata only)
  try {
    const { blobs } = await list({ prefix: 'notes/' })
    const notes = await Promise.all(blobs.map(async blob => {
      try {
        const res = await fetch(blob.url, {
          cache: 'no-store',
          headers: { 'Authorization': `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
        })
        const note = await res.json()
        return { id: note.id, title: note.title, updatedAt: note.updatedAt, preview: (note.content || '').slice(0, 100) }
      } catch { return null }
    }))
    return Response.json(notes.filter(Boolean).sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
  } catch (err: any) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}

// POST - create or update note
export async function POST(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const { id, title, content } = await req.json()
  if (!id) return new Response('Missing id', { status: 400 })

  const note = {
    id,
    title: title || 'Untitled',
    content: content || '',
    updatedAt: new Date().toISOString()
  }

  await put(`notes/${id}.json`, JSON.stringify(note), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json'
  })

  return Response.json({ success: true })
}

// DELETE - delete a note
export async function DELETE(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  try {
    const { blobs } = await list({ prefix: `notes/${id}.json` })
    if (blobs.length) await del(blobs[0].url)
    return Response.json({ success: true })
  } catch (err: any) {
    return new Response('Error: ' + err.message, { status: 500 })
  }
}
