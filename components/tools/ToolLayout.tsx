'use client'
import { ReactNode } from 'react'

export default function ToolLayout({
  icon, title, subtitle, children
}: {
  icon: string
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/tools" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20, textDecoration: 'none' }}>←</a>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>{icon} {title}</h1>
            <p style={{ fontSize: 12, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>{subtitle}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/files" style={{ padding: '8px 12px', background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>📂 Files</a>
          <a href="/" style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>↑ Upload</a>
        </div>
      </div>
      {children}
    </div>
  )
}