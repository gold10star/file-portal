'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import ToolLayout from '@/components/tools/ToolLayout'
import FilePicker from '@/components/tools/FilePicker'
import ResultCard from '@/components/tools/ResultCard'

export default function MergePage() {
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<{ url: string, name: string, size: number }[]>([])
  const [loadingPreset, setLoadingPreset] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    const keys = searchParams.get('keys')
    if (keys) loadPresetFiles(keys.split(','))
  }, [])

  async function loadPresetFiles(keys: string[]) {
    setLoadingPreset(true)
    setProgress('Loading selected files from portal...')
    const loaded: File[] = []
    for (const key of keys) {
      try {
        const res = await fetch(`/api/download?key=${encodeURIComponent(key)}`)
        if (!res.ok) continue
        const blob = await res.blob()
        const filename = key.split('/').pop() || 'file.pdf'
        loaded.push(new File([blob], filename, { type: 'application/pdf' }))
      } catch {}
    }
    setFiles(loaded)
    setProgress(loaded.length > 0 ? `${loaded.length} files loaded from portal` : '')
    setLoadingPreset(false)
  }

  function reset() { setFiles([]); setResults([]); setProgress('') }

  async function process() {
    if (files.length < 2) return
    setProcessing(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const merged = await PDFDocument.create()
      for (let i = 0; i < files.length; i++) {
        setProgress(`Merging ${i + 1} of ${files.length}...`)
        const pdf = await PDFDocument.load(await files[i].arrayBuffer(), { ignoreEncryption: true })
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

  return (
    <ToolLayout icon="📎" title="Merge PDFs" subtitle="Combine multiple PDFs into one · up to 20 files">
      {results.length === 0 && (
        <>
          {loadingPreset && (
            <div style={{ textAlign: 'center', padding: 20, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12, marginBottom: 16 }}>
              <p style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'monospace' }}>Loading files from portal...</p>
            </div>
          )}
          {!loadingPreset && (
            <FilePicker files={files} setFiles={setFiles} accept="application/pdf,.pdf" multiple hint="PDF files only · drag to reorder" maxFiles={20} disabled={processing} />
          )}
          {progress && !processing && (
            <p style={{ textAlign: 'center', fontSize: 13, color: progress.startsWith('Error') ? '#f87171' : '#4ade80', fontFamily: 'monospace', marginBottom: 12 }}>{progress}</p>
          )}
          {files.length >= 2 && !processing && (
            <button onClick={process} style={{ width: '100%', padding: '13px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Merge {files.length} PDFs
            </button>
          )}
          {files.length === 1 && !processing && (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>Add at least one more PDF</p>
          )}
          {processing && (
            <div style={{ textAlign: 'center', padding: 24, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
              <p style={{ color: '#94a3b8', fontSize: 14, fontFamily: 'monospace' }}>{progress}</p>
            </div>
          )}
        </>
      )}
      {results.length > 0 && <ResultCard results={results} onReset={reset} />}
    </ToolLayout>
  )
}
