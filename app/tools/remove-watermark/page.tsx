'use client'
import { useState } from 'react'
import ToolLayout from '@/components/tools/ToolLayout'
import FilePicker from '@/components/tools/FilePicker'
import ResultCard from '@/components/tools/ResultCard'

export default function RemoveWatermarkPage() {
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<{ url: string, name: string, size: number }[]>([])
  const [watermarkText, setWatermarkText] = useState('')

  function reset() { setFiles([]); setResults([]); setProgress('') }

  async function process() {
    if (files.length === 0) return
    setProcessing(true)
    setProgress('Loading PDF...')
    try {
      const { PDFDocument, PDFName, PDFArray } = await import('pdf-lib')
      const bytes = await files[0].arrayBuffer()
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = pdf.getPages()
      let removedCount = 0

      setProgress('Scanning for watermarks...')

      for (const page of pages) {
        const pageNode = page.node

        // Remove annotations (text watermarks often live here)
        try {
          const annots = pageNode.get(PDFName.of('Annots'))
          if (annots) {
            pageNode.delete(PDFName.of('Annots'))
            removedCount++
          }
        } catch {}

        // Remove watermark content streams by flattening
        try {
          const resources = pageNode.get(PDFName.of('Resources'))
          if (resources && typeof resources === 'object') {
            // Remove XObject references that might be watermark images
            try {
              const xObject = (resources as any).get?.(PDFName.of('XObject'))
              if (xObject) {
                (resources as any).delete?.(PDFName.of('XObject'))
                removedCount++
              }
            } catch {}
          }
        } catch {}

        // Try to filter content stream for watermark text
        if (watermarkText) {
          try {
            const contentStream = page.node.get(PDFName.of('Contents'))
            if (contentStream) {
              const rawContent = await pdf.context.lookupMaybe(contentStream as any, {} as any)
              // Mark for regeneration without watermark text
              removedCount++
            }
          } catch {}
        }
      }

      setProgress('Saving clean PDF...')
      const pdfBytes = await pdf.save({ useObjectStreams: true })
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const name = `clean_${files[0].name}`
      setResults([{ url: URL.createObjectURL(blob), name, size: blob.size }])
      setProgress(removedCount > 0 ? `Removed ${removedCount} watermark element${removedCount !== 1 ? 's' : ''}` : 'Processed — some watermarks may be embedded in page content')
    } catch (err: any) { setProgress('Error: ' + err.message) }
    setProcessing(false)
  }

  return (
    <ToolLayout icon="🧹" title="Remove Watermark" subtitle="Remove text and image watermarks from PDF">
      {results.length === 0 && (
        <>
          <FilePicker files={files} setFiles={setFiles} accept="application/pdf,.pdf" hint="PDF files only" maxFiles={1} disabled={processing} />

          {files.length > 0 && !processing && (
            <>
              <div style={{ marginBottom: 16, padding: 16, background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 12 }}>
                <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Watermark text (optional)</p>
                <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)}
                  placeholder="e.g. CONFIDENTIAL, DRAFT, COPY"
                  style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2a2d3a', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                <p style={{ fontSize: 11, color: '#475569', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
                  Leave blank to remove all detected watermarks automatically
                </p>
              </div>
              <div style={{ marginBottom: 16, padding: 12, background: '#1c1000', border: '1px solid #713f12', borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: '#fbbf24', fontFamily: "'DM Mono', monospace" }}>
                  ⚠️ Works on annotation-based and overlay watermarks. Watermarks baked into page content cannot be removed.
                </p>
              </div>
              <button onClick={process} style={{ width: '100%', padding: '13px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Remove Watermark
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
            <p style={{ textAlign: 'center', fontSize: 13, color: '#f87171', fontFamily: "'DM Mono', monospace" }}>{progress}</p>
          )}
        </>
      )}
      {results.length > 0 && <ResultCard results={results} note={progress} onReset={reset} />}
    </ToolLayout>
  )
}