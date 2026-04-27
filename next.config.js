/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      // ── Backend API proxy ──────────────────────────────────────────────────
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      // ── Workspace-namespaced admin routes ──────────────────────────────────
      // /ws/:slug/admin/... → /admin/...  (transparent rewrite, browser URL stays)
      {
        source: '/ws/:slug/admin/:path*',
        destination: '/admin/:path*',
      },
      // /ws/:slug/admin  → /admin/monitor  (default redirect)
      {
        source: '/ws/:slug/admin',
        destination: '/admin/monitor',
      },
    ];
  },
};

module.exports = nextConfig;
