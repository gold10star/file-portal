import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest } from 'next/server'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.MOBILE_UPLOAD_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        access: 'private',
        addRandomSuffix: false,
      }),
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const uuid = blob.pathname.split('/').pop()?.split('.')[0] || crypto.randomUUID()
        const metaKey = `meta/${uuid}.json`
        const now = new Date()
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

        const meta = {
          key: blob.pathname,
          metaKey,
          blobUrl: blob.url,
          originalName: blob.pathname.split('/').pop() || 'file',
          size: 0,
          uploadedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }

        const { put } = await import('@vercel/blob')
        await put(metaKey, JSON.stringify(meta), {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'application/json',
        })
      },
    })

    return Response.json(jsonResponse)
  } catch (err: any) {
    return new Response(err.message, { status: 400 })
  }
}