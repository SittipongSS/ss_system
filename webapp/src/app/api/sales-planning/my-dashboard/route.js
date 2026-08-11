import { withUser, ok, fail, unauthorized } from '@/lib/http';
import { monthKey, forecastAmount, isOpenStage, isWonStage } from '@/lib/salesPlanning';
import { summarizeOpenTasks } from '@/lib/pm/taskSummary';
import { taskCreditId } from '@/lib/permissions';
import { dealActualFromSalesOrders } from '@/lib/sales/salesOrderWorkflow';
import { loadHandoffQueue } from '@/lib/sales/handoffQueueData';
import { FORECAST_VALUES, snapForecastLevel } from '@/lib/sales/forecastLevels';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();

  const month = monthKey(new URL(req.url).searchParams.get('month')) || monthKey(new Date().toISOString());

  // 1. My Target & Won
  const [
    targetRes, dealsRes, leadsRes, tasksByOwner, tasksByAssignee, tasksByProxy, myRequestsRes,
  ] = await Promise.all([
    supabase
      .from('sales_targets')
      .select('targetAmount')
      .eq('ownerId', user.id)
      .eq('targetMonth', month)
      .single(),
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
    supabase.from('dept_requests').select('*')
      .eq('requestedById', user.id)
      .in('status', ['draft', 'pending', 'acknowledged']),
  ]);

  const target = targetRes.data?.targetAmount || 0;
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
  }).format(new Date());
  const taskSummary = summarizeOpenTasks(myTasks, todayBangkok);

  const isWon = (d) => isWonStage(d.stage);
  const isOpen = (d) => isOpenStage(d.stage);
  
  const wonAmt = dealActualFromSalesOrders;
  const wonMonth = (d) => monthKey(d.metadata?.wonMonth) || monthKey(d.confirmedAt) || monthKey(d.metadata?.poReceivedDate) || monthKey(d.forecastMonth);

  // Calculate Won this month
  const wonDealsThisMonth = myDeals.filter(d => isWon(d) && wonMonth(d) === month);
  const wonValue = wonDealsThisMonth.reduce((sum, d) => sum + wonAmt(d), 0);
  
  // Calculate Pipeline (Open Deals)
  const openDeals = myDeals.filter(isOpen);
  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);

  // Group Pipeline by Probability (FC%) — ระดับมาจาก lib/sales/forecastLevels
  // (แหล่งเดียว) เดิมก๊อปลิสต์ไว้ที่นี่เอง แล้วต้องไล่แก้ตามทุกครั้งที่ระดับเปลี่ยน
  const fcLevels = FORECAST_VALUES;
  const snapFc = snapForecastLevel;

  const byForecast = fcLevels.map(level => {
    const dealsInLevel = openDeals.filter(d => snapFc(d.probability) === level);
    return {
      level,
      count: dealsInLevel.length,
      value: dealsInLevel.reduce((sum, d) => sum + Number(d.projectValue || 0), 0)
    };
  });

  // Action Items: Leads that need immediate attention
  // e.g., 'assigned' or 'screened' (needs contact), or 'meeting' (has upcoming meeting)
  const todayStr = businessDate();
  const actionLeads = activeLeads.filter(l => 
    ['assigned', 'screened'].includes(l.status) || 
    (l.status === 'meeting' && l.meetingAt && String(l.meetingAt).slice(0, 10) >= todayStr)
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

  const [year, monthNumber] = month.split('-').map(Number);
  const periodFrom = `${month}-01`;
  const periodTo = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`;

  return ok({
    month,
    periodFrom,
    periodTo,
    // ตัวตนผู้ใช้ — การ์ด "เป้าหมายของฉัน" ใช้ลิงก์เข้าแท็บผลงานขายแบบเจาะตัวเอง
    me: { id: user.id, name: user.name || null, team: user.team || null, teams: user.teams || [] },
    userId: user.id,
    target,
    // แยก "ยังไม่ตั้งเป้า" (ไม่มี record เดือนนี้) ออกจาก "เป้า = 0 จริง" — UI ใช้ตัดสินว่าจะแสดง dash แทน ฿0.00
    hasTarget: !!targetRes.data,
    wonValue,
    pipelineValue,
    weightedForecast,
    targetGap: target - wonValue,
    openDealsCount: openDeals.length,
    byForecast,
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
