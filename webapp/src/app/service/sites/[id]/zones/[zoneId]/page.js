// ── /service/sites/[id]/zones/[zoneId] → /database/... (มติผู้ใช้ 2026-09-17) ──
// เหตุผลเดียวกับหน้าทะเบียน — ดู `src/app/service/sites/page.js`
import { redirect } from 'next/navigation';

export default async function ServiceZoneDetailRedirect({ params }) {
  const { id, zoneId } = await params;
  redirect(`/database/sites/${id}/zones/${zoneId}`);
}
