'use client'
import { useState, useRef } from 'react'

type Tool = 'images-to-pdf' | 'merge-pdf' | 'compress-pdf' | 'split-pdf' | null

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
  const [results, setResults] = useState<{ url: string, name: string, size: number }[]>([])
  const [progress, setProgress] = useState('')
  const [portalFiles, setPortalFiles] = useState<{ key: string, originalName: string, size: number }[]>([])
  const [showPortalPicker, setShowPortalPicker] = useState(false)
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [splitMode, setSplitMode] = useState<'all' | 'range'>('all')
  const [splitRange, setSplitRange] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFiles([])
    setResults([])
    setProgress('')
    setProcessing(false)
    setShowPortalPicker(false)
    setPageCount(0)
    setSplitRange('')
  }

  function openTool(tool: Tool) {
    setActiveTool(tool)
    reset()
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setFiles(prev => [...prev, ...Array.from(incoming)])
    setResults([])
    setProgress('')
    // Get page count for split tool
    if (activeTool === 'split-pdf' && incoming[0]) {
      getPageCount(incoming[0])
    }
  }

  async function getPageCount(file: File) {
    try {
      const { PDFDocument } = await import('pdf-lib')
      const bytes = await file.arrayBuffer()
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      setPageCount(pdf.getPageCount())
    } catch {}
  }

  function removeFile(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
    setPageCount(0)
  }

  function moveUp(i: number) {
    if (i === 0) return
    setFiles(prev => { const a = [...prev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })
  }

  function moveDown(i: number) {
    if (i === files.length - 1) return
    setFiles(prev => { const a = [...prev]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a })
  }

  async function loadPortalFiles() {
    setLoadingPortal(true)
    setShowPortalPicker(true)
    try {
      const res = await fetch('/api/files')
      if (res.ok) setPortalFiles(await res.json())
    } catch {}
    setLoadingPortal(false)
  }

  async function pickFromPortal(file: { key: string, originalName: string, size: number }) {
    setShowPortalPicker(false)
    setProgress('Downloading from portal...')
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(file.key)}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const f = new File([blob], file.originalName, { type: blob.type || 'application/pdf' })
      const newFiles = (activeTool === 'compress-pdf' || activeTool === 'split-pdf') ? [f] : [...files, f]
      setFiles(newFiles)
      setProgress('')
      if (activeTool === 'split-pdf') getPageCount(f)
    } catch (err: any) {
      setProgress('Error: ' + err.message)
    }
  }

  async function processImagesToPDF() {
    if (files.length === 0) return
    setProcessing(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setProgress(`Processing image ${i + 1} of ${files.length}...`)
        const bytes = await files[i].arrayBuffer()
        const ext = files[i].name.split('.').pop()?.toLowerCase()
        const img = ext === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
        const page = pdfDoc.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }
      setProgress('Generating PDF...')
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      setResults([{ url: URL.createObjectURL(blob), name: 'images-combined.pdf', size: blob.size }])
      setProgress('')
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  async function processMergePDF() {
    if (files.length < 2) return
    setProcessing(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const merged = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setProgress(`Merging PDF ${i + 1} of ${files.length}...`)
        const pdf = await PDFDocument.load(await files[i].arrayBuffer())
        const pages = await merged.copyPages(pdf, pdf.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      }
      setProgress('Generating...')
      const pdfBytes = await merged.save()
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      setResults([{ url: URL.createObjectURL(blob), name: 'merged.pdf', size: blob.size }])
      setProgress('')
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  async function processCompressPDF() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress('Optimizing PDF...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdf = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true })
      const pdfBytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 50 })
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const savings = Math.round((1 - blob.size / files[0].size) * 100)
      setResults([{ url: URL.createObjectURL(blob), name: `compressed_${files[0].name}`, size: blob.size }])
      setProgress(savings > 0 ? `Reduced by ${savings}%` : 'Already optimized')
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  async function processSplitPDF() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress('Loading PDF...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const srcBytes = await files[0].arrayBuffer()
      const srcPdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
      const total = srcPdf.getPageCount()
      const newResults: { url: string, name: string, size: number }[] = []

      // Parse page range
      let pagesToExtract: number[][] = []

      if (splitMode === 'all') {
        // Each page as separate PDF
        pagesToExtract = Array.from({ length: total }, (_, i) => [i])
      } else {
        // Parse range like "1-3, 5, 7-9"
        const parts = splitRange.split(',').map(s => s.trim())
        for (const part of parts) {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1)
            if (!isNaN(start) && !isNaN(end)) {
              pagesToExtract.push(Array.from({ length: end - start + 1 }, (_, i) => start + i))
            }
          } else {
            const page = parseInt(part) - 1
            if (!isNaN(page)) pagesToExtract.push([page])
          }
        }
      }

      for (let i = 0; i < pagesToExtract.length; i++) {
        setProgress(`Creating part ${i + 1} of ${pagesToExtract.length}...`)
        const newPdf = await PDFDocument.create()
        const pages = await newPdf.copyPages(srcPdf, pagesToExtract[i])
        pages.forEach(p => newPdf.addPage(p))
        const pdfBytes = await newPdf.save()
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
        const baseName = files[0].name.replace('.pdf', '')
        const label = splitMode === 'all'
          ? `page_${pagesToExtract[i][0] + 1}`
          : `part_${i + 1}_pages_${pagesToExtract[i].map(p => p + 1).join('-')}`
        newResults.push({ url: URL.createObjectURL(blob), name: `${baseName}_${label}.pdf`, size: blob.size })
      }

      setResults(newResults)
      setProgress(`Split into ${newResults.length} file${newResults.length !== 1 ? 's' : ''}`)
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  async function downloadAll() {
    for (const r of results) {
      const a = document.createElement('a')
      a.href = r.url; a.download = r.name; a.click()
      await new Promise(res => setTimeout(res, 300))
    }
  }

  async function uploadToPortal(r: { url: string, name: string, size: number }) {
    setProgress(`Uploading ${r.name}...`)
    try {
      const blob = await (await fetch(r.url)).blob()
      const file = new File([blob], r.name, { type: 'application/pdf' })
      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => xhr.status === 200 ? resolve() : reject()
        xhr.onerror = reject
        xhr.open('POST', `/api/upload?filename=${encodeURIComponent(r.name)}`)
        xhr.send(file)
      })
      setProgress(`✅ ${r.name} uploaded!`)
    } catch { setProgress('Upload failed') }
  }

  const acceptMap: Record<string, string> = {
    'images-to-pdf': 'image/jpeg,image/png,image/webp',
    'merge-pdf': 'application/pdf',
    'compress-pdf': 'application/pdf',
    'split-pdf': 'application/pdf',
  }

  const toolConfig: Record<string, { title: string, icon: string, action: () => void, minFiles: number, maxFiles: number, btnLabel: string }> = {
    'images-to-pdf': { title: 'Images to PDF', icon: '🖼', action: processImagesToPDF, minFiles: 1, maxFiles: 20, btnLabel: 'Convert to PDF' },
    'merge-pdf': { title: 'Merge PDFs', icon: '📎', action: processMergePDF, minFiles: 2, maxFiles: 20, btnLabel: 'Merge PDFs' },
    'compress-pdf': { title: 'Compress PDF', icon: '🗜', action: processCompressPDF, minFiles: 1, maxFiles: 1, btnLabel: 'Compress PDF' },
    'split-pdf': { title: 'Split PDF', icon: '✂️', action: processSplitPDF, minFiles: 1, maxFiles: 1, btnLabel: 'Split PDF' },
  }

  const s: Record<string, React.CSSProperties> = {
    wrap: { maxWidth: 600, margin: '0 auto', padding: '32px 20px 60px' },
    nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
    dropzone: { border: '2px dashed #2a2d3a', borderRadius: 14, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#13151f', marginBottom: 12 },
    fileRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 10, marginBottom: 8 },
    btn: { padding: '12px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
    btnSec: { padding: '12px 24px', background: 'transparent', color: '#94a3b8', border: '1px solid #2a2d3a', borderRadius: 10, fontSize: 14, cursor: 'pointer' },
    btnSm: { padding: '6px 12px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 6, color: '#93c5fd', fontSize: 12, cursor: 'pointer' },
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <ToolCard icon="🖼" title="Images to PDF" desc="Combine photos into a single PDF" onClick={() => openTool('images-to-pdf')} />
        <ToolCard icon="📎" title="Merge PDFs" desc="Combine multiple PDFs into one" onClick={() => openTool('merge-pdf')} />
        <ToolCard icon="🗜" title="Compress PDF" desc="Reduce PDF file size" onClick={() => openTool('compress-pdf')} />
        <ToolCard icon="✂️" title="Split PDF" desc="Split PDF into pages or ranges" onClick={() => openTool('split-pdf')} />
      </div>

      <div style={{ marginTop: 24, padding: 16, background: '#13151f', border: '1px solid #2a2d3a', borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: '#475569', fontFamily: "'DM Mono', monospace", textAlign: 'center' }}>
          All processing happens in your browser — files never leave your device until you choose to upload
        </p>
      </div>
    </div>
  )

  const cfg = toolConfig[activeTool]

  return (
    <div style={s.wrap}>
      <div style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setActiveTool(null); reset() }}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{cfg.icon} {cfg.title}</h1>
            <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>
              {cfg.maxFiles === 1 ? '1 file only' : `up to ${cfg.maxFiles} files`}
            </p>
          </div>
        </div>
        <a href="/files" style={{ padding: '8px 14px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>📂 Files</a>
      </div>

      {/* Drop zone */}
      {files.length < cfg.maxFiles && results.length === 0 && (
        <>
          <div style={s.dropzone} onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" multiple={cfg.maxFiles > 1}
              accept={acceptMap[activeTool]} style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 4 }}>
              {activeTool === 'images-to-pdf' ? 'Tap to select images' : 'Tap to select PDF'}
            </p>
            <p style={{ color: '#475569', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
              {activeTool === 'images-to-pdf' ? 'JPG, PNG, WEBP' : 'PDF files only'}
            </p>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button onClick={loadPortalFiles} style={{
              background: 'none', border: '1px solid #2a2d3a', borderRadius: 8,
              color: '#64748b', fontSize: 13, cursor: 'pointer', padding: '8px 16px',
              fontFamily: "'DM Mono', monospace"
            }}>📂 Choose from portal files</button>
          </div>
        </>
      )}

      {/* Portal picker */}
      {showPortalPicker && (
        <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>Choose from portal</p>
            <button onClick={() => setShowPortalPicker(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          {loadingPortal && <p style={{ color: '#64748b', fontSize: 13 }}>Loading...</p>}
          {!loadingPortal && portalFiles.filter(f =>
            activeTool === 'images-to-pdf'
              ? ['jpg','jpeg','png','webp'].includes(f.originalName.split('.').pop()?.toLowerCase() || '')
              : f.originalName.toLowerCase().endsWith('.pdf')
          ).length === 0 && <p style={{ color: '#64748b', fontSize: 13 }}>No matching files in portal</p>}
          {portalFiles
            .filter(f => activeTool === 'images-to-pdf'
              ? ['jpg','jpeg','png','webp'].includes(f.originalName.split('.').pop()?.toLowerCase() || '')
              : f.originalName.toLowerCase().endsWith('.pdf'))
            .map(f => (
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

      {/* File list */}
      {files.length > 0 && results.length === 0 && (
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

      {/* Split options */}
      {activeTool === 'split-pdf' && files.length > 0 && results.length === 0 && (
        <div style={{ marginBottom: 16, padding: 16, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
          {pageCount > 0 && (
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
              Total pages: <strong style={{ color: '#e2e8f0' }}>{pageCount}</strong>
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button onClick={() => setSplitMode('all')} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: '1px solid',
              borderColor: splitMode === 'all' ? '#2563eb' : '#2a2d3a',
              background: splitMode === 'all' ? '#1e3a5f' : 'transparent',
              color: splitMode === 'all' ? '#93c5fd' : '#64748b'
            }}>Every page separately</button>
            <button onClick={() => setSplitMode('range')} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: '1px solid',
              borderColor: splitMode === 'range' ? '#2563eb' : '#2a2d3a',
              background: splitMode === 'range' ? '#1e3a5f' : 'transparent',
              color: splitMode === 'range' ? '#93c5fd' : '#64748b'
            }}>Custom ranges</button>
          </div>
          {splitMode === 'range' && (
            <div>
              <input
                type="text"
                value={splitRange}
                onChange={e => setSplitRange(e.target.value)}
                placeholder="e.g. 1-3, 5, 7-9"
                style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 11, color: '#475569', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
                Use commas to separate. Ranges with dash (1-3). Single pages (5).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Compress info */}
      {activeTool === 'compress-pdf' && files.length > 0 && results.length === 0 && (
        <div style={{ marginBottom: 16, padding: 16, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Original: <strong style={{ color: '#e2e8f0' }}>{formatSize(files[0]?.size || 0)}</strong></p>
        </div>
      )}

      {/* Process button */}
      {files.length >= cfg.minFiles && results.length === 0 && !processing && (
        <button onClick={cfg.action} style={{ ...s.btn, width: '100%', marginBottom: 12 }}>
          {cfg.btnLabel}
        </button>
      )}

      {/* Processing */}
      {processing && (
        <div style={{ textAlign: 'center', padding: 24, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
          <p style={{ color: '#94a3b8', fontSize: 14, fontFamily: "'DM Mono', monospace" }}>{progress || 'Processing...'}</p>
        </div>
      )}

      {/* Progress message */}
      {!processing && progress && results.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 13, color: progress.startsWith('Error') ? '#f87171' : '#4ade80', fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{progress}</p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ background: '#0d2618', border: '1px solid #166534', borderRadius: 14, padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>
              {results.length === 1 ? results[0].name : `${results.length} files created`}
            </p>
            {progress && <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{progress}</p>}
          </div>

          {/* Multiple results list */}
          {results.length > 1 && (
            <div style={{ marginBottom: 16, maxHeight: 240, overflowY: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#13151f', borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</p>
                    <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{formatSize(r.size)}</p>
                  </div>
                  <button onClick={() => { const a = document.createElement('a'); a.href = r.url; a.download = r.name; a.click() }} style={s.btnSm}>↓</button>
                  <button onClick={() => uploadToPortal(r)} style={{ ...s.btnSm, background: '#0f3020', borderColor: '#166534', color: '#4ade80' }}>☁️</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {results.length === 1 ? (
              <>
                <button onClick={() => { const a = document.createElement('a'); a.href = results[0].url; a.download = results[0].name; a.click() }} style={s.btn}>↓ Download</button>
                <button onClick={() => uploadToPortal(results[0])} style={{ ...s.btn, background: '#0f6e56' }}>☁️ Upload to Portal</button>
              </>
            ) : (
              <button onClick={downloadAll} style={s.btn}>↓ Download All ({results.length})</button>
            )}
            <button onClick={reset} style={s.btnSec}>Process Another</button>
          </div>

          {progress && progress.includes('✅') && (
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#4ade80', fontFamily: "'DM Mono', monospace" }}>{progress}</p>
          )}
        </div>
      )}
    </div>
  )
}