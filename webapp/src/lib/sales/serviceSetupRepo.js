// ── ที่อ่าน/เขียนงานบริการรายบรรทัดของใบสั่งขาย (mig 0392 · PR-A) — ฝั่ง server เท่านั้น ─────────────────
//
// ⭐ **ตัวโหลดบริบทตัวเดียว** (`loadServiceSetupContext`) — GET/PATCH/POST ของ `…/service-setup` (U3) และด่านยื่น/อนุมัติ
//   ของใบ (U4) ป้อนบริบทก้อนเดียวกันเข้าตัวตัดสินล้วนของ `serviceSetup.js` ⇒ จอกับด่านเห็นข้อที่ยังขาดชุดเดียวกัน
//   รูปของบริบท = §2.2 ของแผน (`ctx`) · ตรรกะทั้งหมดอยู่ที่ serviceSetup.js ไฟล์นี้แตะฐานอย่างเดียว
//
// 🔴 **อ่านพังที่ไหน = throw ข้อความไทย** (รวมตัวเลือก FG เมื่อขอ) — ห้ามกลืนเป็น "ไม่มี" · ด่านที่อ่านงวด/โซน/แพ็คเกจ
//    ไม่ขึ้นแล้วถือว่าว่าง คือด่านที่เปิดเงียบ (กติกา supabase ไม่ throw · ผู้เรียกตอบ 500 และไม่เดา)
// 🔴 **ทุกด่านต้อง `withFgOptions: true`** — ข้อ "แพ็คเกจของนิติบุคคลอื่น" (fg_foreign) ตรวจที่ JS เท่านั้น
//    และ `serviceSetupIssues` throw เมื่อไม่มี `fgOptionIds` (fail-closed) · ขอแล้ว = Set เสมอ (ว่างได้ ไม่ใช่ null)
// ⚠️ ลิสต์ที่โตตามข้อมูล (โซน · ไซต์ · สินค้า · ไซต์ของพี่น้อง) ซอยก้อน + ไล่หน้า (`fetchAllInChunks`)
//    และตารางที่ติดเพดาน check:rowcap อ่านผ่าน `fetchAllResult` / `.maybeSingle()` เท่านั้น
// ⚠️ ไม่แตะคอลัมน์ snapshot ของบรรทัด — การเขียนทั้งหมดไปทาง RPC ของ 0392 (ด่านสถานะ/ล็อกอยู่ที่ฐานด้วย)
import { businessDate } from '@/lib/businessDate';
import { categoryOf } from '@/lib/master/categoryOf';
import { customerTaxSiblings } from '@/lib/master/customerTaxSiblings';
import { productDisplayName } from '@/lib/master/productIdentity';
import { orderBusinessLine } from '@/lib/service/intake';
import { termIsActive } from '@/lib/service/terms';
import { loadLiveTermsByZone } from '@/lib/sales/historicalOrderCommit';
import { loadInstallments } from '@/lib/sales/salesOrderInstallmentsStore';
import { serviceSetupSqlMessage } from '@/lib/sales/serviceSetup';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { byColumns, fetchAllInChunks } from '@/lib/supabaseInChunks';

/* หมวดของแพ็คเกจบริการรายรอบ — ตัวเดียวกับ SERVICE_ROUND_CATEGORY (serviceOrders.js) และ `fg_category_of` ของฐาน */
const PACKAGE_CATEGORY = '02-001';

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const hasOwn = (object, key) => !!object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
const uniqueIds = (values) => [...new Set(list(values).map(text).filter(Boolean))];

/* อ่านไม่ขึ้น = Error ภาษาไทยที่บอกว่าอ่านอะไรพัง + ข้อความเดิมของฐาน (ผู้เรียกต่อหน้าด้วย "โหลดงานบริการไม่สำเร็จ: …") */
function readFailed(what, error) {
  const detail = text(error?.message) || text(error?.code) || text(error) || 'ไม่ทราบสาเหตุ';
  const out = new Error(`${what}ไม่สำเร็จ: ${detail}`);
  out.cause = error;
  return out;
}
async function orThrow(what, run) {
  try { return await run(); } catch (error) { throw readFailed(what, error); }
}

/* ── ชิ้นส่วนของบริบท ─────────────────────────────────────────────────────────────────────────────────── */

/* เลขรายการ 1-based ตามลำดับบนใบ (sortOrder แล้ว id — หน้าใบเรียงด้วย sortOrder) · สำเนา ไม่แก้ของผู้เรียก */
function numberLines(rows) {
  return [...list(rows)]
    .sort((a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0)
      || (text(a?.id) < text(b?.id) ? -1 : text(a?.id) > text(b?.id) ? 1 : 0))
    .map((line, index) => ({ ...line, lineNo: index + 1 }));
}

/* ⭐ mig 0400: "servicePeriodFrom"/"servicePeriodTo" = ช่วงบริการของรายการ (โหมดแยกรายรายการ) — ตัวตัดสินอ่านผ่าน `linePeriodOf`
   ⚠️ ต้องรัน 0400 ก่อน deploy (ไม่มีคอลัมน์ = select 500 ทุกใบสายบริการ · check:columns แดงสองชื่อนี้จนกว่าจะรัน)
   🪤 คอมเมนต์อยู่เหนือฟังก์ชัน ไม่แทรกระหว่าง `.from()` กับ `.select()` (check:columns มองหา select ไม่เกิน 200 ตัวอักษรหลัง `.from()`) */
async function loadLines(supabase, orderId) {
  const { data, error } = await fetchAllResult(() => supabase
    .from('sales_order_lines')
    .select('id, "salesOrderId", "quotationLineId", "productId", "fgCode", description, qty, unit, "sortOrder", metadata, "serviceKind", "serviceProductId", "serviceFgCode", "serviceRounds", "servicePeriodFrom", "servicePeriodTo"')
    .eq('salesOrderId', orderId)
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true }));
  if (error) throw readFailed('อ่านรายการของใบสั่งขาย', error);
  return data || [];
}

async function loadAllocations(supabase, orderId) {
  const { data, error } = await fetchAllResult(() => supabase
    .from('sales_order_line_zones')
    .select('id, "salesOrderId", "salesOrderLineId", "zoneId", "packsPerRound", "sortOrder"')
    .eq('salesOrderId', orderId)
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true }));
  if (error) throw readFailed('อ่านโซนที่ตั้งไว้ของใบนี้', error);
  return data || [];
}

async function loadZones(supabase, zoneIds) {
  const rows = await orThrow('อ่านโซนในทะเบียน', () => fetchAllInChunks(zoneIds, (chunk) => supabase
    .from('service_zones')
    .select('id, code, name, "siteId", "isActive"')
    .in('id', chunk)
    .order('id', { ascending: true })));
  return rows.map((zone) => ({
    id: zone.id, code: zone.code ?? null, name: zone.name ?? null, siteId: zone.siteId ?? null, isActive: zone.isActive,
  }));
}

async function loadSites(supabase, siteIds) {
  const rows = await orThrow('อ่านไซต์ในทะเบียน', () => fetchAllInChunks(siteIds, (chunk) => supabase
    .from('service_sites')
    .select('id, code, name, "customerId", kind, "isActive"')
    .in('id', chunk)
    .order('id', { ascending: true })));
  return rows.map((site) => ({
    id: site.id, code: site.code ?? null, name: site.name ?? null, customerId: site.customerId ?? null,
    kind: site.kind ?? null, isActive: site.isActive,
  }));
}

const productShape = (row) => ({
  id: row.id,
  fgCode: row.fgCode ?? null,
  isActive: row.isActive,
  approvalStatus: row.approvalStatus ?? null,
  customerId: row.customerId ?? null,
  name: productDisplayName(row) || row.fgCode || null,
});

/* แพ็คเกจที่บรรทัดเลือกไว้ — อ่านทุกสถานะ (ปิดใช้งาน/ยังไม่อนุมัติ/ไม่ใช่ 02-001 = ข้อ fg_invalid ต้องตัดสินได้) */
async function loadProducts(supabase, productIds) {
  const rows = await orThrow('อ่านแพ็คเกจที่เลือกไว้', () => fetchAllInChunks(productIds, (chunk) => supabase
    .from('products')
    .select('id, "fgCode", "productDescription", "productDescriptionEn", "customerId", "isActive", "approvalStatus"')
    .in('id', chunk)
    .order('id', { ascending: true })));
  return new Map(rows.map((row) => [row.id, productShape(row)]));
}

/* แถวสายธุรกิจ: ใช้ก้อนที่แนบมากับใบเมื่อเป็นแถวเดียวกันและมีคีย์ `line` · ไม่งั้นอ่านเอง (ก้อนเดิมคงอยู่ เติมแค่ line) */
async function businessRowOf(supabase, table, id, attached) {
  if (!id) return attached ?? null;
  const usable = attached && text(attached.id) === id && hasOwn(attached, 'line');
  if (usable) return attached;
  const { data, error } = await supabase.from(table).select('id, line').eq('id', id).maybeSingle();
  if (error) throw readFailed('อ่านสายธุรกิจของใบ', error);
  if (!data) return attached && text(attached.id) === id ? { ...attached, line: null } : null;
  return attached && text(attached.id) === id ? { ...attached, id: data.id, line: data.line ?? null } : { id: data.id, line: data.line ?? null };
}

async function loadBillingRule(supabase, customerId) {
  if (!customerId) return null;
  const { data, error } = await supabase.from('customers').select('id, "billingRule"').eq('id', customerId).maybeSingle();
  if (error) throw readFailed('อ่านรอบวางบิลของลูกค้า', error);
  return data?.billingRule ?? null;
}

async function loadContract(supabase, contractId) {
  if (!contractId) return null;
  const { data, error } = await supabase
    .from('sales_contracts')
    .select('id, "contractNo", status, "effectiveDate", "expiryDate"')
    .eq('id', contractId)
    .maybeSingle();
  if (error) throw readFailed('อ่านสัญญาที่ผูกกับใบ', error);
  return data
    ? { id: data.id, contractNo: data.contractNo ?? null, status: data.status ?? null, effectiveDate: data.effectiveDate ?? null, expiryDate: data.expiryDate ?? null }
    : null;
}

/* ใบเดิมของใบ Rev. — เลขใบ (แบนเนอร์ "ยกมาจาก …") + ไซต์ที่มีรอบบริการเดินอยู่ (บรรทัด "ย้ายรอบบริการ n ไซต์") */
async function loadPredecessor(supabase, revisedFromId) {
  if (!revisedFromId) return null;
  const [head, plans] = await Promise.all([
    supabase.from('sales_orders').select('id, "orderNumber"').eq('id', revisedFromId).maybeSingle(),
    fetchAllResult(() => supabase.from('service_plans').select('id, "siteId"')
      .eq('salesOrderId', revisedFromId).eq('isActive', true)
      .order('id', { ascending: true })),
  ]);
  if (head.error) throw readFailed('อ่านใบเดิมของใบ Rev. ', head.error);
  if (plans.error) throw readFailed('อ่านรอบบริการของใบเดิม', plans.error);
  return {
    id: revisedFromId,
    orderNumber: head.data?.orderNumber ?? null,
    activePlanSiteIds: uniqueIds(list(plans.data).map((plan) => plan?.siteId)),
  };
}

/* รอบขายของ **ใบอื่น** ที่ยังมีผลบนโซนที่ตั้งไว้ (บรรทัด "ต่ออายุ" ของโมดัลอนุมัติ · คำเตือนใต้โซน)
   ⚠️ ตัวอ่านคืนทุก term (ไม่มีสถานะ โตสะสม) ⇒ "มีผลไหม" ตัดสินที่นี่ด้วย termIsActive ตัวเดียวของระบบ (ใบแม่ + ช่วงวัน) */
async function loadLiveTerms(supabase, zoneIds, orderId, todayIso) {
  if (!zoneIds.length) return new Map();
  const byZone = await orThrow('อ่านรอบขายของใบอื่นบนโซนที่ตั้ง', () => loadLiveTermsByZone(supabase, zoneIds));
  const out = new Map();
  for (const [zoneId, entries] of byZone) {
    const live = list(entries).filter(({ term, order } = {}) => term && order?.id
      && order.id !== orderId && term.salesOrderId !== orderId
      && termIsActive(term, order, todayIso));
    if (live.length) out.set(zoneId, live);
  }
  return out;
}

/* ใบลูกค้าของนิติบุคคลเดียวกัน (ตัวเองเป็นตัวแรก) — ตัวเดียวกับดรอปดาวน์ FG ของใบเสนอราคาและด่านตอนบันทึก */
async function taxSiblingsOf(supabase, customerId) {
  if (!customerId) return [];
  return orThrow('อ่านลูกค้านิติบุคคลเดียวกัน', () => customerTaxSiblings(supabase, customerId));
}

/* แพ็คเกจที่เลือกได้ = FG หมวด 02-001 ที่อนุมัติแล้ว (null = ของยุคก่อนมีด่าน) และยังใช้งาน ของลูกค้า + นิติบุคคลเดียวกัน
   ⭐ กติกาเดียวกับ `GET /api/products?taxSiblings=1` + ด่านสินค้าของ RPC บันทึก (อนุมัติ · ใช้งาน · หมวด 02-001)
   ⭐ ของใบลูกค้าที่ถามขึ้นก่อน แล้วเรียงรหัส FG · ของพี่น้องติดป้าย `ownerArCode` ("ของ AR-xxxx") */
async function fgOptionsOf(supabase, customerId, siblings) {
  if (!customerId) return [];
  const owners = siblings.length ? siblings : [{ id: customerId }];
  const arCodeOf = new Map(owners.map((row) => [row.id, text(row.arCode) || null]));
  const rows = await orThrow('อ่านแพ็คเกจ (FG หมวด 02-001) ของลูกค้า', () => fetchAllInChunks(owners.map((row) => row.id), (chunk) => supabase
    .from('products')
    .select('id, "fgCode", "productDescription", "productDescriptionEn", "customerId", "isActive", "approvalStatus"')
    .in('customerId', chunk)
    .or('approvalStatus.eq.approved,approvalStatus.is.null')
    .order('fgCode', { ascending: true })
    .order('id', { ascending: true })));
  return rows
    .filter((row) => row.isActive !== false && categoryOf(row.fgCode) === PACKAGE_CATEGORY)
    .sort((a, b) => Number(a.customerId !== customerId) - Number(b.customerId !== customerId)
      || byColumns('fgCode', 'id')(a, b))
    .map((row) => ({
      id: row.id,
      fgCode: row.fgCode ?? null,
      name: productDisplayName(row) || row.fgCode || null,
      customerId: row.customerId ?? null,
      ownerArCode: row.customerId === customerId ? null : arCodeOf.get(row.customerId) || null,
    }));
}

/* ไซต์ลูกค้าที่ใช้งานอยู่ของพี่น้องนิติบุคคลเดียวกัน (ไม่นับตัวเอง) — ป้ายเตือน "โซนอาจอยู่ในใบลูกค้าอีกใบ" */
async function siblingSiteCountsOf(supabase, customerId, siblings) {
  const others = siblings.filter((row) => row?.id && row.id !== customerId);
  if (!others.length) return [];
  const rows = await orThrow('อ่านไซต์ของลูกค้านิติบุคคลเดียวกัน', () => fetchAllInChunks(others.map((row) => row.id), (chunk) => supabase
    .from('service_sites')
    .select('id, "customerId"')
    .in('customerId', chunk)
    .eq('isActive', true)
    .eq('kind', 'customer')
    .order('id', { ascending: true })));
  const count = new Map();
  for (const row of rows) count.set(row.customerId, (count.get(row.customerId) || 0) + 1);
  return others
    .filter((row) => count.get(row.id) > 0)
    .map((row) => ({ customerId: row.id, arCode: text(row.arCode) || null, siteCount: count.get(row.id) }));
}

/* ── ตัวโหลดบริบท ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ⭐ บริบทของงานบริการหนึ่งใบ — รูปตาม §2.2 ของแผน (ป้อน serviceSetupIssues/Warnings/View/Totals/… ได้ตรง ๆ)
 * @param order แถวใบสั่งขาย (`*`) — ก้อน `project`/`deal` ที่แนบมา (loadOrder · loadScoped) ใช้ได้ถ้ามีคีย์ `line`
 * @param lines บรรทัดที่ผู้เรียกมีอยู่แล้ว (เช่น `before.lines` ของ loadOrder) — ไม่ส่ง = อ่านเอง
 * @param extraZoneIds โซนที่ก้อนบันทึกอ้าง (PATCH) — อ่านรวมกับโซนที่ตั้งไว้ ให้ตัวตรวจเห็นไซต์ของมัน
 * @param withFgOptions 🔴 ด่านทุกตัวต้องส่ง true (fail-closed ของ serviceSetupIssues)
 * @param todayIso วันนี้ตามเวลาไทย (ตัดสิน "รอบขายที่ยังมีผล") — ไม่ส่ง = businessDate()
 * @returns ctx: `{ order (+ businessLine · project · deal), lines (+ lineNo), allocations, zonesById, sitesById, productsById,
 *   fgOptions, fgOptionIds, siblingSites, installments, customerBillingRule, contract, liveTermsByZone, predecessor, unsaved: false }`
 * @throws Error ภาษาไทย เมื่ออ่านส่วนไหนไม่ขึ้น (ตัวเลือก FG ด้วยเมื่อขอ) — ผู้เรียกตอบ 500 ห้ามเดา
 */
export async function loadServiceSetupContext(supabase, order, {
  lines = null, extraZoneIds = [], withFgOptions = false, todayIso = null,
} = {}) {
  if (!order?.id) throw new Error('โหลดงานบริการไม่ได้ — ไม่พบใบสั่งขาย');
  const customerId = text(order.customerId) || null;
  const today = todayIso || businessDate();

  const [rawLines, allocations, project, deal, installments, customerBillingRule, contract, predecessor, siblings] = await Promise.all([
    Array.isArray(lines) ? lines : loadLines(supabase, order.id),
    loadAllocations(supabase, order.id),
    businessRowOf(supabase, 'projects', text(order.projectId), order.project),
    businessRowOf(supabase, 'sales_deals', text(order.dealId), order.deal),
    orThrow('อ่านงวดชำระ', () => loadInstallments(supabase, order.id)),
    loadBillingRule(supabase, customerId),
    loadContract(supabase, text(order.serviceContractId)),
    loadPredecessor(supabase, text(order.revisedFromId)),
    taxSiblingsOf(supabase, customerId),
  ]);

  const numbered = numberLines(rawLines);
  const allocationZoneIds = uniqueIds(allocations.map((row) => row?.zoneId));
  const zoneIds = uniqueIds([...allocationZoneIds, ...list(extraZoneIds)]);
  const productIds = uniqueIds(numbered.map((line) => line?.serviceProductId));

  const [zones, productsById, liveTermsByZone, fgOptions, siblingSites] = await Promise.all([
    loadZones(supabase, zoneIds),
    loadProducts(supabase, productIds),
    loadLiveTerms(supabase, allocationZoneIds, order.id, today),
    withFgOptions ? fgOptionsOf(supabase, customerId, siblings) : Promise.resolve(null),
    siblingSiteCountsOf(supabase, customerId, siblings),
  ]);
  const sites = await loadSites(supabase, uniqueIds(zones.map((zone) => zone.siteId)));

  /* สายธุรกิจ = โครงการก่อนแล้วดีล (ตัวตัดสินเดียวของระบบ) · แนบแถวที่ใช้ตัดสินไว้กับใบด้วย ⇒ serviceSetupRequired/Flow
     ที่อ่านก้อน project/deal ของใบ พูดตรงกับ `businessLine` เสมอ */
  const projectsById = project?.id ? new Map([[project.id, project]]) : new Map();
  const dealsById = deal?.id ? new Map([[deal.id, deal]]) : new Map();
  const businessLine = orderBusinessLine(order, { projectsById, dealsById });

  return {
    order: { ...order, project: project ?? null, deal: deal ?? null, businessLine },
    lines: numbered,
    allocations,
    zonesById: new Map(zones.map((zone) => [zone.id, zone])),
    sitesById: new Map(sites.map((site) => [site.id, site])),
    productsById,
    fgOptions,
    fgOptionIds: fgOptions ? new Set(fgOptions.map((option) => option.id)) : null,
    siblingSites,
    installments,
    customerBillingRule,
    contract,
    liveTermsByZone,
    predecessor,
    unsaved: false,
  };
}

/** แพ็คเกจที่เลือกได้ของลูกค้า (รวมนิติบุคคลเดียวกัน) → `[{ id, fgCode, name, customerId, ownerArCode }]`
 *  @throws Error ภาษาไทยเมื่ออ่านไม่ขึ้น — ไม่มีทางคืน `{ error }` (ด่านต้องไม่เปิดเงียบ) */
export async function loadServiceFgOptions(supabase, customerId) {
  const id = text(customerId) || null;
  return fgOptionsOf(supabase, id, await taxSiblingsOf(supabase, id));
}

/** ใบลูกค้าพี่น้อง (ไม่นับตัวเอง) ที่มีไซต์ลูกค้าใช้งานอยู่ ≥ 1 → `[{ customerId, arCode, siteCount }]` เรียงตามรหัส AR */
export async function loadSiblingSiteCounts(supabase, customerId) {
  const id = text(customerId) || null;
  return siblingSiteCountsOf(supabase, id, await taxSiblingsOf(supabase, id));
}

/* ── RPC ของ 0392 (+ 0396 ท้ายไฟล์) ───────────────────────────────────────────────────────────────────────── */

const UNKNOWN_RPC_MESSAGE = 'ดำเนินการกับงานบริการไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้แจ้งผู้ดูแลระบบ';

/**
 * ยิง RPC ของงานบริการ แล้วแปลผล — `{ data }` หรือ `{ error: { status, message, code, detailCodes } }`
 * · รหัสของฐาน (`RAISE EXCEPTION '<code>'`) → ข้อความไทย/สถานะตามภาคผนวก A.2 (`SERVICE_SETUP_SQL_MESSAGES`)
 * · `detailCodes` = DETAIL ของฐานแยกด้วยจุลภาค (`sales_order_service_setup_incomplete` → 'kind_missing:<line>' …)
 *   ผู้เรียกแปลงเป็นข้อที่ยังขาดด้วย `serviceSetupSqlIssues(detailCodes, ctx)`
 * · รหัสที่ไม่รู้จัก = 500 ข้อความกลาง (ข้อความดิบของฐานลง log ไม่ออกไปที่จอ)
 * ⚠️ supabase ไม่ throw — อ่าน `error` เองเสมอ
 */
export async function rpcServiceSetup(supabase, fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  if (!error) return { data };
  const detailCodes = String(error?.details || '').split(',').map((code) => code.trim()).filter(Boolean);
  const mapped = serviceSetupSqlMessage(error);
  if (mapped) return { error: { status: mapped.status, message: mapped.message, code: mapped.code, detailCodes } };
  console.error(`[service-setup] ${fn} ตอบรหัสที่ไม่รู้จัก:`, error);
  return { error: { status: 500, message: UNKNOWN_RPC_MESSAGE, code: null, detailCodes } };
}

/* ผู้ทำ = บัญชีที่ล็อกอิน (ชื่อ → อีเมล) · บทบาทให้ฐานตัดสินสิทธิ์ซ้ำ (is_sales_keyer_role / is_sales_manager_role) */
const actorOf = (user) => ({
  p_actor_id: user?.id ?? null,
  p_actor_name: user?.name || user?.email || null,
  p_actor_role: user?.role || null,
});

/** บันทึกงานบริการ — `payload` = `validateServiceSetupPatch(body, ctx).value` · `expectedUpdatedAt` = เวลาที่จอเห็น */
export function saveServiceSetup(supabase, { orderId, expectedUpdatedAt, payload, user }) {
  return rpcServiceSetup(supabase, 'save_sales_order_service_setup', {
    p_order_id: orderId,
    p_expected_updated_at: expectedUpdatedAt,
    p_payload: payload,
    ...actorOf(user),
  });
}

/** ยื่นตรวจงานบริการย้อนหลัง (ใบที่อนุมัติแล้ว) — ฐานตรวจข้อที่ยังขาดซ้ำ (`sales_order_service_setup_incomplete`) */
export function submitServiceBackfill(supabase, { orderId, expectedUpdatedAt, user }) {
  return rpcServiceSetup(supabase, 'submit_sales_order_service_setup', {
    p_order_id: orderId,
    p_expected_updated_at: expectedUpdatedAt,
    ...actorOf(user),
  });
}

/** ผู้จัดการฝ่ายขายอนุมัติงานบริการย้อนหลัง = เปิดรอบขายให้ TS · `overrideReason` = Admin ที่ยื่นเองอนุมัติเอง (route ตรวจ 10–500 ก่อน) */
export function approveServiceBackfill(supabase, { orderId, expectedUpdatedAt, overrideReason = null, user }) {
  return rpcServiceSetup(supabase, 'approve_sales_order_service_setup', {
    p_order_id: orderId,
    p_expected_updated_at: expectedUpdatedAt,
    ...actorOf(user),
    p_override_reason: overrideReason ?? null,
  });
}

/** ตีกลับงานบริการย้อนหลัง — เหตุผลส่งแบบตัดช่องว่างหัวท้าย (ฐานนับหลัง btrim · CHECK ของตารางก็เช่นกัน) */
export function rejectServiceBackfill(supabase, { orderId, expectedUpdatedAt, reason, user }) {
  return rpcServiceSetup(supabase, 'reject_sales_order_service_setup', {
    p_order_id: orderId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: text(reason),
    ...actorOf(user),
  });
}

/* ── RPC ของ 0396 — เปิดแก้งานบริการหลังอนุมัติ ─────────────────────────────────────────────────────────── */

/**
 * เปิดแก้งานบริการของใบที่อนุมัติแล้ว = ถอนรอบขาย (SZT-S) จาก TS · ล้างตรา + รอบตั้งย้อนหลังเดิม · บันทึกผู้เปิด/เวลา/เหตุ
 * → `{ data: { order, termsRemoved } }` หรือ `{ error }` (`service_setup_reopen_blocked` พก `detailCodes` = รหัสบล็อกของฐาน)
 * ⚠️ ฐานลง audit เองในทรานแซกชันเดียวกัน (ต่อ term ที่ถอน + แถวใบ) — ผู้เรียกห้ามลงซ้ำ (serviceSetupRoute.js)
 * @param reason ตัดช่องว่างหัวท้ายก่อนส่ง (ฐานนับ 10–500 หลัง btrim) · expectedUpdatedAt = ค่าดิบที่จอได้จาก GET
 */
export function reopenServiceSetup(supabase, { orderId, expectedUpdatedAt, reason, user }) {
  return rpcServiceSetup(supabase, 'reopen_sales_order_service_setup', {
    p_order_id: orderId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: text(reason),
    ...actorOf(user),
  });
}

/**
 * รหัสที่กันการเปิดแก้ของใบนี้ (`sales_order_service_reopen_blockers` — ตัวเดียวกับที่ RPC เปิดแก้ตรวจ)
 * → `{ codes: string[] }` (ว่าง = เปิดแก้ได้) หรือ `{ error }` — 🔴 ผู้เรียกแปลง error เป็น 'unread' (ปิดไว้ก่อน) ห้ามเดาว่าว่าง
 */
export async function loadServiceReopenBlockers(supabase, orderId) {
  const { data, error } = await rpcServiceSetup(supabase, 'sales_order_service_reopen_blockers', { p_order_id: orderId });
  if (error) return { error };
  /* ฐานคืน text[] เสมอ ('{}' = ว่าง) — รูปอื่น = อ่านไม่ออก ไม่ใช่ "ไม่มีอะไรกัน" */
  if (!Array.isArray(data)) return { error: { status: 500, message: UNKNOWN_RPC_MESSAGE, code: null, detailCodes: [] } };
  return { codes: data.map((code) => text(code)).filter(Boolean) };
}
