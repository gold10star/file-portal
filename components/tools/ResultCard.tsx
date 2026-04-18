'use client'
import { useState } from 'react'

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

type Result = { url: string, name: string, size: number }

export default function ResultCard({
  results, note, onReset
}: {
  results: Result[]
  note?: string
  onReset: () => void
}) {
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({})

  async function uploadOne(r: Result) {
    setUploadStatus(prev => ({ ...prev, [r.name]: 'uploading' }))
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
      setUploadStatus(prev => ({ ...prev, [r.name]: 'done' }))
    } catch {
      setUploadStatus(prev => ({ ...prev, [r.name]: 'error' }))
    }
  }

  async function uploadAll() {
    for (const r of results) await uploadOne(r)
  }

  async function downloadAll() {
    for (const r of results) {
      const a = document.createElement('a'); a.href = r.url; a.download = r.name; a.click()
      await new Promise(res => setTimeout(res, 300))
    }
  }

  function download(r: Result) {
    const a = document.createElement('a'); a.href = r.url; a.download = r.name; a.click()
  }

  const s = {
    btn: { padding: '11px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    btnGreen: { padding: '11px 22px', background: '#0f6e56', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    btnSec: { padding: '11px 22px', background: 'transparent', color: '#94a3b8', border: '1px solid #2a2d3a', borderRadius: 10, fontSize: 14, cursor: 'pointer' } as React.CSSProperties,
    btnSm: { padding: '6px 12px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 6, color: '#93c5fd', fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
    btnSmGreen: { padding: '6px 12px', background: '#0f3020', border: '1px solid #166534', borderRadius: 6, color: '#4ade80', fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
  }

  return (
    <div style={{ background: '#0d2618', border: '1px solid #166534', borderRadius: 14, padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: results.length > 1 ? 16 : 20 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>
          {results.length === 1 ? results[0].name : `${results.length} files created`}
        </p>
        {results.length === 1 && (
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{formatSize(results[0].size)}</p>
        )}
        {note && <p style={{ fontSize: 12, color: '#86efac', fontFamily: "'DM Mono', monospace", marginTop: 4 }}>{note}</p>}
      </div>

      {/* Multiple files list */}
      {results.length > 1 && (
        <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#13151f', borderRadius: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</p>
                <p style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{formatSize(r.size)}</p>
              </div>
              <button onClick={() => download(r)} style={s.btnSm}>↓</button>
              <button onClick={() => uploadOne(r)} disabled={uploadStatus[r.name] === 'uploading'} style={uploadStatus[r.name] === 'done' ? { ...s.btnSmGreen, cursor: 'default' } : s.btnSmGreen}>
                {uploadStatus[r.name] === 'done' ? '✓' : uploadStatus[r.name] === 'uploading' ? '...' : '☁️'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {results.length === 1 ? (
          <>
            <button onClick={() => download(results[0])} style={s.btn}>↓ Download</button>
            <button onClick={() => uploadOne(results[0])} disabled={uploadStatus[results[0].name] === 'uploading'} style={s.btnGreen}>
              {uploadStatus[results[0].name] === 'done' ? '✓ Uploaded' : uploadStatus[results[0].name] === 'uploading' ? 'Uploading...' : '☁️ Upload to Portal'}
            </button>
          </>
        ) : (
          <>
            <button onClick={downloadAll} style={s.btn}>↓ Download All</button>
            <button onClick={uploadAll} style={s.btnGreen}>☁️ Upload All</button>
          </>
        )}
        <button onClick={onReset} style={s.btnSec}>Process Another</button>
      </div>
    </div>
  )
}