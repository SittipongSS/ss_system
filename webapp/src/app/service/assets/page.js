// ── /service/assets → /database/assets (มติผู้ใช้ 2026-09-17) ──────────────
// เหตุผลเดียวกับทะเบียนไซต์ — ดู `src/app/service/sites/page.js`
// ⚠️ พก query string ต่อไปด้วย — `?tab=models` คือปลายทางของ /service/models
import { redirect } from 'next/navigation';

export default async function ServiceAssetsRedirect({ searchParams }) {
  const sp = await searchParams;
  const query = new URLSearchParams(
    Object.entries(sp || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, String(v)]])),
  ).toString();
  redirect(query ? `/database/assets?${query}` : '/database/assets');
}
