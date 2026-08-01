// ── เส้นทางกลาง: รหัสเอกสาร → หน้าจริง ──────────────────────────────────
//
// `/go/QT-26070028-0` → หา id ของใบนั้นแล้วพาไปหน้ารายละเอียด
//
// ⭐ มีไว้เพื่อให้ **ข้อความในเธรดทำรหัสเป็นลิงก์ได้โดยไม่ต้องยิง DB ตอนวาด** —
// หน้า QT/SO/ดีล เปิดด้วย id ไม่ใช่เลขที่เอกสาร ถ้าให้ตัว render ไปหา id เอง
// ทุกข้อความที่มีรหัสจะกลายเป็นหนึ่ง query ต่อการวาดหนึ่งครั้ง
//
// ⚠️ ไม่ตรวจสิทธิ์ที่นี่: มันแค่แปลง "รหัส → id" ซึ่งเป็นข้อมูลที่อยู่ในข้อความที่
// ผู้อ่านเห็นอยู่แล้ว · ด่านจริงอยู่ที่หน้าปลายทาง + API ของมันเหมือนเดิมทุกประการ
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { parseDocRef } from '@/lib/master/docRefs';

export const dynamic = 'force-dynamic';

function NotFound({ code, reason }) {
  return (
    <div className="empty-state">
      <strong>ไม่พบเอกสาร</strong>
      <span><span className="mono">{code}</span> — {reason}</span>
      <Link href="/home" className="linklike">กลับหน้าแรก</Link>
    </div>
  );
}

export default async function DocRefRedirect({ params }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(String(raw || ''));
  const ref = parseDocRef(code);
  if (!ref) return <NotFound code={code} reason="ไม่ใช่รูปแบบรหัสที่ระบบรู้จัก" />;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(ref.table).select('id').eq(ref.column, ref.code).limit(1).maybeSingle();
  // ⚠️ แยก "อ่านไม่สำเร็จ" ออกจาก "ไม่มีรหัสนี้" — ไม่งั้น schema error กลายเป็น
  // "ไม่พบเอกสาร" แล้วไล่ผิดทางยาว (กฎเดียวกับ loadUpdateParent)
  if (error) return <NotFound code={ref.code} reason={`เปิดทะเบียนไม่สำเร็จ: ${error.message}`} />;
  if (!data?.id) return <NotFound code={ref.code} reason={`ไม่มี${ref.label}เลขนี้ในระบบ`} />;

  redirect(ref.path(data.id));
}
