// ── ยกเงินค้างจากใบที่ยกเลิกเข้าใบใหม่ของดีลเดียวกัน (PR3 · mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ──
//
// ⭐ ยกเลิกใบที่มีเงินรับแล้วได้ (PR3) — งวดที่มีเงินอยู่กับใบเดิมเป็น "เงินค้างจากใบที่ยกเลิก" (strandedInstallment)
//   ทางออกทางแรก (ไฟล์นี้): ใบใหม่ของ **ดีลเดียวกัน** ที่อนุมัติแล้ว กด "ยกเงินจากใบที่ยกเลิก" ⇒ แถวเดิม id เดิม ย้ายมาทั้งแถว
//   (สลิป · คำรับรอง · ใบกำกับ · คำร้องวางบิล · ช่วงครอบคงเดิม) บัญชีไม่ต้องรับรองซ้ำ · ทางที่สอง = บัญชีบันทึกคืนเงิน
// ⭐ หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว": แผนที่เหลือของใบใหม่ **หักงวดเปิดแรก ๆ ก่อน** (applyCarryIn) — งวดที่หักจนหมดถูกลบ
//   แถวที่มีเงิน/เอกสารผูกของใบใหม่ไม่ถูกแตะ (installmentReplanLock ตัวเดียวกับปรับแผน) · Σ = ยอดใบ (รวม VAT) ถึงสตางค์
// ⭐ ไฟล์นี้คำนวณ "ชุดสุดท้ายทั้งใบ" ให้ทั้งโมดัล (พรีวิวก่อน/หลัง) และ route (payload ของ RPC) — RPC 0378 + แกน 0377 เป็นยาม
// 🔴 ไม่มีอะไรในไฟล์นี้แตะยอด Actual — ผลลัพธ์เป็นแถวงวดล้วน · RPC ไม่เขียน sales_orders (ใบที่ยกเลิกหลุด Actual ไปตั้งแต่ยกเลิก)
import { fmtDate, fmtMoney } from '@/lib/format';
import { canConfirmPayment } from '@/lib/permissions';
import { MAX_INSTALLMENTS } from '@/lib/sales/paymentPlan';
import { installmentRefunded, paymentNotRequired, strandedInstallment } from '@/lib/sales/salesOrderPayments';
import {
  actualMonthLabel, installmentReplanLock, replanChangeLine, replanDiff, replanExpected, replanStale,
} from '@/lib/sales/installmentReplan';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';

export const CARRY_BUTTON = 'ยกเงินจากใบที่ยกเลิก';
export const CARRY_DONE_MESSAGE = 'ยกเงินจากใบที่ยกเลิกแล้ว — บัญชีไม่ต้องรับรองซ้ำ · ยอด Actual ไม่เปลี่ยน';
export const CARRY_FORBIDDEN = 'ยกเงินจากใบที่ยกเลิกได้เฉพาะ AE Sup แอดมิน หรือฝ่ายบัญชี';
export const CARRY_STALE_MESSAGE = 'งวดของใบนี้หรือใบที่ยกเลิกเพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่แล้วยกอีกครั้ง';
/* RPC 0378 ยังไม่มีบนฐาน (PGRST202) — ห้ามถอยไปย้ายแถวเองทีละแถว (ข้ามด่านดีลเดียวกัน/ยกเกิน/Σ/ข้อมูลเก่า) */
export const INSTALLMENT_CARRY_SCHEMA_MISSING = 'ฐานยังไม่ได้รัน 0378 (ยกเงินจากใบที่ยกเลิก) — แจ้งผู้ดูแลระบบ';
/* ทางออกของสองด่านเงิน — ประโยคเดียวกับข้อความของ RPC (documentWorkflowErrors: installment_carry_overpaid/_duplicate) */
export const CARRY_OVERPAID_WAY_OUT = 'ถ้ายกหลายงวดให้เลือกยกน้อยลง · ถ้าเหลืองวดเดียว (คืนบางส่วนไม่ได้)'
  + ' ให้บัญชีบันทึกคืนเงินทั้งงวดที่ใบที่ยกเลิก แล้วเก็บเงินของใบนี้ตามงวดปกติ';
export const CARRY_DUPLICATE_WAY_OUT = 'ให้บัญชีตีกลับ/ถอนคำรับรองงวดที่ซ้ำบนใบนี้ก่อน แล้วจึงยก'
  + ' (ถ้าเป็นเงินคนละก้อนจริง ให้บัญชีบันทึกคืนเงินงวดของใบที่ยกเลิกแทน)';

const text = (v) => String(v ?? '').trim();
const toCents = (v) => Math.round((Number(v) || 0) * 100);
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const bySeq = (a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0);
const sortedRows = (rows) => [...(Array.isArray(rows) ? rows : [])].filter(Boolean).sort(bySeq);
/* ป้ายที่ระบบตั้งให้ — เดินตามเลขงวด · ป้ายที่คนตั้งเอง ("มัดจำ") คงไว้ (กติกาเดียวกับ buildReplanRows) */
const AUTO_LABEL = /^งวดที่ \d+$/;
const labelFor = (given, seq) => (!text(given) || AUTO_LABEL.test(text(given)) ? `งวดที่ ${seq}` : text(given));
const CARRY_STATUS_LABEL = { confirmed: 'รับเงินแล้ว', reported: 'รอบัญชีตรวจ' };

/**
 * ใครกด "ยกเงินจากใบที่ยกเลิก" ได้ — AE Sup · แอดมิน (คนที่ปรับแผนงวดได้อยู่แล้ว · D1) · ฝ่ายบัญชี (เจ้าของทะเบียนเงิน)
 * ⚠️ ฝ่ายบัญชีแคบด้วยฝ่ายผ่าน `canConfirmPayment` (ถือ cap อย่างเดียวไม่พอ) — RPC รับ role finance อีกชั้น
 * ⚠️ proxy ให้ FN ผ่านเฉพาะ PATCH ของ `/installments` ⇒ คำสั่งนี้ต้องเป็น PATCH action บน route งวดของใบปลายทาง
 */
export function canCarryInstallments(user) {
  return isSalesOrderReviewer(user?.role) || canConfirmPayment(user);
}

/**
 * ใบที่ยกเลิกของดีลเดียวกันที่มีเงินค้าง — ตัวเลือกต้นทางของโมดัล (และคำเตือนในโมดัลอนุมัติใบใหม่)
 * @param orders ใบของดีลเดียวกันที่อ่านมา (route กรอง status/origin/dealId ที่ query แล้ว — ที่นี่กรองซ้ำ ไม่เชื่อผู้เรียก)
 * @param rows   งวดของใบเหล่านั้นทั้งหมด (อ่านด้วย select('*') — ก่อนรัน 0378 ไม่มี refundedAt = ยังไม่คืน)
 * @returns `[{ id, orderNumber, quotationId, status, origin, dealId, rows, count, amount, confirmedAmount, reportedAmount }]`
 *   เรียงตามเลขใบ
 */
export function carrySourcesFrom(orders = [], rows = []) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => order && !isHistoricalOrder(order) && order.status === 'cancelled'
      && !paymentNotRequired(order.totalAmount) && Number(order.totalAmount) > 0)
    .map((order) => {
      const stranded = sortedRows(list.filter((r) => r.salesOrderId === order.id && strandedInstallment(r, order)));
      const sum = (pick) => stranded.filter(pick).reduce((acc, r) => acc + toCents(r.amount), 0) / 100;
      return {
        id: order.id,
        orderNumber: order.orderNumber || '',
        quotationId: order.quotationId || null,
        /* สถานะ/ที่มาของใบติดไปด้วย — `carryPromptFacts` ตัดสิน "เงินค้างที่เหลือ" ด้วย strandedInstallment(row, source) */
        status: order.status,
        origin: order.origin,
        dealId: order.dealId || null,
        rows: stranded,
        count: stranded.length,
        amount: sum(() => true),
        confirmedAmount: sum((r) => r.status === 'confirmed'),
        reportedAmount: sum((r) => r.status === 'reported'),
      };
    })
    .filter((source) => source.count > 0)
    .sort((a, b) => String(a.orderNumber).localeCompare(String(b.orderNumber)));
}

/**
 * ปุ่ม "ยกเงินจากใบที่ยกเลิก" บนแผงงวดของใบปลายทาง — `{ visible, blocker }` (กติกา ui-visibility)
 * ⭐ ซ่อน: ไม่มีสิทธิ์ · ใบย้อนหลัง · ดีลไม่มีเงินค้าง (ปุ่มที่ไม่มีอะไรให้ทำบนทุกใบ = เสียงรบกวน) · ใบยกเลิก/ถูกแทนแล้ว
 * ⭐ โชว์แล้วบอกเหตุ: ใบยังไม่อนุมัติ (บอกทาง — ยกได้หลังอนุมัติ) · ยอด 0 · บัญชีปิดใบ · ยังไม่มีงวด
 * ⚠️ route ถามเงื่อนไขชุดเดียวกัน (RPC 0378 ตรวจซ้ำใต้ล็อก)
 */
export function carryBlocker(order, rows = [], user = null, sources = []) {
  if (!canCarryInstallments(user)) return { visible: false, blocker: CARRY_FORBIDDEN };
  if (isHistoricalOrder(order)) return { visible: false, blocker: 'ใบสั่งขายย้อนหลังรับเงินที่ยกมาไม่ได้' };
  if (['cancelled', 'revised'].includes(order?.status)) {
    return { visible: false, blocker: 'ใบนี้ยกเลิก/ถูกออก Rev. แล้ว — ยกเงินเข้าไม่ได้' };
  }
  if (!(Array.isArray(sources) && sources.length)) return { visible: false, blocker: 'ดีลนี้ไม่มีเงินค้างจากใบที่ยกเลิก' };
  if (order?.status !== 'approved' || order?.supersededById) {
    return { visible: true, blocker: 'ใบนี้ยังไม่อนุมัติ — ยกเงินเข้าได้หลัง AE Sup อนุมัติใบ' };
  }
  if (paymentNotRequired(order?.totalAmount) || !(Number(order?.totalAmount) > 0)) {
    return { visible: true, blocker: 'ใบนี้ยอดรวม 0 บาท — รับเงินที่ยกมาไม่ได้' };
  }
  if (order?.financeStatus === 'approved') return { visible: true, blocker: 'บัญชีปิดใบนี้แล้ว — ยกเงินเข้าไม่ได้' };
  if (!(Array.isArray(rows) && rows.length)) {
    return { visible: true, blocker: 'ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน' };
  }
  return { visible: true, blocker: null };
}

/* ── เงินก้อนเดียวนับสองครั้ง (review MONEY-1) ───────────────────────────────────────────────────────────────
   🐞 บทเรียน SO-26080039-0 / -043-0 ซ้ำผ่านทางที่จอแนะนำ: ใบใหม่ของดีลเดียวกันถูกตั้งงวดแรกด้วยมัดจำก้อนเดิมอยู่แล้ว
     (freeze ยืมสลิปจากเอกสารยืนยันคำสั่งซื้อ · เงินงวดแรกที่กรอกตอนสร้างใบ) แล้วโมดัลอนุมัติบอกให้กด "ยกเงินจากใบที่ยกเลิก"
     ⇒ ยกมัดจำเดิมเข้ามาอีกแถว — ด่านยกเกินยอดใบจับไม่ได้ (ยอดล็อก + ยอดที่ยก ยังไม่เกินยอดใบ) แล้วลูกค้าไม่ถูกเก็บเงินส่วนนั้นอีกเลย
   ⭐ ซ้ำ = งวดของใบนี้ที่ **แจ้ง/รับรองแล้ว ยังไม่คืนเงิน** ที่ (ก) แนบสลิปไฟล์เดียวกัน (storagePath) หรือ (ข) วันจ่าย + ยอดตรงกัน
     ⇒ ยกไม่ได้ · ทางออก: บัญชีตีกลับ (รอตรวจ) / ถอนคำรับรองแล้วตีกลับ (รับแล้ว) งวดที่ซ้ำบนใบนี้ก่อน — งวดที่ตีกลับเป็นงวดเปิด
       ที่ถูกหักก่อนตอนยก · RPC 0378 ตรวจเกณฑ์เดียวกันใต้ล็อก (installment_carry_duplicate)
   ⭐ ชื่อไฟล์ตรงกันอย่างเดียว = **คำเตือน** ไม่บล็อก — ชื่อสลิปจากมือถือซ้ำกันได้ ("image.jpg") บล็อกแล้วเงินคนละก้อนจริงเป็นทางตัน */
const toKey = (v) => text(v).toLowerCase();
const evidenceOf = (r) => (Array.isArray(r?.evidence) ? r.evidence.filter((f) => f && typeof f === 'object') : []);
const moneyRecordRow = (r) => ['confirmed', 'reported'].includes(r?.status) && !installmentRefunded(r);

/**
 * งวดของใบปลายทางที่ดูเป็นเงินก้อนเดียวกับแถวที่ยก — `[{ target, source, strong, why }]`
 * · strong = บล็อก (สลิปไฟล์เดียวกัน · วันจ่าย + ยอดตรงกัน) · ไม่ strong = เตือน (ชื่อไฟล์ตรงกันอย่างเดียว)
 */
export function carryDuplicates(targetRows = [], carried = []) {
  const out = [];
  for (const t of sortedRows(targetRows).filter(moneyRecordRow)) {
    const tPaths = new Set(evidenceOf(t).map((f) => text(f.storagePath)).filter(Boolean));
    const tNames = new Set(evidenceOf(t).map((f) => toKey(f.fileName)).filter(Boolean));
    for (const c of sortedRows(carried)) {
      const samePath = evidenceOf(c).some((f) => text(f.storagePath) && tPaths.has(text(f.storagePath)));
      const sameDay = Boolean(text(c.paidOn)) && text(c.paidOn) === text(t.paidOn) && toCents(c.amount) === toCents(t.amount);
      if (samePath || sameDay) {
        out.push({
          target: t, source: c, strong: true,
          why: samePath ? 'สลิปไฟล์เดียวกัน' : `วันจ่าย ${fmtDate(c.paidOn)} ยอด ${fmtMoney(c.amount)} ตรงกัน`,
        });
        continue;
      }
      const name = evidenceOf(c).map((f) => toKey(f.fileName)).find((n) => n && tNames.has(n));
      if (name) out.push({ target: t, source: c, strong: false, why: name });
    }
  }
  return out;
}

/** ใบต้นทางของคำขอยก (route) — ใบ pipeline ที่ยกเลิก · ดีลเดียวกัน (D4) · ไม่ใช่ใบเดียวกัน */
export function carrySourceError(target, source) {
  if (!source) return 'ไม่พบใบที่ยกเลิก — โหลดหน้าใหม่แล้วเลือกอีกครั้ง';
  if (source.id === target?.id) return 'ยกเงินเข้าใบเดิมไม่ได้';
  if (isHistoricalOrder(source) || source.status !== 'cancelled') return 'ยกเงินได้เฉพาะจากใบสั่งขายที่ยกเลิกแล้ว';
  if (!source.dealId || source.dealId !== target?.dealId) return 'ยกเงินได้เฉพาะใบของดีลเดียวกัน';
  return null;
}

/**
 * ชุดสุดท้ายทั้งใบของใบปลายทางหลังยกเงินเข้า — ป้อนทั้งโมดัล (ก่อน/หลัง) และ route (p_target_rows ของ RPC 0378)
 *
 * @param order   ใบปลายทาง (ยอดรวม VAT)
 * @param rows    งวดของใบปลายทางทั้งใบ (อ่านสด)
 * @param carried แถวเงินค้างของใบต้นทางที่เลือกยก
 * @returns `{ rows, view, removed, error, errors, totals }`
 *   · rows    = payload ของ RPC เรียงตามเลขงวด `{ id, seq, label, percent, amount, dueDate, coversFrom, coversTo, note }`
 *               (แถวล็อก + แถวที่ยก ออกมาเท่าในฐานทุกช่องยกเว้นเลขงวด/ป้าย/สัดส่วนของแถวที่ยก — แกน 0377 เทียบทีละช่อง)
 *   · view    = rows + `carried` · `lock` · `status` · `beforeSeq`/`beforeAmount` (แถวเดิมของใบนี้) สำหรับตารางในโมดัล
 *   · removed = งวดเปิดที่ถูกหักจนหมด (ถูกลบ — ยังไม่มีการชำระ)
 * ⭐ แถวที่ยกมาก่อน (ตามเลขงวดเดิม) แล้วงวดเปิดที่เหลือ — เติมเลขว่างที่น้อยสุด ข้ามเลขของแถวล็อก
 * ⭐ ยอด: หักงวดเปิดแรก ๆ ก่อนจนครบยอดที่ยก · สัดส่วน = round2(ยอด/ยอดใบ) · แถวเปิดสุดท้าย (ไม่มี = แถวที่ยกสุดท้าย) รับเศษให้ Σ = 100
 */
export function applyCarryIn(order, rows = [], carried = [], { requestById = null } = {}) {
  const current = sortedRows(rows);
  const moving = sortedRows(carried);
  const totalC = toCents(order?.totalAmount);
  const errors = [];
  const lockOf = (r) => installmentReplanLock(r, { requestById });
  if (totalC <= 0) errors.push('ใบนี้ยอดรวม 0 บาท — รับเงินที่ยกมาไม่ได้');
  if (!moving.length) errors.push('ยังไม่ได้เลือกงวดที่จะยกมา');
  if (!current.length) errors.push('ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน');
  for (const r of moving) {
    if (!['confirmed', 'reported'].includes(r.status) || installmentRefunded(r)) {
      errors.push(`งวดที่ ${r.seq} ของใบเดิมยกไม่ได้ — ยกได้เฉพาะงวดที่รับเงินแล้วหรือรอบัญชีตรวจ และยังไม่คืนเงิน`);
    }
  }

  const locked = current.filter(lockOf);
  const open = current.filter((r) => !lockOf(r));
  const lockedC = locked.reduce((sum, r) => sum + toCents(r.amount), 0);
  const openC = open.reduce((sum, r) => sum + toCents(r.amount), 0);
  const carriedC = moving.reduce((sum, r) => sum + toCents(r.amount), 0);
  if (current.length && totalC > 0 && lockedC + openC !== totalC) {
    errors.push(`งวดชำระของใบนี้รวม ${fmtMoney((lockedC + openC) / 100)} ไม่เท่ายอดใบ ${fmtMoney(totalC / 100)} — ให้แอดมินตรวจงวดก่อน`);
  }
  /* ⚠️ ทางออกต้องมีอยู่จริง (review UI-5) — คืนเงินได้ทั้งงวดเท่านั้น (refundValueError/CHECK ไม่มียอด) · งวดที่ยกเหลืองวดเดียว
     ชิปเลือกงวดถอดไม่ได้ ⇒ "คืนเงินส่วนที่เกิน" คือทางที่ไม่มี · ข้อความเดียวกับ installment_carry_overpaid ของ RPC */
  if (totalC > 0 && lockedC + carriedC > totalC) {
    errors.push(`ยอดที่ยกมา ${fmtMoney(carriedC / 100)} รวมกับงวดที่มีเงินอยู่แล้ว ${fmtMoney(lockedC / 100)} เกินยอดใบ`
      + ` ${fmtMoney(totalC / 100)} — ${CARRY_OVERPAID_WAY_OUT}`);
  }
  /* เงินก้อนเดียวนับสองครั้ง (review MONEY-1 · carryDuplicates) — บล็อกเฉพาะที่ชัด · ชื่อไฟล์ตรงอย่างเดียวเป็นคำเตือน */
  const warnings = [];
  for (const dup of carryDuplicates(current, moving)) {
    if (dup.strong) {
      errors.push(`งวดที่ ${dup.target.seq} ของใบนี้ (${CARRY_STATUS_LABEL[dup.target.status] || dup.target.status})`
        + ` เป็นเงินก้อนเดียวกับงวดที่ ${dup.source.seq} ของใบที่ยกเลิก (${dup.why}) — ยกซ้ำ = นับเงินสองครั้ง`
        + ` · ${CARRY_DUPLICATE_WAY_OUT}`);
    } else {
      warnings.push(`งวดที่ ${dup.target.seq} ของใบนี้แนบสลิปชื่อเดียวกับงวดที่ ${dup.source.seq} ของใบที่ยกเลิก (${dup.why})`
        + ' — ตรวจว่าไม่ใช่เงินก้อนเดียวกันก่อนยก');
    }
  }

  // ── หักงวดเปิดแรก ๆ ก่อน ──
  let left = carriedC;
  const kept = [];
  const removed = [];
  for (const r of open) {
    const amountC = toCents(r.amount);
    if (left >= amountC) { left -= amountC; removed.push(r); continue; }
    kept.push({ row: r, amountC: amountC - left });
    left = 0;
  }

  const count = locked.length + moving.length + kept.length;
  if (count > MAX_INSTALLMENTS) errors.push(`แบ่งงวดได้ไม่เกิน ${MAX_INSTALLMENTS} งวด (หลังยก ${count} งวด)`);

  // ── เลขงวด: แถวล็อกคงเดิม · แถวที่ยกก่อน แล้วงวดเปิดที่เหลือ เติมเลขว่างที่น้อยสุด ──
  const lockedSeqs = new Set(locked.map((r) => Number(r.seq)));
  let next = 1;
  const nextSeq = () => {
    while (lockedSeqs.has(next)) next += 1;
    const seq = next;
    next += 1;
    return seq;
  };
  /* ⚠️ ป้ายส่งแบบดิบ — แถวล็อกต้องเท่าในฐานทุกช่อง (แกน 0377 เทียบป้ายแบบ IS NOT DISTINCT FROM) · แถวที่ยก/แถวเปิดได้ป้าย
     ที่ตัดแล้วจาก labelFor (RPC/แกนเขียน btrim ลงฐานเอง)
     ⭐ `billingDate`/`billingEvent` (กำหนดวางบิล · mig 0389) พกไปด้วยให้แถวของแผนครบรูป (จอ/audit เห็นวันวางบิลของงวดที่ยก)
       — **ไม่ได้แก้ RPC 0377/0378 โดยตั้งใจ**: แกน `_so_installments_write_plan` อ่านเฉพาะคีย์ที่รู้จัก (คีย์เกินถูกข้าม)
       และ ④ UPDATE ไม่เอ่ยสองคอลัมน์นี้ ⇒ แถวเดิม (ทั้งแถวที่ยก = ย้ายทั้งแถว และงวดเปิดที่ถูกหัก) **คงวันวางบิลเดิม**
       · แถวใหม่ของ ⑤ INSERT ไม่มีในเส้นยกเงิน (ยกแถวเดิมเท่านั้น) · แก้ RPC จากไฟล์เมื่อไร = ย้อนสิทธิ์ที่ 0382/0385
       ปะแก้ไว้ในฐาน (ดู installmentReplanMigration.test.mjs) */
  const payload = (r) => ({
    id: r.id,
    seq: Number(r.seq),
    label: r.label == null ? '' : String(r.label),
    percent: Number(r.percent) || 0,
    amount: Number(r.amount) || 0,
    dueDate: r.dueDate || null,
    coversFrom: r.coversFrom || null,
    coversTo: r.coversTo || null,
    note: text(r.note) || null,
    billingDate: r.billingDate || null,
    billingEvent: text(r.billingEvent) || null,
  });
  const movedRows = moving.map((r) => {
    const seq = nextSeq();
    return { ...payload(r), seq, label: labelFor(r.label, seq), percent: 0, _carried: true, _status: r.status };
  });
  const keptRows = kept.map(({ row, amountC }) => {
    const seq = nextSeq();
    return {
      ...payload(row), seq, label: labelFor(row.label, seq), percent: 0, amount: amountC / 100,
      _status: row.status || 'pending', _beforeSeq: Number(row.seq), _beforeAmount: Number(row.amount) || 0,
    };
  });

  // ── สัดส่วน: round2(ยอด/ยอดใบ) · แถวเปิดสุดท้าย (ไม่มี = แถวที่ยกสุดท้าย) รับเศษ ──
  const lockedPct = locked.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  const flexible = [...movedRows, ...keptRows];
  flexible.forEach((r) => { r.percent = totalC > 0 ? round2((toCents(r.amount) / totalC) * 100) : 0; });
  const absorber = keptRows.length ? keptRows[keptRows.length - 1] : movedRows[movedRows.length - 1];
  if (absorber) {
    const others = flexible.filter((r) => r !== absorber).reduce((sum, r) => sum + r.percent, 0);
    absorber.percent = round2(100 - lockedPct - others);
    if (absorber.percent < 0 || absorber.percent > 100) {
      errors.push(`สัดส่วนของงวดที่ ${absorber.seq} ออกนอกช่วง 0–100% — ตรวจยอดของงวดที่ล็อก`);
    }
  }

  const view = [
    ...locked.map((r) => ({ ...payload(r), carried: false, lock: lockOf(r), status: r.status || 'pending', beforeSeq: Number(r.seq), beforeAmount: Number(r.amount) || 0 })),
    ...movedRows.map(({ _carried, _status, ...r }) => ({ ...r, carried: true, lock: null, status: _status, beforeSeq: null, beforeAmount: null })),
    ...keptRows.map(({ _status, _beforeSeq, _beforeAmount, ...r }) => ({
      ...r, carried: false, lock: null, status: _status, beforeSeq: _beforeSeq, beforeAmount: _beforeAmount,
    })),
  ].sort(bySeq);
  const finalRows = view.map(payload);
  const sumC = finalRows.reduce((sum, r) => sum + toCents(r.amount), 0);

  return {
    rows: finalRows,
    view,
    removed: removed.map((r) => ({ id: r.id, seq: Number(r.seq), label: text(r.label), amount: Number(r.amount) || 0 })),
    errors,
    error: errors.length ? errors.join(' · ') : null,
    warnings,
    totals: {
      total: totalC / 100,
      carried: carriedC / 100,
      locked: lockedC / 100,
      sum: sumC / 100,
      percentSum: round2(view.reduce((sum, r) => sum + (Number(r.percent) || 0), 0)),
    },
  };
}

/** `p_expected` ของ RPC 0378 — ทุกแถวของใบปลายทาง + แถวที่ยก (ตามที่ตาเห็นตอนเปิดโมดัล · ห้ามแปลงรูปเวลา) */
export function carryExpected(targetRows = [], carriedRows = []) {
  return replanExpected([...(Array.isArray(targetRows) ? targetRows : []), ...(Array.isArray(carriedRows) ? carriedRows : [])]);
}

/** ข้อมูลเก่า — เกณฑ์เดียวกับ RPC (ครบทุกแถว + updatedAt ตรงทุกแถว) · route ตอบ 409 เร็วก่อนเรียก RPC */
export function carryStale(targetRows = [], carriedRows = [], expected = null) {
  return replanStale([...(Array.isArray(targetRows) ? targetRows : []), ...(Array.isArray(carriedRows) ? carriedRows : [])], expected);
}

/**
 * ข้อเท็จจริงที่จัดรูปแล้วสำหรับ `paymentCarryPrompt` (lib/approvalPrompt.js import ต่อไม่ได้ — หัวไฟล์นั้น)
 * @param before     งวดของใบปลายทางก่อนยก · @param carried แถวที่ยก · @param built ผลของ `applyCarryIn`
 * @param sourceRows งวดเงินค้างทั้งหมดของใบต้นทาง — บอกว่ายกแล้วใบเดิมยังเหลือเงินค้างเท่าไร
 */
export function carryPromptFacts(order, source, before = [], carried = [], built = null, { sourceRows = [] } = {}) {
  const moving = sortedRows(carried);
  const movingIds = new Set(moving.map((r) => r.id));
  const finalRows = Array.isArray(built?.rows) ? built.rows : [];
  const viewById = new Map((Array.isArray(built?.view) ? built.view : []).map((v) => [v.id, v]));
  const reported = moving.filter((r) => r.status === 'reported');
  const remaining = (Array.isArray(sourceRows) ? sourceRows : [])
    .filter((r) => r && !movingIds.has(r.id) && strandedInstallment(r, source));
  const sumOf = (list) => list.reduce((acc, r) => acc + toCents(r.amount), 0) / 100;
  const statusOf = new Map([...sortedRows(before), ...moving].map((r) => [r.id, r.status || 'pending']));
  return {
    orderNumber: order?.orderNumber || '',
    sourceNumber: source?.orderNumber || '',
    count: moving.length,
    amountLabel: fmtMoney(sumOf(moving)),
    reportedCount: reported.length,
    reportedAmountLabel: fmtMoney(sumOf(reported)),
    invoiceNos: [...new Set(moving.map((r) => text(r.taxInvoiceNo)).filter(Boolean))],
    carriedLines: finalRows.filter((r) => movingIds.has(r.id)).map((r) => {
      const status = viewById.get(r.id)?.status || statusOf.get(r.id);
      return `ยกมาเป็นงวดที่ ${r.seq}: ${r.label} ${fmtMoney(r.amount)} · ${CARRY_STATUS_LABEL[status] || status}`;
    }),
    changes: replanDiff(before, finalRows.filter((r) => !movingIds.has(r.id))).map(replanChangeLine),
    totalLabel: fmtMoney(order?.totalAmount),
    actualAmountLabel: fmtMoney(order?.actualAmount),
    actualMonthLabel: actualMonthLabel(order),
    quotationNumber: text(order?.quotation?.quoteNumber),
    remainingCount: remaining.length,
    remainingAmountLabel: fmtMoney(sumOf(remaining)),
    /* คำเตือนสลิปชื่อซ้ำ (carryDuplicates · review MONEY-1) — ต้องถึงโมดัลยืนยันด้วย ไม่ใช่เห็นแต่ในตาราง */
    warnings: Array.isArray(built?.warnings) ? built.warnings : [],
    complete: finalRows.length > 0 && finalRows.every((r) => statusOf.get(r.id) === 'confirmed'),
  };
}

/** สรุป audit ของการยกเงิน (ลงทั้งใบปลายทางและใบต้นทาง) */
export function carryAuditSummary({ fromNumber, toNumber, carried, reason } = {}) {
  const c = carried && typeof carried === 'object' ? carried : {};
  return `ยกเงินจากใบที่ยกเลิก ${fromNumber} → ${toNumber}: ${Number(c.count) || 0} งวด ${fmtMoney(c.amount)}`
    + ` (รับแล้ว ${Number(c.confirmedCount) || 0} · รอบัญชีตรวจ ${Number(c.reportedCount) || 0}) · ${text(reason)}`;
}

/** งวดนี้ยกมาจากใบไหน — รายการ `carry` ล่าสุดของ movedFrom (ป้าย "ยกมาจาก …" บนแผงของใบปลายทาง) */
export function carriedFromOf(row) {
  const moved = Array.isArray(row?.movedFrom) ? row.movedFrom : [];
  const hit = [...moved].reverse().find((m) => m && typeof m === 'object' && m.reason === 'carry');
  return hit ? { salesOrderId: hit.salesOrderId || null, orderNumber: text(hit.orderNumber) } : null;
}

/**
 * ลิงก์ "ยกไป {SO}" บนใบที่ยกเลิก — จับกลุ่มแถวที่ยกออกไป (store.loadMovedOut) ตามใบที่ถืองวดอยู่ตอนนี้
 * ⚠️ ใบที่ถืองวดอยู่ตอนนี้อาจเป็นใบ Rev. ของใบที่รับเงินไป (งวดย้ายต่อด้วย 0376) — ลิงก์ไปที่เงินอยู่จริงเสมอ
 */
export function carriedAwayGroups(movedOut = []) {
  const groups = new Map();
  for (const m of Array.isArray(movedOut) ? movedOut : []) {
    if (!m || m.reason !== 'carry') continue;
    const key = m.salesOrderId || m.orderNumber;
    const group = groups.get(key) || { salesOrderId: m.salesOrderId || null, orderNumber: text(m.orderNumber), count: 0, amountC: 0 };
    group.count += 1;
    group.amountC += toCents(m.amount);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ amountC, ...g }) => ({ ...g, amount: amountC / 100 }));
}
