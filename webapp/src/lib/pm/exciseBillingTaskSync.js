// ── ซิงก์งานไทม์ไลน์ SA "วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต" กับคิวรอออกใบค่าสรรพสามิต (แผนรื้อสรรพสามิต Q21 · มติ 03/11) ──
//
// ⭐ ตัวตัดสินอยู่ที่ `exciseBillingTask.js` (ไฟล์บริสุทธิ์) · ไฟล์นี้โหลดข้อมูล + เขียน + ห่อ route
// ทางเข้าเดียว: `withUser(handler, EXCISE_TASK_SYNC.<เป้า>)` ต่อท้าย route ที่เปลี่ยนสถานะค่าสรรพสามิตของ SO ลูกค้า
//   (ใบค่าสรรพสามิต: ออก/แก้/ยื่น/อนุมัติ/รับ/ย้อนรับ/ยกเลิก/Rev./ลบ · SO: อนุมัติ/Rev./ยกเลิก/ไม่เรียกเก็บ/ปิดยอดค้าง ·
//   สร้าง SO ค่าสรรพสามิต) — route ตอบสำเร็จแล้วค่อยซิงก์ ดีลที่ไม่มีงานนี้จบที่คิวรีแรก
// ⚠️ ซิงก์พลาด **ไม่ทำให้ action หลักล้ม** (บันทึกไปแล้ว) — เขียน log แล้วปล่อยผ่าน · งานค้างผิดจะถูกแก้รอบถัดไปที่ดีลนี้ขยับ
// ⚠️ เขียนแบบ CAS (`status` เดิม) — คนกดเปลี่ยนสถานะชนกันพอดี = ของคนชนะ
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { loadAwaitingFiling } from '@/lib/sales/handoffQueueData';
import { propagateAndPersist } from '@/lib/pm/status';
import { todayStr } from '@/lib/pm/schedule';
import { exciseBillingTaskUpdates, isExciseBillingTask } from '@/lib/pm/exciseBillingTask';

const uniq = (values) => [...new Set((values || []).filter(Boolean))];

const raise = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message || error}`);
};

/** ดีลที่ได้รับผลจาก action บนใบนี้ — SO ลูกค้า = ดีลของใบ · SO ค่าสรรพสามิต / ใบค่าสรรพสามิต = ดีลของ SO ต้นทาง */
export async function exciseBillingDealIdsFor(supabase, { salesOrderId = null, quotationId = null } = {}) {
  let quoteId = quotationId;
  if (salesOrderId) {
    const { data: order, error } = await supabase.from('sales_orders')
      .select('id, "dealId", "quotationId"').eq('id', salesOrderId).maybeSingle();
    raise('โหลดใบสั่งขายไม่สำเร็จ', error);
    if (!order) return [];
    if (order.dealId) return [order.dealId];
    quoteId = order.quotationId;
  }
  if (!quoteId) return [];
  const { data: quote, error: quoteError } = await supabase.from('quotations')
    .select('id, "sourceSalesOrderId"').eq('id', quoteId).maybeSingle();
  raise('โหลดใบเสนอราคาไม่สำเร็จ', quoteError);
  if (!quote?.sourceSalesOrderId) return []; // ใบเสนอราคาลูกค้า — ไม่เปลี่ยนสถานะค่าสรรพสามิตของ SO ไหน
  const { data: source, error: sourceError } = await supabase.from('sales_orders')
    .select('id, "dealId"').eq('id', quote.sourceSalesOrderId).maybeSingle();
  raise('โหลดใบสั่งขายต้นทางไม่สำเร็จ', sourceError);
  return source?.dealId ? [source.dealId] : [];
}

/** แผนของดีลชุดนี้ (อ่านอย่างเดียว) — `{ tasks, updates }` · สคริปต์ย้อนหลังใช้ซ้อมก่อนเขียน · อ่านพลาด = throw */
export async function planExciseBillingTasks(supabase, dealIds = [], {
  loadAwaiting = loadAwaitingFiling,
  today = todayStr(),
  now = new Date().toISOString(),
} = {}) {
  const ids = uniq(dealIds);
  if (!ids.length) return { tasks: [], updates: [] };

  const { data: rows, error: taskError } = await fetchAllResult(() => supabase.from('project_tasks')
    .select('id, "projectId", "dealId", role, name, status, "workflowTemplateStepKey", "actualStartDate", "systemCompletedBy"')
    .in('dealId', ids)
    .eq('role', 'SA')
    .order('id', { ascending: true }));
  raise('โหลดขั้นตอนไทม์ไลน์ไม่สำเร็จ', taskError);
  const tasks = (rows || []).filter(isExciseBillingTask);
  if (!tasks.length) return { tasks: [], updates: [] };

  const dealsWithTasks = uniq(tasks.map((task) => task.dealId));
  const projectIds = uniq(tasks.map((task) => task.projectId));
  const [approvedResult, awaiting, projectResult] = await Promise.all([
    fetchAllResult(() => pipelineRowsOnly(supabase.from('sales_orders')
      .select('id, "dealId"')
      .in('dealId', dealsWithTasks)
      .eq('status', 'approved')
      .is('supersededById', null))
      .order('id', { ascending: true })),
    loadAwaiting(supabase, dealsWithTasks),
    projectIds.length
      ? fetchAllResult(() => supabase.from('projects').select('id, "closeStatus"').in('id', projectIds).order('id', { ascending: true }))
      : Promise.resolve({ data: [], error: null }),
  ]);
  raise('โหลดใบสั่งขายของดีลไม่สำเร็จ', approvedResult.error);
  raise('โหลดโครงการไม่สำเร็จ', projectResult.error);

  const dealStates = new Map(dealsWithTasks.map((dealId) => [dealId, { approvedCount: 0, pendingCount: 0 }]));
  for (const order of approvedResult.data || []) {
    if (dealStates.has(order.dealId)) dealStates.get(order.dealId).approvedCount += 1;
  }
  for (const order of awaiting || []) {
    if (dealStates.has(order.dealId)) dealStates.get(order.dealId).pendingCount += 1;
  }
  const closedProjectIds = new Set((projectResult.data || [])
    .filter((project) => (project.closeStatus || 'open') === 'closed').map((project) => project.id));

  return { tasks, updates: exciseBillingTaskUpdates(tasks, { dealStates, closedProjectIds, today, now }) };
}

/** ซิงก์งานของดีลชุดนี้ — คืน `{ updated }` · อ่าน/เขียนพลาด = throw (ผู้เรียกตัดสินเองว่าจะกลืนไหม) */
export async function syncExciseBillingTasks(supabase, dealIds = [], {
  loadAwaiting = loadAwaitingFiling,
  propagate = propagateAndPersist,
  today = todayStr(),
  now = new Date().toISOString(),
} = {}) {
  const { updates } = await planExciseBillingTasks(supabase, dealIds, { loadAwaiting, today, now });
  let updated = 0;
  const graphs = new Map();
  for (const update of updates) {
    const { data, error } = await supabase.from('project_tasks')
      .update(update.patch)
      .eq('id', update.id)
      .eq('status', update.prevStatus)
      .select('id');
    raise('ปรับสถานะงานวางบิลค่าสรรพสามิตไม่สำเร็จ', error);
    if (!data?.length) continue; // มีคนเปลี่ยนสถานะชนกันพอดี — ของคนชนะ
    updated += 1;
    const key = update.projectId ? `p:${update.projectId}` : `d:${update.dealId}`;
    graphs.set(key, update);
  }
  // สถานะขั้นถัดไปเดินตามกราฟ — กติกาเดียวกับคนกดเปลี่ยนสถานะเอง (route PATCH ของขั้นตอน)
  for (const update of graphs.values()) {
    await propagate(supabase, update.projectId, { dealId: update.dealId });
  }
  return { updated };
}

/** เป้าหมายจาก `[id]` ของ route */
const paramTarget = (key) => async ({ ctx }) => {
  const params = await ctx?.params;
  return params?.id ? { [key]: params.id } : null;
};

/** เป้าหมายจากใบที่ route สร้าง (คำตอบ `{ id }`) */
const responseTarget = (key) => async ({ res }) => {
  const body = await res.clone().json().catch(() => null);
  return body?.id ? { [key]: body.id } : null;
};

/** งานต่อท้าย route (`withUser(handler, { after })`): ตอบสำเร็จ (2xx) แล้วซิงก์งานของดีลที่ได้รับผล · ซิงก์พลาดไม่เปลี่ยนคำตอบ */
export function exciseBillingTaskAfter(target, {
  resolveDeals = exciseBillingDealIdsFor,
  sync = syncExciseBillingTasks,
  log = (...args) => console.error(...args),
} = {}) {
  return async ({ supabase, ctx, req, res }) => {
    if (!res || res.status < 200 || res.status >= 300) return;
    try {
      const key = await target({ req, ctx, res });
      if (!key) return;
      const dealIds = await resolveDeals(supabase, key);
      if (dealIds.length) await sync(supabase, dealIds);
    } catch (error) {
      log('[excise-billing-task-sync] ซิงก์งานวางบิลค่าสรรพสามิตไม่สำเร็จ', error);
    }
  };
}

/** ชุดที่ route ใช้: `export const PATCH = withUser(async (...) => { ... }, EXCISE_TASK_SYNC.salesOrder);` */
export const EXCISE_TASK_SYNC = Object.freeze({
  salesOrder: Object.freeze({ after: exciseBillingTaskAfter(paramTarget('salesOrderId')) }),
  quotation: Object.freeze({ after: exciseBillingTaskAfter(paramTarget('quotationId')) }),
  createdSalesOrder: Object.freeze({ after: exciseBillingTaskAfter(responseTarget('salesOrderId')) }),
});
