import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {
    root: rootDir,
  },
  // Drive backend libs are heavy Node packages — leave them as runtime
  // node_modules requires instead of bundling. Also stops Next from trying to
  // resolve @vercel/functions/oidc's optional dynamic import of the AWS SDK
  // (we only use getVercelOidcToken, never the AWS credentials provider).
  serverExternalPackages: ['googleapis', 'google-auth-library', '@vercel/functions'],
  // Sales Management owns the /sa namespace. Keep legacy URLs working without
  // exposing the old system split in user-facing navigation.
  async rewrites() {
    return [
      { source: '/sa', destination: '/sa/dashboard' },
      // เฟส C: คิวลีด + KPI
      { source: '/sa/leads', destination: '/sales-planning/leads' },
      { source: '/sa/leads/:path*', destination: '/sales-planning/leads/:path*' },
      // เฟส D: ใบเสนอราคา
      { source: '/sa/quotations', destination: '/sales-planning/quotations' },
      { source: '/sa/quotations/:path*', destination: '/sales-planning/quotations/:path*' },
      { source: '/sa/deals', destination: '/sales-planning/deals' },
      { source: '/sa/deals/:path*', destination: '/sales-planning/deals/:path*' },
      { source: '/sa/targets', destination: '/sales-planning/targets' },
      { source: '/sa/targets/:path*', destination: '/sales-planning/targets/:path*' },
      // /sa/projects is now a native App Router route. Do not rewrite it back
      // to the removed /pm/projects pages; legacy /pm URLs redirect below.
      { source: '/sa/tasks', destination: '/pm/tasks' },
      { source: '/sa/tasks/:path*', destination: '/pm/tasks/:path*' },
    ];
  },
  async redirects() {
    return [
      { source: '/sales-planning', destination: '/sa/dashboard', permanent: false },
      { source: '/sales-planning/deals', destination: '/sa/deals', permanent: false },
      { source: '/sales-planning/deals/:path*', destination: '/sa/deals/:path*', permanent: false },
      { source: '/sales-planning/targets', destination: '/sa/targets', permanent: false },
      { source: '/sales-planning/targets/:path*', destination: '/sa/targets/:path*', permanent: false },
      { source: '/pm', destination: '/sa', permanent: false },
      { source: '/pm/projects', destination: '/sa/projects', permanent: false },
      { source: '/pm/projects/:path*', destination: '/sa/projects/:path*', permanent: false },
      { source: '/pm/tasks', destination: '/sa/tasks', permanent: false },
      { source: '/pm/tasks/:path*', destination: '/sa/tasks/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
