// ── เส้นทางกลางของบันทึกการยื่นชำระภาษีสรรพสามิต: `/go/filing/<id>` → หน้าที่คนกดเปิดได้ ─────────────────────
//
// มติเจ้าของ 02/11 V13: /tax เข้าได้เฉพาะ RA + แอดมิน + ผู้ดู (cap `tax:module`) — ฝ่ายขายเห็นขั้นของ RA บนเส้นเดินงานของ SO
// ⇒ ลิงก์บันทึกการยื่นจากหน้าฝ่ายขาย/แจ้งเตือนชี้มาที่นี่ แล้วพาไปตามสิทธิ์ของคนกด:
//   · ถือ tax:module → `/tax/filings/<id>`
//   · ไม่ถือ          → SO ลูกค้าของบันทึก (เส้นเดินงานบอกว่า RA ถึงขั้นไหน) · บันทึกเก่าที่ไม่ผูก SO = หน้าแรก
// ⚠️ ไม่ตรวจสิทธิ์ที่นี่ — ด่านจริงอยู่ที่หน้าปลายทาง (แบบเดียวกับ /go/[code])
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function NotFound({ reason }) {
  return (
    <div className="empty-state">
      <strong>ไม่พบบันทึกการยื่นชำระ</strong>
      <span>{reason}</span>
      <Link href="/home" className="linklike">กลับหน้าแรก</Link>
    </div>
  );
}

export default async function FilingRedirect({ params }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(String(raw || ''));
  const user = await getCurrentUser();
  if (canUser(user, 'tax:module')) redirect(`/tax/filings/${encodeURIComponent(id)}`);

  const { data, error } = await getSupabaseAdmin()
    .from('orders').select('id, "salesOrderId"').eq('id', id).maybeSingle();
  if (error) return <NotFound reason={`เปิดบันทึกไม่สำเร็จ: ${error.message}`} />;
  if (!data) return <NotFound reason="บันทึกนี้ถูกยกเลิก/ลบไปแล้ว" />;
  if (!data.salesOrderId) return <NotFound reason="บันทึกนี้ไม่ได้ผูกใบสั่งขาย — ดูได้ที่ระบบภาษีสรรพสามิต (ฝ่าย RA)" />;
  redirect(`/sa/sales-orders/${encodeURIComponent(data.salesOrderId)}`);
}
