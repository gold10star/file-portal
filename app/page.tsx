'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_FILES = 10
const MAX_MB = 100
const MAX_BYTES = MAX_MB * 1024 * 1024

type FileEntry = {
  file: File
  id: string
  progress: number
  error?: string
  done?: boolean
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg'].includes(ext)) return { icon: '🖼', label: 'IMG', color: '#059669' }
  if (ext === 'pdf') return { icon: '📄', label: 'PDF', color: '#dc2626' }
  if (['doc', 'docx'].includes(ext)) return { icon: '📝', label: 'DOC', color: '#2563eb' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: '📊', label: 'XLS', color: '#16a34a' }
  if (['ppt', 'pptx'].includes(ext)) return { icon: '📋', label: 'PPT', color: '#ea580c' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: '🗜', label: 'ZIP', color: '#7c3aed' }
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return { icon: '🎬', label: 'VID', color: '#db2777' }
  if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) return { icon: '🎵', label: 'AUD', color: '#0891b2' }
  return { icon: '📁', label: ext.toUpperCase().slice(0, 4) || 'FILE', color: '#64748b' }
}

function QRCode({ url }: { url: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}&bgcolor=1a1d27&color=e2e8f0&margin=10`
  return (
    <div style={{ textAlign: 'center', padding: '20px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 20 }}>
      <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace", marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Scan to open on mobile</p>
      <img src={qrUrl} alt="QR Code" width={120} height={120} style={{ borderRadius: 8, display: 'block', margin: '0 auto' }} />
      <p style={{ fontSize: 11, color: '#475569', fontFamily: "'DM Mono', monospace", marginTop: 10, wordBreak: 'break-all' }}>{url}</p>
    </div>
  )
}

export default function Home() {
 const [authed, setAuthed] = useState(() => {
  if (typeof document === 'undefined') return false
  return document.cookie.includes('portal_auth=')
})
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [checking, setChecking] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [portalUrl, setPortalUrl] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPortalUrl(window.location.origin)
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  async function login() {
    setChecking(true)
    setPwError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) setAuthed(true)
      else setPwError('Wrong password. Try again.')
    } catch {
      setPwError('Connection error. Try again.')
    }
    setChecking(false)
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const current = entries.length
    const slots = MAX_FILES - current
    if (slots <= 0) return
    const arr = Array.from(incoming).slice(0, slots)
    const newEntries: FileEntry[] = arr.map(f => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      progress: 0,
      error: f.size > MAX_BYTES ? `File too large — max ${MAX_MB} MB` : undefined,
    }))
    setEntries(prev => [...prev, ...newEntries])
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [entries])

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function uploadAll() {
    const pending = entries.filter(e => !e.done && !e.error)
    if (pending.length === 0) return
    setUploading(true)

    for (const entry of pending) {
      await new Promise<void>(resolve => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = ev => {
          if (ev.lengthComputable) {
            const pct = Math.min(95, Math.round((ev.loaded / ev.total) * 95))
            setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, progress: pct } : e))
          }
        }
        xhr.onload = () => {
          if (xhr.status === 200) {
            setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, progress: 100, done: true } : e))
          } else {
            const msg = xhr.status === 413 ? 'File too large for server' : 'Upload failed. Try again.'
            setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, error: msg, progress: 0 } : e))
          }
          resolve()
        }
        xhr.onerror = () => {
          setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, error: 'Network error', progress: 0 } : e))
          resolve()
        }
        xhr.open('POST', `/api/upload?filename=${encodeURIComponent(entry.file.name)}`)
        xhr.setRequestHeader('x-file-size', String(entry.file.size))
        xhr.send(entry.file)
      })
    }
    setUploading(false)
  }

  const pendingCount = entries.filter(e => !e.done && !e.error).length
  const doneCount = entries.filter(e => e.done).length
  const allDone = entries.length > 0 && pendingCount === 0 && doneCount > 0

  // --- Login screen ---
  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: '#1e2a3a', border: '1px solid #2a3f5f', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 16px' }}>🔒</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>File Portal</h1>
          <p style={{ color: '#64748b', fontSize: 14, fontFamily: "'DM Mono', monospace" }}>Secure · Private · Auto-expiring</p>
        </div>

        <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '28px 24px' }}>
          <label style={{ display: 'block', fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Password</label>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !checking && login()}
            placeholder="Enter portal password"
            autoFocus
            style={{ width: '100%', padding: '12px 14px', background: '#0f1117', border: `1px solid ${pwError ? '#7f1d1d' : '#2a2d3a'}`, borderRadius: 10, color: '#e2e8f0', fontSize: 15, outline: 'none' }}
          />
          {pwError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8, fontFamily: "'DM Mono', monospace" }}>{pwError}</p>}
          <button
            onClick={login}
            disabled={checking || !pw}
            style={{ width: '100%', marginTop: 14, padding: '13px', background: checking ? '#1e3a5f' : '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: checking ? 'default' : 'pointer', transition: 'background 0.2s' }}
          >
            {checking ? 'Checking...' : 'Enter Portal'}
          </button>
        </div>
      </div>
    </div>
  )

  // --- Upload screen ---
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Upload Files</h1>
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>
            Up to {MAX_FILES} files · {MAX_MB} MB each · auto-deleted in 7 days
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!isMobile && (
            <button
              onClick={() => setShowQR(v => !v)}
              title="Show QR code for mobile"
              style={{ padding: '8px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}
            >
              {showQR ? '✕ QR' : '📱 QR'}
            </button>
          )}
          <a href="/files" style={{ padding: '8px 14px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>
            📂 Files
          </a>
        </div>
      </div>

      {/* QR Code — PC only */}
      {showQR && !isMobile && <QRCode url={portalUrl} />}

      {/* Mobile source buttons */}
      {isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { ref: cameraRef, icon: '📷', label: 'Camera', accept: 'image/*', capture: 'environment' },
            { ref: photoRef, icon: '🖼', label: 'Photos', accept: 'image/*', capture: undefined },
            { ref: fileRef, icon: '📁', label: 'Files', accept: '*/*', capture: undefined },
          ].map(({ ref, icon, label, accept, capture }) => (
            <button
              key={label}
              onClick={() => (ref as React.RefObject<HTMLInputElement>).current?.click()}
              disabled={entries.length >= MAX_FILES}
              style={{ padding: '16px 8px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, color: '#e2e8f0', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 24 }}>{icon}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={photoRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

      {/* Drag and drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
        onDrop={onDrop}
        onClick={() => entries.length < MAX_FILES && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : entries.length >= MAX_FILES ? '#1e2d1e' : '#2a2d3a'}`,
          borderRadius: 14,
          padding: '36px 20px',
          textAlign: 'center',
          cursor: entries.length >= MAX_FILES ? 'not-allowed' : 'pointer',
          background: dragging ? '#1a2535' : '#13151f',
          transition: 'all 0.2s',
          marginBottom: 16,
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 10 }}>{dragging ? '📂' : '☁️'}</div>
        <p style={{ color: dragging ? '#93c5fd' : '#94a3b8', fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
          {dragging ? 'Drop files here' : entries.length >= MAX_FILES ? `Max ${MAX_FILES} files reached` : 'Drag & drop files here'}
        </p>
        <p style={{ color: '#475569', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
          {isMobile ? 'or use buttons above' : 'or click to browse · supports all file types'}
        </p>
      </div>

      {/* File list */}
      {entries.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {entries.map(entry => {
            const { icon, label, color } = getIcon(entry.file.name)
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#1a1d27', border: `1px solid ${entry.error ? '#3f1515' : entry.done ? '#1a3320' : '#2a2d3a'}`, borderRadius: 10, marginBottom: 8, transition: 'border-color 0.2s' }}>
                {/* Type badge */}
                <div style={{ width: 40, height: 40, borderRadius: 8, background: color + '20', border: `1px solid ${color}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span style={{ fontSize: 8, color, fontFamily: "'DM Mono', monospace", fontWeight: 500, letterSpacing: '0.05em' }}>{label}</span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{entry.file.name}</p>
                  <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace' " }}>{formatSize(entry.file.size)}</p>
                  {!entry.error && !entry.done && entry.progress > 0 && (
                    <div style={{ height: 3, background: '#2a2d3a', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: entry.progress + '%', background: '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  )}
                  {entry.error && <p style={{ fontSize: 11, color: '#f87171', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>✕ {entry.error}</p>}
                  {entry.done && <p style={{ fontSize: 11, color: '#4ade80', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>✓ Uploaded successfully</p>}
                  {!entry.error && !entry.done && entry.progress > 0 && (
                    <p style={{ fontSize: 11, color: '#3b82f6', marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{entry.progress}%</p>
                  )}
                </div>

                {/* Remove */}
                {!uploading && (
                  <button onClick={() => removeEntry(entry.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, padding: '4px 6px', borderRadius: 6, lineHeight: 1, flexShrink: 0 }}>✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload button */}
      {entries.length > 0 && !allDone && (
        <button
          onClick={uploadAll}
          disabled={uploading || pendingCount === 0}
          style={{ width: '100%', padding: '14px', background: uploading ? '#1e3a5f' : pendingCount === 0 ? '#1a1d27' : '#2563eb', color: pendingCount === 0 && !uploading ? '#475569' : '#fff', border: `1px solid ${pendingCount === 0 && !uploading ? '#2a2d3a' : 'transparent'}`, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: uploading || pendingCount === 0 ? 'default' : 'pointer', transition: 'background 0.2s' }}
        >
          {uploading ? `Uploading... ${entries.filter(e => e.done).length}/${entries.filter(e => !e.error).length}` : pendingCount === 0 ? 'All uploaded' : `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
        </button>
      )}

      {/* Success state */}
      {allDone && (
        <div style={{ background: '#0d2618', border: '1px solid #166534', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#4ade80', marginBottom: 6 }}>✓ {doneCount} file{doneCount !== 1 ? 's' : ''} uploaded</p>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14, fontFamily: "'DM Mono', monospace" }}>Auto-deletes in 7 days</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a href="/files" style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>View all files →</a>
            <button onClick={() => setEntries([])} style={{ padding: '10px 20px', background: 'transparent', color: '#94a3b8', border: '1px solid #2a2d3a', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Upload more</button>
          </div>
        </div>
      )}

      {/* Slot counter */}
      {entries.length > 0 && entries.length < MAX_FILES && !allDone && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#475569', marginTop: 12, fontFamily: "'DM Mono', monospace" }}>
          {entries.length}/{MAX_FILES} files · {MAX_FILES - entries.length} slots remaining
        </p>
      )}
    </div>
  )
}
