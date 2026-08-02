import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { loadForecastDrift } from '@/lib/salesPlanningForecast';
import { loadUserDirectory } from '@/lib/usersRepo';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { loadHandoffQueue } from '@/lib/sales/handoffQueueData';
import { canViewUpdates } from '@/lib/master/updateAccess';

export const dynamic = 'force-dynamic';

const dealSelect = `
  *,
  customer:customers(id, name, arCode, email, phone)
`;

async function safe(label, promise, fallback) {
  const { data, error } = await promise;
  if (error) return { data: fallback, warning: `${label}: ${error.message}` };
  return { data: data ?? fallback, warning: null };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { data: deal, error } = await supabase.from('sales_deals').select(dealSelect).eq('id', id).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesViewScope(user, deal)) return forbidden();

  const [quotations, salesOrders, documents, stageHistory, forecasts, dealTasks, inquiries] = await Promise.all([
    safe('quotations', supabase.from('quotations').select('*, lines:quotation_lines(*)').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
    safe('sales orders', supabase.from('sales_orders').select('*').eq('dealId', deal.id).order('orderDate', { ascending: false }), []),
    safe('documents', supabase.from('sales_deal_documents').select('*').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
    // mig 0169: ฟีดความเคลื่อนไหวไม่ได้โหลดที่นี่แล้ว — UpdateThread ยิง /api/updates
    // เอง ถ้าดึงซ้ำที่นี่ก็เป็นการอ่านสองรอบแล้วทิ้งชุดหนึ่ง
    safe('stage history', supabase.from('sales_deal_stage_history').select('*').eq('dealId', deal.id).order('changedAt', { ascending: false }), []),
    safe('forecasts', supabase.from('sales_deal_forecasts').select('*').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
    // งาน: ผูกดีลตรง (dealId) + งานเดิมที่ผูกผ่านไทม์ไลน์ (projectId) — ฟอร์มตัด
    // การผูกไทม์ไลน์ออกแล้ว แต่ข้อมูลเก่ายังมี ต้องไม่หายไปจากหน้าดีล
    safe('deal tasks', supabase.from('personal_tasks').select('*')
      .or(deal.projectId ? `dealId.eq.${deal.id},projectId.eq.${deal.projectId}` : `dealId.eq.${deal.id}`)
      .order('createdAt', { ascending: false }), []),
    // ข้อสอบถามถึงฝ่ายอื่น (RD) ของดีลนี้ — "เก็บแยก โชว์รวม": merge เข้าฟีด
    // ความเคลื่อนไหวฝั่ง client แบบเดียวกับ stageHistory (อ่านอย่างเดียวในฟีด)
    safe('inquiries', supabase.from('dept_requests').select('*').eq('dealId', deal.id).order('createdAt', { ascending: false }), []),
  ]);

  // ── สายภาษี: ปลายทางของ SO ที่เดิมหน้าดีลมองไม่เห็น ────────────────────────
  // ใบยื่นชำระสรรพสามิตผูก SO ตัวต่อตัว (unique 1 SO = 1 ใบยื่น — mig 0160) แต่หน้าดีล
  // จบที่ SO มาตลอด คนดูดีลจึงไม่รู้ว่าภาษีเดินถึงไหน ต้องไปเปิดหน้า SO ก่อนทุกครั้ง
  //
  // "ค้างรอออกใบยื่น" อ่านจากคิวกลาง (loadHandoffQueue) ไม่คิดเอง เพราะมันกรอง
  // "มีสินค้าสรรพสามิตให้ยื่นจริง" (resolveSoFiling().eligible) ให้แล้ว — SO ที่ขายของ
  // นอกพิกัดต้องไม่ขึ้นว่าค้าง ไม่งั้นหน้าดีลจะเตือนตลอดกาลจนคนเลิกอ่าน
  let taxFilings = { data: [], warning: null };
  let awaitingFilingIds = [];
  const salesOrderIds = (salesOrders.data || []).map((order) => order.id);
  if (salesOrderIds.length) {
    [taxFilings, awaitingFilingIds] = await Promise.all([
      safe('tax filings', supabase.from('orders')
        .select('id, salesOrderId, status, totalTax, amountToCollect, createdAt')
        .in('salesOrderId', salesOrderIds), []),
      loadHandoffQueue(supabase, { dealIds: [deal.id] })
        .then((queue) => (queue.awaitingFiling || []).map((order) => order.id))
        // คิวเสียไม่ควรทำให้หน้าดีลทั้งหน้าล่ม — แค่ไม่โชว์ป้าย "รอออกใบยื่น"
        .catch(() => []),
    ]);
  }

  let project = { data: null, warning: null };
  let projectProducts = { data: [], warning: null };
  // DL1: ยังไม่ผูกโครงการ → ไทม์ไลน์ลอยของดีลเอง (project_tasks ที่ projectId ว่าง)
  let projectTasks = { data: [], warning: null };
  if (!deal.projectId) {
    projectTasks = await safe('deal timeline', supabase
      .from('project_tasks').select('*')
      .eq('dealId', deal.id).is('projectId', null)
      .order('stepOrder', { ascending: true }), []);
  }
  let shipmentPrep = { data: null, warning: null };
  let exciseRegistrations = { data: [], warning: null };
  let sahamitPo = { data: null, warning: null };
  let siblingDeals = { data: [], warning: null };
  if (deal.projectId) {
    [project, projectProducts, projectTasks, shipmentPrep, exciseRegistrations, sahamitPo, siblingDeals] = await Promise.all([
      safe('project', supabase.from('projects').select('*').eq('id', deal.projectId).maybeSingle(), null),
      safe('project products', supabase.from('project_products').select('*, product:products(id, fgCode, productDescription, productDescriptionEn)').eq('projectId', deal.projectId), []),
      // เฟส B: หน้าดีลเห็นไทม์ไลน์เฉพาะ segment ของตัวเอง + งานกลางของโครงการ (dealId ว่าง —
      // ขั้นตอน custom/ข้อมูลก่อน backfill) — ไม่ปนงานของดีลพี่น้อง
      // DL2: ส่งทั้งแถว — หน้าดีลโชว์ตาราง segment ของตัวเอง (แผนก/วัน/สถานะ) แก้สถานะได้
      safe('project tasks', supabase.from('project_tasks').select('*').eq('projectId', deal.projectId).or(`dealId.eq.${deal.id},dealId.is.null`).order('stepOrder', { ascending: true }), []),
      safe('shipment prep', supabase.from('shipment_prep').select('*, lines:shipment_prep_lines(*)').eq('projectId', deal.projectId).maybeSingle(), null),
      safe('excise registrations', supabase.from('excise_registrations').select('*').eq('projectId', deal.projectId), []),
      safe('sahamit po', supabase.from('sahamit_pos').select('*, lines:sahamit_po_lines(*)').eq('projectId', deal.projectId).maybeSingle(), null),
      // ดีลอื่นในโครงการเดียวกัน (เฟส B: หลายดีลต่อโครงการ) — ลิงก์ข้ามบนหน้าดีล
      safe('sibling deals', supabase.from('sales_deals').select('id, title, stage, dealType, projectValue, wonValue, forecastMonth').eq('projectId', deal.projectId).neq('id', deal.id).order('createdAt', { ascending: true }), []),
    ]);
  }

  const warnings = [
    quotations.warning,
    salesOrders.warning,
    documents.warning,
    stageHistory.warning,
    forecasts.warning,
    dealTasks.warning,
    project.warning,
    projectProducts.warning,
    projectTasks.warning,
    shipmentPrep.warning,
    exciseRegistrations.warning,
    sahamitPo.warning,
    taxFilings.warning,
  ].filter(Boolean);

  const forecastDrift = await loadForecastDrift(supabase, deal).catch(() => null);
  const users = await loadUserDirectory(supabase).catch(() => new Map());
  const enrichedDealTasks = (dealTasks.data || []).map((task) => ({
    ...task,
    ownerName: users.get(task.ownerId)?.name || null,
    assigneeName: task.assigneeId ? (users.get(task.assigneeId)?.name || null) : null,
  }));

  // ── ความคืบหน้าที่คนพิมพ์ไว้ในเธรดของ "งานที่ผูกดีล" ────────────────────
  //
  // เดิมดีลได้แค่ 3 จังหวะ (สร้าง/เสร็จ/เลยกำหนด) ส่วนเนื้อความจริง — "ลูกค้าขอเลื่อน
  // ส่งตัวอย่าง" "โรงพิมพ์ตอบกลับแล้ว" — อยู่ในเธรดของงานใบนั้นและไม่ไหลออกมาไหน
  // คนดูดีลจึงเห็นว่ามีงาน แต่ไม่รู้ว่างานเดินไปถึงไหน
  //
  // 🔴 ด่านสิทธิ์: เธรดงานมีกติกาของตัวเอง (`canViewPersonalTask` — คนเกี่ยวข้อง +
  // ทีม) **แคบกว่าด่านของดีล** → ต้องกรองรายใบเหมือนที่หน้าโครงการทำกับดีล (PR #861)
  // ห้ามเหมาว่า "เห็นดีล = เห็นทุกอย่างใต้ดีล"
  //
  // ⚠️ อ่านอย่างเดียว — ไม่เขียนซ้ำลงเธรดดีล (เก็บแยก โชว์รวม) แก้/ลบที่งานแล้ว
  // ดีลจึงเปลี่ยนตามเองโดยไม่ต้องมีตัวซิงค์
  let taskUpdates = [];
  let hiddenTaskFeeds = 0;
  if (enrichedDealTasks.length) {
    const visible = await Promise.all(
      enrichedDealTasks.map((task) => canViewUpdates(supabase, 'personal_task', task, user)),
    );
    const readableIds = enrichedDealTasks.filter((_, i) => visible[i]).map((task) => task.id);
    hiddenTaskFeeds = enrichedDealTasks.length - readableIds.length;
    if (readableIds.length) {
      const titleById = new Map(enrichedDealTasks.map((task) => [task.id, task.title]));
      const feed = await safe('task updates', supabase.from('entity_updates')
        .select('id, entityId, kind, body, authorName, createdAt')
        .eq('entityType', 'personal_task').in('entityId', readableIds).is('deletedAt', null)
        .order('createdAt', { ascending: false }).limit(40), []);
      if (feed.warning) warnings.push(feed.warning);
      taskUpdates = (feed.data || []).map((row) => ({
        ...row, taskTitle: titleById.get(row.entityId) || null,
      }));
    }
  }

  const canEdit = canEditSalesPlanning(user) && inSalesEditScope(user, deal);

  return ok({
    taskUpdates,
    hiddenTaskFeeds,
    deal,
    canEdit,
    forecastDrift,
    quotations: latestQuotationRevisions(quotations.data),
    salesOrders: salesOrders.data,
    taxFilings: taxFilings.data,
    awaitingFilingIds,
    documents: documents.data,
    inquiries: inquiries.data,
    dealTasks: enrichedDealTasks,
    stageHistory: stageHistory.data,
    forecasts: forecasts.data,
    project: project.data,
    projectProducts: projectProducts.data,
    projectTasks: projectTasks.data,
    shipmentPrep: shipmentPrep.data,
    exciseRegistrations: exciseRegistrations.data,
    sahamitPo: sahamitPo.data,
    siblingDeals: siblingDeals.data,
    warnings,
  });
});
