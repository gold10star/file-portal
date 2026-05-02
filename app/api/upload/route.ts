import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { put } from '@vercel/blob'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

async function checkAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get('portal_auth')
  return auth?.value === process.env.PORTAL_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth())) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Verify auth before generating upload token
        const cookieStore = await cookies()
        const auth = cookieStore.get('portal_auth')
        if (auth?.value !== process.env.PORTAL_PASSWORD) {
          throw new Error('Unauthorized')
        }
        return {
          access: 'private' as const,
          addRandomSuffix: false,
          tokenPayload: clientPayload,
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called by Vercel after upload completes
        try {
          const payload = JSON.parse(tokenPayload || '{}')
          const originalName = payload.originalName || blob.pathname.split('/').pop() || 'file'
          const uuid = payload.uuid || crypto.randomUUID()
          const metaKey = `meta/${uuid}.json`
          const now = new Date()
          const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

          const meta = {
            key: blob.pathname,
            metaKey,
            blobUrl: blob.url,
            originalName,
           size: 0,
            uploadedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          }

          await put(metaKey, JSON.stringify(meta), {
            access: 'private',
            addRandomSuffix: false,
            contentType: 'application/json',
          })
        } catch (err) {
          console.error('onUploadCompleted error:', err)
        }
      },
    })

    return Response.json(jsonResponse)
  } catch (err: any) {
    return new Response(err.message, { status: 400 })
  }
}
