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
  // @sparticuz/chromium แตกไบนารี brotli ตอน runtime — ต้องไม่ให้ Next bundle (external
  // เสมอ); puppeteer-core external ตามกันเพื่อกันปัญหา resolve ของ chromium runtime
  serverExternalPackages: [
    'googleapis', 'google-auth-library', '@vercel/functions',
    '@sparticuz/chromium', 'puppeteer-core',
  ],
  // ไบนารี brotli ของ @sparticuz/chromium ถูกอ่านด้วย fs ตอน runtime ไม่ใช่ require →
  // file tracing มองไม่เห็นและตัด bin/ ทิ้งตอน deploy (ฟ้อง "input directory does not
  // exist" บน Lambda). ต้องสั่ง include ให้ route ที่เรนเดอร์ PDF โดยตรง
  // — serverExternalPackages ข้างบนกันแค่การ bundle ไม่ได้ทำให้ไฟล์ถูกก๊อปไปด้วย
  // ⚠️ key เป็น glob ไม่ใช่ path ตรง ๆ — ต้อง escape เป็น \[id\] ไม่งั้นวงเล็บถูกอ่านเป็น
  // character class แล้วไม่แมตช์ route จริง "เงียบ ๆ" (build ผ่าน ไม่มี warning ไปตายที่ prod).
  // ตรวจว่าได้ผลจริงโดยดูไฟล์ .br ใน .next/server/app/<route>/route.js.nft.json หลัง build
  // ระบุเจาะจง 2 route ที่เรนเดอร์ PDF เพราะ bin/ หนัก ~70MB ไม่ควรพองไปทุกฟังก์ชัน
  outputFileTracingIncludes: {
    '/api/sales-planning/quotations/\\[id\\]/issued/pdf': [
      'node_modules/@sparticuz/chromium/bin/**/*',
    ],
    '/api/sales-planning/quotations/\\[id\\]/approval': [
      'node_modules/@sparticuz/chromium/bin/**/*',
    ],
  },
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
      { source: '/sa/sales-orders', destination: '/sales-planning/sales-orders' },
      { source: '/sa/sales-orders/:path*', destination: '/sales-planning/sales-orders/:path*' },
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
      // ค่ากลางระดับระบบย้ายเข้า Admin Center (/settings) — คง URL เดิมไว้ให้
      // bookmark/ลิงก์ในการ์ดแจ้งเตือนเก่ายังใช้ได้
      { source: '/database/holidays', destination: '/settings/holidays', permanent: false },
      { source: '/database/chat-webhooks', destination: '/settings/chat-webhooks', permanent: false },
    ];
  },
};

export default nextConfig;
