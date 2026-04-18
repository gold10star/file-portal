'use client'
import { useState } from 'react'
import ToolLayout from '@/components/tools/ToolLayout'
import FilePicker from '@/components/tools/FilePicker'
import ResultCard from '@/components/tools/ResultCard'

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function CompressPage() {
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<{ url: string, name: string, size: number }[]>([])
  const [note, setNote] = useState('')

  function reset() { setFiles([]); setResults([]); setProgress(''); setNote('') }

  async function process() {
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
      setNote(savings > 0 ? `Reduced by ${savings}% · ${formatSize(files[0].size)} → ${formatSize(blob.size)}` : 'Already optimized — no size reduction possible')
      setProgress('')
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  return (
    <ToolLayout icon="🗜" title="Compress PDF" subtitle="Reduce PDF file size · 1 file only">
      {results.length === 0 && (
        <>
          <FilePicker files={files} setFiles={setFiles} accept="application/pdf,.pdf" hint="PDF files only" maxFiles={1} disabled={processing} />
          {files.length > 0 && !processing && (
            <div style={{ marginBottom: 16, padding: 16, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>Original: <strong style={{ color: '#e2e8f0' }}>{formatSize(files[0].size)}</strong></p>
            </div>
          )}
          {files.length > 0 && !processing && (
            <button onClick={process} style={{ width: '100%', padding: '13px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Compress PDF
            </button>
          )}
          {processing && (
            <div style={{ textAlign: 'center', padding: 24, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
              <p style={{ color: '#94a3b8', fontSize: 14, fontFamily: "'DM Mono', monospace" }}>{progress}</p>
            </div>
          )}
          {!processing && progress && (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#f87171', fontFamily: "'DM Mono', monospace" }}>{progress}</p>
          )}
        </>
      )}
      {results.length > 0 && <ResultCard results={results} note={note} onReset={reset} />}
    </ToolLayout>
  )
}