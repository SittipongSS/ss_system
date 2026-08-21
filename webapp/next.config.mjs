import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  /* 🔴 `experimental.turbopackFileSystemCacheForBuild` **ถอดออกแล้ว 2026-08-22** —
     คีย์นี้ (#1339) เปิดไว้เพื่อลด Build CPU Minutes ซึ่งเดือนก่อนกินไป 7,066 CPU-min
     = 87% ของบิล infra · คอมเมนต์เดิมเขียนทางหนีไฟไว้เองว่า "ถ้า output เพี้ยน
     ถอดคีย์นี้ออกได้ทันที" — และมัน **เพี้ยนจริงบน production**

     สิ่งที่เกิด: build เสิร์ฟ **JS ใหม่คู่กับ CSS เก่า** ผู้ใช้เห็นแถบเมนูแบบเก่า
     พร้อมปุ่ม ☰/✕ ของโค้ดใหม่โผล่ซ้อนกันสี่ตัวบนจอเดียว

     หลักฐานที่วัดได้ (21/08 18:53Z):
     · HTML ที่ production เสิร์ฟสด ๆ (`x-vercel-cache: MISS`, age 0) ชี้ไปที่
       `/_next/static/chunks/0m77d5wl_v7e5.css` ซึ่ง `last-modified: 18:41`
       = ไฟล์จาก build รอบล่าสุดจริง ไม่ใช่ของค้างบน CDN
     · ในไฟล์นั้น: `sidenav-hamburger` 0 ครั้ง · `sidenav-w-expanded` 0 ครั้ง ·
       `container-name` 0 ครั้ง — แต่ยังมี `--topnav-menu-h` ซึ่ง #1356 ลบทิ้งไปแล้ว
     · source บน main รอบเดียวกัน: `sidenav-hamburger` 6 · `sidenav-w-expanded` 8
     ⇒ CSS ที่ออกจาก build ไม่ได้มาจาก source ของ commit ที่ build — มาจากแคช

     จะเปิดกลับต้องพิสูจน์ก่อนว่า turbopack ไม่หยิบ CSS ก้อนเก่ามาใช้ซ้ำ ไม่ใช่แค่
     ดูว่า build ผ่านหรือบิลถูกลง · ทางลดค่า build ที่ไม่แลกกับความถูกต้อง เช่น
     ลดจำนวน build ต่อวัน หรือ ignore build step ตอน diff ไม่แตะ webapp/ */
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
      // สัญญา (mig 0274) — เส้นทางสั้น /sa/contracts เหมือนเอกสารขายใบอื่น
      { source: '/sa/contracts', destination: '/sales-planning/contracts' },
      { source: '/sa/contracts/:path*', destination: '/sales-planning/contracts/:path*' },
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
      // ใบขอราคาวัสดุ MR- ถูกยุบเป็น "เคสขอราคา" (mig 0158) — ลิงก์เก่าในแชท/bookmark
      // ต้องไม่ตายกลางอากาศ (ตัวใบเก่าไม่มีข้อมูลบน prod จึงส่งไปหน้ารายการเคสพอ)
      { source: '/sa/materials/requests', destination: '/sa/materials/asks', permanent: false },
      { source: '/sa/materials/requests/:path*', destination: '/sa/materials/asks', permanent: false },
      // คำร้องออกจาก /sa → /requests (P0b) — มันเป็นทะเบียนกลางที่ทุกฝ่ายยิงเข้ามาหา
      // ไม่ใช่สมบัติของฝ่ายขาย · ที่เคยอยู่ใต้ /sa เป็นเศษกรอบจากสมัยที่ยังเป็น
      // "ระบบขอราคาวัสดุของ SA" · Next คง query string ให้เอง ⇒ ?tab= และ ?dealId=
      // ของลิงก์เก่าและ bookmark ยังทำงานครบ
      { source: '/sa/requests', destination: '/requests', permanent: false },
      { source: '/sa/requests/:path*', destination: '/requests/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
