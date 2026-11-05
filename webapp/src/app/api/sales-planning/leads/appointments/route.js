import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canViewLeads } from '@/lib/sales/leads';
import { thaiDayRange } from '@/lib/sales/leadAppointments';
import { loadActiveAppointmentsInRange, withVisibleLeadNames } from '@/lib/sales/leadAppointmentsRepo';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/leads/appointments?date=YYYY-MM-DD
// นัดที่ยังไม่ปิดของ "วันไทย" หนึ่งวัน ทุกห้องทุกรูปแบบ — วัตถุดิบของแผ่นเลือกห้องในฟอร์มรับลีด
// และกล่องนัดประชุม (ห้องไหนว่าง/ไม่ว่างช่วงไหน) · mig 0424
//
// ⚠️ แถวของลีดนอกขอบเขตคนดู **ไม่ถูกตัดทิ้ง** แค่ไม่มีชื่อลูกค้า — ห้องที่ถูกจองต้องขึ้นว่าไม่ว่าง
//    ในสายตาทุกคน (AE ทีมหนึ่งต้องรู้ว่า Studio 02 ไม่ว่าง แม้จะเป็นลูกค้าของอีกทีม) ส่วนชื่อลูกค้า
//    เป็นข้อมูลของทีมอื่น (กติกาเดียวกับปฏิทินนัด) · ด่านจริงของ "ห้องชน" อยู่ที่ตอนบันทึก ไม่ใช่ที่นี่
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();

  const range = thaiDayRange(new URL(req.url).searchParams.get('date'));
  if (!range) return badRequest('ต้องระบุวันที่ (date) รูปแบบ YYYY-MM-DD');

  const { data, error } = await loadActiveAppointmentsInRange(supabase, range);
  if (error) return fail(`อ่านนัดของวันนั้นไม่สำเร็จ: ${error.message}`, 500);
  const rows = await withVisibleLeadNames(supabase, user, data || []);
  return ok(rows.map((row) => ({
    id: row.id,
    leadId: row.leadId,
    contactName: row.contactName || null,
    company: row.company || null,
    source: row.source,
    mode: row.mode,
    room: row.room,
    startAt: row.startAt,
    endAt: row.endAt,
    createdByName: row.createdByName || null,
  })));
});
