import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { NextRequest } from 'next/server'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.MOBILE_UPLOAD_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  const filename = req.nextUrl.searchParams.get('filename') || 'file'
  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : ''
  const uuid = crypto.randomUUID()
  const pathname = `uploads/${uuid}${ext}`

  const clientToken = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB2_READ_WRITE_TOKEN!,
    pathname,
    onUploadCompleted: {
      callbackUrl: `https://file-portal-ten.vercel.app/api/upload-complete`,
      tokenPayload: JSON.stringify({
        originalName: filename,
        pathname,
        uuid,
      }),
    },
  })

  // Return both the token AND the upload URL
  return Response.json({
    clientToken,
    uploadUrl: `https://blob.vercel-storage.com/${pathname}`,
    pathname
  })
}