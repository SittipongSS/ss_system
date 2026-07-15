import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { canSeeRdKpi, normalizeDepartment } from '@/lib/permissions';
import { loadUserDirectory } from '@/lib/usersRepo';
import {
  TASK_KPI_WEIGHTS, aggregateGroup, clampPeriod, emptyPerson, finalize,
  inPeriod, loadTasksForUsers, tallyTask, taskCreditId, ymd,
} from '@/lib/pm/taskKpi';
import { setHolidays, countBusinessDays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

// ── KPI ฝ่าย RD — วัดแยกจากฝ่ายขาย (มติ 2026-07-15) ──
// สองเส้นวัด:
//   1. SLA ตอบข้อสอบถาม (ตาราง inquiries): ตอบทันกำหนด (dueDate = +3 วันทำการ),
//      เวลาตอบเฉลี่ยเป็นวันทำการ, ค้างตอบ/เลยกำหนดตอนนี้
//   2. งาน personal_tasks ของคนฝ่าย RD: สูตรคะแนนเดียวกับ KPI งานฝ่ายขาย
//      (lib/pm/taskKpi — เสร็จ 40 + ตรงเวลา 40 + ความยาก 20)
// ช่วงเวลา: default เดือนปัจจุบัน (from/to override ได้) — งานนับตามช่วง,
// เรื่องที่ "ตอบแล้ว" นับเมื่อ answeredAt อยู่ในช่วง, ค้าง/เลยกำหนดคือสถานะปัจจุบัน

const DEPT = 'RD';

function emptyInquiryStats() {
  return { answered: 0, answeredOnTime: 0, answeredWithDue: 0, onTimePct: 0, avgResponseDays: null, openNow: 0, overdueNow: 0, _responseDays: [] };
}

function finalizeInquiryStats(s) {
  s.onTimePct = s.answeredWithDue > 0 ? Math.round((s.answeredOnTime / s.answeredWithDue) * 100) : (s.answered > 0 ? 100 : 0);
  s.avgResponseDays = s._responseDays.length
    ? Math.round((s._responseDays.reduce((a, b) => a + b, 0) / s._responseDays.length) * 10) / 10
    : null;
  delete s._responseDays;
  return s;
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canSeeRdKpi(user.role)) return forbidden();

  const url = new URL(req.url);
  const period = clampPeriod(url.searchParams.get('from'), url.searchParams.get('to'));

  // คนฝ่าย RD ทุก role (rd ใหม่ + staff เดิมที่ยังไม่ย้าย role)
  const directory = await loadUserDirectory(supabase);
  const people = Array.from(directory.values()).filter((u) => normalizeDepartment(u.department) === DEPT);
  const peopleIds = people.map((u) => u.id);
  const rowsByUser = new Map(people.map((u) => [u.id, { ...emptyPerson(u), inquiries: emptyInquiryStats() }]));

  // ── งานของคนฝ่าย RD (สูตรคะแนนกลาง) ──
  let tasks = [];
  try {
    tasks = peopleIds.length ? await loadTasksForUsers(supabase, peopleIds) : [];
  } catch (error) {
    return fail(error.message, 500);
  }
  const today = businessDate();
  const peopleSet = new Set(peopleIds);
  for (const task of tasks.filter((t) => inPeriod(t, period.from, period.to))) {
    const rid = taskCreditId(task);
    if (!rid || !peopleSet.has(rid)) continue;
    const row = rowsByUser.get(rid);
    if (row) tallyTask(row, task, today);
  }

  // ── ข้อสอบถามของฝ่าย (ทั้งหมด — ปริมาณต่อฝ่ายต่ำ กรองช่วงเวลาในลูป) ──
  const { data: inquiries, error: inqError } = await supabase
    .from('inquiries').select('*').eq('targetDept', DEPT).order('createdAt', { ascending: false });
  if (inqError) return fail(inqError.message, 500);

  setHolidays([...(await holidaySet())]); // เวลาตอบนับเป็น "วันทำการ" ให้ตรงกับ SLA
  const deptInquiries = emptyInquiryStats();
  let createdInPeriod = 0;
  let unassignedOpen = 0;
  for (const q of inquiries || []) {
    const createdDay = ymd(q.createdAt);
    if (createdDay && createdDay >= period.from && createdDay <= period.to) createdInPeriod += 1;

    const responderId = q.answeredById || q.assigneeId;
    const personRow = responderId ? rowsByUser.get(responderId) : null;
    const buckets = personRow ? [personRow.inquiries, deptInquiries] : [deptInquiries];

    const answeredDay = ymd(q.answeredAt);
    if (answeredDay && answeredDay >= period.from && answeredDay <= period.to) {
      const respDays = createdDay ? Math.max(0, countBusinessDays(createdDay, answeredDay)) : null;
      for (const b of buckets) {
        b.answered += 1;
        if (respDays != null) b._responseDays.push(respDays);
        if (q.dueDate) {
          b.answeredWithDue += 1;
          if (answeredDay <= q.dueDate) b.answeredOnTime += 1;
        }
      }
    }
    if (q.status === 'open') {
      if (!q.assigneeId) unassignedOpen += 1;
      for (const b of buckets) {
        b.openNow += 1;
        if (q.dueDate && q.dueDate < today) b.overdueNow += 1;
      }
    }
  }

  const rows = Array.from(rowsByUser.values())
    .map((row) => { finalize(row); finalizeInquiryStats(row.inquiries); return row; })
    .sort((a, b) => b.score - a.score || b.inquiries.answered - a.inquiries.answered || a.name.localeCompare(b.name, 'th'));
  const taskSummary = aggregateGroup(DEPT, rows);
  const userName = (id) => directory.get(id)?.name || directory.get(id)?.email || null;
  const taskFeed = [...tasks]
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 40)
    .map((task) => ({
      id: task.id, title: task.title, note: task.note || null, status: task.status,
      category: task.category || null, urgent: !!task.urgent, important: !!task.important,
      dueDate: task.dueDate || null, createdAt: task.createdAt, updatedAt: task.updatedAt,
      completedAt: task.completedAt || null,
      assigneeName: userName(taskCreditId(task)) || userName(task.assigneeId) || userName(task.ownerId) || 'ทีม RD',
      assignedByName: userName(task.assignedBy) || userName(task.ownerId),
      inquiryId: task.inquiryId || null, dealId: task.dealId || null, projectId: task.projectId || null,
    }));

  // คิวเรื่องค้าง (สำหรับ action queue บนแดชบอร์ด) — เรียงใกล้ครบกำหนดก่อน
  const openQueue = (inquiries || [])
    .filter((q) => q.status === 'open')
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')))
    .slice(0, 12);

  const inquiryMap = new Map((inquiries || []).map((q) => [q.id, q]));
  let activityFeed = [];
  if (inquiryMap.size) {
    const { data: feedRows, error: feedError } = await supabase
      .from('inquiry_messages')
      .select('id, inquiryId, kind, body, authorName, authorDept, createdAt, editedAt, acknowledgedAt, deletedAt')
      .in('inquiryId', Array.from(inquiryMap.keys()))
      .order('createdAt', { ascending: false })
      .limit(40);
    if (feedError) return fail(feedError.message, 500);
    activityFeed = (feedRows || []).map((message) => {
      const inquiry = inquiryMap.get(message.inquiryId);
      return {
        ...message,
        body: message.deletedAt ? null : message.body,
        inquiryCode: inquiry?.code || null,
        inquiryTitle: inquiry?.title || 'เรื่องสอบถาม RD',
        inquiryStatus: inquiry?.status || 'open',
        urgent: !!inquiry?.urgent,
        requesterName: inquiry?.requesterName || null,
        assigneeName: inquiry?.assigneeName || null,
        dueDate: inquiry?.committedDueDate || inquiry?.requestedDueDate || inquiry?.dueDate || null,
        dealId: inquiry?.dealId || null,
        projectId: inquiry?.projectId || null,
      };
    });
  }

  return ok({
    from: period.from,
    to: period.to,
    weights: TASK_KPI_WEIGHTS,
    people: rows,
    taskSummary,
    inquirySummary: { ...finalizeInquiryStats(deptInquiries), createdInPeriod, unassignedOpen },
    openQueue,
    activityFeed,
    taskFeed,
  });
});
