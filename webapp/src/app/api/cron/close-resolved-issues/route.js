// ── ปิดเรื่องแจ้งปัญหาที่ผู้แจ้งเงียบเกิน 7 วัน (mig 0219) ────────────────
//
// ⭐ ขาที่สองของ "ปิดสองฝ่าย" (มติ Q8) — แอดมินตั้ง `resolved` แล้วผู้แจ้งเป็นคนปิด
// จริง · ถ้าไม่มีตัวนี้ คิวจะบวมค้างตลอดกาลเพราะคนส่วนใหญ่ไม่กลับมากดยืนยัน
//
// ⚠️ ปิดอัตโนมัติ ≠ ผู้แจ้งยืนยันว่าหาย — จึงติดธง `autoClosed` ไว้ให้อ่านย้อนได้
// ไม่งั้นสถิติ "แก้แล้วหายจริง" จะโป่งด้วยเรื่องที่ไม่มีใครยืนยัน
//
// เรียกโดย Vercel Cron (ดู vercel.json) ด้วย Authorization: Bearer CRON_SECRET
// หรือ admin เปิดเองจากเบราว์เซอร์เพื่อทดสอบ — กติกาเดียวกับ daily-digest
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { AUTO_CLOSE_DAYS, autoClosePatch, isDueForAutoClose } from '@/lib/issues/model';
import { recordIssueEvent } from '@/lib/issues/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!can(user?.role, 'master:manage')) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  // ดึงเฉพาะใบที่รอยืนยันอยู่ (index system_issues_awaiting_confirm_idx)
  const { data, error } = await supabase
    .from('system_issues').select('*').eq('status', 'resolved').limit(500);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ⚠️ ตัดสินด้วยฟังก์ชันเดียวกับที่เทสต์คุมอยู่ ไม่เขียนเงื่อนไขวันที่ซ้ำใน SQL —
  // สองที่ที่ต้องตรงกันเองคือสองที่ที่จะเพี้ยนหากันวันหนึ่ง
  const due = (data || []).filter((row) => isDueForAutoClose(row, now));
  const closed = [];

  for (const row of due) {
    const { data: updated, error: updateError } = await supabase
      .from('system_issues')
      .update({ ...autoClosePatch(now), updatedAt: now.toISOString() })
      .eq('id', row.id)
      // ⚠️ กันแข่งกับผู้แจ้งที่เพิ่งกด "ยืนยัน"/"ยังไม่หาย" พอดี — แถวที่ขยับไปแล้ว
      // จะไม่ match เงื่อนไขนี้ แล้ว cron จะข้ามไปเงียบ ๆ แทนที่จะทับสถานะที่ถูกต้อง
      .eq('status', 'resolved')
      .select().maybeSingle();
    if (updateError || !updated) continue;

    // fire-and-forget: แจ้งเตือนพลาดต้องไม่ทำให้รอบ cron ล้ม
    await recordIssueEvent(supabase, {
      row: updated,
      kind: 'auto_close',
      body: `ผู้แจ้งไม่ได้ยืนยันภายใน ${AUTO_CLOSE_DAYS} วัน — ระบบปิดเรื่องให้อัตโนมัติ`,
    });
    closed.push(updated.code || updated.id);
  }

  return Response.json({ scanned: (data || []).length, closed: closed.length, codes: closed });
}
