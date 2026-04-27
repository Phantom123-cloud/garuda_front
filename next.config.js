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
      {
        source: '/ws/:slug/admin/:path*',
        destination: '/admin/:path*',
      },
      {
        source: '/ws/:slug/admin',
        destination: '/admin/monitor',
      },
      // ── Workspace-namespaced operator routes ───────────────────────────────
      {
        source: '/ws/:slug/operator/:path*',
        destination: '/operator/:path*',
      },
      {
        source: '/ws/:slug/operator',
        destination: '/operator/softphone',
      },
    ];
  },
};

module.exports = nextConfig;
