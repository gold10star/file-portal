import Link from 'next/link'

const tools = [
  { href: '/tools/images-to-pdf', icon: '🖼', title: 'Images to PDF', desc: 'Combine photos into a single PDF document' },
  { href: '/tools/merge', icon: '📎', title: 'Merge PDFs', desc: 'Combine multiple PDFs into one document' },
  { href: '/tools/compress', icon: '🗜', title: 'Compress PDF', desc: 'Reduce PDF file size for faster sharing' },
  { href: '/tools/split', icon: '✂️', title: 'Split PDF', desc: 'Split PDF into pages or custom ranges' },
  { href: '/tools/remove-watermark', icon: '🧹', title: 'Remove Watermark', desc: 'Remove text and image watermarks from PDF' },
]

export default function ToolsPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Tools</h1>
          <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>client-side · files never leave your device</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/files" style={{ padding: '8px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>📂 Files</Link>
          <Link href="/" style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>↑ Upload</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {tools.map(t => (
          <Link key={t.href} href={t.href} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 16, padding: '24px 20px', height: '100%', cursor: 'pointer' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{t.icon}</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>{t.title}</p>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{t.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: '#13151f', border: '1px solid #2a2d3a', borderRadius: 12 }}>
        <p style={{ fontSize: 12, color: '#475569', fontFamily: "'DM Mono', monospace", textAlign: 'center' }}>
          All processing happens in your browser · files never leave your device until you choose to upload
        </p>
      </div>
    </div>
  )
}