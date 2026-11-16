// ── ลิงก์โครงการเก่า: `/go/project/<id หรือรหัส PJ>` → หน้าลูกค้าศูนย์รวมของโครงการนั้น ───────────────────────────────────
//
// ยุบดีล/โครงการ P2d (มติเจ้าของ 13/11/2026 ④): เมนูโครงการถูกถอด · ลิงก์เก่า (แจ้งเตือน · บุ๊กมาร์ก · เธรด) ถูก proxy
// พามาที่นี่ แล้วส่งต่อไปหน้าลูกค้าศูนย์รวม (แฟ้มรวมดีลของลูกค้า แทนโครงการ) · โครงการไม่มีลูกค้า/ถูกลบ = รายการดีล
// ⚠️ ไม่ตรวจสิทธิ์ที่นี่ — แค่แปลง id → หน้า · ด่านจริงอยู่ที่หน้าปลายทาง + API ของมัน (แบบเดียวกับ /go/registration)
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isProjectCode } from '@/lib/pm/oldProjectLink';

export const dynamic = 'force-dynamic';

export default async function ProjectRedirect({ params }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(String(raw || ''));
  // ลิงก์เก่าบางจุด (หน้าคำร้อง · คำร้องประเมินพื้นที่) ใช้รหัส PJ แทน id — รับทั้งสองแบบ
  const { data, error } = await getSupabaseAdmin()
    .from('projects').select('id, "customerId"').eq(isProjectCode(id) ? 'code' : 'id', id).maybeSingle();
  if (error) {
    return (
      <div className="empty-state">
        <strong>เปิดลิงก์โครงการเดิมไม่สำเร็จ</strong>
        <span>{error.message}</span>
        <Link href="/sa/deals" className="linklike">ไปหน้ารายการดีล</Link>
      </div>
    );
  }
  if (!data?.customerId) redirect('/sa/deals');
  redirect(`/database/customers/${encodeURIComponent(data.customerId)}`);
}
