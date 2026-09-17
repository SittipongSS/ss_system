// ── /service/assets/[id] → /database/assets/[id] (มติผู้ใช้ 2026-09-17) ────
// เหตุผลเดียวกับทะเบียนไซต์ — ดู `src/app/service/sites/page.js`
import { redirect } from 'next/navigation';

export default async function ServiceAssetDetailRedirect({ params }) {
  const { id } = await params;
  redirect(`/database/assets/${id}`);
}
