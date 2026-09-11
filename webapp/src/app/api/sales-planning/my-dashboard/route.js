import { withUser, ok, fail, unauthorized } from '@/lib/http';
import { monthKey } from '@/lib/salesPlanning';
import { summarizeOpenTasks } from '@/lib/pm/taskSummary';
import { taskCreditId } from '@/lib/permissions';
import { loadHandoffQueue } from '@/lib/sales/handoffQueueData';
import { summarizeMyDeals } from '@/lib/sales/myDashboardTotals';
import { businessDate } from '@/lib/businessDate';
import { businessDayKey, currentMonth, isYearValue } from '@/lib/datePeriods';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  /* นาฬิกาตัวเดียวของคำขอนี้ — ทั้งค่าถอยของ `month` และเดือนของยอดรออนุมัติอ่านจากตัวนี้
     ⚠️ ค่าถอยเดิมเป็น `monthKey(new Date().toISOString())` = เดือนตาม UTC (ตี 0–7 วันที่ 1
     ได้เดือนก่อน) · ใช้ currentMonth (เวลาไทย) ตัวเดียวกับที่ตัดสินเดือนของยอดรออนุมัติ */
  const now = new Date();
  const month = monthKey(params.get('month')) || currentMonth(now);
  /* year=YYYY = "ทุกเดือนของปีนั้น" (ติ๊ก "ทุกเดือน" บนหัวแดชบอร์ด) — กติกาเดียวกับ
     ลีด/ดีล (มติ 2026-07-29): ทุกเดือน**ของปีที่เลือก** ไม่ใช่ทุกปีตั้งแต่เปิดระบบ
     ⚠️ `month` ยังส่งมาเสมอ ตัวนี้แค่ขยายขอบเป็นทั้งปีของเดือนนั้น */
  const year = isYearValue(params.get('year')) ? params.get('year') : null;

  // 1. My Target & Won
  const [
    targetRes, dealsRes, leadsRes, tasksByOwner, tasksByAssignee, tasksByProxy, myRequestsRes,
  ] = await Promise.all([
    /* เป้าของฉัน — **รวมทุกแถวที่เข้าเงื่อนไข** ไม่ใช่ `.single()`
       · โหมดทั้งปี = 12 แถวรายเดือนบวกกัน (`targetMonth` มีค่าเฉพาะแถวรายเดือน
         แถวเป้ารายปีเป็น null จึงไม่หลุดเข้ามาซ้ำ)
       · โหมดเดือนเดียวก็รวมเช่นกัน — คนอยู่หลายทีมมีเป้าเดือนเดียวกันได้มากกว่าหนึ่งแถว
         (unique คือ period+team+ownerId) แล้ว `.single()` เดิมคืน error ⇒ จอขึ้น
         "ยังไม่ตั้งเป้า" ทั้งที่ตั้งไว้แล้ว */
    (year
      ? supabase.from('sales_targets').select('targetAmount').eq('ownerId', user.id).like('targetMonth', `${year}-%`)
      : supabase.from('sales_targets').select('targetAmount').eq('ownerId', user.id).eq('targetMonth', month)),
    supabase
      .from('sales_deals')
      .select('*')
      .eq('ownerId', user.id),
    supabase
      .from('sales_leads')
      .select('*')
      .eq('assigneeId', user.id)
      .in('status', ['new', 'screened', 'assigned', 'contacted', 'meeting'])
      .order('createdAt', { ascending: false }),
    supabase.from('personal_tasks').select('*').eq('ownerId', user.id),
    supabase.from('personal_tasks').select('*').eq('assigneeId', user.id),
    supabase.from('personal_tasks').select('*').eq('proxyBy', user.id),
    /* ⭐ **คำร้องของฉัน** (2026-08-12 · แบบ ก) — แดชบอร์ดนี้ไม่เคยแตะ `dept_requests`
       สักบรรทัด ⇒ ใบที่ถูกตีกลับ (ม-102) มองไม่เห็นจากหน้านี้เลย ทั้งที่เป็นของค้าง
       ที่ **ไม่มีใครกำลังทำอยู่** (ฝ่ายปล่อยมือแล้ว ผู้ขอยังไม่รู้ตัว)
       ⚠️ รวม `draft` ด้วยโดยตั้งใจ — ใบตีกลับกลับไปเป็นร่าง · ตัวกรองฝั่งล่างจะตัด
       ร่างที่ยังไม่เคยส่งออกเอง (ร่างเปล่าไม่ใช่ของค้าง มันคือของที่ยังไม่เริ่ม) */
    /* ⭐ รวม `answered` (ม-145) — ฝ่ายตอบแล้วรอเรากดปิด คือของค้างของผู้ขอจริง ๆ · เดิมไม่โหลด
       ⇒ ใบ "รอ SA ปิด" ไม่เคยโผล่บนแดชบอร์ดของคนที่ต้องกด (`buildMyQueue` ตัดสินต่อ) */
    supabase.from('dept_requests').select('*')
      .eq('requestedById', user.id)
      .in('status', ['draft', 'pending', 'acknowledged', 'answered']),
  ]);

  /* 🔴 supabase ไม่ throw — ทุกก้อนต้องเช็ค `error` เอง ไม่งั้นก้อนที่พังกลายเป็น []
     แล้วแดชบอร์ดขึ้น "ไม่มีดีล/ไม่มีลีด/ไม่มีงาน" ทั้งที่ของอยู่ครบ
     (โรคเดียวกับที่คอมเมนต์ข้างบนบันทึกไว้ว่า `.single()` เคยทำให้จอขึ้น
     "ยังไม่ตั้งเป้า" ทั้งที่ตั้งไว้แล้ว) */
  for (const res of [targetRes, dealsRes, leadsRes, tasksByOwner, tasksByAssignee, tasksByProxy, myRequestsRes]) {
    if (res?.error) throw res.error;
  }

  const targetRows = targetRes.data || [];
  const target = targetRows.reduce((sum, row) => sum + Number(row.targetAmount || 0), 0);
  const myDeals = dealsRes.data || [];
  const activeLeads = leadsRes.data || [];
  const seenTaskIds = new Set();
  const myTasks = [
    ...(tasksByOwner.data || []),
    ...(tasksByAssignee.data || []),
    ...(tasksByProxy.data || []),
  ]
    .filter((task) => taskCreditId(task) === user.id)
    .filter((task) => (seenTaskIds.has(task.id) ? false : seenTaskIds.add(task.id)));
  const todayBangkok = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const taskSummary = summarizeOpenTasks(myTasks, todayBangkok);

  /* ยอดของงวด (ยอดปิดได้ · รออนุมัติ · ส่วนต่างกับเป้า · ท่อ) — กติกาอยู่ที่
     `lib/sales/myDashboardTotals` ทั้งหมด (เทสต์ได้โดยไม่มี supabase)
     ⭐ ยอด SO รออนุมัติ (มติผู้ใช้ 2026-09-11 · mig 0353) มาเป็นช่องแยก `pendingApproval` /
        `pendingApprovalCount` — `wonValue` · `targetGap` ยังเป็น Actual ล้วนเหมือนเดิม
     ⚠️ ไม่ต้องมี query ใหม่ — ยอดรออนุมัติเป็น cache บน `sales_deals.metadata` ที่ select('*') มาแล้ว */
  const totals = summarizeMyDeals(myDeals, { month, year, target, now });

  // Action Items: Leads that need immediate attention
  // e.g., 'assigned' or 'screened' (needs contact), or 'meeting' (has upcoming meeting)
  const todayStr = businessDate(now);
  /* ⚠️ `meetingAt` เป็น timestamptz — วันของนัดต้องเป็นวันไทย (`businessDayKey`) เดิมตัด
     `.slice(0, 10)` จากสตริง ISO = วันตาม UTC ⇒ นัดก่อน 7 โมงเช้าหลุดจากรายการในวันนัดเอง */
  const actionLeads = activeLeads.filter(l =>
    ['assigned', 'screened'].includes(l.status) ||
    (l.status === 'meeting' && l.meetingAt && (businessDayKey(l.meetingAt) || '') >= todayStr)
  );

  // Feed ส่วนตัว: รวมความเคลื่อนไหวของดีลที่ผู้ใช้ดูแลกับงานที่ผู้ใช้รับผิดชอบ
  // ใช้ข้อมูลดิบคนละตารางแล้ว normalize ก่อนส่ง เพื่อให้ UI เรียงรวมแบบเดียวกับ RD feed.
  const dealMap = new Map(myDeals.map((deal) => [deal.id, deal]));
  let dealActivityFeed = [];
  if (dealMap.size) {
    // mig 0169: ฟีดดีลย้ายมาเธรดกลางแล้ว — กรอง entityType ด้วยเสมอ ไม่งั้นจะได้
    // อัปเดตของ entity อื่นที่บังเอิญ id ชนกันปนมา (ตารางเดียวเก็บทุกโมดูล)
    // ข้อความที่ถูกลบ (soft delete) ต้องไม่โผล่ในฟีดสรุป — ของเดิมลบจริงจึงไม่มีปัญหานี้
    const { data: activities, error: activityError } = await supabase
      .from('entity_updates')
      .select('*')
      .eq('entityType', 'deal')
      .in('entityId', Array.from(dealMap.keys()))
      .is('deletedAt', null)
      .order('createdAt', { ascending: false })
      .limit(50);
    if (activityError) return fail(activityError.message, 500);
    dealActivityFeed = (activities || []).map((activity) => {
      const deal = dealMap.get(activity.entityId);
      const dueDate = activity.meta?.dueDate || null;
      return {
        id: activity.id,
        dealId: activity.entityId,
        dealCode: deal?.code || null,
        dealTitle: deal?.title || 'ดีล',
        customerName: deal?.customerName || null,
        kind: activity.kind,
        body: activity.body,
        dueDate,
        createdByName: activity.authorName || user.name || 'ฝ่ายขาย',
        createdAt: activity.createdAt,
        updatedAt: activity.editedAt || null,
        urgent: !!(dueDate && dueDate <= todayBangkok),
      };
    });
  }

  const taskFeed = [...myTasks]
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 50)
    .map((task) => ({
      id: task.id,
      title: task.title,
      note: task.note || null,
      status: task.status,
      category: task.category || null,
      urgent: !!task.urgent,
      important: !!task.important,
      dueDate: task.dueDate || null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assigneeName: task.assigneeName || task.ownerName || user.name || 'ฉัน',
      assignedByName: task.assignedByName || null,
      dealId: task.dealId || null,
      projectId: task.projectId || null,
    }));

  // คิวรอยต่อเอกสารของฉัน: Won → Sale Order → ใบยื่นชำระภาษี (มติผู้ใช้ 2026-07-28:
  // นับเฉพาะดีลที่ฉันเป็นเจ้าของ เหมือนทุกตัวเลขในแท็บนี้ ไม่ใช่ทั้งทีม)
  // พังก็ไม่ล้มทั้งหน้า — ส่ง error ขึ้นไปให้การ์ดบอกเอง ดีกว่าเงียบแล้วโชว์ 0 หลอก
  let handoff = { awaitingSalesOrder: [], awaitingFiling: [] };
  try {
    handoff = await loadHandoffQueue(supabase, { dealIds: myDeals.map((deal) => deal.id) });
  } catch (handoffError) {
    handoff = { awaitingSalesOrder: [], awaitingFiling: [], error: handoffError.message };
  }

  /* คำร้องที่เป็น "ของค้างของฉัน" จริง ๆ — ร่างที่ยังไม่เคยส่งไม่นับ (ยังไม่เริ่ม)
     แต่ร่างที่ **ถูกตีกลับ** นับ เพราะฝ่ายส่งคืนมาให้เราแก้แล้ว */
  const myRequests = (myRequestsRes.data || [])
    .filter((r) => r.status !== 'draft' || r.bouncedAt);

  const [monthYear, monthNumber] = month.split('-').map(Number);
  const periodFrom = year ? `${year}-01-01` : `${month}-01`;
  const periodTo = year
    ? `${year}-12-31`
    : `${month}-${String(new Date(monthYear, monthNumber, 0).getDate()).padStart(2, '0')}`;

  return ok({
    month,
    // ปีที่ถูกขอมาแบบ "ทุกเดือน" — null = ก้อนนี้เป็นของเดือนเดียว
    year,
    periodFrom,
    periodTo,
    // ตัวตนผู้ใช้ — การ์ด "เป้าหมายของฉัน" ใช้ลิงก์เข้าแท็บผลงานขายแบบเจาะตัวเอง
    me: { id: user.id, name: user.name || null, team: user.team || null, teams: user.teams || [] },
    userId: user.id,
    target,
    // แยก "ยังไม่ตั้งเป้า" (ไม่มี record ของงวดนี้) ออกจาก "เป้า = 0 จริง" — UI ใช้ตัดสินว่าจะแสดง dash แทน ฿0.00
    hasTarget: targetRows.length > 0,
    // ยอดปิดได้ = Actual (SO อนุมัติแล้ว) เท่านั้น
    wonValue: totals.wonValue,
    /* ยอด SO "รออนุมัติ" ของงวด — **แยกจาก wonValue** · มีค่าเฉพาะงวดที่ครอบเดือนปัจจุบัน
       (เวลาไทย) เพราะอนุมัติวันนี้ Actual ลงเดือนนี้ · จอวางไว้ใต้ยอดปิดได้ ไม่บวกรวม */
    pendingApproval: totals.pendingApproval,
    pendingApprovalCount: totals.pendingApprovalCount,
    pipelineValue: totals.pipelineValue,
    weightedForecast: totals.weightedForecast,
    // เป้า − Actual ล้วน — ขับทั้ง "ขาดอีก/เกินเป้า" และสีเขียวบนการ์ด (ห้ามหักยอดรออนุมัติ)
    targetGap: totals.targetGap,
    openDealsCount: totals.openDealsCount,
    byForecast: totals.byForecast,
    activeLeads,
    actionLeads,
    taskSummary,
    taskFeed,
    dealActivityFeed,
    handoff,
    // ⚠️ ส่ง **แถวดิบ** ให้จอ ไม่ใช่ตัวเลขสรุป — คิวรวม (`lib/salesPlanning/myQueue.js`)
    // ต้องเรียงของทุกชนิดด้วยกติกาเดียวกัน จึงต้องเห็นวันที่ของแต่ละใบเอง
    myRequests,
    /* งานที่ยังไม่จบ — **กติกาเดียวกับ `summarizeOpenTasks`** (`status !== 'Completed'`)
       ⚠️ เดาสถานะเองเมื่อไร ตัวเลขบนแถบกับจำนวนแถวในตารางจะไม่ตรงกันทันที
       (ค่าจริงในตารางนี้เป็น 'Completed' ตัวใหญ่ ไม่ใช่ 'done') */
    openTasks: myTasks.filter((task) => task.status !== 'Completed'),
  });
});
