import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canUser, taskCreditId } from '@/lib/permissions';
import { calendarRange, toCalendarEntries } from '@/lib/sales/leadCalendar';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { fetchAll, fetchAllResult } from '@/lib/supabaseFetchAll';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/my-schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// วัตถุดิบของส่วน "กำหนดการของฉัน" บนแดชบอร์ดของฉัน — สามแหล่งในคำขอเดียว:
//   นัดลูกค้า (`lead_events` kind='meeting') · งานของฉัน (`personal_tasks`)
//   · คำร้องที่ฉันเปิด (`dept_requests`)
//
// ⚠️ **ขอบเขตคือ "ของฉัน" เท่านั้น ไม่ใช่ของทีม** — ทุกตัวเลขในแท็บนี้เป็นของเจ้าของ
// งานคนเดียว (กติกาเดียวกับ my-dashboard) · ปฏิทินที่หลวมกว่าคิวลีดคือช่องอ่านนัด
// ข้ามทีมโดยไม่ตั้งใจ ⇒ ที่นี่กรองด้วย `assigneeId === user.id` ตรง ๆ ไม่ใช่ applyLeadScope
//
// ⚠️ **ส่ง `at` เป็น ISO ดิบ ไม่แบ่งวันให้** — `eventAt` เป็น UTC และ server ไม่รู้
// timezone ของคนดู · การแบ่งช่องวันเกิดฝั่งจอเสมอ (`localDayKey` ใน lib/salesPlanning/mySchedule)
// `calendarRange` จึงถ่างช่วงเผื่อขอบให้ด้านละวันอยู่แล้ว
//
// ⚠️ **ของค้างข้ามช่วง**: `overdueTasks` / `overdueRequests` = ของที่เลยกำหนดก่อนวันนี้
// ส่งมาเสมอไม่ขึ้นกับช่วงที่ขอ — การ์ด "ถึงกำหนด" ของวันนี้ต้องเห็นของที่ค้างมาจาก
// วันก่อน ไม่งั้นใบที่เลยกำหนดจะหายไปจากสายตาทันทีที่ข้ามวัน

/** งานส่วนตัวของฉัน — สามความสัมพันธ์ (เจ้าของ · ผู้รับมอบหมาย · ผู้ทำแทน) เหมือน my-dashboard
 *  ⚠️ `personal_tasks` เกินเพดาน 1,000 แถวของ PostgREST ไปแล้ว ⇒ ต้อง `fetchAll`
 *  พร้อมลำดับที่นิ่ง (`dueDate` ซ้ำกันได้ทั้งตาราง จึงพ่วง `id`) */
const myTasksBefore = (supabase, column, userId, to) => fetchAll(() => supabase.from('personal_tasks').select('*')
  .eq(column, userId)
  .not('dueDate', 'is', null)
  .lte('dueDate', to)
  .order('dueDate', { ascending: true })
  .order('id', { ascending: true }));

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  // แท็บนี้อยู่ในแดชบอร์ดงานขาย — ด่านเดียวกับหน้าที่มันฝังอยู่
  if (!canUser(user, 'salesplan:view')) return forbidden();

  const params = new URL(req.url).searchParams;
  const from = String(params.get('from') || '');
  const to = String(params.get('to') || '');
  const range = calendarRange(from, to);
  if (range.error) return badRequest(range.error);

  const today = businessDate();

  const [eventsResult, tasksResult, requestsResult] = await Promise.all([
    supabase
      .from('lead_events')
      .select('id, leadId, eventAt, meetingMode, createdByName')
      .eq('kind', 'meeting')
      .gte('eventAt', range.fromIso)
      .lt('eventAt', range.untilIso)
      .order('eventAt', { ascending: true }),
    /* ดึงถึงปลายช่วงแล้วค่อยแยก "ในช่วง" กับ "เลยกำหนด" ฝั่งนี้ — สองคำถามใช้ query
       เดียวกันได้ และแยกทีหลังถูกกว่ายิงสองรอบ */
    Promise.all(['ownerId', 'assigneeId', 'proxyBy'].map((column) => myTasksBefore(supabase, column, user.id, to)))
      .then((groups) => ({ data: groups.flat(), error: null }))
      .catch((error) => ({ data: null, error })),
    /* คำร้องของฉันที่ยังไม่ปิด — จำนวนต่อคนน้อย แต่ยังต้อง `fetchAll` เพราะไม่มีอะไร
       ในคำสั่งจำกัดแถวไว้เลย (กติกาของ `npm run check:rowcap`) */
    fetchAllResult(() => supabase.from('dept_requests').select('*')
      .eq('requestedById', user.id)
      .in('status', REQUEST_OPEN_STATUSES)
      .order('committedDueDate', { ascending: true })
      .order('id', { ascending: true })),
  ]);

  if (eventsResult.error) return fail(eventsResult.error.message, 500);
  if (tasksResult.error) return fail(tasksResult.error.message, 500);
  if (requestsResult.error) return fail(requestsResult.error.message, 500);

  // ── นัดลูกค้า: เหตุการณ์ในช่วง → ลีดที่ **ฉัน** ดูแล ──
  const events = eventsResult.data || [];
  let meetings = [];
  if (events.length) {
    const leadIds = [...new Set(events.map((event) => event.leadId).filter(Boolean))];
    const { data: leads, error: leadsError } = await supabase
      .from('sales_leads')
      .select('id, contactName, company, team, assigneeId, assigneeName, status')
      .eq('assigneeId', user.id)
      .in('id', leadIds);
    if (leadsError) return fail(leadsError.message, 500);
    meetings = toCalendarEntries(events, new Map((leads || []).map((lead) => [lead.id, lead])));
  }

  // ── งาน: ของฉันจริง (เครดิตงานเป็นของคนเดียว) และยังไม่เสร็จ ──
  /* ⚠️ กรอง "ยังไม่เสร็จ" ฝั่ง JS ไม่ใช่ `.neq('status','Completed')` — PostgREST ตัด
     แถวที่ค่าเป็น NULL ออกจากผลของ `neq` ด้วย ⇒ งานเก่าที่ไม่มีสถานะจะหายไปเงียบ ๆ */
  const seenTask = new Set();
  const tasks = (tasksResult.data || [])
    .filter((task) => taskCreditId(task) === user.id)
    .filter((task) => task.status !== 'Completed')
    .filter((task) => (seenTask.has(task.id) ? false : seenTask.add(task.id)));

  const requests = requestsResult.data || [];
  const requestDue = (request) => request.committedDueDate || request.requestedDueDate || null;
  const inRange = (date) => !!date && date >= from && date <= to;
  const isOverdue = (date) => !!date && date < today;

  return ok({
    from,
    to,
    today,
    meetings,
    tasks: tasks.filter((task) => inRange(task.dueDate)),
    requests: requests.filter((request) => inRange(requestDue(request))),
    /* ของค้าง: เฉพาะที่ **ยังไม่อยู่ในช่วงที่ขอ** — ไม่งั้นใบเดียวกันจะถูกนับสองรอบ
       ตอนช่วงที่กางคาบวันในอดีต (มุมมองเดือนคาบเสมอ) */
    overdueTasks: tasks.filter((task) => isOverdue(task.dueDate) && !inRange(task.dueDate)),
    overdueRequests: requests.filter((request) => {
      const date = request.committedDueDate;  // ยังไม่รับปาก = ไม่มีใครผิดสัญญา ไม่นับว่าค้าง
      return isOverdue(date) && !inRange(date);
    }),
  });
});
