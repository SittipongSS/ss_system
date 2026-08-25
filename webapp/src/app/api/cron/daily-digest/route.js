import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { holidaySet } from '@/lib/master/holidays';
import { businessDaysWaiting } from '@/lib/sales/handoffQueue';
import { overdueLeadNotices } from '@/lib/sales/leadNotify';
import { notifyUsers } from '@/lib/notifications';
import { businessDayKey } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/daily-digest — ทวงลีดค้างเกิน SLA เข้ากล่องแจ้งเตือน **รายคน**
// เรียกโดย Vercel Cron (08:30 ไทย จ-ศ, ดู webapp/vercel.json) ด้วย Authorization:
// Bearer CRON_SECRET หรือ admin เปิดเองจากเบราว์เซอร์เพื่อทดสอบ
//
// 🪦 **เดิมชื่อ "สรุปประจำวัน" เพราะส่งการ์ด 4 ใบเข้า Google Chat** (งานค้างอนุมัติ ·
// ลีดค้างคิว · งานโครงการใกล้ครบกำหนด · รอยต่อเอกสารค้าง) · ท่อ Chat ถูกถอดออกทั้งระบบ
// 2026-08-12 (มติผู้ใช้: ใช้กระดิ่ง + ป้ายตัวเลขพอ) ⇒ **สามใบที่ไม่มีคู่ในกล่องแจ้งเตือน
// หายไปด้วย** เหลือแต่การทวงลีดซึ่งถึงตัวคนที่ต้องลงมือโดยตรงอยู่แล้ว
// ⚠️ ชื่อ path คงเดิมเพราะผูกกับ `crons` ใน vercel.json — เปลี่ยนชื่อ = ต้องแก้สองที่
// ให้ตรงกัน แล้ว cron เงียบทันทีถ้าพลาด (บทเรียน 401 ที่เพิ่งเจอ)

/* ทวงลีดที่เลย SLA เข้ากล่องแจ้งเตือนรายคน — หนึ่งคนได้เด้งเดียวต่อวัน
   กติกา "ใครค้างอะไร" อยู่ที่ `overdueLeadNotices` (lib/sales/leadNotify.js) ที่นี่แค่
   ดึงข้อมูลกับยิง · ยิงซ้ำวันเดียวกันไม่เกิดแถวซ้ำ (dedupeKey ต่อคนต่อวัน) */
async function notifyOverdueLeads(supabase) {
  const { data, error } = await supabase
    .from('sales_leads')
    .select('id, contactName, status, team, assigneeId, createdAt, screenedAt, assignedAt, followUpAt')
    // ⭐ `contacted` เข้ามาพร้อม mig 0289 — สถานะนี้เคยไม่มีนาฬิกาเลย ลีดที่ติดต่อแล้ว
    // จึงเงียบหายไปจากการทวงทั้งหมด · นับจาก `followUpAt` (วันที่ AE รับปากลูกค้าไว้)
    .in('status', ['new', 'screened', 'assigned', 'contacted']);
  if (error) return { sent: 0, error: error.message };
  if (!data?.length) return { sent: 0, reason: 'ไม่มีลีดค้าง' };

  const [holidays, directory] = await Promise.all([
    holidaySet().catch(() => new Set()),
    loadUserDirectory(supabase).catch(() => new Map()),
  ]);
  const now = new Date().toISOString();
  // ⚠️ ก๊อปที่ 2 ของ 3 — ต้องตรงกับ SINCE_OF ใน lib/sales/leadNotify.js เป๊ะ
  // (อีกตัวอยู่ที่ lib/sales/leadDigest.js) · `contacted` คืน null ได้ ตัวกรองฝั่ง
  // overdueLeadNotices ตัดใบพวกนั้นออกเอง
  const sinceOf = {
    new: (l) => l.createdAt,
    screened: (l) => l.screenedAt || l.createdAt,
    assigned: (l) => l.assignedAt || l.createdAt,
    contacted: (l) => l.followUpAt || null,
  };
  const notices = overdueLeadNotices(data, {
    directory,
    ageOf: (lead) => businessDaysWaiting(sinceOf[lead.status]?.(lead), now, holidays),
    dayKey: businessDayKey(now),
  });
  if (!notices.length) return { sent: 0, reason: 'ไม่มีลีดเลย SLA' };

  let sent = 0;
  for (const notice of notices) {
    const result = await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'lead',
      entityId: notice.entityId,
      kind: 'lead_overdue',
      title: notice.title,
      body: notice.body,
      dedupeKey: notice.dedupeKey,
      // สรุปหลายใบ → พาไปที่ *คิว* ไม่ใช่ใบใดใบหนึ่ง (การ์ด "ค้างคิว" อยู่บนหน้านั้นแล้ว)
      href: '/sa/leads',
      actorName: 'สรุปประจำวัน',
    });
    sent += result.sent || 0;
  }
  return { sent, notices: notices.length };
}

export async function GET(request) {
  // ผ่านได้ 2 ทาง: Vercel Cron (Bearer CRON_SECRET) หรือ admin กดทดสอบเองจากเบราว์เซอร์
  //
  // ⚠️ ด่านนี้จะทำงานได้ก็ต่อเมื่อ proxy ปล่อย `/api/cron/` ผ่าน (bypassesSessionGate)
  // — cron ไม่มี cookie session · เคยโดน proxy ตอบ 401 แทนเงียบ ๆ อยู่ 4 สัปดาห์
  const auth = request.headers.get('authorization');
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!can(user?.role, 'master:manage')) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();
  const results = {};
  try {
    results.leadOverdue = await notifyOverdueLeads(supabase);
  } catch (e) {
    results.leadOverdue = { sent: 0, error: e?.message || String(e) };
  }

  return Response.json({ ok: true, at: new Date().toISOString(), results });
}
