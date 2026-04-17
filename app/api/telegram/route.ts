import { put } from '@vercel/blob'
import { NextRequest } from 'next/server'

process.env.BLOB_READ_WRITE_TOKEN = process.env.BLOB2_READ_WRITE_TOKEN

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = body.message || body.channel_post

    if (!message) return Response.json({ ok: true })

 
 // Accept from your personal chat ID or your channel
const chatId = message.chat?.id?.toString()
const isPersonalChat = chatId === process.env.TELEGRAM_CHAT_ID
const isChannel = chatId === process.env.TELEGRAM_CHANNEL_ID

if (!isPersonalChat && !isChannel) {
  return Response.json({ ok: true })
}

    // Handle commands
    if (message.text === '/start') {
      await sendMessage(chatId, '✅ File Portal Bot ready!\n\nSend me any file, photo or document and it will appear in your portal at /files')
      return Response.json({ ok: true })
    }

    if (message.text === '/files') {
      await sendMessage(chatId, `📂 View your files:\nhttps://file-portal-ten.vercel.app/files`)
      return Response.json({ ok: true })
    }

    // Get file info
    let fileId: string | null = null
    let fileName = 'file'
    let mimeType = 'application/octet-stream'

    if (message.document) {
      fileId = message.document.file_id
      fileName = message.document.file_name || 'document'
      mimeType = message.document.mime_type || mimeType
    } else if (message.photo) {
      const photo = message.photo[message.photo.length - 1]
      fileId = photo.file_id
      fileName = `photo_${Date.now()}.jpg`
      mimeType = 'image/jpeg'
    } else if (message.video) {
      fileId = message.video.file_id
      fileName = message.video.file_name || `video_${Date.now()}.mp4`
      mimeType = message.video.mime_type || 'video/mp4'
    } else if (message.audio) {
      fileId = message.audio.file_id
      fileName = message.audio.file_name || `audio_${Date.now()}.mp3`
      mimeType = message.audio.mime_type || 'audio/mpeg'
    } else if (message.voice) {
      fileId = message.voice.file_id
      fileName = `voice_${Date.now()}.ogg`
      mimeType = 'audio/ogg'
    }

    if (!fileId) {
      await sendMessage(chatId, '⚠️ Please send a file, photo or document.')
      return Response.json({ ok: true })
    }

    // Get file download URL from Telegram
    const fileRes = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
    )
    const fileData = await fileRes.json()
    const filePath = fileData.result?.file_path

    if (!filePath) {
      await sendMessage(chatId, '❌ Could not get file. File may be too large (>20MB via Telegram API).')
      return Response.json({ ok: true })
    }

    // Download file from Telegram
    const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`
    const fileResponse = await fetch(downloadUrl)
    if (!fileResponse.ok) throw new Error('Failed to download from Telegram')

    // Upload to Vercel Blob
    const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
    const uuid = crypto.randomUUID()
    const storageKey = `uploads/${uuid}${ext}`
    const metaKey = `meta/${uuid}.json`

    const blob = await put(storageKey, fileResponse.body!, {
      access: 'private',
      contentType: mimeType,
      addRandomSuffix: false,
    })

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const meta = {
      key: storageKey,
      metaKey,
      blobUrl: blob.url,
      originalName: fileName,
      size: 0,
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await put(metaKey, JSON.stringify(meta), {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    })

    await sendMessage(chatId, `✅ *${fileName}* uploaded!\n\nView at: https://file-portal-ten.vercel.app/files`)

    return Response.json({ ok: true })
  } catch (err: any) {
    console.error('Telegram webhook error:', err)
    return Response.json({ ok: true })
  }
}

async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}