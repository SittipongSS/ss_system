import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { applyLeadScope, canViewLeads } from '@/lib/sales/leads';
import { calendarRange, toCalendarEntries } from '@/lib/sales/leadCalendar';

export const dynamic = 'force-dynamic';

// จำนวนนัดสูงสุดต่อคำขอ — ช่วงถูกจำกัดที่ ~3 เดือนอยู่แล้ว เพดานนี้เป็นตาข่ายกันเคสผิดปกติ
const MAX_EVENTS = 1000;

// GET /api/sales-planning/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// นัดประชุมของลีดในช่วงวันที่ — วัตถุดิบของหน้า /sa/calendar
//
// ⭐ แหล่งข้อมูลคือ `lead_events` (kind='meeting') **ไม่ใช่** `sales_leads.meetingAt`
// เพราะคอลัมน์นั้นเก็บได้ใบละหนึ่งค่า ("นัดถัดไป" — ดู pickNextMeetingAt) ส่วนปฏิทิน
// ต้องเห็นทุกนัดรวมนัดที่ผ่านไปแล้วและนัดที่ถูกเลื่อน
//
// ⚠️ ขอบเขตต้องเท่ากับคิวลีดเป๊ะ — ใช้ `applyLeadScope` ตัวเดียวกับ GET /leads
// ไม่เขียนกติกาใหม่ที่นี่ ปฏิทินที่หลวมกว่าคิว = ช่องอ่านชื่อลูกค้าข้ามทีม
//
// ลำดับ query ตั้งใจให้ "เหตุการณ์ก่อน แล้วค่อยลีด": ถ้าดึงลีดในขอบเขตมาก่อนจะได้ก้อน
// ที่ไม่มีเพดาน (แอดมินเห็นทุกใบตั้งแต่เปิดระบบ) — ส่วนเหตุการณ์ถูกล้อมด้วยช่วงวันที่แล้ว
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const range = calendarRange(params.get('from'), params.get('to'));
  if (range.error) return badRequest(range.error);

  const { data: events, error: eventsError } = await supabase
    .from('lead_events')
    .select('id, leadId, eventAt, meetingMode, createdByName')
    .eq('kind', 'meeting')
    .gte('eventAt', range.fromIso)
    .lt('eventAt', range.untilIso)
    .order('eventAt', { ascending: true })
    .limit(MAX_EVENTS);
  if (eventsError) return fail(eventsError.message, 500);
  if (!events?.length) return ok([]);

  const leadIds = [...new Set(events.map((event) => event.leadId).filter(Boolean))];
  let query = supabase
    .from('sales_leads')
    .select('id, contactName, company, team, assigneeId, assigneeName, status')
    .in('id', leadIds);
  query = applyLeadScope(query, user);
  const { data: leads, error: leadsError } = await query;
  if (leadsError) return fail(leadsError.message, 500);

  const leadsById = new Map((leads || []).map((lead) => [lead.id, lead]));
  return ok(toCalendarEntries(events, leadsById));
});
