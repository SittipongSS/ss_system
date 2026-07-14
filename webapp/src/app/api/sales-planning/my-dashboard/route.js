import { withUser, ok, fail, unauthorized } from '@/lib/http';
import { monthKey, forecastAmount } from '@/lib/salesPlanning';
import { summarizeOpenTasks } from '@/lib/pm/taskSummary';

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
    supabase.from('personal_tasks').select('id, status, dueDate, urgent').eq('ownerId', user.id),
    supabase.from('personal_tasks').select('id, status, dueDate, urgent').eq('assigneeId', user.id),
    supabase.from('personal_tasks').select('id, status, dueDate, urgent').eq('proxyBy', user.id),
  ]);

  const target = targetRes.data?.targetAmount || 0;
  const myDeals = dealsRes.data || [];
  const activeLeads = leadsRes.data || [];
  const seenTaskIds = new Set();
  const myTasks = [
    ...(tasksByOwner.data || []),
    ...(tasksByAssignee.data || []),
    ...(tasksByProxy.data || []),
  ].filter((task) => (seenTaskIds.has(task.id) ? false : seenTaskIds.add(task.id)));
  const todayBangkok = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const taskSummary = summarizeOpenTasks(myTasks, todayBangkok);

  const isWon = (d) => ['won', 'in_project'].includes(d.stage);
  const isOpen = (d) => !['won', 'in_project', 'lost'].includes(d.stage);
  
  // wonAmt uses wonValue or projectValue
  const wonAmt = (d) => Number(d.wonValue ?? d.projectValue ?? 0);
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

  return ok({
    month,
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
  });
});
