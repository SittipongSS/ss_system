// ── ถ้อยคำของใบสั่งขายย้อนหลัง (มติเจ้าของ 22/09 · mig 0374) — สถานะ · รางก้าว · โมดัลอนุมัติ · ผลของการกด ─────
//
// ⭐ ทำไมเป็นไฟล์กลาง: หน้าใบสั่งขายยาว ~1,600 บรรทัด และใบย้อนหลังพูดคนละเรื่องกับใบปกติแทบทุกจุด
//   (ไม่นับ Actual · ไม่มีใบเสนอราคา/ลายเซ็น · เอกสารแทนสัญญาอนุมัติพร้อมใบ · งวดยกมา · TS ตั้งรอบ)
//   ⇒ ตรรกะของคำอยู่ที่นี่พร้อมเทสต์ จอแค่แตกกิ่ง JSX (แพตเทิร์นเดียวกับ salesOrderFinanceApproval)
// 🔴 **ห้ามมีประโยคไหนบอกว่าใบย้อนหลัง "นับ Actual"** — ขายไปก่อนเข้าระบบ ยอดไม่เข้า Actual / FC / เป้า
//   (sync_sales_order_actual กรอง origin = 'pipeline') · เทสต์ไล่ทุกสตริงที่ไฟล์นี้คืนออกไป
// ⚠️ pure — ไม่อ่านฐาน ไม่อ่านนาฬิกา ("วันนี้" รับเข้ามาเป็น `todayIso` จากนาฬิกาไทยของผู้เรียก)
//   ฝั่งจอ import ได้: import เฉพาะ format · ป้ายของสัญญา · historicalOrders · paymentCoverage · paymentNotRequired
import { NA, fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { externalDocKindLabel } from '@/lib/sales/contracts';
import {
  HISTORICAL_APPROVER_LABEL, HISTORICAL_APPROVER_ROLES_TEXT, HISTORICAL_CANCEL_NOTE_MIN, HISTORICAL_CORRECTION_PATH, HISTORICAL_STATUS_NOTE, OPENING_INSTALLMENT_LABEL,
  historicalCancelOpening, isHistoricalOrder, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import { addDays, coverageContinuityErrors, isConfirmed, paidThrough } from '@/lib/sales/paymentCoverage';
import { historicalDuplicateApprovalRows, historicalDuplicateReviewOf } from '@/lib/sales/historicalDuplicates';
import { paymentNotRequired, salesOrderMoneyOutcome } from '@/lib/sales/salesOrderPayments';
import { SERVICE_ROUNDS_LABEL } from '@/lib/sales/serviceOrders';

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const day = (value) => (text(value) ? fmtDate(value) : '—');
const span = (from, to) => `${day(from)}–${day(to)}`;

/* งวดยกมาก่อน แล้วงวดที่เหลือตามวันเริ่มครอบ (ตามด้วย seq) — ลำดับเดียวกับที่ฐานเขียน (seq 1 = ยกมา) */
function orderedRows(installments) {
  return list(installments).slice().sort((a, b) => {
    const opening = Number(isOpeningInstallment(b)) - Number(isOpeningInstallment(a));
    if (opening) return opening;
    const from = text(a.coversFrom).localeCompare(text(b.coversFrom));
    return from || (Number(a.seq) || 0) - (Number(b.seq) || 0);
  });
}

/**
 * บรรทัดหนึ่งบรรทัด **ตามลำดับคอลัมน์ของใบเสนอราคา** — จำนวน (หน่วย) × ราคา/หน่วย [− ส่วนลดรายการ] = จำนวนเงิน
 * ⭐ มติเจ้าของ 23/09: ผู้อนุมัติต้องเห็นบรรทัดแบบเดียวกับที่ผู้คีย์คีย์ (ไม่ใช่ "N แพ็ค" ที่อ่านได้สองความหมาย)
 * @param line `{ qty, unit, unitPrice, discountAmount, lineTotal }` (บรรทัดใบสั่งขาย หรือแถวโซนจาก GET ของใบ)
 */
export function quoteLineText(line = {}) {
  const discount = Number(line?.discountAmount) || 0;
  return `${fmtNumber(Number(line?.qty) || 0)} ${text(line?.unit) || 'หน่วย'} × ${fmtMoney(Number(line?.unitPrice) || 0)}`
    + `${discount > 0 ? ` − ส่วนลด ${fmtMoney(discount)}` : ''} = ${fmtMoney(Number(line?.lineTotal) || 0)}`;
}

/* บรรทัดที่หน้าตาเหมือนกันรวมเป็นกลุ่มเดียว (สินค้า · จำนวน · หน่วย · ราคา · ส่วนลด) — ใบย้อนหลังส่วนใหญ่คือ
   แพ็คเกจเดียวกันทุกโซน ⇒ โมดัลพูด "12 แพ็คเกจ × 3,500 = 42,000 (4 โซน)" บรรทัดเดียวแทนสี่บรรทัดที่ซ้ำกัน */
const LINE_GROUPS_SHOWN = 3;
function lineGroups(lines) {
  const groups = new Map();
  for (const line of list(lines)) {
    const key = [text(line.fgCode), Number(line.qty) || 0, text(line.unit), Number(line.unitPrice) || 0, Number(line.discountAmount) || 0].join('|');
    const group = groups.get(key) || { fgCode: text(line.fgCode) || null, line, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/* ป้ายเอกสารแทนสัญญา "ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118" — ชนิดที่ไม่รู้จัก (ขีด) ไม่พูด */
function contractDocText(contract) {
  if (!contract) return '';
  const kind = externalDocKindLabel(contract.externalDocKind);
  return [kind === '—' ? '' : kind, text(contract.externalRef)].filter(Boolean).join(' ');
}

/* ── สถานะของใบย้อนหลัง (แทน STATUS ของหน้าใบสำหรับใบนี้) ─────────────────────────────────
   ⭐ ป้ายเท่ากับใบปกติ (คนอ่านทะเบียนเดียวกัน) · **คำอธิบายเป็นของใบย้อนหลัง** — ของใบปกติพูดเรื่องยอด Actual
     ทุกสถานะ ซึ่งผิดกับใบนี้ · tone = ชื่อโทนของ <StatusBadge> ไม่ใช่สี (กติกาเดียวกับ CONTRACT_STATUS_TONES)
   ⚠️ approval_revoked / revised ไม่มีในใบย้อนหลัง (CHECK ของ 0374) — ตกค่าตั้งต้น ไม่เดาความหมาย */
const HISTORICAL_STATUS_COPY = Object.freeze({
  draft: {
    label: 'ฉบับร่าง',
    tone: 'muted',
    description: 'ยังไม่ส่งอนุมัติ — แก้ต่อในฟอร์มคีย์ใบ แล้วกด "บันทึกและส่งอนุมัติ"',
  },
  pending_approval: {
    label: `รอ${HISTORICAL_APPROVER_LABEL}อนุมัติ`,
    tone: 'warning',
    description: 'อนุมัติแล้วเอกสารแทนสัญญาได้เลข CT · งวดขึ้นคิวบัญชี · โซนขึ้นคิว TS — ใบย้อนหลังไม่นับ Actual / FC / เป้า',
  },
  rejected: {
    label: 'ตีกลับให้แก้ไข',
    tone: 'danger',
    description: 'แก้ในฟอร์มคีย์ใบตามเหตุผล แล้วส่งอนุมัติใหม่',
  },
  approved: {
    label: 'อนุมัติแล้ว',
    tone: 'success',
    description: HISTORICAL_STATUS_NOTE,
  },
  cancelled: {
    label: 'ยกเลิก',
    tone: 'danger',
    description: 'ใบย้อนหลังที่ยกเลิกแล้วคืนเป็นร่างไม่ได้ — ถ้าจะใช้ข้อมูลนี้ต้องคีย์ใบใหม่',
  },
});

export function historicalStatusCopy(status) {
  return HISTORICAL_STATUS_COPY[status] || { label: text(status) || '—', tone: 'muted', description: HISTORICAL_STATUS_NOTE };
}

/* ── รางก้าวของใบย้อนหลัง (mock SoStatus/AeApprove · REVISION 2) ──────────────────────────────
   คีย์ใบ → AE Sup อนุมัติ (ไม่นับ Actual) → บัญชีรับรองงวดยกมา|งวดแรก → TS ตั้งรอบ → เข้าบริการ
   · ใบ ฿0 ไม่มีขั้นบัญชี (ไม่มีงวด · ด่านเงินผ่านเองด้วย paymentNotRequired)
   · คืน `{ steps, index }` ให้จอส่งต่อ `workflowStepsFromIndex(steps, index, cancelled)` ตามเดิม
   ⭐ ขั้นบัญชีกับขั้น TS **เกิดสลับกันได้** — รอบขายของโซนเกิดตอนอนุมัติ ⇒ TS ตั้งรอบได้ก่อนบัญชีรับรอง
     (นัดติดด่านเงินแทน) ⇒ ขั้นที่เสร็จแล้วประกาศ `state: 'done'` เอง ไม่ปล่อยให้นับจาก index
     (กติกาของ workflowStepsFromIndex: state ที่ประกาศชนะ) · index = ขั้นแรกที่ยังไม่เสร็จ
   ⚠️ "TS ตั้งรอบแล้ว" นับรายไซต์เหมือน planQueue: รอบบริการของคู่ (ไซต์, ใบนี้) ที่ยังใช้งาน ครอบทุกโซนของไซต์นั้น
     ไซต์ของโซนอ่านจาก `term.siteId` หรือ `order.lineZones` (ของเสริมที่ loadOrder แนบ) — ไม่รู้ไซต์ = ยังไม่ตั้ง */
export function historicalWorkflowSteps(order, installments = [], terms = [], plans = [], todayIso = null) {
  const status = order?.status || '';
  const approved = status === 'approved';
  const cancelled = status === 'cancelled';
  const everApproved = approved || Boolean(order?.approvedAt);
  const rows = orderedRows(installments);
  const zeroValue = paymentNotRequired(order?.totalAmount);

  const keyer = text(order?.submittedByName) || text(order?.createdByName) || 'ผู้คีย์';
  const keyed = {
    key: 'keyed',
    label: 'คีย์ใบ',
    hint: status === 'draft' ? `${text(order?.createdByName) || 'ผู้คีย์'} · ยังไม่ส่งอนุมัติ`
      : status === 'rejected' ? `ตีกลับให้แก้ไข${text(order?.rejectedByName) ? ` (${text(order.rejectedByName)})` : ''}`
        : `${keyer}${order?.submittedAt ? ` · ${fmtDate(order.submittedAt)}` : ''}`,
  };
  const override = order?.approvalMode === 'admin_override' ? ' · Admin Override' : '';
  const approveStep = {
    key: 'approve',
    label: `${HISTORICAL_APPROVER_LABEL}อนุมัติ`,
    hint: everApproved
      ? `${text(order?.approvedByName) || HISTORICAL_APPROVER_LABEL}${order?.approvedAt ? ` · ${fmtDate(order.approvedAt)}` : ''}${override}`
      : status === 'rejected' ? 'ตีกลับแล้ว · ไม่นับ Actual' : `รอ${HISTORICAL_APPROVER_LABEL} · ไม่นับ Actual`,
  };

  // ── ขั้นบัญชี: งวดยกมา ถ้ามี · ไม่มีก็งวดแรกของใบ ──
  const opening = rows.find(isOpeningInstallment) || null;
  const firstRow = opening || rows[0] || null;
  let financeStep = null;
  if (!zeroValue) {
    const confirmed = Boolean(firstRow && isConfirmed(firstRow));
    const rowStatus = firstRow?.status || 'pending';
    financeStep = {
      key: 'finance',
      label: opening ? `บัญชีรับรอง${OPENING_INSTALLMENT_LABEL}` : 'บัญชีรับรองงวดแรก',
      hint: confirmed
        ? `${text(firstRow.confirmedByName) || 'ฝ่ายบัญชี'}${firstRow.confirmedAt ? ` · ${fmtDate(firstRow.confirmedAt)}` : ''}`
        : cancelled ? 'ใบยกเลิกแล้ว'
        : !approved ? `ขึ้นคิวบัญชีหลัง${HISTORICAL_APPROVER_LABEL}อนุมัติ`
        : rowStatus === 'rejected' ? 'บัญชีตีกลับ — ฝ่ายขายแจ้งใหม่พร้อมหลักฐาน'
        : rowStatus === 'reported' || opening ? 'รอบัญชีรับรอง'
        : 'รอลูกค้าจ่าย แล้วฝ่ายขายแจ้งชำระ',
      done: approved && confirmed,
    };
  }

  // ── ขั้น TS: โซนของใบ = รอบขายของโซน (หลังอนุมัติ) หรือบรรทัดที่ชี้โซน (ก่อนอนุมัติ) ──
  const siteOfZone = new Map(list(order?.lineZones).map((z) => [z.zoneId, z.siteId]));
  const zoneIds = new Set(list(terms).map((t) => t.zoneId).filter(Boolean));
  if (!zoneIds.size) for (const line of list(order?.lines)) if (line.serviceZoneId) zoneIds.add(line.serviceZoneId);
  const siteOf = new Map();
  for (const term of list(terms)) if (term.zoneId && term.siteId) siteOf.set(term.zoneId, term.siteId);
  const plannedSites = new Set(list(plans)
    .filter((p) => p.isActive !== false && p.salesOrderId && p.salesOrderId === order?.id)
    .map((p) => p.siteId));
  const zoneCount = zoneIds.size;
  const plannedZones = [...zoneIds].filter((zoneId) => {
    const siteId = siteOf.get(zoneId) || siteOfZone.get(zoneId);
    return Boolean(siteId) && plannedSites.has(siteId);
  }).length;
  const tsDone = approved && zoneCount > 0 && plannedZones === zoneCount;
  const tsStep = {
    key: 'ts',
    label: 'TS ตั้งรอบ',
    hint: cancelled ? `ใบยกเลิกแล้ว · ${fmtNumber(zoneCount)} โซน`
      : !approved ? `หลัง${HISTORICAL_APPROVER_LABEL}อนุมัติ · ${fmtNumber(zoneCount)} โซน`
      : tsDone ? `ตั้งรอบครบ ${fmtNumber(zoneCount)} โซน`
      : plannedZones ? `ตั้งรอบแล้ว ${fmtNumber(plannedZones)}/${fmtNumber(zoneCount)} โซน`
      : `รอฝ่าย TS · ${fmtNumber(zoneCount)} โซน`,
    done: tsDone,
  };

  // ── เข้าบริการ: เงินที่บัญชีรับรองแล้วเป็นตัวเปิด (paidThrough) · ใบ ฿0 ไม่มีด่านเงิน ──
  const through = paidThrough(rows);
  const today = text(todayIso);
  const serviceStep = {
    key: 'service',
    label: 'เข้าบริการ',
    hint: cancelled ? 'ใบยกเลิกแล้ว — รอบขายของโซนหยุดตามใบ'
      : zeroValue ? 'ใบยอด 0 บาท — ไม่มีด่านเงิน'
      : !through ? 'รอบัญชีรับรองงวด'
      : today && through < today ? `เงินครอบถึง ${fmtDate(through)} — นัดหลังจากนี้ติดด่านเงิน`
      : `ถึง ${fmtDate(through)}`,
  };

  const flow = [keyed, approveStep, ...(financeStep ? [financeStep] : []), tsStep, serviceStep];
  let index;
  if (!everApproved) index = status === 'pending_approval' ? 1 : 0;
  else {
    index = flow.findIndex((step, i) => i >= 2 && step.key !== 'service' && !step.done);
    if (index < 0) index = flow.length - 1; // ผ่านทุกด่านแล้ว = อยู่ในช่วงบริการ (เดินต่อเนื่อง ไม่ใช่ "จบ")
  }
  const steps = flow.map(({ done, ...step }) => (done ? { ...step, state: 'done' } : step));
  return { steps, index };
}

/* ── สรุปฝั่งบริการของใบ → รูปที่รางก้าว/การ์ดโซนอ่าน ────────────────────────────────────────
   ⭐ GET ของใบ **ไม่ได้** โหลดรอบขายของโซน/รอบบริการมาด้วย (คิวรี 5 ตาราง และใบส่วนใหญ่ในระบบเป็นสายสินค้า
     — คอมเมนต์หัว `/sales-orders/[id]/service` เตือนไว้เอง) ⇒ หน้าใบยิงเส้นสรุปเองเฉพาะ **ใบย้อนหลังที่
     อนุมัติแล้ว** (ก่อนอนุมัติยังไม่มีรอบขายของโซนสักแถว) แล้วแปลงที่นี่ จอไม่ต้องรู้รูปของ payload
   ⚠️ "ตั้งรอบแล้ว" นับ **รายไซต์** เหมือน planQueue — รอบบริการของไซต์ครอบทุกโซนของไซต์นั้น
   @param summary  body ของ `GET /api/sales-planning/sales-orders/{id}/service` (salesOrderServiceSummary)
   @returns `{ terms, plans, plannedSiteIds }` — ป้อน historicalWorkflowSteps ได้ตรง ๆ */
export function historicalServiceProgress(summary, orderId = null) {
  const terms = [];
  const plans = [];
  for (const site of list(summary?.allocation?.sites)) {
    for (const zone of list(site.zones)) if (zone?.id) terms.push({ zoneId: zone.id, siteId: site.siteId });
    if (site.hasPlan && site.siteId) plans.push({ siteId: site.siteId, salesOrderId: orderId, isActive: true });
  }
  return { terms, plans, plannedSiteIds: plans.map((plan) => plan.siteId) };
}

/* สถานะรอบบริการ **รายโซน** บนการ์ด "โซนในใบนี้" — คนละคำถามกับสถานะของใบ
   ⚠️ ไม่รู้ = บอกว่าไม่รู้ ไม่ใช่เดาว่า "ยังไม่ตั้งรอบ" (โหลดสรุปงานบริการไม่ขึ้นแล้วเขียนว่ายังไม่ตั้ง
     = ไล่ฝ่ายขายไปตาม TS ทั้งที่ TS ทำไปแล้ว) */
export function historicalZoneState(order, zone, { plannedSiteIds = null, loading = false } = {}) {
  if (order?.status === 'cancelled') return 'ใบยกเลิกแล้ว';
  if (order?.status !== 'approved') return `รอ${HISTORICAL_APPROVER_LABEL}อนุมัติ`;
  if (loading) return 'กำลังตรวจรอบบริการ…';
  if (!Array.isArray(plannedSiteIds)) return 'ตรวจรอบบริการไม่ขึ้น — ดูที่แท็บงานบริการ';
  return plannedSiteIds.includes(zone?.siteId) ? 'ตั้งรอบแล้ว' : 'ยังไม่ตั้งรอบ — รอฝ่าย TS';
}

/* ── แถบ "ช่วงบริการ" ของหน้าใบ (mock SoStatus `.tl`) ────────────────────────────────────────
   ⭐ เงินที่บัญชีรับรองแล้วเป็นตัวเปิดบริการ ⇒ แถบแบ่งสองท่อน: ครอบแล้ว (paid) กับที่ยังรอชำระ (due)
     ท่อน paid วัดจาก `paidThrough` **ตัวเดียวกับด่านเงินของนัด** ไม่ใช่ผลรวมยอดที่เก็บได้
   ⚠️ ไม่มีช่วงสัญญา = ไม่มีแถบ (คืน null) — วาดจากวันที่เดาเองอ่านผิดยิ่งกว่าไม่วาด
   @returns `{ start, end, through, segments }` ป้อน <CoverageTimeline> ได้ตรง ๆ หรือ null */
export function historicalCoverageSegments(installments = [], { start = null, end = null } = {}) {
  const from = text(start);
  const to = text(end);
  if (!from || !to || from > to) return null;
  const raw = paidThrough(orderedRows(installments));
  const through = raw && raw >= from ? (raw > to ? to : raw) : null;
  const segments = [];
  if (through) segments.push({ key: 'paid', kind: 'paid', from, to: through, label: `เปิดบริการถึง ${fmtDate(through)}` });
  const dueFrom = through ? addDays(through, 1) : from;
  if (dueFrom && dueFrom <= to) segments.push({ key: 'due', kind: 'due', from: dueFrom, to, label: `รอชำระ ${span(dueFrom, to)}` });
  return { start: from, end: to, through, segments };
}

/* ── สิ่งที่ AE Sup ตรวจ + สิ่งที่เกิดทันทีหลังกดอนุมัติ (ป้อน historicalApprovalPrompt) ─────────────
   ⭐ โมดัลต้องโชว์ **สิ่งที่ผู้อนุมัติรับรองจริง** รวมไฟล์ที่จะกลายเป็น signedFileId ของเอกสารแทนสัญญา
     (RPC ใช้ไฟล์ที่ AE Sup เห็นในโมดัล ไม่ใช่ไฟล์แรกที่หาเจอ — D4)
   ⚠️ ของเสริมโหลดไม่ขึ้น (`extrasError`) = บอกว่า "โหลดไม่ขึ้น" ในรายการ **ไม่ใช่ซ่อนแถว** — แถวที่หายไปเงียบ ๆ
     อ่านเหมือน "ไม่มีเรื่องต้องตรวจ" ซึ่งตรงข้ามกับความจริง
   @param order   ใบ (orderNumber · customerName · customer.arCode · totalAmount · subtotal · vatAmount · lines · notes)
   @param extras  `{ installments, contract, contractFiles, lineZones, liveTermWarnings, signedFile, extrasError }`
     · lineZones: `[{ zoneId, zoneCode, zoneName, siteId, siteCode, siteName, fgCode?, qty?, unit?, unitPrice?,
       discountAmount?, lineTotal?, rounds?, packsPerRound? }]` (หนึ่งแถวต่อบรรทัด — ของเสริมจาก loadHistoricalOrderExtras ·
       packsPerRound: number|null จาก sales_order_line_zones · mig 0394)
     · liveTermWarnings: สตริง หรือ `{ zoneCode|zoneName, orderNumber, endDate }`
   @returns `{ subject, checklist, effects }` — effects ไม่รวม HISTORICAL_STATUS_NOTE (ตัวสร้างโมดัลเติมเอง) */
/* ── ประโยคของข้อเท็จจริงที่ผู้อนุมัติตรวจ — **ตัวเดียว** ของหน้าต่างอนุมัติ (`historicalApprovalFacts`) และขั้น ④ ของฟอร์มคีย์ใบ
   ⭐ มติเจ้าของ 25/09 (รื้อขั้น ④ "ตรวจแบบผู้อนุมัติ"): ผู้คีย์อ่านคำเดียวกับที่ผู้จัดการฝ่ายขายจะอ่าน ⇒ ถ้าตรงนี้ผิด ผิดทั้งสองที่พร้อมกัน
     (ไม่ใช่สองชุดที่เพี้ยนหากัน) · ย้ายออกมาแบบไม่เปลี่ยนคำ — เทสต์ของโมดัลอนุมัติยืนยันว่าข้อความเท่าเดิมทุกตัวอักษร */
/** "{ชนิด} {เลขที่} · {เริ่ม}–{สิ้นสุด}" */
export function historicalContractFactText(docText, start, end) {
  return `${text(docText) || '—'} · ${span(start, end)}`;
}

/** "N โซน — {ไซต์} n โซน · …" (โซนไม่รู้ไซต์ไม่ขึ้นชื่อ) · ไม่มีโซน = null */
export function historicalZoneSitesText(zones = []) {
  const rows = list(zones);
  if (!rows.length) return null;
  const bySite = new Map();
  for (const zone of rows) {
    const key = zone.siteId || zone.siteCode || zone.siteName || '';
    const entry = bySite.get(key) || { name: [text(zone.siteCode), text(zone.siteName)].filter(Boolean).join(' '), count: 0 };
    entry.count += 1;
    bySite.set(key, entry);
  }
  const siteText = [...bySite.values()].filter((site) => site.name).map((site) => `${site.name} ${fmtNumber(site.count)} โซน`).join(' · ');
  return `${fmtNumber(rows.length)} โซน${siteText ? ` — ${siteText}` : ''}`;
}

/** "฿X · ครอบบริการ {เริ่ม}–{ถึง} · รับเงิน {วัน} · หลักฐาน n ไฟล์" */
export function historicalOpeningFactText(opening = {}, evidenceCount = 0) {
  return `${fmtMoney(opening?.amount)} · ครอบบริการ ${span(opening?.coversFrom, opening?.coversTo)}`
    + ` · รับเงิน ${day(opening?.paidOn)} · หลักฐาน ${fmtNumber(evidenceCount)} ไฟล์`;
}

/** งวดที่ยังต้องเก็บ — ≤ 3 งวดเรียงทีละงวด · มากกว่านั้นสรุปจำนวน/ยอด/งวดแรก · ไม่มี = null */
export function historicalRemainingFactText(remaining = []) {
  const rows = list(remaining);
  if (!rows.length) return null;
  if (rows.length <= 3) return rows.map((row) => `${text(row.label) || 'งวด'} ${fmtMoney(row.amount)} ครบกำหนด ${day(row.dueDate)}`).join(' · ');
  const sum = rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
  return `${fmtNumber(rows.length)} งวด รวม ${fmtMoney(sum)} · งวดแรกครบกำหนด ${day(rows[0].dueDate)}`;
}

/** บรรทัดผลตรวจของฐาน (coverageContinuityErrors ↔ historical_so_check_installments) ตอนผ่านทั้งสองข้อ */
export function historicalCoverageVerdictText(start, end) {
  return `ยอดงวดรวม = ยอดใบ · ช่วงบริการต่อเนื่อง ${span(start, end)} ไม่มีช่องโหว่`;
}

/**
 * วันวางบิลของงวดที่ยังต้องเก็บ (PR-D · IMPL_PLAN_D §3.3 — ไม่บังคับ) → "มีวันวางบิล k จาก m งวด" · ไม่มีสักงวด = null
 * ⚠️ งวดยกมาไม่นับทั้งตัวตั้งและตัวหาร — ไม่มีวันวางบิลเสมอ (CHECK sales_order_installments_billing_sane ของ 0389)
 * @param installments งวดของใบ (ของเสริม) หรือ `plan.installments` (งวดปกติล้วน)
 */
export function historicalBillingDatesText(installments = []) {
  const rows = list(installments).filter((row) => !isOpeningInstallment(row));
  const billed = rows.filter((row) => text(row.billingDate)).length;
  return billed ? `มีวันวางบิล ${fmtNumber(billed)} จาก ${fmtNumber(rows.length)} งวด` : null;
}

/* ── แพ็คต่อรอบ · รอบบริการของโซน (PR-D · มติเจ้าของ 26/09 A3/O9 · mig 0394) ─────────────────────────────
   ⭐ "แพ็คต่อรอบ" เป็นช่องของ **โซน** (sales_order_line_zones.packsPerRound) คนละช่องกับจำนวนของบรรทัด (เงิน: 1 ชุด × 12 เดือน)
     — อนุมัติแล้วเป็น packageQty ของรอบขาย (0394/P3 เปิดผ่าน sales_order_open_service_terms) ⇒ ผู้คีย์ (ขั้น ④)
     ผู้อนุมัติ (โมดัล) และการ์ดโซนหน้าใบอ่านตัวเลขชุดเดียวกันจากตัวนี้
   🔴 คำที่ยอม: "แพ็คต่อรอบ" · "แพ็ค/รอบ" เท่านั้น — "N แพ็ค" เปล่า ๆ อ่านได้สองความหมาย (มติ 23/09 · เทสต์ไล่ทุกสตริง)
   ⚠️ ค่าที่ไม่ใช่จำนวนเต็มบวก = **ไม่รู้** (null) ไม่ใช่ 0 — ใบที่คีย์ก่อนมีช่องไม่มีแถวโซนของงานบริการ */
const positiveInt = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean' || text(value) === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const ZONE_CARD_META_TAIL = 'โซนผูกจากทะเบียนไซต์ตอนคีย์ใบแล้ว ฝ่าย TS ตั้งรอบต่อได้เลย';
/* หัวแถว "แพ็คต่อรอบ · จำนวนรอบบริการ" ของขั้น ④ (historicalReviewView) และโมดัลอนุมัติ — คำเรียกรอบตามมติเจ้าของ 29/09
   (`SERVICE_ROUNDS_LABEL`) · ค่าตามหลังเป็นตัวเลขล้วน "รวม 6 แพ็ค/รอบ · 12 รอบ/โซน" (ป้ายบอกแล้วว่าตัวไหนคืออะไร) */
export const PACKS_ROUNDS_HEAD = `แพ็คต่อรอบ · ${SERVICE_ROUNDS_LABEL}`;

/**
 * ตัวเลขรวมของแพ็คต่อรอบ · รอบ — รับได้ทั้งแถวโซนของเสริม (`packsPerRound` · `rounds`) และบรรทัดของแผน (`packsPerRound` · `serviceRounds`)
 * @returns `{ zoneCount, siteCount, packsKnown, packsMissing, packsTotal, roundsMin, roundsMax, perZone: [{ label, packs, rounds }] }`
 */
export function historicalServiceTotals(zones = []) {
  const rows = list(zones);
  const sites = new Set();
  let packsKnown = 0;
  let packsTotal = 0;
  let roundsMin = null;
  let roundsMax = null;
  const perZone = rows.map((zone) => {
    const site = text(zone.siteId) || text(zone.siteCode) || text(zone.siteName);
    if (site) sites.add(site);
    const packs = positiveInt(zone.packsPerRound);
    const rounds = positiveInt(zone.rounds ?? zone.serviceRounds);
    if (packs !== null) { packsKnown += 1; packsTotal += packs; }
    if (rounds !== null) {
      roundsMin = roundsMin === null ? rounds : Math.min(roundsMin, rounds);
      roundsMax = roundsMax === null ? rounds : Math.max(roundsMax, rounds);
    }
    return { label: text(zone.zoneName) || text(zone.zoneCode) || 'โซน', packs, rounds };
  });
  return {
    zoneCount: rows.length, siteCount: sites.size, packsKnown, packsMissing: rows.length - packsKnown, packsTotal,
    roundsMin, roundsMax, perZone,
  };
}

/* "12 รอบ/โซน" · รอบต่างกัน = ช่วง "6–12 รอบ/โซน" · ไม่รู้สักโซน = '' */
function roundsPerZoneText(totals) {
  if (totals.roundsMin === null) return '';
  return totals.roundsMin === totals.roundsMax
    ? `${fmtNumber(totals.roundsMin)} รอบ/โซน`
    : `${fmtNumber(totals.roundsMin)}–${fmtNumber(totals.roundsMax)} รอบ/โซน`;
}

/* "Lobby 2 แพ็ค/รอบ × 12 รอบ" · ยังไม่มีแพ็ค = "Lobby ยังไม่มีแพ็คต่อรอบ · 12 รอบ" (บอกว่าโซนไหนขาด) */
function zonePacksText({ label, packs, rounds }) {
  if (packs === null) return `${label} ยังไม่มีแพ็คต่อรอบ${rounds !== null ? ` · ${fmtNumber(rounds)} รอบ` : ''}`;
  return `${label} ${fmtNumber(packs)} แพ็ค/รอบ${rounds !== null ? ` × ${fmtNumber(rounds)} รอบ` : ''}`;
}

/**
 * ประโยคของแพ็คต่อรอบ · รอบ (IMPL_PLAN_D §3.4)
 * @returns `{ total, perZone, meta, overflow, totals }`
 *   · total "รวม 9 แพ็ค/รอบ · 12 รอบ/โซน" (ขาดบางโซน = บอกจำนวนที่ขาดในวงเล็บ) · ไม่รู้แพ็คสักโซน = null
 *   · perZone "Lobby 2 แพ็ค/รอบ × 12 รอบ · …" · เกิน `maxZones` = null + `overflow: true` (ผู้เรียกชี้ที่ของตัวเอง)
 *   · meta = บรรทัดหัวของการ์ด "โซนในใบนี้" · ไม่รู้แพ็คสักโซน = null (การ์ดใช้ meta เดิม)
 */
export function historicalPacksRoundsText(zones = [], { maxZones = 5 } = {}) {
  const totals = historicalServiceTotals(zones);
  if (!totals.zoneCount) return { total: null, perZone: null, meta: null, overflow: false, totals };
  const overflow = totals.zoneCount > maxZones;
  const packs = totals.packsKnown
    ? `รวม ${fmtNumber(totals.packsTotal)} แพ็ค/รอบ${totals.packsMissing ? ` (ยังไม่มีแพ็คต่อรอบ ${fmtNumber(totals.packsMissing)} โซน)` : ''}`
    : null;
  return {
    total: packs ? [packs, roundsPerZoneText(totals)].filter(Boolean).join(' · ') : null,
    perZone: overflow ? null : totals.perZone.map(zonePacksText).join(' · '),
    meta: packs ? `${fmtNumber(totals.zoneCount)} โซน · ${packs} — ${ZONE_CARD_META_TAIL}` : null,
    overflow,
    totals,
  };
}

/** เซลล์ "แพ็คต่อรอบ" ของการ์ดโซน — "2 แพ็ค/รอบ" · ไม่รู้ = ขีด (การ์ดไม่ประกอบคำว่าแพ็คเอง · M3) */
export function historicalPacksCellText(value) {
  const packs = positiveInt(value);
  return packs === null ? NA : `${fmtNumber(packs)} แพ็ค/รอบ`;
}

/* ── ตัวกลางตีกลับการอนุมัติใบย้อนหลัง (mig 0394/P3 → sales_order_open_service_terms) ──────────────────────
   ⭐ ฐานโยน `sales_order_service_setup_incomplete` DETAIL = '<ชนิด>:<บรรทัด>[:<โซน>]' คั่นจุลภาค (0392 §5 + 0394/P9c)
     ⇒ ผู้อนุมัติต้องเห็น "รายการ n" (ลำดับบนใบ) ไม่ใช่รหัสบรรทัด · ทางออกเดียว = ตีกลับให้ผู้คีย์บันทึกขั้น ② ใหม่
     (ขั้นส่ง/อนุมัติสร้างแถวโซนเองไม่ได้ — แถวเกิดตอนบันทึกฟอร์มเท่านั้น 0394/P6)
   · ชนิดที่ไม่อยู่ในตาราง = "งานบริการไม่ครบ (ชนิด)" — ไม่มีข้อไหนหายเงียบ */
export const HISTORICAL_SETUP_ISSUE_TEXT = Object.freeze({
  zones_missing: 'ยังไม่มีแพ็คต่อรอบ (ใบนี้คีย์ก่อนมีช่องแพ็คต่อรอบ)',
  packs_missing: 'ยังไม่ใส่แพ็คต่อรอบ',
  rounds_missing: `ยังไม่ใส่${SERVICE_ROUNDS_LABEL}`,
  zone_invalid: 'โซนถูกปิดใช้งานหรือไม่ใช่ไซต์ของลูกค้าแล้ว',
  historical_zone_mismatch: 'โซนของงานบริการไม่ตรงกับโซนของรายการ',
});
const SETUP_ISSUES_SHOWN = 5;

/* ── ฐานที่ยังไม่รัน 0394 (review 29/09) ────────────────────────────────────────────────────────────────
   0394 ไม่เพิ่มคอลัมน์ ⇒ check:columns/CI มองไม่เห็นว่ารันแล้วหรือยัง · deploy อัตโนมัติวันละ 3 รอบไม่ถามมิก (historicalOrders.js)
   ⇒ โค้ดขึ้นก่อนมิกได้: ตัวเขียนรุ่นเก่ารับคีย์ packsPerRound เงียบ ๆ แล้วไม่สร้างแถวแพ็คต่อรอบ · อนุมัติรุ่นเก่าเขียนรอบขาย
   packageQty = จำนวนของบรรทัด (กับดักที่ PR-D มาแก้) ⇒ เข็มขัดฝั่ง JS สองจุด: บันทึก → 503 (ประโยคแรก) · อนุมัติ → 409 (ต่อท้ายด้วยประโยคสอง)
   ⚠️ ประโยคของการบันทึกต้องบอกว่า "บันทึกแล้ว" — ใบร่างลงฐานไปแล้ว ห้ามอ่านเหมือนไม่ได้บันทึก */
export const HISTORICAL_ALIGNMENT_MISSING_SAVED = 'บันทึกใบร่างแล้ว แต่ฐานข้อมูลยังไม่ได้รัน migration 0394 (แพ็คต่อรอบของใบย้อนหลัง)'
  + ' — แพ็คต่อรอบของใบนี้ยังไม่ถูกเก็บ · แจ้งผู้ดูแลระบบ แล้วเปิดใบร่างบันทึกขั้น ② ใหม่หลังรันแล้ว';
export const HISTORICAL_ALIGNMENT_HINT = 'หากเพิ่งอัปเดตระบบ ฐานข้อมูลอาจยังไม่ได้รัน migration 0394 — แจ้งผู้ดูแลระบบก่อนตีกลับ';

/**
 * ข้อความ 409 ของการอนุมัติที่ตัวกลางตีกลับ
 * @param codes DETAIL ของฐาน — array หรือ CSV ดิบ ('zones_missing:SOL-a,packs_missing:SOL-b:ZN-1,…')
 * @param lines บรรทัดของใบ (`id` · `sortOrder`) — เลขรายการ = ลำดับตาม sortOrder + 1 (ตารางบนหน้าใบ)
 */
export function historicalSetupIncompleteMessage(codes, lines = []) {
  const raw = Array.isArray(codes) ? codes : text(codes).split(',');
  const numberOf = new Map(list(lines).slice()
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((line, index) => [text(line.id), index + 1]));
  const seen = new Set();
  const items = [];
  for (const entry of raw) {
    const [kind = '', lineId = ''] = text(entry).split(':');
    if (!kind) continue;
    const detail = HISTORICAL_SETUP_ISSUE_TEXT[kind] || `งานบริการไม่ครบ (${kind})`;
    const n = numberOf.get(lineId) || null;
    const itemText = n ? `รายการ ${fmtNumber(n)}: ${detail}` : detail;
    if (seen.has(itemText)) continue;
    seen.add(itemText);
    items.push({ n, text: itemText });
  }
  // เรียงตามรายการบนใบ (ไม่มีเลขรายการไปท้าย) — sort ของ JS คงลำดับเดิมเมื่อเท่ากัน
  items.sort((a, b) => (a.n === null ? Number.MAX_SAFE_INTEGER : a.n) - (b.n === null ? Number.MAX_SAFE_INTEGER : b.n));
  const shown = items.slice(0, SETUP_ISSUES_SHOWN).map((item) => item.text);
  if (items.length > SETUP_ISSUES_SHOWN) shown.push(`และอีก ${fmtNumber(items.length - SETUP_ISSUES_SHOWN)} ข้อ`);
  return `อนุมัติไม่ได้ — งานบริการของใบนี้ไม่ครบ${shown.length ? `: ${shown.join(' · ')}` : ''} — ตีกลับให้ผู้คีย์บันทึกขั้น ② ใหม่`;
}

export function historicalApprovalFacts(order, {
  installments = [], contract = null, contractFiles = [], lineZones = [], liveTermWarnings = [], signedFile = null,
  extrasError = null, duplicateCheck = null,
} = {}) {
  const rows = orderedRows(installments);
  const opening = rows.find(isOpeningInstallment) || null;
  const remaining = rows.filter((row) => !isOpeningInstallment(row));
  const zeroValue = paymentNotRequired(order?.totalAmount);
  const missing = extrasError ? 'โหลดไม่ขึ้น' : 'ไม่พบ';
  const checklist = [];
  const effects = [];

  if (extrasError) {
    checklist.push(`⚠️ โหลดข้อมูลประกอบไม่ขึ้น (${text(extrasError)}) — รายการที่ขึ้นว่า "โหลดไม่ขึ้น" ต้องเปิดดูเองก่อนอนุมัติ`);
  }
  const arCode = text(order?.customer?.arCode);
  checklist.push(`ลูกค้า: ${[arCode, text(order?.customerName)].filter(Boolean).join(' · ') || '—'}`);

  // ── เอกสารแทนสัญญา + ไฟล์ที่จะผูกเป็นหลักฐานลงนาม ──
  const start = contract?.effectiveDate || contract?.contractDate || null;
  const end = contract?.expiryDate || null;
  if (contract) {
    checklist.push(`เอกสารแทนสัญญา: ${historicalContractFactText(contractDocText(contract), start, end)} — อนุมัติพร้อมใบนี้ ไม่ต้องอนุมัติสัญญาแยก`);
  } else {
    checklist.push(`เอกสารแทนสัญญา: ${missing} — เปิดใบใหม่ก่อนอนุมัติ`);
  }
  const files = list(contractFiles);
  if (signedFile) {
    const others = files.length > 1 ? ` (จาก ${fmtNumber(files.length)} ไฟล์ที่แนบ)` : '';
    checklist.push(`ไฟล์ที่ผูกเป็นหลักฐานลงนามของสัญญา: ${text(signedFile.fileName) || 'ไฟล์ไม่มีชื่อ'}${others}`);
  } else {
    checklist.push(`ไฟล์เอกสารแทนสัญญา: ${extrasError ? 'โหลดไม่ขึ้น' : 'ยังไม่มีไฟล์'} — อนุมัติไม่ได้จนกว่าจะเห็นไฟล์`);
  }

  // ── โซน รายไซต์ + รายการแบบใบเสนอราคา (มติ 23/09 — จำนวนของบรรทัดไม่ใช่ "แพ็ค") ──
  const zones = list(lineZones).length
    ? list(lineZones)
    : list(order?.lines).filter((l) => l.serviceZoneId).map((l) => ({ zoneId: l.serviceZoneId, siteName: null }));
  checklist.push(zones.length
    ? `โซน: ${historicalZoneSitesText(zones)}`
    : `โซน: ${missing} — ใบย้อนหลังต้องมีอย่างน้อย 1 โซน`);
  /* ── แพ็คต่อรอบ · รอบ (PR-D · มติ 26/09 A3/O9) — แพ็คมากับแถวโซนของเสริมเท่านั้น (บรรทัดของใบไม่พก)
     ⇒ ของเสริมโหลดไม่ขึ้น / ไม่มีแถวโซน = บอกว่าไม่รู้ ("โหลดไม่ขึ้น"/"ไม่พบ") ไม่ใช่ ⚠️ "คีย์ก่อนมีช่อง" (ไม่รู้ ≠ ไม่มี)
     · ตัวกลางของ 0392 ตรวจซ้ำตอนกด (0394/P3) — แพ็คไม่ครบ = การอนุมัติทั้งก้อนถอย */
  const service = historicalPacksRoundsText(list(lineZones));
  if (extrasError) {
    checklist.push(`${PACKS_ROUNDS_HEAD}: โหลดไม่ขึ้น — ระบบตรวจซ้ำตอนกดอนุมัติ`);
  } else if (!service.totals.zoneCount) {
    if (zones.length) checklist.push(`${PACKS_ROUNDS_HEAD}: ${missing} — ระบบตรวจซ้ำตอนกดอนุมัติ`);
  } else {
    const head = service.total || ['ยังไม่มีแพ็คต่อรอบ', roundsPerZoneText(service.totals)].filter(Boolean).join(' · ');
    checklist.push(`${PACKS_ROUNDS_HEAD}: ${head} — ${service.perZone || 'ดูการ์ดโซนในหน้าใบ'}`);
    if (service.totals.packsMissing) {
      checklist.push(`⚠️ แพ็คต่อรอบยังไม่ครบ ${fmtNumber(service.totals.packsMissing)} รายการ (ใบนี้คีย์ก่อนมีช่องแพ็คต่อรอบ)`
        + ' — ระบบจะไม่ยอมให้อนุมัติ ตีกลับให้ผู้คีย์บันทึกขั้น ② ใหม่');
    }
  }
  /* บรรทัดของใบ = ของจริงที่จะอนุมัติ · ไม่มี (ของเสริมโหลดไม่ขึ้นและใบไม่พกบรรทัดมา) ⇒ ถอยไปแถวโซน */
  const priced = list(order?.lines).filter((l) => l.serviceZoneId || l.productId);
  const groups = lineGroups(priced.length ? priced : zones.filter((zone) => zone.qty !== undefined && zone.qty !== null));
  if (groups.length) {
    const lineCount = groups.reduce((sum, group) => sum + group.count, 0);
    checklist.push(groups.length <= LINE_GROUPS_SHOWN
      ? `รายการ: ${groups.map((group) => `${group.fgCode ? `${group.fgCode} ` : ''}${quoteLineText(group.line)}`
        + `${group.count > 1 ? ` (${fmtNumber(group.count)} โซน)` : ''}`).join(' · ')}`
      : `รายการ: ${fmtNumber(lineCount)} บรรทัด ${fmtNumber(groups.length)} แบบ — ยอดรวมสินค้า/บริการ ${fmtMoney(order?.subtotal)} (ดูตารางรายการในหน้าใบ)`);
  }

  // ── เงิน (ป้ายท้ายตารางของใบเสนอราคา) ──
  const vat = Number(order?.vatAmount) || 0;
  /* ⭐ ส่วนลดท้ายใบ (มติ 25/09) — ของที่ AE Sup อนุมัติต้องบวกลบกันลงตัวบนจอ: ยอดรวมสินค้า/บริการ − ส่วนลด + VAT = ยอดรวมทั้งสิ้น
     🐞 รีวิว 25/09: บรรทัดนี้เคยข้ามส่วนลด (ใบย้อนหลังไม่เคยมีมาก่อน) ⇒ 42,000 + 2,800 ≠ 42,800 และส่วนลดที่อนุมัติไม่ขึ้นเลย */
  const discount = Number(order?.discountAmount) || 0;
  checklist.push(zeroValue
    ? `ยอดรวมทั้งสิ้น: ${fmtMoney(0)} — ไม่มีงวดให้เก็บ${text(order?.notes) ? ` · หมายเหตุ: ${text(order.notes)}` : ''}`
    : `ยอดรวมทั้งสิ้น: ${fmtMoney(order?.totalAmount)} — ยอดรวมสินค้า/บริการ ${fmtMoney(order?.subtotal)}`
      + `${discount > 0 ? ` · หัก ส่วนลด ${fmtMoney(discount)}` : ''}`
      + ` · ${vat > 0 ? `ภาษีมูลค่าเพิ่ม ${fmtMoney(vat)}` : 'รวม VAT แล้ว'}`);
  if (!zeroValue) {
    if (opening) {
      checklist.push(`${OPENING_INSTALLMENT_LABEL}: ${historicalOpeningFactText(opening, list(opening.evidence).length)}`);
    } else {
      checklist.push(`${OPENING_INSTALLMENT_LABEL}: ไม่มี (ยังไม่เคยเก็บเงิน) — นัดบริการติดด่านเงินจนกว่าบัญชีรับรองงวดแรก`);
    }
    if (remaining.length) {
      const billing = historicalBillingDatesText(remaining); // วันวางบิลไม่บังคับ (PR-D · §3.3) — ไม่มีสักงวด = บรรทัดเดิม
      checklist.push(`งวดที่ยังต้องเก็บ: ${historicalRemainingFactText(remaining)}${billing ? ` · ${billing}` : ''}`);
    }
    // ⭐ ตัวเดียวกับที่ฐานตรวจ (coverageContinuityErrors ↔ historical_so_check_installments) — ฐานตรวจซ้ำตอนกด
    const rowSum = rows.reduce((total, row) => total + Math.round((Number(row.amount) || 0) * 100), 0);
    const sumOk = Math.abs(rowSum - Math.round((Number(order?.totalAmount) || 0) * 100)) <= 1;
    const continuous = start && end ? coverageContinuityErrors(rows, { start, end }).length === 0 : null;
    if (sumOk && continuous) {
      checklist.push(historicalCoverageVerdictText(start, end));
    } else {
      if (!sumOk) checklist.push('⚠️ ยอดงวดรวมไม่เท่ายอดใบ — ระบบจะไม่ยอมให้อนุมัติ ตีกลับให้ผู้คีย์แก้');
      if (continuous === false) checklist.push('⚠️ ช่วงครอบของงวดไม่ต่อเนื่องเต็มสัญญา — ระบบจะไม่ยอมให้อนุมัติ ตีกลับให้ผู้คีย์แก้');
      if (continuous === null) {
        checklist.push(`ช่วงครอบของงวด: ช่วงสัญญา${extrasError ? 'โหลดไม่ขึ้น' : 'ไม่ครบ'} เทียบไม่ได้ — ระบบตรวจซ้ำตอนกดอนุมัติ`);
      }
    }
  }

  // ── โซนที่มีรอบขายของใบอื่นอยู่แล้ว (เตือน ไม่บล็อก — AE Sup ตัดสิน · F10) ──
  for (const warning of list(liveTermWarnings)) {
    if (typeof warning === 'string') { checklist.push(`⚠️ ${warning}`); continue; }
    const zone = text(warning.zoneCode) || text(warning.zoneName) || 'โซน';
    const until = warning.endDate ? fmtDate(warning.endDate) : 'ไม่ระบุวันสิ้นสุด';
    checklist.push(`⚠️ ${zone}: โซนนี้มีรอบขายของ ${text(warning.orderNumber) || 'ใบอื่น'} อยู่แล้ว (ถึง ${until}) — ตรวจว่าไม่ซ้ำสัญญา`);
  }

  // ── ใบที่อาจซ้ำ: ผู้คีย์ยืนยันใบไหน ใคร เมื่อไร + ที่พบเพิ่มตอนเปิดใบ (เตือน ไม่บล็อก — มติ 26/09) ──
  /* บันทึกของผู้คีย์มากับแถวใบ (metadata) ⇒ ยังพูดได้แม้ของเสริมโหลดไม่ขึ้น · ไม่มีอะไรจะพูด = ไม่มีแถว */
  checklist.push(...historicalDuplicateApprovalRows(historicalDuplicateReviewOf(order), duplicateCheck, {
    statusLabel: (status) => historicalStatusCopy(status).label,
    loadError: Boolean(extrasError) && !duplicateCheck,
  }));

  // ── สิ่งที่เกิดทันที ──
  effects.push(`เอกสารแทนสัญญา${contractDocText(contract) ? ` ${contractDocText(contract)}` : ''} อนุมัติ ออกเลข CT แล้วผูกกับใบนี้`
    + (start || end ? ` (มีผล ${span(start, end)})` : ''));
  if (zeroValue) {
    effects.push('ใบยอด 0 บาท — ไม่มีงวดเข้าคิวบัญชี');
  } else {
    if (opening) effects.push(`ส่ง${OPENING_INSTALLMENT_LABEL} ${fmtMoney(opening.amount)} (ครอบบริการ ${span(opening.coversFrom, opening.coversTo)}) ให้บัญชีรับรอง`);
    if (remaining.length) effects.push(`งวดที่ยังต้องเก็บ ${fmtNumber(remaining.length)} งวดขึ้นทะเบียนการชำระ — ฝ่ายขายแจ้งชำระเมื่อลูกค้าจ่าย`);
  }
  const gate = zeroValue ? 'นัดขึ้นตารางได้ทันที (ใบยอด 0 ไม่มีด่านเงิน)'
    : opening ? `นัดขึ้นตารางได้เมื่อบัญชีรับรอง${OPENING_INSTALLMENT_LABEL}`
      : 'นัดขึ้นตารางได้เมื่อบัญชีรับรองงวดแรก';
  /* ⭐ PR-D: แพ็คครบทุกโซน = บอกสิ่งที่ TS จะเห็นในคิว (โซน · ไซต์ · แพ็ค/รอบ · จำนวนรอบบริการ) · ไม่รู้/ไม่ครบ = ประโยคเดิม */
  const totals = service.totals;
  const rounds = roundsPerZoneText(totals);
  effects.push(!extrasError && totals.zoneCount && !totals.packsMissing
    ? `${fmtNumber(totals.zoneCount)} โซน${totals.siteCount ? `ใน ${fmtNumber(totals.siteCount)} ไซต์` : ''}`
      + ` · รวม ${fmtNumber(totals.packsTotal)} แพ็ค/รอบ${rounds ? ` · ${SERVICE_ROUNDS_LABEL} ${rounds}` : ''} ขึ้นคิว TS งานเข้าใหม่ › รอตั้งรอบ — ${gate}`
    : `${fmtNumber(zones.length)} โซนขึ้นคิว TS งานเข้าใหม่ › รอตั้งรอบ — ${gate}`);

  return { subject: `ใบสั่งขาย ${text(order?.orderNumber) || '—'}`, checklist, effects };
}

/* Admin อนุมัติใบที่ตัวเองคีย์/ส่ง — บรรทัดที่เติมเข้าโมดัลเดียวกับผู้ตรวจปกติ (historicalApprovalPrompt · override) */
export const historicalOverrideNote = 'คุณเป็นผู้คีย์หรือผู้ส่งใบนี้ — อนุมัติแบบ Admin Override และบันทึกไว้ว่าเป็นการอนุมัติใบตัวเอง';

/* บรรทัดผลลัพธ์ของโมดัล "ตีกลับ" / "ดึงกลับ" — ของใบปกติพูดเรื่องยอดออกจากกอง "รออนุมัติ" ซึ่งใบนี้ไม่มี */
export function historicalRejectDetail(order) {
  return `ใบ ${text(order?.orderNumber) || 'นี้'} กลับไปให้ผู้คีย์แก้ในฟอร์มคีย์ใบ แล้วส่งอนุมัติใหม่`
    + ' — เอกสารแทนสัญญายังเป็นร่าง งวดยังไม่ขึ้นคิวบัญชี · ใบย้อนหลังไม่นับ Actual จึงไม่มียอดออกจากกองไหน';
}

export function historicalWithdrawDetail(order) {
  return `ใบ ${text(order?.orderNumber) || 'นี้'} กลับเป็นฉบับร่าง แก้ในฟอร์มคีย์ใบได้ แล้วกด "บันทึกและส่งอนุมัติ" อีกครั้ง`
    + ' — ใบย้อนหลังไม่นับ Actual จึงไม่มียอดออกจากกองไหน';
}

/* ── ผลต่อเอกสารแทนสัญญาเมื่อยกเลิก/ลบใบ (trigger sales_orders_historical_void_contract_* ของ 0374) ─────
   ⭐ เงื่อนไขเดียวกับ trigger: เอกสารภายนอกที่ชี้กลับมาใบนี้ (metadata.historicalSalesOrderId) และยังร่าง/ลงนามแล้ว
     ⇒ ฐานยกเลิกให้ในทรานแซกชันเดียวกับใบ · ฉบับที่ลงนามแล้วเลข CT **ไม่คืน** (เหมือน void ของ FM-SA-04)
   ⚠️ โหลดสัญญาไม่ขึ้นแต่ใบชี้สัญญาอยู่ = พูดแบบ "ถ้ายัง…" ดีกว่าเงียบ · ไม่ใช่ใบย้อนหลัง/ไม่มีผล = null */
export function historicalCancelEffect(order, contract = null) {
  if (!isHistoricalOrder(order)) return null;
  if (!contract) {
    return order?.serviceContractId ? 'เอกสารแทนสัญญาของใบนี้ (ถ้ายังเป็นร่างหรือลงนามแล้ว) จะถูกยกเลิกด้วย' : null;
  }
  const own = contract.source === 'external' && contract.metadata?.historicalSalesOrderId === order.id;
  if (!own || !['draft', 'signed'].includes(contract.status)) return null;
  const doc = contractDocText(contract);
  const base = `เอกสารแทนสัญญา${doc ? ` ${doc}` : ''} จะถูกยกเลิกด้วย`;
  return contract.status === 'signed' && text(contract.contractNo)
    ? `${base} (เลข ${text(contract.contractNo)} ไม่คืน)`
    : base;
}

/* ── โมดัลยกเลิกใบย้อนหลัง (มติเจ้าของ 24/09 · mig 0387) ─────────────────────────────────────────────────
   ⭐ "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" — ผู้จัดการฝ่ายขาย (CD · CM · AE Sup · Admin) ยกเลิกใบที่อนุมัติแล้วได้
     แม้งวดยกมารับรองแล้ว ⇒ คนกดต้องเห็นก่อนกดว่าอะไรหายไปพร้อมใบ:
     · เอกสารแทนสัญญา (historicalCancelEffect — การ์ดแยกของจอ) · งวดยกมาเป็นโมฆะ ใครรับรองไว้ (money)
     · รอบขายของโซนหยุด และด่านเงินของนัดช่างรอทั้งใบใหม่อนุมัติ **และ** บัญชีรับรองงวดยกมาของใบใหม่
       (ด่านนับเฉพาะงวด confirmed — paymentCoverage.paidThrough · ขั้นอนุมัติดันงวดยกมาแค่ถึง "รอตรวจ")
     · ทางคีย์ใหม่ (HISTORICAL_CORRECTION_PATH)
   🐞 คำนำเดิมของโมดัลเป็นของใบปกติ ("ยอด Actual จะถูกนำออก" / "ออกจากรออนุมัติ") — ไม่จริงกับใบย้อนหลังทุกสถานะ
   ⚠️ หมายเหตุบังคับของงวดยกมาที่รับรองแล้วถามตัวเดียวกับ route (historicalCancelNoteError) — ที่นี่แค่ติดป้ายช่อง
   @param reasonCode รหัสเหตุผลที่เลือกอยู่ ('other' = หมายเหตุบังคับตามกติกาเดิมของทุกใบ) */
export function historicalCancelPrompt(order, { installments = [], reasonCode = '' } = {}) {
  if (!isHistoricalOrder(order)) return null;
  const rows = list(installments);
  const certified = historicalCancelOpening(order, rows)?.status === 'confirmed';
  const zones = new Set(list(order?.lines).map((line) => text(line.serviceZoneId)).filter(Boolean)).size;
  /* รอบขายของโซนเกิดตอนอนุมัติ (0374 ข้อ ④) ⇒ ใบที่ยังไม่อนุมัติไม่มีอะไรให้หยุด และยังแก้ในฟอร์มได้ (ไม่ต้องชี้ทางคีย์ใหม่) */
  const notices = order?.status === 'approved' ? [
    zones
      ? `รอบขายของโซน ${fmtNumber(zones)} โซนหยุดมีผลทันที — นัดบริการของโซนเหล่านี้ติดด่านจนกว่าใบที่คีย์ใหม่จะอนุมัติ`
        + ' และบัญชีรับรองงวดยกมาของใบใหม่'
      : null,
    HISTORICAL_CORRECTION_PATH,
  ].filter(Boolean) : [];
  const noteRequired = certified || reasonCode === 'other';
  return {
    title: 'ยกเลิกใบสั่งขายย้อนหลัง',
    lead: `ใบ ${text(order?.orderNumber) || 'นี้'} จะเป็น “ยกเลิก” — ใบย้อนหลังไม่นับ Actual/รออนุมัติ ยอดจึงไม่ขยับ`,
    money: salesOrderMoneyOutcome(order, rows, 'cancel'),
    notices,
    noteRequired,
    noteLabel: certified
      ? `หมายเหตุ (บังคับ อย่างน้อย ${HISTORICAL_CANCEL_NOTE_MIN} ตัวอักษร — บัญชีเห็นในประวัติ)`
      : `หมายเหตุ (${noteRequired ? 'บังคับ' : 'ไม่บังคับ'})`,
    confirmLabel: 'ยืนยันยกเลิกใบย้อนหลัง',
  };
}

/* สรุปงวดยกมาที่โมฆะตามใบ — ท้ายสรุป audit ของใบ + หัวสรุป audit ของงวด (route ยกเลิก) · null = ไม่มีอะไรโมฆะ
   @param opening ผลของ historicalCancelOpening (งวดที่อ่านสดก่อนยกเลิก) */
export function historicalOpeningVoidSummary(opening) {
  if (!opening) return null;
  const by = text(opening.row?.confirmedByName);
  const state = opening.status === 'confirmed'
    ? `รับรองแล้ว${by ? ` โดย ${by}` : ''}`
    : 'รอรับรอง — ออกจากคิวบัญชี';
  return `${OPENING_INSTALLMENT_LABEL} ${fmtMoney(opening.amount)} (${state}) โมฆะตามใบ`;
}

/* toast หลังยกเลิกใบย้อนหลัง — บอกสิ่งที่เกิดจริงจากคำตอบของ route (`contractVoided` · `contractVoidedLabel` · `openingVoided`)
   ⚠️ ของใบปกติพูดว่า "คำนวณ Actual ใหม่แล้ว" ซึ่งไม่จริงกับใบนี้สักตัวอักษร */
const HISTORICAL_REKEY_HINT = 'คีย์ใบใหม่ได้ที่ ใบสั่งขาย › SO ย้อนหลัง';
export function historicalCancelToast(result) {
  const r = result && typeof result === 'object' ? result : {};
  const label = text(r.contractVoidedLabel);
  const parts = [
    r.contractVoided ? `เอกสารแทนสัญญา${label ? ` ${label} ` : ''}ถูกยกเลิกตาม` : null,
    r.openingVoided ? `${OPENING_INSTALLMENT_LABEL}เป็นโมฆะ` : null,
    HISTORICAL_REKEY_HINT,
  ].filter(Boolean);
  return `ยกเลิกใบย้อนหลังแล้ว — ${parts.join(' · ')}`;
}

/* บัญชีตีกลับงวดยกมา — บอกทางออกทั้งสองแบบ (หลักฐานผิด = แจ้งใหม่ · ยอด/ช่วงที่อนุมัติไปผิด = ยกเลิกแล้วคีย์ใหม่) */
export const historicalOpeningRejectNote = `ถ้าแค่หลักฐานหรือวันที่รับเงินผิด ฝ่ายขายแจ้ง${OPENING_INSTALLMENT_LABEL}ใหม่พร้อมหลักฐานได้`
  + ` · ถ้ายอดหรือช่วงครอบที่อนุมัติไปผิด: ${HISTORICAL_CORRECTION_PATH}`;

export const HISTORICAL_APPROVE_TOAST = 'อนุมัติใบย้อนหลังแล้ว (ไม่นับ Actual) — เอกสารแทนสัญญาออกเลข CT · งวดขึ้นคิวบัญชี · โซนขึ้นคิว TS';

/* ── "หลังกดส่ง" ของขั้น ④ ในฟอร์มคีย์ใบ (มติเจ้าของ 25/09 — รื้อขั้น ④) ─────────────────────────────────
   ⭐ รูปของ `WorkflowRail` (หน้าสร้างใบสั่งขายใช้รางเดียวกัน "คุณอยู่ตรงนี้ — เลขที่ใบออกตอนกดสร้าง") · ป้ายขั้นชุดเดียวกับรางบน
     หน้าใบย้อนหลัง (`historicalWorkflowSteps`) ⇒ ผู้คีย์เห็นรางเดิมต่อหลังระบบพาไปหน้าใบ
   🐞 ของเดิม: รายการมีรหัสฝ่าย + เส้นทางเมนูของ TS · บอกผู้คีย์ว่า "AE Sup" คนเดียวอนุมัติ ทั้งที่ CM/CD ก็อนุมัติได้
     · กล่องเหลือง "ยังเข้าบริการไม่ได้จนกว่า…" ขึ้นทุกใบ ซึ่งไม่จริงกับใบ ฿0 · ลำดับจริงอยู่ในรางนี้แล้ว
   · ใบ ฿0 ไม่มีขั้นบัญชีและขั้นตามเก็บงวด · นัดบริการได้ทันที
   @param keyerMode 'keyer' (ผู้คีย์ทั่วไป) · 'manager' (ผู้จัดการฝ่ายขายที่ไม่ใช่ admin — อนุมัติใบตัวเองไม่ได้) ·
     'admin' (อนุมัติเองได้แบบ Admin Override)
   @param orderNumber เลขใบที่มีแล้ว (ใบร่าง/ถูกตีกลับ) — ส่งซ้ำใช้เลขเดิม
   @returns `[{ id, label, hint, state? }]` */
export function historicalAfterSendRail(plan, { keyerMode = 'keyer', orderNumber = null } = {}) {
  const zeroValue = Boolean(plan?.zeroValue);
  const opening = plan?.opening || null;
  const remaining = list(plan?.installments).slice()
    .sort((a, b) => text(a.coversFrom).localeCompare(text(b.coversFrom)) || text(a.dueDate).localeCompare(text(b.dueDate)));
  const zoneCount = new Set(list(plan?.lines).map((line) => line.zoneId || line.serviceZoneId).filter(Boolean)).size
    || list(plan?.lines).length;
  const steps = [{
    id: 'keyed',
    label: 'คีย์ใบ',
    state: 'current',
    hint: text(orderNumber)
      ? `คุณอยู่ตรงนี้ — ส่ง ${text(orderNumber)} อีกครั้ง ใช้เลขเดิม`
      : 'คุณอยู่ตรงนี้ — กดส่งแล้วได้เลข SO (เลขใช้แล้วไม่คืน) · ไฟล์เอกสารแทนสัญญาล็อกระหว่างรออนุมัติ',
  }];
  steps.push({
    id: 'approve',
    label: `${HISTORICAL_APPROVER_LABEL}อนุมัติ`,
    hint: keyerMode === 'admin'
      ? `${HISTORICAL_APPROVER_LABEL} หรือคุณอนุมัติเองแบบ Admin Override ที่หน้าใบ (บันทึกไว้ว่าอนุมัติใบตัวเอง)`
      : keyerMode === 'manager'
        ? `${HISTORICAL_APPROVER_LABEL}คนอื่นเป็นผู้อนุมัติ — คุณคีย์/ส่งใบนี้เองจึงอนุมัติเองไม่ได้`
        : `${HISTORICAL_APPROVER_ROLES_TEXT} ตรวจตามรายการข้างบน — ตีกลับได้ ใบกลับมาที่ฟอร์มนี้พร้อมเหตุผล`,
  });
  if (!zeroValue) {
    steps.push(opening
      ? {
        id: 'finance',
        label: `บัญชีรับรอง${OPENING_INSTALLMENT_LABEL}`,
        hint: `${fmtMoney(opening.amount)} แจ้งชำระในชื่อคุณ — รับรองแล้วนัดบริการได้ถึง ${day(opening.coversTo)}`
          + ` · ถ้าบัญชีตีกลับ แจ้ง${OPENING_INSTALLMENT_LABEL}ใหม่พร้อมหลักฐานที่หน้าใบ`,
      }
      : {
        id: 'finance',
        label: 'บัญชีรับรองงวดแรก',
        hint: 'เมื่อลูกค้าจ่ายและฝ่ายขายแจ้งชำระ — ก่อนนั้นนัดบริการไม่ได้',
      });
  }
  steps.push({
    id: 'ts',
    label: 'TS ตั้งรอบ',
    hint: zeroValue
      ? `${fmtNumber(zoneCount)} โซนขึ้นคิวฝ่ายบริการทันทีที่อนุมัติ — นัดได้ทันที ไม่มีด่านเงิน`
      : `${fmtNumber(zoneCount)} โซนขึ้นคิวฝ่ายบริการทันทีที่อนุมัติ — ตั้งรอบได้ก่อนบัญชีรับรอง แต่นัดเข้าบริการรอด่านเงิน`,
  });
  if (!zeroValue) {
    const next = remaining[0] || null;
    steps.push({
      id: 'collect',
      label: 'ฝ่ายขายตามเก็บงวด',
      hint: next
        ? `${text(next.label) || 'งวดถัดไป'} ${fmtMoney(next.amount)} ครบกำหนด ${day(next.dueDate)}`
          + `${remaining.length > 1 ? ` · อีก ${fmtNumber(remaining.length - 1)} งวดตามตาราง` : ''}`
        : 'ไม่มีงวดที่ต้องเก็บต่อ — เก็บครบตั้งแต่ก่อนเข้าระบบ',
    });
  }
  return steps;
}
