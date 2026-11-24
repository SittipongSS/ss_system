// ── ตัวโหลดทะเบียนติดตามต่อสัญญาบริการ (mig 0327 · แผน §PR-E) — ย้ายจาก api/sales-planning/renewals/route.js ─────
//
// ⭐ สองผู้เรียก: ทะเบียน (GET/POST ของ route — ตัดตามขอบเขตของผู้ใช้) และ cron daily-digest (กระดิ่งต่อรอบบริการ ·
//   `user = null` = เห็นทุกไซต์) · งวด 3 วันกำหนด 24/11/2026 ย้ายการกวาดกระดิ่งจาก GET มา cron ⇒ ต้องใช้ตัวโหลดเดียวกัน
//   ไม่งั้นกระดิ่งกับทะเบียนนับไซต์คนละชุด
// ⚠️ route file ของ Next export ชื่ออื่นนอกจาก HTTP method ไม่ได้ ⇒ ตัวโหลดอยู่ที่นี่
// ⚠️ ตัวตัดสินทั้งหมดอยู่ที่ `lib/service/renewals.js` — ที่นี่มีหน้าที่หยิบข้อมูลกับตัดขอบเขตเท่านั้น
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { inSalesViewScope } from '@/lib/salesPlanning';
import { loadSites } from '@/lib/service/sitesRepo';
import { loadAllZones, loadTerms } from '@/lib/service/termsRepo';
import { attachLinePeriods } from '@/lib/service/termPeriodRepo';
import { renewalLeadTerm, renewalRows } from '@/lib/service/renewals';

/* โหลดของทั้งหมดที่ทะเบียนต้องใช้ — ก้อนเดียวใช้ทั้ง GET และ POST
   (POST ต้องรู้ว่าไซต์นั้นเข้าเขตจริงไหมก่อนเปิดเรื่อง ไม่งั้นเปิดเรื่องให้ไซต์อะไรก็ได้) */
export async function loadRenewalContext(supabase, user) {
  const [zones, sites, rawTerms] = await Promise.all([
    loadAllZones(supabase), loadSites(supabase), loadTerms(supabase),
  ]);

  const orderIds = [...new Set(rawTerms.map((t) => t.salesOrderId).filter(Boolean))];
  /* ⚠️ ไล่ทีละหน้า — จำนวนรอบขายโตตามงานที่ขายได้ · เพดาน 1,000 ตัดเงียบแล้ว
     ไซต์ที่หลุดจะ "ไม่ใกล้หมด" ทั้งที่หมดพรุ่งนี้ (check:rowcap คุมไว้) */
  const { data: orders, error: orderError } = orderIds.length
    ? await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase.from('sales_orders')
      /* ⚠️ **`serviceContractId` คือทางไปหาวันหมด** (mig 0324) — ลืมคอลัมน์นี้เมื่อไร
         ทะเบียนกลับไปว่างเปล่าเงียบ ๆ เหมือนก่อนแก้ 06/09/2026
         ⭐ `servicePeriodTo` + `serviceTermsOpenedAt` (PR-C) — ใบที่เปิดงานบริการแล้วแต่ยังไม่ผูกสัญญา
           ถอยไปใช้วันจบช่วงบริการของใบ (`termEndInfo`) · ลืมสองคอลัมน์นี้ = ทางถอยเงียบทั้งที่เทสต์ lib เขียว
         ⭐ `servicePeriodMode` (mig 0400) — ใบแยกรายรายการ: วันจบ = วันจบของรายการที่รอบขายมาจาก (แนบให้ term ข้างล่าง)
           ไม่ใช่วันจบของช่วงรวมของใบ · ⚠️ ต้องรัน 0400 ก่อน deploy (check:columns แดงชื่อนี้จนกว่าจะรัน) */
      .select('id, "orderNumber", status, "supersededById", "dealId", "customerId", "serviceContractId", "servicePeriodTo", "serviceTermsOpenedAt", "servicePeriodMode"')
      .in('id', chunk).order('id', { ascending: true })))
    : { data: [], error: null };
  if (orderError) throw new Error(orderError.message);

  const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
  const { data: deals, error: dealError } = dealIds.length
    ? await fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase.from('sales_deals')
      .select('id, title, team, "ownerId", "ownerName", line')
      .in('id', chunk).order('id', { ascending: true })))
    : { data: [], error: null };
  if (dealError) throw new Error(dealError.message);

  const { data: followups, error: followupError } = await fetchAllResult(() => supabase
    .from('service_renewal_followups').select('*').order('id', { ascending: true }));
  if (followupError) throw new Error(followupError.message);

  const dealById = new Map((deals || []).map((d) => [d.id, d]));
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  /* รอบขายของใบแยกรายรายการได้ช่วงของบรรทัดตัวเอง (`linePeriodFrom/To` · mig 0400) — ไม่มีใบโหมดนั้น = ไม่ยิงเพิ่ม
     · อ่านไม่ขึ้น = โยน (GET/POST ตอบ 500 — ไม่ถอยไปใช้วันจบของช่วงรวมเงียบ ๆ) */
  const terms = await attachLinePeriods(supabase, rawTerms, ordersById);

  /* ขอบเขต: ตัด term ที่ใบแม่อยู่นอกขอบเขตของผู้ใช้ทิ้งตั้งแต่ต้นทาง
     ⚠️ ตัดที่ term ไม่ใช่ที่แถวสุดท้าย — ไซต์เดียวมีรอบจากหลายดีลได้ ถ้าตัดทีหลัง
     คนที่เห็นดีลเดียวจะได้วันหมดของดีลที่ตัวเองไม่มีสิทธิ์เห็นมาเป็นตัวเรียง */
  /* ⭐ `user = null` = cron (สิทธิ์ admin · กระดิ่งต่อรอบบริการ) — เห็นทุก term ที่มีดีล ไม่ตัดขอบเขต
     ⚠️ term ที่ไม่มีดีลยังตัดทิ้งเหมือนเดิม — ไม่มีดีล = ไม่มีเจ้าของให้ส่งกระดิ่ง และจอก็ไม่เคยเห็นแถวนั้น */
  const visibleTerms = terms.filter((t) => {
    const order = ordersById.get(t.salesOrderId);
    const deal = order?.dealId ? dealById.get(order.dealId) : null;
    if (!deal) return false;
    return user ? inSalesViewScope(user, deal) : true;
  });

  /* ── สัญญาบริการ = แหล่งความจริงของ "รอบนี้หมดเมื่อไร" (mig 0324) ──────────
     🐞 ก่อน 06/09/2026 ทะเบียนอ่าน `service_zone_terms.endDate` ซึ่งไม่มีใครเขียนเลย
       ⇒ ตอบ `[]` เสมอ · กระดิ่งไม่ยิงสักใบ · แถบสรุปเป็น 0 ทั้งสี่ช่องถาวร
     ⚠️ อ่านเท่าที่ใบอ้างถึงเท่านั้น — ดึงทั้งตารางคือดึงสัญญาทั้งบริษัท
     ⚠️ ชุดคอลัมน์เดียวกับที่ `gateContext` ใช้ ⇒ สองที่อ่านของชุดเดียวกัน
     ⭐ `approvedAt` + `cancelledAt` (มติ 24/09/2026) — สัญญาที่ถูกยกเลิกหลังลงนามจบวันที่ยกเลิก (`contractEndDate`) */
  const contractIds = [...new Set((orders || []).map((o) => o.serviceContractId).filter(Boolean))];
  const { data: contracts, error: contractError } = contractIds.length
    ? await fetchInChunks(contractIds, (chunk) => fetchAllResult(() => supabase.from('sales_contracts')
      .select('id, "contractNo", kind, status, "effectiveDate", "expiryDate", "approvedAt", "cancelledAt"')
      .in('id', chunk).order('id', { ascending: true })))
    : { data: [], error: null };
  if (contractError) throw new Error(contractError.message);
  const contractsById = new Map((contracts || []).map((c) => [c.id, c]));

  return {
    zones, sites, terms: visibleTerms, ordersById, dealById, contractsById,
    followups: followups || [],
  };
}

/* เรื่องที่ปิดไปแล้วครอบวันหมดไหนบ้าง (siteId → [วันหมด]) — ตัวกันไม่ให้เรื่องเดิม
   โผล่ซ้ำ และตัวที่ทำให้รอบ **ถัดไป** ยังโผล่ได้ (mig 0327 `coveredEndDate`) */
export function closedEndDatesOf(followups = []) {
  const map = new Map();
  for (const row of followups) {
    if (row.status === 'following' || !row.coveredEndDate) continue;
    map.set(row.siteId, [...(map.get(row.siteId) || []), row.coveredEndDate]);
  }
  return map;
}

export const rowsOf = (ctx, todayIso) => renewalRows({
  sites: ctx.sites, zones: ctx.zones, terms: ctx.terms,
  ordersById: ctx.ordersById, contractsById: ctx.contractsById,
  followups: ctx.followups, closedEndDates: closedEndDatesOf(ctx.followups), todayIso,
});

/* แถวพร้อมดีล/ใบของรอบที่เร็วที่สุด — จอต้องลิงก์กลับไปที่ใบและรู้ว่าใครเป็นเจ้าของ · กระดิ่งส่งถึงเจ้าของดีลในก้อนนี้
   (ไม่ส่งราคา/ยอดไปด้วย: ทะเบียนนี้ตอบว่า "ต้องโทรใครก่อน" ไม่ใช่เรื่องเงิน) */
export function enrichedRenewalRows(ctx, rows) {
  return rows.map((row) => {
    const term = renewalLeadTerm(row);
    const order = ctx.ordersById.get(term?.salesOrderId) || null;
    const deal = order?.dealId ? ctx.dealById.get(order.dealId) || null : null;
    const { terms: _terms, ...rest } = row;
    return {
      ...rest,
      zoneCount: row.terms.length,
      order: order ? { id: order.id, orderNumber: order.orderNumber } : null,
      deal: deal ? { id: deal.id, title: deal.title, ownerId: deal.ownerId, ownerName: deal.ownerName } : null,
    };
  });
}
