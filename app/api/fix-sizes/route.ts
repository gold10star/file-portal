import { list, put } from "@vercel/blob"
import { NextRequest } from "next/server"
import { cookies } from "next/headers"

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const auth = cookieStore.get("portal_auth")
  if (auth?.value !== process.env.PORTAL_PASSWORD) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { blobs } = await list({ prefix: "meta/" })
  let fixed = 0

  for (const blob of blobs) {
    try {
      const res = await fetch(blob.url, {
        cache: "no-store",
        headers: { "Authorization": `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
      })
      if (!res.ok) continue
      const meta = await res.json()

      if (meta.size === 0 && meta.blobUrl) {
        const headRes = await fetch(meta.blobUrl, {
          method: "HEAD",
          headers: { "Authorization": `Bearer ${process.env.BLOB2_READ_WRITE_TOKEN}` }
        })
        const contentLength = headRes.headers.get("content-length")
        if (contentLength && parseInt(contentLength) > 0) {
          meta.size = parseInt(contentLength)
          await put(meta.metaKey, JSON.stringify(meta), {
            access: "private",
            addRandomSuffix: false,
            contentType: "application/json",
          })
          fixed++
        }
      }
    } catch {}
  }

  return Response.json({ fixed, total: blobs.length })
}
