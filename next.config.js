/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig