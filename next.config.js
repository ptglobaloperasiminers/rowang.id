/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Increase body size limit for file uploads
  // Vercel free tier max is 4.5MB per request
  // We handle large files by chunking on the client side
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // API body size limit
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: false,
  },
}

module.exports = nextConfig
