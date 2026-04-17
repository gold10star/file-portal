import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'File Portal',
  description: 'Secure file transfer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0f1117" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600&display=swap"
          rel="stylesheet"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'DM Sans', sans-serif;
            background: #0f1117;
            color: #e2e8f0;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
          }
          input, button, select, textarea { font-family: inherit; }
          a { color: #3b82f6; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: #1a1d27; }
          ::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 3px; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
