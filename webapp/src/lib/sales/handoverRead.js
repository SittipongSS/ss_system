// ── อ่านรายการที่ต้องส่งต่อ (ฝั่ง server) — ตัวคิดอยู่ที่ `handover.js` ───────────────────────────
//
// ทางเข้าสามแบบให้ผลรูปเดียวกัน (หน้าต่างเลือกตัวเดียวกันทั้งสามที่ · มติ 27/11 ข้อ 1):
//   · `fromId`     — งานทั้งหมดของคนหนึ่งคน (หน้าโอนงานคนลาออก) + เป้าตั้งแต่เดือนถัดไป
//   · `customerId` — งานของลูกค้ารายหนึ่ง ทุกเจ้าของ (Control Panel หน้าลูกค้า)
//   · `dealId`     — ดีลใบเดียว (Control Panel หน้าดีล)
//
// ⚠️ ทุก `.in()` ที่ลิสต์โตตามข้อมูลผ่าน `fetchInChunks` (คนหนึ่งคนถือดีล 100+ ใบ · เพดาน 16 KB ของ PostgREST)
// ⚠️ supabase ไม่ throw — ทุก query เช็ก error เอง อ่านไม่ขึ้น = โยนให้ route ตอบ 500 (ห้ามถือว่าไม่มีของ)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { LEAD_CLOSED_STATUSES } from '@/lib/sales/leads';
import { nextMonthKey } from '@/lib/usersTransfer';
import { dealHandoverGroup, isHandoverEligible, MOVABLE_ORDER_STATUSES, OPEN_CONTRACT_STATUSES, SIGNED_CONTRACT_STATUSES, DEAD_ORDER_STATUSES } from '@/lib/sales/handover';

const DEAL_COLUMNS = 'id, code, title, stage, origin, team, line, "customerId", "customerName", "ownerId", "ownerName", "projectValue", "acOwnerId", "acOwnerName", "aeSupervisorId", "aeSupervisorName", metadata';
const LEAD_COLUMNS = 'id, company, "contactName", status, team, "serviceInterest", "meetingAt", "followUpAt", "assigneeId", "assigneeName", "customerId"';

const must = (result, what) => {
  if (result.error) throw new Error(`อ่าน${what}ไม่สำเร็จ: ${result.error.message || result.error}`);
  return result.data || [];
};

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows || []) {
    const k = row?.[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};

/** เอกสารของดีลที่จอต้องโชว์ว่า "ย้ายตาม / ชื่อบนใบเปลี่ยน / ไม่ย้าย" */
function docsOf({ quotations = [], orders = [], contracts = [] }) {
  const docs = [];
  for (const q of quotations) {
    if (['revised', 'cancelled', 'superseded'].includes(q.status)) continue;
    docs.push({ kind: 'quotation', id: q.id, number: q.quoteNumber || null, status: q.status, moves: 'name' });
  }
  for (const o of orders) {
    if (DEAD_ORDER_STATUSES.includes(o.status)) continue;
    docs.push({ kind: 'sales_order', id: o.id, number: o.orderNumber || null, status: o.status, moves: MOVABLE_ORDER_STATUSES.includes(o.status) ? 'with' : 'stays' });
  }
  for (const c of contracts) {
    if (!OPEN_CONTRACT_STATUSES.includes(c.status) && !SIGNED_CONTRACT_STATUSES.includes(c.status)) continue;
    docs.push({ kind: 'contract', id: c.id, number: c.contractNo || null, status: c.status, contractKind: c.kind || null, moves: 'with' });
  }
  return docs;
}

/**
 * เอกสารลูกของดีลชุดหนึ่ง (QT · SO · สัญญา · งวดเงินของ SO ที่อนุมัติแล้ว)
 * @returns `{ quotations, orders, contracts, installmentsByOrder }` — แต่ละตัวเป็น Map(dealId → แถว)
 */
export async function loadDealDocs(supabase, dealIds = []) {
  const ids = [...new Set(dealIds.filter(Boolean))];
  if (!ids.length) return { quotations: new Map(), orders: new Map(), contracts: new Map(), installmentsByOrder: new Map() };
  /* fetchAllInChunks = ซอยลิสต์ id + ไล่หน้า (เพดาน 1,000 แถวของ PostgREST) · พังแล้ว throw ⇒ route ตอบ 500 */
  const [quotations, orders, contracts] = await Promise.all([
    fetchAllInChunks(ids, (chunk) => supabase
      .from('quotations').select('id, "dealId", "quoteNumber", status').in('dealId', chunk).order('id')),
    fetchAllInChunks(ids, (chunk) => supabase
      .from('sales_orders').select('id, "dealId", "orderNumber", status, "createdBy"').in('dealId', chunk).order('id')),
    fetchAllInChunks(ids, (chunk) => supabase
      .from('sales_contracts').select('id, "dealId", "contractNo", status, kind, "ownerId", "createdBy"').in('dealId', chunk).order('id')),
  ]);
  const approvedIds = orders.filter((o) => o.status === 'approved').map((o) => o.id);
  const installments = await fetchAllInChunks(approvedIds, (chunk) => supabase
    .from('sales_order_installments').select('id, "salesOrderId", status').in('salesOrderId', chunk).order('id'));
  return {
    quotations: groupBy(quotations, 'dealId'),
    orders: groupBy(orders, 'dealId'),
    contracts: groupBy(contracts, 'dealId'),
    installmentsByOrder: groupBy(installments, 'salesOrderId'),
  };
}

/** แถวดีลที่จอใช้ — ตัด metadata ทิ้ง (ก้อนละหลายสิบ KB) เหลือแค่ที่จอต้องรู้ */
function dealView(deal, docs, verdict) {
  return {
    id: deal.id,
    code: deal.code || null,
    title: deal.title || null,
    stage: deal.stage,
    team: deal.team || null,
    line: deal.line || null,
    customerId: deal.customerId || null,
    customerName: deal.customerName || null,
    ownerId: deal.ownerId || null,
    ownerName: deal.ownerName || null,
    projectValue: deal.projectValue ?? null,
    acOwnerId: deal.acOwnerId || null,
    acOwnerName: deal.acOwnerName || null,
    aeSupervisorId: deal.aeSupervisorId || null,
    aeSupervisorName: deal.aeSupervisorName || null,
    group: verdict.group,
    reasons: verdict.reasons,
    docs,
  };
}

/**
 * จัดดีลชุดหนึ่งเข้ากลุ่ม — คืนเฉพาะดีลที่ต้องส่งต่อ + ตัวนับของที่อยู่กับคนเดิม
 */
export async function classifyDeals(supabase, deals = []) {
  const docs = await loadDealDocs(supabase, deals.map((d) => d.id));
  const items = [];
  const counts = { wonDone: 0, lost: 0, historical: 0 };
  const historical = [];
  for (const deal of deals) {
    const ctx = {
      quotations: docs.quotations.get(deal.id) || [],
      orders: docs.orders.get(deal.id) || [],
      contracts: docs.contracts.get(deal.id) || [],
    };
    const verdict = dealHandoverGroup(deal, { ...ctx, installmentsByOrder: docs.installmentsByOrder });
    if (isHandoverEligible(verdict.group)) {
      items.push(dealView(deal, docsOf(ctx), verdict));
      continue;
    }
    if (verdict.group === 'won_done') counts.wonDone += 1;
    else if (verdict.group === 'lost') counts.lost += 1;
    else if (verdict.group === 'container') {
      counts.historical += 1;
      historical.push({ id: deal.id, code: deal.code || null, title: deal.title || null, customerName: deal.customerName || null });
    }
  }
  // ดีลเปิดก่อน แล้วค่อย Won ที่ค้าง · ในกลุ่มเรียงตามรหัสดีลใหม่สุดก่อน (คนหาด้วยรหัส)
  items.sort((a, b) => (a.group === b.group ? String(b.code || '').localeCompare(String(a.code || '')) : a.group === 'open' ? -1 : 1));
  return { deals: items, counts, historical };
}

/**
 * รายการส่งต่องาน
 * @param scope `{ fromId }` | `{ customerId }` | `{ dealId }` (ตัวเดียว)
 * @returns `{ deals, leads, targets, counts, historical }`
 */
export async function listHandoverItems(supabase, { fromId = null, customerId = null, dealId = null } = {}) {
  if (!dealId && !customerId && !fromId) throw new Error('ต้องระบุว่าจะส่งต่องานของใคร (คน · ลูกค้า · ดีล)');
  const [column, value] = dealId ? ['id', dealId] : customerId ? ['customerId', customerId] : ['ownerId', fromId];
  const deals = must(await fetchAllResult(() => supabase
    .from('sales_deals').select(DEAL_COLUMNS).eq(column, value).order('id')), 'ดีล');
  const classified = await classifyDeals(supabase, deals);

  let leads = [];
  if (fromId || customerId) {
    const closed = `(${LEAD_CLOSED_STATUSES.join(',')})`;
    const [leadColumn, leadValue] = fromId ? ['assigneeId', fromId] : ['customerId', customerId];
    leads = must(await fetchAllResult(() => supabase
      .from('sales_leads').select(LEAD_COLUMNS).eq(leadColumn, leadValue).not('status', 'in', closed).order('id')), 'ลีด');
  }

  /* เป้า — เฉพาะทางเข้าคนลาออก · ตั้งแต่เดือนถัดไป (เดือนที่ผ่านมาแล้ว + เดือนนี้ไม่แตะ ตามคู่มือพนักงานเข้า-ออก) */
  let targets = [];
  if (fromId) {
    const rows = must(await supabase.from('sales_targets')
      .select('id, period, team, "targetAmount"')
      .eq('ownerId', fromId).eq('periodType', 'month').gte('period', nextMonthKey())
      .order('period', { ascending: true }), 'เป้า');
    targets = rows.filter((row) => Number(row.targetAmount || 0) > 0);
  }

  return { ...classified, leads, targets };
}
