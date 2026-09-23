// ── ถ้อยคำของใบสั่งขายย้อนหลัง (มติเจ้าของ 22/09 · mig 0374) — สถานะ · รางก้าว · โมดัลอนุมัติ · ผลของการกด ─────
//
// ⭐ ทำไมเป็นไฟล์กลาง: หน้าใบสั่งขายยาว ~1,600 บรรทัด และใบย้อนหลังพูดคนละเรื่องกับใบปกติแทบทุกจุด
//   (ไม่นับ Actual · ไม่มีใบเสนอราคา/ลายเซ็น · เอกสารแทนสัญญาอนุมัติพร้อมใบ · งวดยกมา · TS ตั้งรอบ)
//   ⇒ ตรรกะของคำอยู่ที่นี่พร้อมเทสต์ จอแค่แตกกิ่ง JSX (แพตเทิร์นเดียวกับ salesOrderFinanceApproval)
// 🔴 **ห้ามมีประโยคไหนบอกว่าใบย้อนหลัง "นับ Actual"** — ขายไปก่อนเข้าระบบ ยอดไม่เข้า Actual / FC / เป้า
//   (sync_sales_order_actual กรอง origin = 'pipeline') · เทสต์ไล่ทุกสตริงที่ไฟล์นี้คืนออกไป
// ⚠️ pure — ไม่อ่านฐาน ไม่อ่านนาฬิกา ("วันนี้" รับเข้ามาเป็น `todayIso` จากนาฬิกาไทยของผู้เรียก)
//   ฝั่งจอ import ได้: import เฉพาะ format · ป้ายของสัญญา · historicalOrders · paymentCoverage · paymentNotRequired
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { externalDocKindLabel } from '@/lib/sales/contracts';
import {
  HISTORICAL_CORRECTION_PATH, HISTORICAL_STATUS_NOTE, OPENING_INSTALLMENT_LABEL,
  isHistoricalOrder, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import { addDays, coverageContinuityErrors, isConfirmed, paidThrough } from '@/lib/sales/paymentCoverage';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';

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
    label: 'รอ AE Supervisor อนุมัติ',
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
    label: 'AE Sup อนุมัติ',
    hint: everApproved
      ? `${text(order?.approvedByName) || 'AE Sup'}${order?.approvedAt ? ` · ${fmtDate(order.approvedAt)}` : ''}${override}`
      : status === 'rejected' ? 'ตีกลับแล้ว · ไม่นับ Actual' : 'รอ AE Sup · ไม่นับ Actual',
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
        : !approved ? 'ขึ้นคิวบัญชีหลัง AE Sup อนุมัติ'
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
      : !approved ? `หลัง AE Sup อนุมัติ · ${fmtNumber(zoneCount)} โซน`
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
  if (order?.status !== 'approved') return 'รอ AE Sup อนุมัติ';
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
       discountAmount?, lineTotal? }]` (หนึ่งแถวต่อบรรทัด — ของเสริมจาก loadHistoricalOrderExtras)
     · liveTermWarnings: สตริง หรือ `{ zoneCode|zoneName, orderNumber, endDate }`
   @returns `{ subject, checklist, effects }` — effects ไม่รวม HISTORICAL_STATUS_NOTE (ตัวสร้างโมดัลเติมเอง) */
export function historicalApprovalFacts(order, {
  installments = [], contract = null, contractFiles = [], lineZones = [], liveTermWarnings = [], signedFile = null,
  extrasError = null,
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
    checklist.push(`เอกสารแทนสัญญา: ${contractDocText(contract) || '—'} · ${span(start, end)} — อนุมัติพร้อมใบนี้ ไม่ต้องอนุมัติสัญญาแยก`);
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

  // ── โซน รายไซต์ + รายการแบบใบเสนอราคา (มติ 23/09 — ไม่นับ "แพ็ค" แล้ว) ──
  const zones = list(lineZones).length
    ? list(lineZones)
    : list(order?.lines).filter((l) => l.serviceZoneId).map((l) => ({ zoneId: l.serviceZoneId, siteName: null }));
  const bySite = new Map();
  for (const zone of zones) {
    const key = zone.siteId || zone.siteCode || zone.siteName || '';
    const entry = bySite.get(key) || { name: [text(zone.siteCode), text(zone.siteName)].filter(Boolean).join(' '), count: 0 };
    entry.count += 1;
    bySite.set(key, entry);
  }
  const siteText = [...bySite.values()].filter((s) => s.name).map((s) => `${s.name} ${fmtNumber(s.count)} โซน`).join(' · ');
  checklist.push(zones.length
    ? `โซน: ${fmtNumber(zones.length)} โซน${siteText ? ` — ${siteText}` : ''}`
    : `โซน: ${missing} — ใบย้อนหลังต้องมีอย่างน้อย 1 โซน`);
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
  checklist.push(zeroValue
    ? `ยอดรวมทั้งสิ้น: ${fmtMoney(0)} — ไม่มีงวดให้เก็บ${text(order?.notes) ? ` · หมายเหตุ: ${text(order.notes)}` : ''}`
    : `ยอดรวมทั้งสิ้น: ${fmtMoney(order?.totalAmount)} — ยอดรวมสินค้า/บริการ ${fmtMoney(order?.subtotal)}`
      + ` · ${vat > 0 ? `ภาษีมูลค่าเพิ่ม ${fmtMoney(vat)}` : 'รวม VAT แล้ว'}`);
  if (!zeroValue) {
    if (opening) {
      const evidence = list(opening.evidence).length;
      checklist.push(`${OPENING_INSTALLMENT_LABEL}: ${fmtMoney(opening.amount)} · ครอบบริการ ${span(opening.coversFrom, opening.coversTo)}`
        + ` · รับเงิน ${day(opening.paidOn)} · หลักฐาน ${fmtNumber(evidence)} ไฟล์`);
    } else {
      checklist.push(`${OPENING_INSTALLMENT_LABEL}: ไม่มี (ยังไม่เคยเก็บเงิน) — นัดบริการติดด่านเงินจนกว่าบัญชีรับรองงวดแรก`);
    }
    if (remaining.length) {
      const sum = remaining.reduce((total, row) => total + (Number(row.amount) || 0), 0);
      checklist.push(remaining.length <= 3
        ? `งวดที่ยังต้องเก็บ: ${remaining.map((row) => `${text(row.label) || 'งวด'} ${fmtMoney(row.amount)} ครบกำหนด ${day(row.dueDate)}`).join(' · ')}`
        : `งวดที่ยังต้องเก็บ: ${fmtNumber(remaining.length)} งวด รวม ${fmtMoney(sum)} · งวดแรกครบกำหนด ${day(remaining[0].dueDate)}`);
    }
    // ⭐ ตัวเดียวกับที่ฐานตรวจ (coverageContinuityErrors ↔ historical_so_check_installments) — ฐานตรวจซ้ำตอนกด
    const rowSum = rows.reduce((total, row) => total + Math.round((Number(row.amount) || 0) * 100), 0);
    const sumOk = Math.abs(rowSum - Math.round((Number(order?.totalAmount) || 0) * 100)) <= 1;
    const continuous = start && end ? coverageContinuityErrors(rows, { start, end }).length === 0 : null;
    if (sumOk && continuous) {
      checklist.push(`ยอดงวดรวม = ยอดใบ · ช่วงบริการต่อเนื่อง ${span(start, end)} ไม่มีช่องโหว่`);
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
  effects.push(`${fmtNumber(zones.length)} โซนขึ้นคิว TS งานเข้าใหม่ › รอตั้งรอบ — ${gate}`);

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

/* บัญชีตีกลับงวดยกมา — บอกทางออกทั้งสองแบบ (หลักฐานผิด = แจ้งใหม่ · ยอด/ช่วงที่อนุมัติไปผิด = ยกเลิกแล้วคีย์ใหม่) */
export const historicalOpeningRejectNote = `ถ้าแค่หลักฐานหรือวันที่รับเงินผิด ฝ่ายขายแจ้ง${OPENING_INSTALLMENT_LABEL}ใหม่พร้อมหลักฐานได้`
  + ` · ถ้ายอดหรือช่วงครอบที่อนุมัติไปผิด: ${HISTORICAL_CORRECTION_PATH}`;

export const HISTORICAL_APPROVE_TOAST = 'อนุมัติใบย้อนหลังแล้ว (ไม่นับ Actual) — เอกสารแทนสัญญาออกเลข CT · งวดขึ้นคิวบัญชี · โซนขึ้นคิว TS';

/* ── "หลังบันทึก จะเกิดอะไร" ของขั้น ④ ในฟอร์มคีย์ใบ (mock Step4 · REVISION 2) ─────────────────────────
   ลำดับ AE Sup → FN → TS → SA · อ่านจากแผนของ planHistoricalServiceOrder (ตัวเดียวกับที่ส่งเข้า RPC)
   ⭐ ผู้คีย์ที่เป็นผู้ตรวจเอง (AE Sup/Admin) อนุมัติใบตัวเองไม่ได้ ⇒ ต้องบอกตั้งแต่ก่อนกดว่าใบจะรอใคร
   · ใบ ฿0 ไม่มีขั้นบัญชีและไม่มีงวดให้ฝ่ายขายตาม
   @returns `[{ key, lane, text, note }]` */
export function historicalAfterSaveSteps(plan, { keyerIsReviewer = false } = {}) {
  const zeroValue = Boolean(plan?.zeroValue);
  const opening = plan?.opening || null;
  const remaining = list(plan?.installments).slice()
    .sort((a, b) => text(a.coversFrom).localeCompare(text(b.coversFrom)) || text(a.dueDate).localeCompare(text(b.dueDate)));
  const zoneCount = list(plan?.lines).length;
  const steps = [{
    key: 'approve',
    lane: 'AE Sup · หัวหน้าฝ่ายขาย',
    text: keyerIsReviewer
      ? 'AE Sup คนอื่นหรือ admin อนุมัติใบ — ผู้คีย์อนุมัติใบตัวเองไม่ได้'
      : 'AE Sup อนุมัติใบ — ตรวจยอด โซน สัญญา',
    note: 'ไม่นับ Actual / FC / เป้า · ตีกลับให้แก้ไขได้ ใบกลับมาที่ฟอร์มนี้',
  }];
  if (!zeroValue) {
    steps.push(opening
      ? {
        key: 'finance',
        lane: 'FN · บัญชี',
        text: `บัญชีรับรอง${OPENING_INSTALLMENT_LABEL} ${fmtMoney(opening.amount)} → เปิดบริการถึง ${day(opening.coversTo)}`,
        note: 'ขึ้นคิวบัญชีหลัง AE Sup อนุมัติ',
      }
      : {
        key: 'finance',
        lane: 'FN · บัญชี',
        text: 'บัญชีรับรองงวดแรกเมื่อลูกค้าจ่ายและฝ่ายขายแจ้งชำระ',
        note: `ไม่มี${OPENING_INSTALLMENT_LABEL} — นัดบริการติดด่านเงินจนกว่าบัญชีรับรองงวดแรก`,
      });
  }
  steps.push({
    key: 'ts',
    lane: 'TS · ฝ่ายบริการ',
    text: `ตั้งรอบของ ${fmtNumber(zoneCount)} โซน — โซนผูกให้แล้ว ไม่ต้องผูกซ้ำ`,
    note: 'เห็นใน งานเข้าใหม่ › รอตั้งรอบ หลัง AE Sup อนุมัติ',
  });
  if (!zeroValue) {
    const next = remaining[0] || null;
    steps.push(next
      ? {
        key: 'sales',
        lane: 'SA · ฝ่ายขาย',
        text: `${text(next.label) || 'งวดถัดไป'} ${fmtMoney(next.amount)} ครบกำหนด ${day(next.dueDate)} — ลูกค้าจ่ายแล้วแจ้งชำระพร้อมหลักฐาน`,
        note: remaining.length > 1 ? `อีก ${fmtNumber(remaining.length - 1)} งวดตามตาราง` : null,
      }
      : {
        key: 'sales',
        lane: 'SA · ฝ่ายขาย',
        text: 'ไม่มีงวดที่ต้องเก็บต่อ — เก็บครบตั้งแต่ก่อนเข้าระบบ',
        note: null,
      });
  }
  return steps;
}
