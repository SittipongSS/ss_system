// ── แท็บ "รอฝ่ายขายตั้งงานบริการ (ใบเดิม)" ของหน้างานเข้าใหม่ — logic ล้วน (mig 0392 · PR-A · D14/D25) ─────────
//
// ⭐ **ถังนี้แทน `bindQueue` (ถังผูกโซนของ TS) ที่ปลดแล้ว** — ตั้งแต่ 0392 ฝ่ายขายตั้งแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ ·
//   ช่วงบริการที่หน้าใบสั่งขายเอง ใบใหม่อนุมัติแล้วรอบขายของโซนเกิดทันที ⇒ TS ไม่ต้องผูกโซนอีก
//   ใบที่อนุมัติไปก่อนมีเรื่องนี้ = "ใบเดิม" ฝ่ายขายตั้งย้อนหลังแล้วผู้จัดการฝ่ายขายตรวจ · แท็บนี้ให้ TS **ดูอย่างเดียว**
//   ว่าใบไหนยังรออยู่ และถึงขั้นไหนแล้ว (ตรวจผ่านแล้วขึ้น "รอตั้งรอบ" เอง)
//
// 🔴 **ทำไมเป็นไฟล์แยก ไม่อยู่ใน intake.js** (กฎ 16 ของแผน) — ถังนี้ต้องใช้ทั้ง `intake.js` และตัวตัดสิน
//   `serviceSetup.js` แต่ `intake.js` ↔ `serviceOrders.js` เป็นวง import อยู่แล้ว และ `serviceSetup.js` import
//   สองไฟล์นั้น ⇒ `intake.js` **ห้าม** import `serviceSetup.js` · โค้ดที่ต้องการทั้งสองฝั่งอยู่ที่นี่
//   ยาม: legacySetupQueueGuard.test.mjs
//
// ⚠️ **ตัดสินด้วยตัวตัดสินกลางเท่านั้น** — "ใบนี้ต้องตั้งย้อนหลังไหม" = `serviceBackfillNeeded` (D25) · "ถึงขั้นไหน" =
//   `serviceBackfillState` (D28: 'submitted' เฉพาะใบที่ `serviceBackfillAwaitingReview`) · ห้ามอ่าน `serviceSetupState` เอง
//   ⇒ ใบที่ถูกย้อนอนุมัติ/ออก Rev./ยกเลิกแล้วค้างสถานะ 'submitted' ไม่โผล่ (ไม่ใช่ใบที่รับได้อยู่แล้ว)
// ⚠️ ใบที่ทุกบรรทัดตัดสินได้**เอง**ว่า "ไม่ใช่งานบริการ" ไม่ขึ้นที่นี่ (D25 — ไม่มีอะไรให้ TS) · ใบที่ฝ่ายขายเลือก "ไม่ใช่งานบริการ"
//   เองครบทุกบรรทัดยังอยู่จนผู้จัดการอนุมัติ (`serviceLineNeedsBackfill`)
// 🔒 ไม่มียอดเงินออกไปกับแถว — ฝ่ายบริการไม่เห็นราคาโดยตั้งใจ (หัวไฟล์ route คิว)
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { orderBusinessLine, orderReadiness, orderReceivable } from '@/lib/service/intake';
import {
  SERVICE_BACKFILL_STATE_LABELS,
  SERVICE_KIND_NOT_SERVICE,
  serviceBackfillNeeded,
  serviceBackfillState,
  serviceLineNeedsBackfill,
  serviceLineRole,
  serviceSetupTotals,
} from '@/lib/sales/serviceSetup';
import { fmtDate, fmtNumber } from '@/lib/format';

/* 🔴 คอลัมน์นี้ต้องมาจาก select ของใบเสมอ — ไม่ส่งมา = undefined = "ยังไม่ประทับ" ⇒ ใบที่ตั้งเสร็จและเปิดงานให้ TS
   แล้วจะกลับมาโผล่ในถังนี้เงียบ ๆ (โรคเดียวกับ `serviceContractId` ที่ตกจาก select ของคิวนี้ UAT 2026-09-01)
   ⇒ โยนทันที ไม่เดา · ยาม: legacySetupQueueGuard.test.mjs ตรวจ select ของทุกผู้เรียก */
export const LEGACY_SETUP_SELECT_ERROR = 'legacySetupQueue: order select ต้องมี "serviceTermsOpenedAt"';

/* ⭐ ลูกค้าของใบยังไม่มีไซต์ในทะเบียน — ฝ่ายขายเลือกโซนไม่ได้ (ยื่นตรวจไม่ได้) จนกว่า TS เพิ่มไซต์ ⇒ ต้องบอก TS ที่แถวนี้
   (ไม่ต้องเดาจำนวนสาขาจากหมายเหตุ — "ขาด n สาขา" ของ D24 ยังเป็นงาน PR-B · กรณี "ไม่มีเลยสักไซต์" ตอบได้แน่นอน) */
export const LEGACY_SETUP_NO_SITE_SUB = 'ลูกค้ายังไม่มีไซต์ในทะเบียน — ฝ่ายขายเลือกโซนไม่ได้จนกว่า TS เพิ่มไซต์'
  + ' (ทะเบียนไซต์ › เพิ่มไซต์ย้อนหลัง หรือจากคำร้องประเมินพื้นที่)';

/* ตัวกรองสถานะบนแท็บ (Segmented) — ลำดับตามขั้นของงาน · 'all' = ทุกสถานะ */
export const LEGACY_SETUP_FILTERS = Object.freeze(['all', 'not_started', 'editing', 'submitted', 'rejected']);
export const LEGACY_SETUP_FILTER_LABELS = Object.freeze({
  all: 'ทุกสถานะ',
  not_started: 'ยังไม่เริ่ม',
  editing: 'ฝ่ายขายกำลังตั้ง',
  submitted: 'รอผู้จัดการตรวจ',
  rejected: 'ตีกลับ',
});

const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
const pick = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || null;

function groupBy(rows, key) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

/* ชนิดที่บรรทัดตัดสินได้เอง (ไม่ดูค่าที่ฝ่ายขายเก็บ) — ตัวตัดสินเดียวกัน แค่ถอดชนิดที่เก็บออก */
const derivedRole = (line) => serviceLineRole({ ...line, serviceKind: null });

/* บรรทัดที่นับในความคืบหน้า = บรรทัดที่ต้องมีคนตัดสิน: ตัดสินเองได้ว่าเป็นแพ็คเกจ · ยังไม่รู้ · หรือฝ่ายขายเลือกทับแล้ว
   ⚠️ บรรทัดที่ตัดสินเองได้ว่า "ไม่ใช่งานบริการ" (FG หมวดอื่น · บรรทัดพิมพ์เองที่มีหมวดอื่น) ไม่มีอะไรให้ทำ ⇒ ไม่นับ
   ⭐ ฝ่ายขายเลือก "ไม่ใช่งานบริการ" ให้บรรทัดที่ต้องตัดสิน = ตัดสินแล้ว (นับเป็นเสร็จ) ไม่ใช่หลุดจากตัวหาร */
const lineNeedsDecision = (line) => derivedRole(line) !== SERVICE_KIND_NOT_SERVICE
  || serviceLineRole(line) !== SERVICE_KIND_NOT_SERVICE;

/* บรรทัดตั้งครบ — ถามตัวรวมกลาง (`serviceSetupTotals.completeLines`) ด้วยบริบทของบรรทัดเดียว
   ⇒ นิยาม "ครบ" (FG · รอบ · ≥1 โซน · แพ็คต่อรอบทุกโซน · ไม่ใช่งานบริการ = ไม่มีโซนค้าง) เป็นตัวเดียวกับชิปบนหน้าใบ */
const lineComplete = (line, allocations, zonesById) =>
  serviceSetupTotals({ lines: [line], allocations, zonesById }).completeLines === 1;

/* ฝ่ายขายเริ่มตั้งแล้วหรือยัง — ช่วงบริการ · ชนิดที่เลือกเอง · แพ็คเกจ · โซน อย่างใดอย่างหนึ่งที่บันทึกแล้ว
   ⚠️ **ไม่นับจำนวนรอบ** — ใบเดิมกรอกรอบได้ตั้งแต่ mig 0326 (ตารางรอบบนการ์ดสัญญา) ⇒ นับรอบ = ใบเดิมจำนวนมาก
      ขึ้นเป็น "ฝ่ายขายกำลังตั้ง" ทั้งที่ยังไม่มีใครแตะงานบริการเลย */
function hasDraftData(order, lines, allocations) {
  if (order?.servicePeriodFrom) return true;
  if (allocations.length) return true;
  return lines.some((line) => !!line?.serviceKind || !!line?.serviceProductId || !!line?.serviceFgCode);
}

function buildRow(order, orderLines, orderAllocations, { zonesById, dealsById, contractsById, line, customersWithSite }) {
  const relevant = orderLines.filter(lineNeedsDecision);
  const allocationsByLine = groupBy(orderAllocations, 'salesOrderLineId');
  const done = relevant.filter((l) => lineComplete(l, allocationsByLine.get(l.id) || [], zonesById)).length;
  const state = serviceBackfillState(order, { hasDraftData: hasDraftData(order, orderLines, orderAllocations) });
  const totals = state === 'submitted'
    ? serviceSetupTotals({ lines: orderLines, allocations: orderAllocations, zonesById })
    : null;
  const readiness = orderReadiness(order, { contractsById });
  return {
    orderId: order.id,
    // ⚠️ ใบสั่งขายใช้ `orderNumber` ไม่ใช่ `code` — ต่างจาก entity อื่นในระบบ
    code: order.orderNumber || order.id,
    customerId: order.customerId || null,
    customerName: order.customerName || null,
    approvedAt: order.approvedAt || null,
    /* ผู้ดูแลฝ่ายขาย = เจ้าของดีล **ปัจจุบัน** (คนเดียวกับเลน "รอฉันลงมือ" ของใบนี้ · D26) */
    ownerName: pick(dealsById, order.dealId)?.ownerName || null,
    line,
    state,
    stateLabel: SERVICE_BACKFILL_STATE_LABELS[state],
    progress: { done, total: relevant.length },
    /* RPC บันทึกขยับ `updatedAt` ของใบ ⇒ "แก้ล่าสุด" ของงานบริการ (ขั้นอื่นไม่ต้องใช้) */
    lastEditedAt: state === 'editing' ? (order.updatedAt || null) : null,
    submitted: totals
      ? {
        at: order.serviceSetupSubmittedAt || null,
        byName: order.serviceSetupSubmittedByName || null,
        zones: totals.zones,
        sites: totals.sites,
        packsPerRound: totals.packsPerRound,
      }
      : null,
    rejected: state === 'rejected'
      ? {
        at: order.serviceSetupRejectedAt || null,
        byName: order.serviceSetupRejectedByName || null,
        reason: order.serviceSetupRejectedReason || null,
      }
      : null,
    readiness: { contractNo: readiness.contractNo, hasContract: readiness.hasContract },
    /* ไม่ส่งชุดไซต์มา = ไม่รู้ ⇒ false (ไม่เดาว่าไม่มี) */
    noSite: customersWithSite instanceof Set ? !customersWithSite.has(order.customerId) : false,
  };
}

/**
 * ⭐ ถัง "รอฝ่ายขายตั้งงานบริการ (ใบเดิม)" — ใบ pipeline ที่อนุมัติแล้ว ยังไม่ถูก Rev. ทับ ยังไม่ประทับ และมีสิ่งที่ต้องตั้ง
 * @param orders       ใบสั่งขาย (select ต้องมี "serviceTermsOpenedAt" · ไม่มี = โยน)
 * @param lines        บรรทัดของใบ (พก serviceKind · serviceProductId · serviceFgCode · serviceRounds · metadata)
 * @param allocations  `sales_order_line_zones` ของใบ `{ salesOrderId, salesOrderLineId, zoneId, packsPerRound }`
 * @param zonesById    Map zoneId → { siteId } — นับไซต์ของสรุป "ยื่นแล้ว"
 * @param projectsById/dealsById  ตัดสินสายธุรกิจ (โครงการก่อน แล้วดีล) · ดีลพก `ownerName`
 * @param contractsById ชิปสัญญาของใบ
 * @param customersWithSite Set ของ customerId ที่มีไซต์ลูกค้าที่ใช้งานในทะเบียน — ไม่มี = แถวบอก TS ให้เพิ่มไซต์ก่อน
 *   (ไม่ส่ง = ไม่ตัดสินเรื่องไซต์)
 * @returns `{ rows, unknownLine }` — `unknownLine` = ใบที่ตอบไม่ได้ว่าสายอะไร (ขึ้นแถบของมันเอง ห้ามเงียบห้ามเดา)
 */
export function legacySetupQueue({
  orders = [], lines = [], allocations = [], zonesById = new Map(), projectsById, dealsById, contractsById = new Map(),
  customersWithSite = null,
} = {}) {
  const orderList = Array.isArray(orders) ? orders : [];
  if (orderList.some((order) => !hasOwn(order, 'serviceTermsOpenedAt'))) throw new Error(LEGACY_SETUP_SELECT_ERROR);

  const linesByOrder = groupBy(lines, 'salesOrderId');
  const allocationsByOrder = groupBy(allocations, 'salesOrderId');
  const lineCtx = { projectsById: projectsById || new Map(), dealsById: dealsById || new Map() };

  const rows = [];
  const unknownLine = [];
  for (const order of orderList) {
    if (!orderReceivable(order) || isHistoricalOrder(order) || order.serviceTermsOpenedAt) continue;
    const orderLines = linesByOrder.get(order.id) || [];
    const orderAllocations = allocationsByOrder.get(order.id) || [];
    const line = orderBusinessLine(order, lineCtx);
    const extra = { zonesById, dealsById, contractsById, line, customersWithSite };
    if (serviceBackfillNeeded(order, orderLines, lineCtx)) {
      rows.push(buildRow(order, orderLines, orderAllocations, extra));
    } else if (!line && orderLines.some((l) => serviceLineNeedsBackfill(l))) {
      /* ⚠️ สายว่าง = `serviceBackfillNeeded` ตอบ false (ไม่เดาว่าเป็นบริการ) — แต่เงียบไม่ได้ ต้องขึ้นแถบของมันเอง
         ให้ฝ่ายขายระบุสายที่โครงการ/ดีลก่อน (กติกาเดิมของคิวนี้) */
      unknownLine.push(buildRow(order, orderLines, orderAllocations, extra));
    }
    // สาย PRODUCT ไม่เข้าคิวนี้เลย — ของส่งออกจากบริษัทแล้วจบ ไม่มีอะไรให้ไปดูแล
  }

  const byNewest = (a, b) => String(b.approvedAt || '').localeCompare(String(a.approvedAt || ''))
    || String(a.code).localeCompare(String(b.code));
  return { rows: rows.sort(byNewest), unknownLine: unknownLine.sort(byNewest) };
}

/* ── ป้ายของเซลล์สถานะ — ตารางกับการ์ดอ่านจากตัวเดียว (สองมุมมองพูดตรงกัน) ────────────────────────────────
   `{ tone, label, sub }` · ป้าย = ขั้นของงาน (+ ความคืบหน้า/เหตุที่ตีกลับ) · บรรทัดรอง = เมื่อไร/ใคร/เท่าไร (หนึ่งบรรทัด) */
const LEGACY_SETUP_TONES = Object.freeze({ not_started: 'neutral', editing: 'info', submitted: 'accent', rejected: 'danger' });

export function legacySetupStatusView(row) {
  const state = row?.state || 'not_started';
  /* ยังไม่มีไซต์ = งานติดที่ TS (ไม่ใช่ฝ่ายขายช้า) — เตือนเฉพาะขั้นที่ฝ่ายขายยังต้องเลือกโซน */
  const noSite = !!row?.noSite && (state === 'not_started' || state === 'editing');
  const tone = noSite ? 'warning' : (LEGACY_SETUP_TONES[state] || 'neutral');
  const base = SERVICE_BACKFILL_STATE_LABELS[state] || SERVICE_BACKFILL_STATE_LABELS.not_started;
  if (state === 'editing') {
    const { done = 0, total = 0 } = row.progress || {};
    const edited = row.lastEditedAt ? `แก้ล่าสุด ${fmtDate(row.lastEditedAt)}` : null;
    return {
      tone,
      label: `${base} · ${fmtNumber(done)}/${fmtNumber(total)} รายการ`,
      sub: [edited, noSite ? LEGACY_SETUP_NO_SITE_SUB : null].filter(Boolean).join(' · ') || null,
    };
  }
  if (state === 'submitted') {
    const s = row.submitted || {};
    return {
      tone,
      label: base,
      /* คำของมติ 29/09 ("แต่ละครั้งกี่แพ็ค") — ความหมายเดิม: Σ แพ็คของทุกโซนในหนึ่งครั้งที่ไป */
      sub: `ยื่นเมื่อ ${s.at ? fmtDate(s.at) : '—'} · ${fmtNumber(s.zones || 0)} โซนใน ${fmtNumber(s.sites || 0)} ไซต์`
        + ` · ครั้งละ ${fmtNumber(s.packsPerRound || 0)} แพ็ค`,
    };
  }
  if (state === 'rejected') {
    const r = row.rejected || {};
    return {
      tone,
      label: `${base}: ${r.reason || '—'}`,
      sub: [r.byName, r.at ? fmtDate(r.at) : null].filter(Boolean).join(' · ') || null,
    };
  }
  return { tone, label: base, sub: noSite ? LEGACY_SETUP_NO_SITE_SUB : null };
}

/* จำนวนของแต่ละตัวกรอง — ป้ายเลขบน Segmented · 'all' = ทุกแถว */
export function legacySetupFilterCounts(rows = []) {
  const counts = Object.fromEntries(LEGACY_SETUP_FILTERS.map((key) => [key, 0]));
  for (const row of Array.isArray(rows) ? rows : []) {
    counts.all += 1;
    if (hasOwn(counts, row?.state) && row.state !== 'all') counts[row.state] += 1;
  }
  return counts;
}

/* ⭐ คำค้น = ทุกอย่างที่ตาเห็นบนแถว (กติกา "ตาเห็นบนแถว = ต้องค้นเจอ") — รหัส · ลูกค้า · วันอนุมัติ · ผู้ดูแล ·
   ป้าย/บรรทัดรองของสถานะ · ชิปสัญญา */
export function legacySetupHaystack(row) {
  const view = legacySetupStatusView(row);
  return [
    row?.code,
    row?.customerName,
    row?.approvedAt ? fmtDate(row.approvedAt) : null,
    row?.ownerName,
    view.label,
    view.sub,
    row?.readiness?.hasContract ? row.readiness.contractNo : 'ยังไม่ผูกสัญญา',
  ].filter(Boolean).join(' ').toLocaleLowerCase('th');
}
