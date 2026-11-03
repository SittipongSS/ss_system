// ── เส้นทางกลางของทะเบียนสรรพสามิต: `/go/registration/<id>` → หน้าที่คนกดเปิดได้ ─────────────────────────
//
// มติเจ้าของ 02/11 V13: /tax เข้าได้เฉพาะ RA + แอดมิน + ผู้ดู (cap `tax:module`) — ฝ่ายขายทำงานทะเบียนจากแผงบนหน้าสินค้า
// ⇒ ลิงก์ทะเบียนจากหน้าฝ่ายขาย/แจ้งเตือนชี้มาที่นี่ที่เดียว แล้วพาไปตามสิทธิ์ของคนกด:
//   · ถือ tax:module → `/tax/registrations/<id>` (หน้าทำงานของ RA)
//   · ไม่ถือ          → หน้าสินค้า FG ของทะเบียน `?registration=<id>` (หน้าเปิดแผงทะเบียนให้เอง)
// ⚠️ ไม่ตรวจสิทธิ์ดูทะเบียนที่นี่ — แค่แปลง id → หน้า · ด่านจริงอยู่ที่หน้าปลายทาง + API ของมัน (แบบเดียวกับ /go/[code])
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function NotFound({ reason }) {
  return (
    <div className="empty-state">
      <strong>ไม่พบทะเบียนสรรพสามิต</strong>
      <span>{reason}</span>
      <Link href="/home" className="linklike">กลับหน้าแรก</Link>
    </div>
  );
}

export default async function RegistrationRedirect({ params }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(String(raw || ''));
  const user = await getCurrentUser();
  if (canUser(user, 'tax:module')) redirect(`/tax/registrations/${encodeURIComponent(id)}`);

  const { data, error } = await getSupabaseAdmin()
    .from('excise_registrations').select('id, "productId"').eq('id', id).maybeSingle();
  if (error) return <NotFound reason={`เปิดทะเบียนไม่สำเร็จ: ${error.message}`} />;
  if (!data?.productId) return <NotFound reason="ทะเบียนนี้ถูกลบไปแล้ว หรือไม่ได้ผูกสินค้า" />;
  redirect(`/database/products/${encodeURIComponent(data.productId)}?registration=${encodeURIComponent(data.id)}`);
}
