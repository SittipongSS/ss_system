// ── /service/sites/[id] → /database/sites/[id] (มติผู้ใช้ 2026-09-17) ──────
// เหตุผลเดียวกับหน้าทะเบียน — ดู `src/app/service/sites/page.js`
import { redirect } from 'next/navigation';

export default async function ServiceSiteDetailRedirect({ params }) {
  const { id } = await params;
  redirect(`/database/sites/${id}`);
}
