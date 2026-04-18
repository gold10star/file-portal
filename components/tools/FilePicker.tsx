'use client'
import { useRef, useState } from 'react'

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

type PortalFile = { key: string, originalName: string, size: number }

export default function FilePicker({
  files, setFiles, accept, multiple, hint, maxFiles, disabled
}: {
  files: File[]
  setFiles: (files: File[]) => void
  accept: string
  multiple?: boolean
  hint: string
  maxFiles: number
  disabled?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [portalFiles, setPortalFiles] = useState<PortalFile[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fetchProgress, setFetchProgress] = useState('')

  function addFiles(incoming: FileList | null) {
    if (!incoming || disabled) return
    const arr = Array.from(incoming)
    const newFiles = multiple ? [...files, ...arr].slice(0, maxFiles) : [arr[0]]
    setFiles(newFiles)
  }

  function removeFile(i: number) {
    setFiles(files.filter((_, idx) => idx !== i))
  }

  function moveUp(i: number) {
    if (i === 0) return
    const a = [...files];[a[i - 1], a[i]] = [a[i], a[i - 1]]; setFiles(a)
  }

  function moveDown(i: number) {
    if (i === files.length - 1) return
    const a = [...files];[a[i], a[i + 1]] = [a[i + 1], a[i]]; setFiles(a)
  }

  async function loadPortalFiles() {
    setLoading(true)
    setShowPicker(true)
    try {
      const res = await fetch('/api/files')
      if (res.ok) setPortalFiles(await res.json())
    } catch { }
    setLoading(false)
  }

  async function pickFromPortal(file: PortalFile) {
    setShowPicker(false)
    setFetchProgress('Downloading from portal...')
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(file.key)}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const f = new File([blob], file.originalName, { type: blob.type || 'application/octet-stream' })
      const newFiles = multiple ? [...files, f].slice(0, maxFiles) : [f]
      setFiles(newFiles)
      setFetchProgress('')
    } catch (err: any) {
      setFetchProgress('Error: ' + err.message)
    }
  }

  const isPDF = accept.includes('pdf')
  const isImage = accept.includes('image')

  const filteredPortal = portalFiles.filter(f => {
    const ext = f.originalName.split('.').pop()?.toLowerCase() || ''
    if (isPDF && !isImage) return ext === 'pdf'
    if (isImage && !isPDF) return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    return true
  })

  return (
    <div>
      {/* Dropzone */}
      {(multiple ? files.length < maxFiles : files.length === 0) && !disabled && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#2563eb' : '#2a2d3a'}`,
              borderRadius: 14, padding: '32px 20px', textAlign: 'center',
              cursor: 'pointer', background: dragging ? '#1a2535' : '#13151f', marginBottom: 12
            }}
          >
            <input ref={fileRef} type="file" multiple={multiple} accept={accept}
              style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 4 }}>Drag & drop or tap to select</p>
            <p style={{ color: '#475569', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{hint}</p>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button onClick={loadPortalFiles} style={{
              background: 'none', border: '1px solid #2a2d3a', borderRadius: 8,
              color: '#64748b', fontSize: 13, cursor: 'pointer', padding: '8px 16px',
              fontFamily: "'DM Mono', monospace"
            }}>📂 Choose from portal</button>
          </div>
        </>
      )}

      {/* Portal picker */}
      {showPicker && (
        <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>Choose from portal</p>
            <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading...</p>}
          {!loading && filteredPortal.length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No matching files in portal</p>}
          {filteredPortal.map(f => (
            <button key={f.key} onClick={() => pickFromPortal(f)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: '#13151f', border: '1px solid #2a2d3a', borderRadius: 8,
              padding: '10px 12px', marginBottom: 8, cursor: 'pointer', textAlign: 'left'
            }}>
              <span style={{ fontSize: 16 }}>{f.originalName.endsWith('.pdf') ? '📄' : '🖼'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.originalName}</p>
                <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{formatSize(f.size)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Fetch progress */}
      {fetchProgress && (
        <p style={{ fontSize: 13, color: fetchProgress.startsWith('Error') ? '#f87171' : '#94a3b8', fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>{fetchProgress}</p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{f.name.endsWith('.pdf') ? '📄' : '🖼'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{formatSize(f.size)}</p>
              </div>
              {multiple && files.length > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => moveUp(i)} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>↑</button>
                  <button onClick={() => moveDown(i)} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>↓</button>
                </div>
              )}
              {!disabled && (
                <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}