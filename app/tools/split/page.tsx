'use client'
import { useState } from 'react'
import ToolLayout from '@/components/tools/ToolLayout'
import FilePicker from '@/components/tools/FilePicker'
import ResultCard from '@/components/tools/ResultCard'

export default function SplitPage() {
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<{ url: string, name: string, size: number }[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [mode, setMode] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('')

  function reset() { setFiles([]); setResults([]); setProgress(''); setPageCount(0); setRange('') }

  async function onFilesChange(newFiles: File[]) {
    setFiles(newFiles)
    setResults([])
    if (newFiles.length > 0) {
      try {
        const { PDFDocument } = await import('pdf-lib')
        const pdf = await PDFDocument.load(await newFiles[0].arrayBuffer(), { ignoreEncryption: true })
        setPageCount(pdf.getPageCount())
      } catch {}
    } else {
      setPageCount(0)
    }
  }

  async function process() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress('Loading PDF...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true })
      const total = src.getPageCount()
      const newResults: { url: string, name: string, size: number }[] = []
      let pageSets: number[][] = []

      if (mode === 'all') {
        pageSets = Array.from({ length: total }, (_, i) => [i])
      } else {
        const parts = range.split(',').map(s => s.trim()).filter(Boolean)
        for (const part of parts) {
          if (part.includes('-')) {
            const [s, e] = part.split('-').map(n => parseInt(n.trim()) - 1)
            if (!isNaN(s) && !isNaN(e) && s >= 0 && e < total) {
              pageSets.push(Array.from({ length: e - s + 1 }, (_, i) => s + i))
            }
          } else {
            const p = parseInt(part) - 1
            if (!isNaN(p) && p >= 0 && p < total) pageSets.push([p])
          }
        }
      }

      if (pageSets.length === 0) {
        setProgress('No valid pages found. Check your range.')
        setProcessing(false)
        return
      }

      const base = files[0].name.replace('.pdf', '')
      for (let i = 0; i < pageSets.length; i++) {
        setProgress(`Creating part ${i + 1} of ${pageSets.length}...`)
        const newPdf = await PDFDocument.create()
        const pages = await newPdf.copyPages(src, pageSets[i])
        pages.forEach(p => newPdf.addPage(p))
        const pdfBytes = await newPdf.save()
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
        const label = mode === 'all'
          ? `page_${pageSets[i][0] + 1}`
          : `part_${i + 1}`
        newResults.push({ url: URL.createObjectURL(blob), name: `${base}_${label}.pdf`, size: blob.size })
      }
      setResults(newResults)
      setProgress(`Split into ${newResults.length} file${newResults.length !== 1 ? 's' : ''}`)
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  return (
    <ToolLayout icon="✂️" title="Split PDF" subtitle="Split into pages or custom ranges · 1 file">
      {results.length === 0 && (
        <>
          <FilePicker files={files} setFiles={onFilesChange} accept="application/pdf,.pdf" hint="PDF files only" maxFiles={1} disabled={processing} />

          {files.length > 0 && !processing && (
            <>
              {pageCount > 0 && (
                <div style={{ marginBottom: 16, padding: 16, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                    Total pages: <strong style={{ color: '#e2e8f0' }}>{pageCount}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    {(['all', 'range'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: '1px solid',
                        borderColor: mode === m ? '#2563eb' : '#2a2d3a',
                        background: mode === m ? '#1e3a5f' : 'transparent',
                        color: mode === m ? '#93c5fd' : '#64748b'
                      }}>
                        {m === 'all' ? 'Every page separately' : 'Custom ranges'}
                      </button>
                    ))}
                  </div>
                  {mode === 'range' && (
                    <div>
                      <input type="text" value={range} onChange={e => setRange(e.target.value)}
                        placeholder="e.g. 1-3, 5, 7-9"
                        style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                      <p style={{ fontSize: 11, color: '#475569', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
                        Separate with commas · ranges with dash (1-3) · single pages (5)
                      </p>
                    </div>
                  )}
                </div>
              )}
              <button onClick={process} disabled={mode === 'range' && !range.trim()}
                style={{ width: '100%', padding: '13px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: mode === 'range' && !range.trim() ? 0.5 : 1 }}>
                Split PDF
              </button>
            </>
          )}

          {processing && (
            <div style={{ textAlign: 'center', padding: 24, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
              <p style={{ color: '#94a3b8', fontSize: 14, fontFamily: "'DM Mono', monospace" }}>{progress}</p>
            </div>
          )}
          {!processing && progress && results.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: 13, color: progress.startsWith('Error') ? '#f87171' : '#64748b', fontFamily: "'DM Mono', monospace" }}>{progress}</p>
          )}
        </>
      )}
      {results.length > 0 && <ResultCard results={results} note={progress} onReset={reset} />}
    </ToolLayout>
  )
}