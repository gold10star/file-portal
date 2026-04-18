'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

type FileMeta = {
  key: string
  metaKey: string
  originalName: string
  displayName?: string
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

function getExt(name: string) {
  return name.split('.').pop()?.toLowerCase() || ''
}

function isImage(name: string) {
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'bmp'].includes(getExt(name))
}

function isPDF(name: string) {
  return getExt(name) === 'pdf'
}

function getIcon(name: string) {
  const ext = getExt(name)
  if (isImage(name)) return { icon: '🖼', label: 'IMG', color: '#059669' }
  if (ext === 'pdf') return { icon: '📄', label: 'PDF', color: '#dc2626' }
  if (['doc', 'docx'].includes(ext)) return { icon: '📝', label: 'DOC', color: '#2563eb' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: '📊', label: 'XLS', color: '#16a34a' }
  if (['ppt', 'pptx'].includes(ext)) return { icon: '📋', label: 'PPT', color: '#ea580c' }
  if (['zip', 'rar', '7z'].includes(ext)) return { icon: '🗜', label: 'ZIP', color: '#7c3aed' }
  if (['mp4', 'mov', 'avi'].includes(ext)) return { icon: '🎬', label: 'VID', color: '#db2777' }
  return { icon: '📁', label: ext.toUpperCase().slice(0, 4) || 'FILE', color: '#64748b' }
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
    <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontFamily: 'monospace', fontWeight: 500, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text, whiteSpace: 'nowrap' as const }}>
      {cfg.label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 20, height: 20, borderRadius: 4, background: '#2a2d3a', flexShrink: 0 }} />
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

// Thumbnail component
function Thumbnail({ file, blobUrl, onClick }: { file: FileMeta, blobUrl: string | null, onClick: () => void }) {
  const { icon, label, color } = getIcon(file.originalName)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [pdfThumb, setPdfThumb] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!blobUrl || loaded.current) return
    loaded.current = true
    if (isImage(file.originalName)) {
      setImgSrc(blobUrl)
    } else if (isPDF(file.originalName)) {
      renderPDFThumb(blobUrl)
    }
  }, [blobUrl])

  async function renderPDFThumb(url: string) {
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
      const res = await fetch(url)
      const bytes = await res.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
      setPageCount(pdf.numPages)
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 0.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
 await page.render({ canvasContext: ctx, viewport, canvas }).promise
      setPdfThumb(canvas.toDataURL())
    } catch {}
  }

  return (
    <div onClick={onClick} style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
      {imgSrc ? (
        <img src={imgSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : pdfThumb ? (
        <>
          <img src={pdfThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {pageCount && (
            <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 8, padding: '1px 3px', borderRadius: '4px 0 0 0', fontFamily: 'monospace' }}>
              {pageCount}p
            </div>
          )}
        </>
      ) : (
        <div style={{ width: '100%', height: '100%', background: color + '20', border: `1px solid ${color}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 8, color, fontFamily: 'monospace', fontWeight: 500 }}>{label}</span>
        </div>
      )}
    </div>
  )
}

// View Modal
function ViewModal({ file, blobUrl, onClose }: { file: FileMeta, blobUrl: string | null, onClose: () => void }) {
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const displayName = file.displayName || file.originalName

  useEffect(() => {
    if (!blobUrl) return
    if (isPDF(file.originalName)) renderPDF(blobUrl)
    else setLoading(false)
  }, [blobUrl])

  async function renderPDF(url: string) {
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
      const res = await fetch(url)
      const bytes = await res.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
      setTotalPages(pdf.numPages)
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
     await page.render({ canvasContext: ctx, viewport, canvas }).promise
      setPdfPages([canvas.toDataURL()])
      setLoading(false)
    } catch { setLoading(false) }
  }

  async function goToPage(pageNum: number) {
    if (!blobUrl || pageNum < 1 || pageNum > totalPages) return
    setLoading(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
      const res = await fetch(blobUrl)
      const bytes = await res.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      setPdfPages(prev => { const a = [...prev]; a[pageNum - 1] = canvas.toDataURL(); return a })
      setCurrentPage(pageNum)
    } catch {}
    setLoading(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #2a2d3a' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
            <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{formatSize(file.size)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
            {isPDF(file.originalName) && totalPages > 0 && (
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', padding: '4px 8px', background: '#13151f', borderRadius: 6 }}>
                {currentPage} / {totalPages}
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', cursor: 'pointer', padding: '6px 10px', fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 13 }}>Loading preview...</p>
            </div>
          )}
          {!loading && isImage(file.originalName) && blobUrl && (
            <img src={blobUrl} alt={displayName} style={{ maxWidth: '100%', borderRadius: 8 }} />
          )}
          {!loading && isPDF(file.originalName) && pdfPages[currentPage - 1] && (
            <img src={pdfPages[currentPage - 1]} alt={`Page ${currentPage}`} style={{ maxWidth: '100%', borderRadius: 4 }} />
          )}
          {!loading && !isImage(file.originalName) && !isPDF(file.originalName) && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
              <p style={{ color: '#94a3b8', fontSize: 14 }}>{displayName}</p>
              <p style={{ color: '#64748b', fontSize: 12, fontFamily: 'monospace', marginTop: 4 }}>{formatSize(file.size)}</p>
            </div>
          )}
        </div>

        {/* PDF Navigation */}
        {isPDF(file.originalName) && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, padding: '12px 20px', borderTop: '1px solid #2a2d3a' }}>
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}
              style={{ padding: '8px 16px', background: '#13151f', border: '1px solid #2a2d3a', borderRadius: 8, color: currentPage === 1 ? '#475569' : '#94a3b8', cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: 13 }}>← Prev</button>
            <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>Page {currentPage} of {totalPages}</span>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}
              style={{ padding: '8px 16px', background: '#13151f', border: '1px solid #2a2d3a', borderRadius: 8, color: currentPage === totalPages ? '#475569' : '#94a3b8', cursor: currentPage === totalPages ? 'default' : 'pointer', fontSize: 13 }}>Next →</button>
          </div>
        )}

        {/* Download button */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #2a2d3a', display: 'flex', gap: 8 }}>
          <a href={blobUrl || '#'} download={displayName}
            style={{ flex: 1, padding: '10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', textAlign: 'center', cursor: 'pointer' }}>
            ↓ Download
          </a>
        </div>
      </div>
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({})
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [viewFile, setViewFile] = useState<FileMeta | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState(false)

  async function login() {
    setPwError('')
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    if (res.ok) setAuthed(true)
    else setPwError('Wrong password')
  }

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/files')
      if (res.ok) {
        const data = await res.json()
        setFiles(data)
        setLastRefresh(new Date())
        // Pre-fetch blob URLs for thumbnails
        prefetchBlobs(data)
      }
    } catch {}
    setLoading(false)
  }, [])

  async function prefetchBlobs(fileList: FileMeta[]) {
    for (const file of fileList) {
      if (isImage(file.originalName) || isPDF(file.originalName)) {
        if (!blobUrls[file.key]) {
          fetchBlobUrl(file)
        }
      }
    }
  }

  async function fetchBlobUrl(file: FileMeta): Promise<string | null> {
    if (blobUrls[file.key]) return blobUrls[file.key]
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(file.key)}`)
      if (!res.ok) return null
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setBlobUrls(prev => ({ ...prev, [file.key]: url }))
      return url
    } catch { return null }
  }

  useEffect(() => { if (authed) loadFiles() }, [authed])

  // Selection
  function toggleSelect(key: string) {
    setSelected(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }
  function selectAll() { setSelected(new Set(files.map(f => f.key))) }
  function deselectAll() { setSelected(new Set()) }

  // Download single
  async function downloadFile(file: FileMeta) {
    setDownloading(prev => new Set([...prev, file.key]))
    try {
      let url = blobUrls[file.key]
      if (!url) url = await fetchBlobUrl(file) || ''
      if (!url) { alert('Download failed'); return }
      const a = document.createElement('a')
      a.href = url
      a.download = file.displayName || file.originalName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch { alert('Download failed.') }
    setDownloading(prev => { const s = new Set(prev); s.delete(file.key); return s })
  }

  // Bulk download
  async function bulkDownload() {
    setBulkDownloading(true)
    const selectedFiles = files.filter(f => selected.has(f.key))
    for (const file of selectedFiles) {
      await downloadFile(file)
      await new Promise(res => setTimeout(res, 400))
    }
    setBulkDownloading(false)
  }

  // Delete single
  async function deleteFile(file: FileMeta) {
    if (!confirm(`Delete "${file.displayName || file.originalName}"?`)) return
    setDeleting(prev => new Set([...prev, file.key]))
    try {
      await fetch(`/api/files?key=${encodeURIComponent(file.key)}&metaKey=${encodeURIComponent(file.metaKey)}`, { method: 'DELETE' })
      setFiles(prev => prev.filter(f => f.key !== file.key))
      setSelected(prev => { const s = new Set(prev); s.delete(file.key); return s })
    } catch { alert('Delete failed.') }
    setDeleting(prev => { const s = new Set(prev); s.delete(file.key); return s })
  }

  // Bulk delete
  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} selected file${selected.size !== 1 ? 's' : ''}?`)) return
    setBulkDeleting(true)
    const selectedFiles = files.filter(f => selected.has(f.key))
    for (const file of selectedFiles) {
      try {
        await fetch(`/api/files?key=${encodeURIComponent(file.key)}&metaKey=${encodeURIComponent(file.metaKey)}`, { method: 'DELETE' })
        setFiles(prev => prev.filter(f => f.key !== file.key))
      } catch {}
    }
    setSelected(new Set())
    setBulkDeleting(false)
  }

  // Merge selected PDFs
  function mergeSelected() {
    const selectedPDFs = files.filter(f => selected.has(f.key) && isPDF(f.originalName))
    if (selectedPDFs.length < 2) { alert('Select at least 2 PDF files to merge'); return }
    const keys = selectedPDFs.map(f => f.key).join(',')
    window.location.href = `/tools/merge?keys=${encodeURIComponent(keys)}`
  }

  // Rename
  function startRename(file: FileMeta) {
    setRenamingKey(file.key)
    setRenameValue(file.displayName || file.originalName)
  }

  async function saveRename(file: FileMeta) {
    if (!renameValue.trim()) { setRenamingKey(null); return }
    try {
      await fetch(`/api/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaKey: file.metaKey, displayName: renameValue.trim() })
      })
      setFiles(prev => prev.map(f => f.key === file.key ? { ...f, displayName: renameValue.trim() } : f))
    } catch {}
    setRenamingKey(null)
  }

  // Open view modal
  async function openView(file: FileMeta) {
    setViewFile(file)
    if (!blobUrls[file.key]) await fetchBlobUrl(file)
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const selectedPDFCount = files.filter(f => selected.has(f.key) && isPDF(f.originalName)).length

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: '#1e2a3a', border: '1px solid #2a3f5f', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 16px' }}>📂</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>File Portal</h1>
          <p style={{ color: '#64748b', fontSize: 14, fontFamily: 'monospace' }}>Enter password to view files</p>
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
      {/* View Modal */}
      {viewFile && (
        <ViewModal
          file={viewFile}
          blobUrl={blobUrls[viewFile.key] || null}
          onClose={() => setViewFile(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Your Files</h1>
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
            {files.length} file{files.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
            {lastRefresh && ` · ${lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadFiles} disabled={loading}
            style={{ padding: '8px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: loading ? '#475569' : '#94a3b8', fontSize: 13, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? '...' : '↻'}
          </button>
          <a href="/tools" style={{ padding: '8px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>🔧 Tools</a>
          <a href="/" style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>↑ Upload</a>
        </div>
      </div>

      {/* Stats */}
      {files.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total files', value: files.length },
            { label: 'Storage used', value: formatSize(totalSize) },
            { label: 'Expiring soon', value: files.filter(f => daysLeft(f.expiresAt) <= 2).length },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{label}</p>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Select all / Bulk actions bar */}
      {files.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#13151f', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={selected.size === files.length && files.length > 0}
              onChange={e => e.target.checked ? selectAll() : deselectAll()}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }} />
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </span>
          </div>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={bulkDownload} disabled={bulkDownloading}
                style={{ padding: '6px 12px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 6, color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}>
                {bulkDownloading ? '...' : `↓ Download (${selected.size})`}
              </button>
              {selectedPDFCount >= 2 && (
                <button onClick={mergeSelected}
                  style={{ padding: '6px 12px', background: '#1a2a1a', border: '1px solid #166534', borderRadius: 6, color: '#4ade80', fontSize: 12, cursor: 'pointer' }}>
                  📎 Merge PDFs ({selectedPDFCount})
                </button>
              )}
              <button onClick={bulkDelete} disabled={bulkDeleting}
                style={{ padding: '6px 12px', background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
                {bulkDeleting ? '...' : `✕ Delete (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Skeleton */}
      {loading && files.length === 0 && <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>}

      {/* Empty */}
      {!loading && files.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <p style={{ color: '#475569', fontFamily: 'monospace', fontSize: 14 }}>No files yet</p>
          <a href="/" style={{ display: 'inline-block', marginTop: 16, padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 14, textDecoration: 'none' }}>Upload files →</a>
        </div>
      )}

      {/* File rows */}
      {files.map(file => {
        const isDl = downloading.has(file.key)
        const isDel = deleting.has(file.key)
        const isSelected = selected.has(file.key)
        const isRenaming = renamingKey === file.key
        const displayName = file.displayName || file.originalName

        return (
          <div key={file.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: isSelected ? '#1a2535' : '#1a1d27', border: `1px solid ${isSelected ? '#2563eb40' : '#2a2d3a'}`, borderRadius: 12, marginBottom: 8, opacity: isDel ? 0.5 : 1, transition: 'all 0.15s' }}>

            {/* Checkbox */}
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(file.key)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />

            {/* Thumbnail */}
            <Thumbnail file={file} blobUrl={blobUrls[file.key] || null} onClick={() => openView(file)} />

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {isRenaming ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(file); if (e.key === 'Escape') setRenamingKey(null) }}
                    style={{ flex: 1, padding: '4px 8px', background: '#0f1117', border: '1px solid #2563eb', borderRadius: 6, color: '#e2e8f0', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={() => saveRename(file)} style={{ background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>✓</button>
                  <button onClick={() => setRenamingKey(null)} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>✕</button>
                </div>
              ) : (
                <p
                  onClick={() => startRename(file)}
                  title="Click to rename"
                  style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3, cursor: 'text' }}>
                  {displayName}
                  {file.displayName && file.displayName !== file.originalName && (
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 6, fontFamily: 'monospace' }}>renamed</span>
                  )}
                </p>
              )}
              <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                {formatSize(file.size)} · {new Date(file.uploadedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <ExpiryBadge expiresAt={file.expiresAt} />

            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => downloadFile(file)} disabled={isDl}
                style={{ padding: '7px 12px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 8, color: isDl ? '#64748b' : '#93c5fd', fontSize: 12, cursor: isDl ? 'default' : 'pointer', whiteSpace: 'nowrap' as const }}>
                {isDl ? '...' : '↓'}
              </button>
              <button onClick={() => deleteFile(file)} disabled={isDel}
                style={{ padding: '7px 10px', background: 'transparent', border: '1px solid #3f1515', borderRadius: 8, color: isDel ? '#475569' : '#f87171', fontSize: 13, cursor: isDel ? 'default' : 'pointer' }}>
                {isDel ? '...' : '✕'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
