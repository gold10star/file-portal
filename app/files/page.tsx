'use client'
import { useState, useEffect, useCallback } from 'react'

type FileMeta = {
  key: string
  metaKey: string
  originalName: string
  size: number
  uploadedAt: string
  expiresAt: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function daysLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function hoursLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)))
}

function getIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg','jpeg','png','gif','webp','heic','heif','bmp'].includes(ext)) return { icon: '🖼', label: 'IMG', color: '#059669' }
  if (ext === 'pdf') return { icon: '📄', label: 'PDF', color: '#dc2626' }
  if (['doc','docx'].includes(ext)) return { icon: '📝', label: 'DOC', color: '#2563eb' }
  if (['xls','xlsx','csv'].includes(ext)) return { icon: '📊', label: 'XLS', color: '#16a34a' }
  if (['ppt','pptx'].includes(ext)) return { icon: '📋', label: 'PPT', color: '#ea580c' }
  if (['zip','rar','7z'].includes(ext)) return { icon: '🗜', label: 'ZIP', color: '#7c3aed' }
  if (['mp4','mov','avi'].includes(ext)) return { icon: '🎬', label: 'VID', color: '#db2777' }
  return { icon: '📁', label: ext.toUpperCase().slice(0,4) || 'FILE', color: '#64748b' }
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const days = daysLeft(expiresAt)
  const hours = hoursLeft(expiresAt)
  const expired = days === 0 && hours === 0
  const cfg = expired
    ? { bg: '#1c0a0a', border: '#5a1a1a', text: '#f87171', label: 'Expired' }
    : days === 0
    ? { bg: '#1c0a0a', border: '#7f1d1d', text: '#fca5a5', label: `${hours}h left` }
    : days <= 2
    ? { bg: '#1c1000', border: '#713f12', text: '#fbbf24', label: `${days}d left` }
    : { bg: '#0d1f0d', border: '#14532d', text: '#86efac', label: `${days}d left` }
  return (
    <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 500, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: '#2a2d3a', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, background: '#2a2d3a', borderRadius: 4, marginBottom: 8, width: '60%' }} />
        <div style={{ height: 11, background: '#222530', borderRadius: 4, width: '40%' }} />
      </div>
      <div style={{ width: 60, height: 22, background: '#2a2d3a', borderRadius: 20 }} />
      <div style={{ width: 90, height: 32, background: '#2a2d3a', borderRadius: 8 }} />
      <div style={{ width: 32, height: 32, background: '#2a2d3a', borderRadius: 8 }} />
    </div>
  )
}

export default function FilesPage() {
  const [authed, setAuthed] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.cookie.includes('portal_auth=')
  })
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [files, setFiles] = useState<FileMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(30)

  async function login() {
    setPwError('')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    if (res.ok) setAuthed(true)
    else setPwError('Wrong password')
  }

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/files')
      if (res.ok) {
        setFiles(await res.json())
        setLastRefresh(new Date())
        setCountdown(30)
      }
    } catch {}
    setLoading(false)
  }, [])

  // Initial load
  useEffect(() => { if (authed) loadFiles() }, [authed])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!authed) return
    const interval = setInterval(() => loadFiles(), 30000)
    return () => clearInterval(interval)
  }, [authed])

  // Countdown timer
  useEffect(() => {
    if (!authed) return
    const tick = setInterval(() => setCountdown(c => c <= 1 ? 30 : c - 1), 1000)
    return () => clearInterval(tick)
  }, [authed])

  async function downloadFile(file: FileMeta) {
    setDownloading(prev => new Set([...prev, file.key]))
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(file.key)}`)
      if (!res.ok) { alert('Download failed. File may have expired.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.originalName
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { alert('Download failed.') }
    setDownloading(prev => { const s = new Set(prev); s.delete(file.key); return s })
  }

  async function deleteFile(file: FileMeta) {
    if (!confirm(`Delete "${file.originalName}"?`)) return
    setDeleting(prev => new Set([...prev, file.key]))
    try {
      await fetch(`/api/files?key=${encodeURIComponent(file.key)}&metaKey=${encodeURIComponent(file.metaKey)}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.key !== file.key))
    } catch { alert('Delete failed.') }
    setDeleting(prev => { const s = new Set(prev); s.delete(file.key); return s })
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0)

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: '#1e2a3a', border: '1px solid #2a3f5f', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 16px' }}>📂</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>File Portal</h1>
          <p style={{ color: '#64748b', fontSize: 14, fontFamily: "'DM Mono', monospace" }}>Enter password to view files</p>
        </div>
        <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '28px 24px' }}>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()} placeholder="Password" autoFocus
            style={{ width: '100%', padding: '12px 14px', background: '#0f1117', border: `1px solid ${pwError ? '#7f1d1d' : '#2a2d3a'}`, borderRadius: 10, color: '#e2e8f0', fontSize: 15, outline: 'none' }} />
          {pwError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{pwError}</p>}
          <button onClick={login} style={{ width: '100%', marginTop: 12, padding: '13px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Enter</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Your Files</h1>
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>
            {files.length} file{files.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
            {lastRefresh && ` · refreshed ${lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
            {` · auto-refresh in ${countdown}s`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadFiles} disabled={loading}
            style={{ padding: '8px 14px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: loading ? '#475569' : '#94a3b8', fontSize: 13, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? '...' : '↻ Refresh'}
          </button>
          <a href="/" style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>↑ Upload</a>
        </div>
      </div>

      {/* Stats */}
      {(files.length > 0 || loading) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total files', value: loading ? '...' : files.length },
            { label: 'Storage used', value: loading ? '...' : formatSize(totalSize) },
            { label: 'Expiring soon', value: loading ? '...' : files.filter(f => daysLeft(f.expiresAt) <= 2).length },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace", marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Skeleton loading */}
      {loading && files.length === 0 && (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </>
      )}

      {/* Empty state */}
      {!loading && files.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <p style={{ color: '#475569', fontFamily: "'DM Mono', monospace", fontSize: 14 }}>No files yet</p>
          <a href="/" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 14, textDecoration: 'none' }}>Upload files →</a>
        </div>
      )}

      {/* File rows */}
      {files.map(file => {
        const { icon, label, color } = getIcon(file.originalName)
        const isDl = downloading.has(file.key)
        const isDel = deleting.has(file.key)
        return (
          <div key={file.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 8, opacity: isDel ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: color + '20', border: `1px solid ${color}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 8, color, fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }} title={file.originalName}>{file.originalName}</p>
              <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>
                {formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <ExpiryBadge expiresAt={file.expiresAt} />
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => downloadFile(file)} disabled={isDl}
                style={{ padding: '8px 14px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 8, color: isDl ? '#64748b' : '#93c5fd', fontSize: 13, cursor: isDl ? 'default' : 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {isDl ? 'Downloading...' : '↓ Download'}
              </button>
              <button onClick={() => deleteFile(file)} disabled={isDel}
                style={{ padding: '8px 10px', background: 'transparent', border: '1px solid #3f1515', borderRadius: 8, color: isDel ? '#475569' : '#f87171', fontSize: 13, cursor: isDel ? 'default' : 'pointer' }}>
                {isDel ? '...' : '✕'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}