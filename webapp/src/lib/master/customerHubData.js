// ── หน้าลูกค้าศูนย์รวม: ข้อมูลสายขาย/การเงิน/คำร้อง/สรรพสามิตของลูกค้า 1 ราย (งวด H1) ─────────────────
//
// แผน: docs/customer-hub-plan.md · มติเจ้าของ 13/11/2026
//  · มติ 4 — **ตัวเลขเงินเห็นตามสิทธิ์ของแต่ละโมดูลเดิม** ⇒ ทุกกลุ่มกรองด้วยด่านชุดเดียวกับรายการของโมดูลนั้น
//    (ห้ามเขียนด่านใหม่ — เขียนใหม่เมื่อไรหน้าลูกค้าจะเห็นมากกว่า/น้อยกว่าหน้ารายการ)
//      ดีล        canViewSalesPlanning + inSalesViewScope          (= GET /api/sales-planning/deals)
//      ใบเสนอราคา  canViewSalesPlanning + inSalesDocScope (+ดีลต้นทางของใบค่าสรรพสามิต)   (= GET …/quotations)
//      ใบสั่งขาย   canViewSalesPlanning + inSalesDocScope                                (= GET …/sales-orders)
//      สัญญา       canViewSalesPlanning + inSalesViewScope(row.deal) + ฉบับล่าสุด          (= GET …/contracts)
//      งวดชำระ     ของใบสั่งขายที่เห็นได้เท่านั้น (หน้าใบสั่งขายโชว์งวดของใบนั้นอยู่แล้ว)
//      คำร้อง      canViewRequests + canReadRequestRow · ร่างของคนอื่นไม่ขึ้น            (= GET /api/sa/requests)
//      สรรพสามิต   ทะเบียน: history:view + canViewRecord('registrations') (ของเดิม relations.js)
//                 SO ค่าสรรพสามิต: เห็นใบสั่งขายได้ หรือถือ ra:view/ra:approve (= คิว RA ใน /tax)
//  · มติ 3 — ลีดขึ้นเฉพาะที่เป็นดีลแล้ว (ผ่าน `sales_deals.leadId`) · `sales_leads.customerId` ไม่ใช้
//  · ⛔ GET ห้ามเขียน — ไม่เรียก syncContractsAgainstQuotations (ตัวนั้นเขียนฐาน) ⇒ สถานะสัญญาที่โชว์คือค่าบนแถว
//  · ⚠️ query ทุกตัวผ่าน fetchAll + เรียงด้วย id (ตัด 1,000 แถวเงียบ) · `.in()` ผ่าน fetchAllInChunks (16 KB)
import { can } from '@/lib/permissions';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { inSalesDocScope } from '@/lib/scopedRow';
import { canViewRequests } from '@/lib/permissions';
import { canReadRequestRow } from '@/lib/requests/access';
import { attachReworkRows } from '@/lib/requests/reworkRows';
import { latestContractRevisions } from '@/lib/sales/contracts';
import { isExciseOrder } from '@/lib/sales/historicalOrders';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';

export const HUB_DEAL_COLS = 'id, code, title, stage, dealType, categoryCode, projectValue, wonValue, ownerId, ownerName, team, line, leadId, createdAt, customerId';
export const HUB_QUOTATION_COLS = 'id, quoteNumber, dealId, status, approvalStatus, totalAmount, quoteDate, createdAt, acceptedAt, revisedFromId, baseNumber, revisionNo, origin, sourceSalesOrderId, referenceNote, customerId';
export const HUB_ORDER_COLS = 'id, orderNumber, dealId, quotationId, status, financeStatus, origin, totalAmount, actualAmount, actualMode, actualCountedAmount, actualSubmittedAmount, orderDate, approvedAt, referenceDoc, sourceSalesOrderId, supersededById, revisionNo, customerId, createdAt';
// actualStatus/actualAmount/actualApprovedAt = Actual รายงวด (mig 0412) — แท็บภาพรวมคิด Actual รายเดือนด้วยตัวเดียวกับรายงานยอดขาย (reportActualRows)
/* ⚠️ `evidence` · `refundedAt` · `frozenAt` = ช่องที่ `installmentDisplayStatus` ใช้ตัดสิน "รับล่วงหน้า" / "คืนเงิน" (งวด H4 แก้)
   🐞 H1–H3 ไม่ได้ดึงมา ⇒ งวดรับล่วงหน้า (pending + paidOn + หลักฐาน · prod 13/11 มี 6 งวด) ถูกนับว่า "ค้างรับ" บนหน้าลูกค้า
   ขณะที่หน้า SO บอกว่ารับแล้ว · หลักฐานถูกย่อเหลือแค่จำนวนไฟล์ก่อนส่งให้จอ (`slimInstallment`) — หน้าลูกค้าไม่ต้องรู้ชื่อไฟล์ */
export const HUB_INSTALLMENT_COLS = 'id, salesOrderId, seq, label, amount, dueDate, status, paidOn, confirmedAt, kind, taxInvoiceNo, billingDate, actualStatus, actualAmount, actualApprovedAt, evidence, refundedAt, frozenAt';
export const HUB_REQUEST_COLS = 'id, docNo, dept, kind, status, title, dealId, salesOrderId, customerId, requestedById, requestedByName, team, submittedAt, createdAt, committedDueDate, dueCommittedAt, requestedDueDate, closedAt, answeredAt, urgent, pdrRefNo, acknowledgedAt';
export const HUB_CONTRACT_COLS = 'id, contractNo, kind, status, dealId, quotationId, customerId, contractDate, signedDate, effectiveDate, expiryDate, baseNumber, revisionNo, revisedFromId, createdAt, externalRef, source, team, ownerId';
export const HUB_LEAD_COLS = 'id, company, contactName, channel, status, assigneeName, createdAt';
export const HUB_LINE_COLS = 'id, salesOrderId, productId, fgCode, description, qty, unit, lineTotal';
const DEAL_SCOPE_COLS = 'id, code, title, stage, dealType, team, ownerId, ownerName';

const byCustomer = (supabase, table, cols, customerId) => fetchAll(() => supabase
  .from(table).select(cols).eq('customerId', customerId)
  .order('createdAt', { ascending: false }).order('id', { ascending: true }));

const byIds = (supabase, table, cols, column, ids) => fetchAllInChunks(ids, (chunk) => supabase
  .from(table).select(cols).in(column, chunk).order('id', { ascending: true }));

/** ดีลของแถวที่ดีลไม่ได้อยู่ในชุดของลูกค้ารายนี้ (ใบที่ย้ายลูกค้า · ดีลที่ customerId ว่าง) — ใช้ตัดสินสิทธิ์อย่างเดียว */
async function dealMapFor(supabase, deals, rows) {
  const map = new Map(deals.map((d) => [d.id, d]));
  const missing = [...new Set(rows.map((r) => r.dealId).filter((id) => id && !map.has(id)))];
  if (missing.length) {
    for (const d of await byIds(supabase, 'sales_deals', DEAL_SCOPE_COLS, 'id', missing)) map.set(d.id, d);
  }
  return map;
}

/** ดีลต้นทางของใบค่าสรรพสามิต (ไม่มีดีลของตัวเอง) — ผ่าน SO ต้นทาง · แบบเดียวกับ loadSourceDeals ของ scopedRow */
async function sourceDealMapFor(supabase, rows) {
  const sourceIds = [...new Set(rows.filter((r) => !r.dealId && r.sourceSalesOrderId).map((r) => r.sourceSalesOrderId))];
  if (!sourceIds.length) return new Map();
  const sources = await byIds(supabase, 'sales_orders', 'id, dealId', 'id', sourceIds);
  const dealIds = [...new Set(sources.map((s) => s.dealId).filter(Boolean))];
  const deals = dealIds.length ? await byIds(supabase, 'sales_deals', DEAL_SCOPE_COLS, 'id', dealIds) : [];
  const dealById = new Map(deals.map((d) => [d.id, d]));
  return new Map(sources.filter((s) => dealById.has(s.dealId)).map((s) => [s.id, dealById.get(s.dealId)]));
}

/** ติดดีล (หรือดีลต้นทาง) ให้แถว แล้วกรองด้วย inSalesDocScope — คืนแถวเดิมที่ไม่มีก้อนดีลติดไปด้วย */
function scopeSalesDocs(user, rows, dealById, sourceDealById) {
  return rows.filter((row) => inSalesDocScope(user, {
    deal: row.dealId ? dealById.get(row.dealId) || null : null,
    sourceDeal: !row.dealId && row.sourceSalesOrderId ? sourceDealById.get(row.sourceSalesOrderId) || null : null,
  }, 'view'));
}

/**
 * ข้อมูลทุกกลุ่มของหน้าลูกค้าศูนย์รวม
 * @returns {{
 *   sales: { visible: boolean, deals: object[], leads: object[], quotations: object[], orders: object[], contracts: object[] },
 *   finance: { visible: boolean, installments: object[] },
 *   requests: { visible: boolean, rows: object[] },
 *   excise: { visible: boolean, orders: object[] },
 *   orderLines: object[],
 * }}
 * กลุ่มที่ไม่มีสิทธิ์ = `visible: false` + ลิสต์ว่าง (จอซ่อนแท็บ · มติ 4 + กติกา "ไม่มีสิทธิ์ = ไม่โชว์")
 * ⚠️ query พัง = throw (ห้ามคืนลิสต์ว่าง — ว่างเพราะพังอ่านเหมือน "ลูกค้าไม่มีดีล")
 */
/** งวดที่ส่งให้จอ: หลักฐานเหลือแค่จำนวน (ตัวตัดสินรับล่วงหน้าถามแค่ "มีไหม") — ไม่ส่งชื่อ/ที่อยู่ไฟล์สลิปไปหน้าลูกค้า */
export function slimInstallment(inst) {
  const files = Array.isArray(inst?.evidence) ? inst.evidence.length : 0;
  return { ...inst, evidence: Array.from({ length: files }, () => ({})) };
}

export async function customerHubRelations(supabase, customerId, user) {
  const seesSales = canViewSalesPlanning(user);
  const seesRequests = canViewRequests(user);
  const seesRa = can(user?.role, 'ra:view') || can(user?.role, 'ra:approve');

  const [dealRows, quoteRows, orderRows, contractRows, requestRows] = await Promise.all([
    seesSales ? byCustomer(supabase, 'sales_deals', HUB_DEAL_COLS, customerId) : [],
    seesSales ? byCustomer(supabase, 'quotations', HUB_QUOTATION_COLS, customerId) : [],
    seesSales || seesRa ? byCustomer(supabase, 'sales_orders', HUB_ORDER_COLS, customerId) : [],
    seesSales ? byCustomer(supabase, 'sales_contracts', HUB_CONTRACT_COLS, customerId) : [],
    seesRequests ? byCustomer(supabase, 'dept_requests', HUB_REQUEST_COLS, customerId) : [],
  ]);

  const deals = seesSales ? dealRows.filter((d) => inSalesViewScope(user, d)) : [];
  const docRows = [...quoteRows, ...orderRows];
  const dealById = seesSales || seesRa ? await dealMapFor(supabase, deals, [...docRows, ...contractRows]) : new Map();
  const sourceDealById = seesSales || seesRa ? await sourceDealMapFor(supabase, docRows) : new Map();

  const quotations = seesSales ? scopeSalesDocs(user, quoteRows, dealById, sourceDealById) : [];
  const salesOrders = seesSales ? scopeSalesDocs(user, orderRows, dealById, sourceDealById) : [];
  // ใบค่าสรรพสามิต: เห็นใบสั่งขายได้ = ผ่านด่านเดียวกับใบอื่น · RA เห็นทุกใบของลูกค้า (คิว /tax ไม่มี row scope)
  const salesOrderIds = new Set(salesOrders.map((o) => o.id));
  const exciseOrders = orderRows.filter((o) => isExciseOrder(o) && (salesOrderIds.has(o.id) || seesRa));
  const contracts = seesSales
    ? latestContractRevisions(contractRows.filter((c) => {
      const deal = c.dealId ? dealById.get(c.dealId) : null;
      return deal && inSalesViewScope(user, deal);
    }))
    : [];

  const leadIds = [...new Set(deals.map((d) => d.leadId).filter(Boolean))];
  const visibleOrderIds = salesOrders.map((o) => o.id);
  const [leads, rawInstallments, orderLines] = await Promise.all([
    leadIds.length ? byIds(supabase, 'sales_leads', HUB_LEAD_COLS, 'id', leadIds) : [],
    visibleOrderIds.length ? byIds(supabase, 'sales_order_installments', HUB_INSTALLMENT_COLS, 'salesOrderId', visibleOrderIds) : [],
    visibleOrderIds.length ? byIds(supabase, 'sales_order_lines', HUB_LINE_COLS, 'salesOrderId', visibleOrderIds) : [],
  ]);

  // ร่างของคนอื่นไม่ขึ้น — ตรงกับ loadVisibleRequests (lib/requests/visibleRows.js)
  // + แถวรอบแก้ (`items`) ให้ `liveDueDate` ตัดวันของรอบเก่าที่ถูกตีกลับ — คอลัมน์กำหนดส่ง (มติ 8 · งวด H4)
  //   พูดเหมือนคิวคำร้อง (ตัวเติมเดียวกับ my-schedule · โหลดพลาด = ไม่มีแถวรอบแก้ ไม่ล้มทั้งหน้า)
  const requests = seesRequests
    ? await attachReworkRows(supabase, requestRows.filter((r) => (r.status !== 'draft' || r.requestedById === user?.id) && canReadRequestRow(user, r)))
    : [];

  return {
    sales: { visible: seesSales, deals, leads, quotations, orders: salesOrders, contracts },
    finance: { visible: seesSales, installments: rawInstallments.map(slimInstallment) },
    requests: { visible: seesRequests, rows: requests },
    excise: { visible: exciseOrders.length > 0 || seesRa, orders: exciseOrders },
    orderLines,
  };
}
