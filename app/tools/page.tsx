'use client'
import { useState, useRef, useCallback } from 'react'

type Tool = 'images-to-pdf' | 'merge-pdf' | 'compress-pdf' | null

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function ToolCard({ icon, title, desc, onClick }: { icon: string, title: string, desc: string, onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16,
      padding: '24px 20px', textAlign: 'left', cursor: 'pointer', width: '100%',
      transition: 'border-color 0.2s, background 0.2s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLElement).style.background = '#1e2235' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2d3a'; (e.currentTarget as HTMLElement).style.background = '#1a1d27' }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{desc}</p>
    </button>
  )
}

export default function ToolsPage() {
  const [activeTool, setActiveTool] = useState<Tool>(null)
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ url: string, name: string, size: number } | null>(null)
  const [progress, setProgress] = useState('')
  const [quality, setQuality] = useState(70)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFiles([])
    setResult(null)
    setProgress('')
    setProcessing(false)
  }

  function openTool(tool: Tool) {
    setActiveTool(tool)
    reset()
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setFiles(prev => [...prev, ...Array.from(incoming)])
    setResult(null)
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  function moveUp(i: number) {
    if (i === 0) return
    setFiles(prev => { const a = [...prev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })
  }

  function moveDown(i: number) {
    if (i === files.length - 1) return
    setFiles(prev => { const a = [...prev]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a })
  }

  async function processImagesToPDF() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress('Loading PDF library...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setProgress(`Processing image ${i + 1} of ${files.length}...`)
        const file = files[i]
        const bytes = await file.arrayBuffer()
        const ext = file.name.split('.').pop()?.toLowerCase()
        let img
        if (ext === 'png') img = await pdfDoc.embedPng(bytes)
        else img = await pdfDoc.embedJpg(bytes)
        const page = pdfDoc.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }
      setProgress('Generating PDF...')
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setResult({ url, name: 'images-combined.pdf', size: blob.size })
      setProgress('')
    } catch (err: any) {
      setProgress('Error: ' + err.message)
    }
    setProcessing(false)
  }

  async function processMergePDF() {
    if (files.length < 2) return
    setProcessing(true)
    setProgress('Loading PDF library...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const merged = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setProgress(`Merging PDF ${i + 1} of ${files.length}...`)
        const bytes = await files[i].arrayBuffer()
        const pdf = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(pdf, pdf.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      }
      setProgress('Generating merged PDF...')
      const pdfBytes = await merged.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setResult({ url, name: 'merged.pdf', size: blob.size })
      setProgress('')
    } catch (err: any) {
      setProgress('Error: ' + err.message)
    }
    setProcessing(false)
  }

  async function processCompressPDF() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress('Compressing PDF...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const bytes = await files[0].arrayBuffer()
      const pdf = await PDFDocument.load(bytes)
      const pdfBytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false })
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const savings = Math.round((1 - blob.size / files[0].size) * 100)
      setResult({ url, name: 'compressed.pdf', size: blob.size })
      setProgress(savings > 0 ? `Reduced by ${savings}%` : 'Already optimized')
    } catch (err: any) {
      setProgress('Error: ' + err.message)
    }
    setProcessing(false)
  }

  function download() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.name
    a.click()
  }

  async function uploadToPortal() {
    if (!result) return
    setProgress('Uploading to portal...')
    try {
      const res = await fetch(result.url)
      const blob = await res.blob()
      const file = new File([blob], result.name, { type: 'application/pdf' })
      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) setProgress(`Uploading ${Math.round(ev.loaded / ev.total * 100)}%...`)
      }
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error('Upload failed'))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('POST', `/api/upload?filename=${encodeURIComponent(result.name)}`)
        xhr.send(file)
      })
      setProgress('✅ Uploaded to portal!')
    } catch (err: any) {
      setProgress('Upload failed: ' + err.message)
    }
  }

  const acceptMap: Record<string, string> = {
    'images-to-pdf': 'image/jpeg,image/png,image/webp,image/heic',
    'merge-pdf': 'application/pdf',
    'compress-pdf': 'application/pdf',
  }

  const toolConfig: Record<string, { title: string, icon: string, action: () => void, minFiles: number, maxFiles: number, btnLabel: string }> = {
    'images-to-pdf': { title: 'Images to PDF', icon: '🖼', action: processImagesToPDF, minFiles: 1, maxFiles: 20, btnLabel: 'Convert to PDF' },
    'merge-pdf': { title: 'Merge PDFs', icon: '📎', action: processMergePDF, minFiles: 2, maxFiles: 20, btnLabel: 'Merge PDFs' },
    'compress-pdf': { title: 'Compress PDF', icon: '🗜', action: processCompressPDF, minFiles: 1, maxFiles: 1, btnLabel: 'Compress PDF' },
  }

  const s: Record<string, React.CSSProperties> = {
    wrap: { maxWidth: 600, margin: '0 auto', padding: '32px 20px 60px' },
    nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
    dropzone: { border: '2px dashed #2a2d3a', borderRadius: 14, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#13151f', marginBottom: 16 },
    fileRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, marginBottom: 8 },
    btn: { padding: '12px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    btnSec: { padding: '12px 24px', background: 'transparent', color: '#94a3b8', border: '1px solid #2a2d3a', borderRadius: 10, fontSize: 14, cursor: 'pointer' },
  }

  if (!activeTool) return (
    <div style={s.wrap}>
      <div style={s.nav}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Tools</h1>
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>client-side · files never leave your device</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/files" style={{ padding: '8px 14px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>📂 Files</a>
          <a href="/" style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>↑ Upload</a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <ToolCard icon="🖼" title="Images to PDF" desc="Combine multiple photos into a single PDF document" onClick={() => openTool('images-to-pdf')} />
        <ToolCard icon="📎" title="Merge PDFs" desc="Combine multiple PDF files into one document" onClick={() => openTool('merge-pdf')} />
        <ToolCard icon="🗜" title="Compress PDF" desc="Reduce PDF file size for faster sharing" onClick={() => openTool('compress-pdf')} />
      </div>

      <div style={{ marginTop: 24, padding: '16px', background: '#13151f', border: '1px solid #2a2d3a', borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: '#475569', fontFamily: "'DM Mono', monospace", textAlign: 'center' }}>
          All processing happens in your browser — files are never uploaded to any server until you choose to
        </p>
      </div>
    </div>
  )

  const cfg = toolConfig[activeTool]

  return (
    <div style={s.wrap}>
      <div style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setActiveTool(null); reset() }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{cfg.icon} {cfg.title}</h1>
            <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>
              {activeTool === 'compress-pdf' ? '1 file only' : `up to ${cfg.maxFiles} files`}
            </p>
          </div>
        </div>
        <a href="/files" style={{ padding: '8px 14px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>📂 Files</a>
      </div>

      {/* Drop zone */}
      {files.length < cfg.maxFiles && !result && (
        <div style={s.dropzone} onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" multiple={cfg.maxFiles > 1} accept={acceptMap[activeTool]} style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 4 }}>
            {activeTool === 'images-to-pdf' ? 'Tap to select images' : activeTool === 'merge-pdf' ? 'Tap to select PDF files' : 'Tap to select a PDF'}
          </p>
          <p style={{ color: '#475569', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
            {activeTool === 'images-to-pdf' ? 'JPG, PNG, WEBP supported' : 'PDF files only'}
          </p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && !result && (
        <div style={{ marginBottom: 16 }}>
          {files.map((f, i) => (
            <div key={i} style={s.fileRow}>
              <span style={{ fontSize: 16 }}>{activeTool === 'images-to-pdf' ? '🖼' : '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{formatSize(f.size)}</p>
              </div>
              {cfg.maxFiles > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => moveUp(i)} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>↑</button>
                  <button onClick={() => moveDown(i)} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 6, color: '#64748b', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>↓</button>
                </div>
              )}
              <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, padding: '4px 6px' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Compress quality slider */}
      {activeTool === 'compress-pdf' && files.length > 0 && !result && (
        <div style={{ marginBottom: 16, padding: '16px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Original size: {formatSize(files[0]?.size || 0)}</p>
        </div>
      )}

      {/* Process button */}
      {files.length >= cfg.minFiles && !result && !processing && (
        <button onClick={cfg.action} style={{ ...s.btn, width: '100%', marginBottom: 12 }}>
          {cfg.btnLabel}
        </button>
      )}

      {/* Progress */}
      {processing && (
        <div style={{ textAlign: 'center', padding: '24px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
          <p style={{ color: '#94a3b8', fontSize: 14, fontFamily: "'DM Mono', monospace" }}>{progress || 'Processing...'}</p>
        </div>
      )}

      {/* Progress message (non-processing) */}
      {!processing && progress && !result && (
        <p style={{ textAlign: 'center', fontSize: 13, color: progress.startsWith('Error') ? '#f87171' : '#4ade80', fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{progress}</p>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: '#0d2618', border: '1px solid #166534', borderRadius: 14, padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>{result.name}</p>
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>
            {formatSize(result.size)}
            {progress && ` · ${progress}`}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={download} style={s.btn}>↓ Download</button>
            <button onClick={uploadToPortal} style={{ ...s.btn, background: '#0f6e56' }}>☁️ Upload to Portal</button>
            <button onClick={reset} style={s.btnSec}>Process Another</button>
          </div>
        </div>
      )}
    </div>
  )
}