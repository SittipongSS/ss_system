import { withUser, ok, fail, unauthorized } from '@/lib/http';
import { monthKey, forecastAmount } from '@/lib/salesPlanning';
import { summarizeOpenTasks } from '@/lib/pm/taskSummary';
import { taskCreditId } from '@/lib/permissions';
import { dealActualFromSalesOrders } from '@/lib/sales/salesOrderWorkflow';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();

  const month = monthKey(new URL(req.url).searchParams.get('month')) || monthKey(new Date().toISOString());

  // 1. My Target & Won
  const [targetRes, dealsRes, leadsRes, tasksByOwner, tasksByAssignee, tasksByProxy] = await Promise.all([
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

  const isWon = (d) => ['won', 'in_project'].includes(d.stage);
  const isOpen = (d) => !['won', 'in_project', 'lost'].includes(d.stage);
  
  const wonAmt = dealActualFromSalesOrders;
  const wonMonth = (d) => monthKey(d.metadata?.wonMonth) || monthKey(d.confirmedAt) || monthKey(d.metadata?.poReceivedDate) || monthKey(d.forecastMonth);

  // Calculate Won this month
  const wonDealsThisMonth = myDeals.filter(d => isWon(d) && wonMonth(d) === month);
  const wonValue = wonDealsThisMonth.reduce((sum, d) => sum + wonAmt(d), 0);
  
  // Calculate Pipeline (Open Deals)
  const openDeals = myDeals.filter(isOpen);
  const pipelineValue = openDeals.reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const weightedForecast = openDeals.reduce((sum, d) => sum + forecastAmount(d), 0);

  // Group Pipeline by Probability (FC%)
  const fcLevels = [20, 50, 80, 100];
  const snapFc = (p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) return 50;
    return fcLevels.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), fcLevels[0]);
  };

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
  const todayStr = new Date().toISOString().slice(0,10);
  const actionLeads = activeLeads.filter(l => 
    ['assigned', 'screened'].includes(l.status) || 
    (l.status === 'meeting' && l.meetingAt && String(l.meetingAt).slice(0, 10) >= todayStr)
  );

  // Feed ส่วนตัว: รวมความเคลื่อนไหวของดีลที่ผู้ใช้ดูแลกับงานที่ผู้ใช้รับผิดชอบ
  // ใช้ข้อมูลดิบคนละตารางแล้ว normalize ก่อนส่ง เพื่อให้ UI เรียงรวมแบบเดียวกับ RD feed.
  const dealMap = new Map(myDeals.map((deal) => [deal.id, deal]));
  let dealActivityFeed = [];
  if (dealMap.size) {
    const { data: activities, error: activityError } = await supabase
      .from('sales_deal_activities')
      .select('*')
      .in('dealId', Array.from(dealMap.keys()))
      .order('createdAt', { ascending: false })
      .limit(50);
    if (activityError) return fail(activityError.message, 500);
    dealActivityFeed = (activities || []).map((activity) => {
      const deal = dealMap.get(activity.dealId);
      return {
        id: activity.id,
        dealId: activity.dealId,
        dealCode: deal?.code || null,
        dealTitle: deal?.title || 'ดีล',
        customerName: deal?.customerName || null,
        kind: activity.kind,
        body: activity.body,
        dueDate: activity.dueDate || null,
        createdByName: activity.createdByName || user.name || 'ฝ่ายขาย',
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt || null,
        urgent: !!(activity.dueDate && activity.dueDate <= todayBangkok),
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

  const [year, monthNumber] = month.split('-').map(Number);
  const periodFrom = `${month}-01`;
  const periodTo = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`;

  return ok({
    month,
    periodFrom,
    periodTo,
    // ตัวตนผู้ใช้ — การ์ด "เป้าหมายของฉัน" ใช้ลิงก์เข้าแท็บผลงานขายแบบเจาะตัวเอง
    me: { id: user.id, name: user.name || null, team: user.team || null },
    userId: user.id,
    target,
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
  });
});
