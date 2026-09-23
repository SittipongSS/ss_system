// ── ปรับแผนงวดชำระหลังอนุมัติ (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09) — logic ล้วน ─────
//
// ⭐ คำขอ B ของเจ้าของ: ใบที่อนุมัติแล้วปรับแผนงวดได้ **โดยไม่ต้องย้อนการอนุมัติ** (D1: AE Sup/admin กดเอง ·
//   ต้องมีเหตุผล · โมดัลยืนยัน · audit) — ใบยังอนุมัติอยู่ ⇒ ยอด Actual และเดือน Actual ไม่ขยับ
// ⭐ หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว":
//   · แถวที่มีเงินหรือมีเอกสารผูก (installmentReplanLock) **ไม่ถูกแตะ** — ยอด/เลขงวด/หลักฐาน/ใบกำกับคงเดิม
//   · แถวเปิด (pending/rejected ที่ไม่มีอะไรผูก) แก้ป้าย ยอด วันครบกำหนด ช่วงครอบ หมายเหตุได้ ลบได้ เพิ่มได้
//   · Σ ยอดทุกงวด = ยอดใบ (รวม VAT) ถึงสตางค์ · Σ สัดส่วน = 100% (±0.01) · 1–12 งวด
// ⭐ ไฟล์นี้คำนวณ "ชุดสุดท้ายทั้งใบ" (เลขงวด · สัดส่วน · ยอด) ให้ทั้งจอและ route — RPC ของ 0377 เป็นยามอย่างเดียว
//   (นิยามแถวล็อกตัวเดียวกับ `public._so_installment_replan_locked` · เกณฑ์ Σ ตัวเดียวกับ RPC)
// 🔴 **ไม่มีอะไรในไฟล์นี้แตะยอด Actual** — ผลลัพธ์เป็นแถวงวดล้วน (ไม่มี totalAmount/actualAmount/approvedAt)
//   และ RPC ไม่เขียน sales_orders ⇒ trigger sync_sales_order_actual ไม่ตื่น (หัวไฟล์ salesOrderPayments.js)
import { fmtDate, fmtMoney, fmtPercent } from '@/lib/format';
import { currentMonth, formatMonthLabel } from '@/lib/datePeriods';
import { MAX_INSTALLMENTS } from '@/lib/sales/paymentPlan';
import { coverageWarnings, paidThrough } from '@/lib/sales/paymentCoverage';
import {
  MIN_REJECT_REASON, installmentStale, installmentsFromPaymentPlan, paymentNotRequired,
} from '@/lib/sales/salesOrderPayments';
import { OPENING_INSTALLMENT_LABEL, isHistoricalOrder, isOpeningInstallment } from '@/lib/sales/historicalOrders';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';

/** ป้ายบนแผงงวดและทะเบียนบัญชี (มติ D5 — ฉบับพิมพ์ยังแสดงแผนตาม QT) */
export const REPLANNED_BADGE = 'ปรับแผนหลังอนุมัติ';
export const REPLANNED_BADGE_TITLE = 'งวดชำระถูกปรับหลังอนุมัติ — ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา';
export const REPLAN_DONE_MESSAGE = 'ปรับแผนงวดแล้ว — ยอด Actual ไม่เปลี่ยน';
export const REPLAN_VAT_NOTE = 'ยอดรวมต้องเท่ายอดใบรวม VAT — ภาษีหัก ณ ที่จ่ายไม่ต้องหักในงวด';
export const REPLAN_MAX_REASON = 500;
export const REPLAN_FORBIDDEN = 'ปรับแผนงวดหลังอนุมัติได้เฉพาะ AE Sup และแอดมิน';
/* RPC 0377 ยังไม่มีบนฐาน (PGRST202) — ห้ามถอยไปเขียนงวดเองทีละแถว (ข้ามด่าน Σ/แถวล็อก/ข้อมูลเก่า) */
export const INSTALLMENT_REPLAN_SCHEMA_MISSING = 'ฐานยังไม่ได้รัน 0377 (ปรับแผนงวดหลังอนุมัติ) — แจ้งผู้ดูแลระบบ';

const text = (v) => String(v ?? '').trim();
const toCents = (v) => Math.round((Number(v) || 0) * 100);
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const bySeq = (a, b) => (Number(a?.seq) || 0) - (Number(b?.seq) || 0);
const sortedRows = (rows) => [...(Array.isArray(rows) ? rows : [])].filter(Boolean).sort(bySeq);
const lookup = (map, id) => (map instanceof Map ? map.get(id) : map?.[id]) || null;
/* ป้ายที่ระบบตั้งให้ — เดินตามเลขงวด · ป้ายที่คนตั้งเอง ("มัดจำ") คงไว้ */
const AUTO_LABEL = /^งวดที่ \d+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v) => ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && v >= '2000-01-01' && v <= '2100-12-31';

/**
 * แถวนี้ **ล็อก** ไหมตอนปรับแผน — คืนเหตุผลไทย หรือ null (= แถวเปิด)
 * ⚠️ นิยามเดียวกับ `public._so_installment_replan_locked` ของ 0377 ทุกข้อ (ปุ่ม · จอ · API · SQL ตอบคำเดียวกัน)
 * ⭐ ลำดับ: สถานะเงินก่อนเอกสาร — งวดที่รับเงินแล้วบอก "รับเงินแล้ว" แม้มีใบกำกับด้วย
 * ⚠️ `rejected` = เปิด (มติแผน PR2): บัญชีตีกลับแล้ว เงินยังไม่ถูกนับ · สถานะคงไว้ให้ SA แจ้งใหม่
 * @param requestById Map|object ของคำร้องขอวางบิล (order.billingRequests) — ใช้บอกเลขคำร้องในเหตุผล
 */
export function installmentReplanLock(row, { requestById = null } = {}) {
  if (!row) return null;
  const status = row.status || 'pending';
  if (status === 'confirmed') return 'รับเงินแล้ว';
  if (status === 'reported') return 'รอบัญชีตรวจ — ผู้แจ้งดึงกลับหรือบัญชีตีกลับก่อน';
  const invoice = text(row.taxInvoiceNo);
  if (invoice) return `มีใบกำกับภาษี ${invoice}`;
  const requestId = text(row.billingRequestId);
  if (requestId) {
    const docNo = text(lookup(requestById, requestId)?.docNo);
    return `ผูกคำร้องขอวางบิล${docNo ? ` ${docNo}` : ''} — ถอดคำร้องก่อน (เมนูแถว)`;
  }
  if (isOpeningInstallment(row)) return `${OPENING_INSTALLMENT_LABEL} — เงินที่เก็บก่อนเข้าระบบ แก้ไม่ได้`;
  const hasEvidence = Array.isArray(row.evidence) && row.evidence.length > 0;
  if (status === 'pending' && (hasEvidence || row.paidOn)) return 'มีหลักฐานการจ่ายค้างอยู่';
  return null;
}

/**
 * ปุ่ม "ปรับแผนงวด" — `{ visible, blocker }` (กติกา ui-visibility: ไม่มีสิทธิ์/ไม่เกี่ยว = ซ่อน · ติดด่าน = โชว์แล้วบอกเหตุ)
 * ⚠️ route ถามตัวเดียวกัน — `blocker` ของกรณีซ่อนคือคำที่ API ตอบ (ปุ่มไม่มีให้กดอยู่แล้ว)
 * ⭐ ซ่อน: ไม่ใช่ AE Sup/admin (D1) · ใบย้อนหลัง (งวดมาจากฟอร์มคีย์ใบ — กติกาเดิมทุกข้อ) · ใบที่ไม่ใช่ approved
 *   หรือถูกแทนแล้ว (ใบร่าง/รออนุมัติ/ย้อนการอนุมัติยังไม่ตรึงยอด หรือแก้ทาง Rev.) · ใบยอด 0 (ไม่มีงวด)
 * ⭐ โชว์แต่บอกเหตุ: บัญชีปิดใบ · ยังไม่มีงวด · ทุกงวดล็อก
 */
export function installmentReplanBlocker(order, rows = [], user = null) {
  if (!isSalesOrderReviewer(user?.role)) return { visible: false, blocker: REPLAN_FORBIDDEN };
  if (isHistoricalOrder(order)) {
    return { visible: false, blocker: 'ใบสั่งขายย้อนหลังแก้งวดที่ฟอร์มคีย์ใบ — ปรับแผนงวดหลังอนุมัติไม่ได้' };
  }
  if (order?.status !== 'approved' || order?.supersededById) {
    return { visible: false, blocker: 'ปรับแผนงวดได้เฉพาะใบสั่งขายที่อนุมัติแล้ว' };
  }
  if (paymentNotRequired(order?.totalAmount) || !(Number(order?.totalAmount) > 0)) {
    return { visible: false, blocker: 'ใบนี้ยอดรวม 0 บาท — ไม่มีงวดชำระให้ปรับ' };
  }
  if (order?.financeStatus === 'approved') return { visible: true, blocker: 'บัญชีปิดใบนี้แล้ว — ปรับแผนงวดไม่ได้' };
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return { visible: true, blocker: 'ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ก่อน' };
  if (list.every((r) => installmentReplanLock(r))) {
    return { visible: true, blocker: 'ทุกงวดรับเงินหรือมีเอกสารผูกแล้ว — ไม่มีงวดที่ปรับได้' };
  }
  return { visible: true, blocker: null };
}

/** ร่างตั้งต้นของตัวแก้ = แถวเปิดของใบตามลำดับงวด (แถวล็อกไม่อยู่ในร่าง — คงเดิมเสมอ) */
export function replanDraftFrom(rows = [], { requestById = null } = {}) {
  return sortedRows(rows)
    .filter((r) => !installmentReplanLock(r, { requestById }))
    .map((r) => ({
      id: r.id,
      label: r.label || '',
      amount: Number(r.amount) || 0,
      percent: Number(r.percent) || 0,
      dueDate: r.dueDate || '',
      coversFrom: r.coversFrom || '',
      coversTo: r.coversTo || '',
      note: r.note || '',
    }));
}

/** `p_expected` ของ RPC — ทุกแถวที่ตาเห็นตอนเปิดตัวแก้ (id + updatedAt ตามที่ API ส่งมา ห้ามแปลงรูปเวลา) */
export function replanExpected(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(Boolean).map((r) => ({ id: r.id, updatedAt: r.updatedAt }));
}

/* ── ข้อมูลเก่า (ตัวแก้เปิดค้างขณะอีกหน้าต่างแจ้งชำระ/รับรอง/ตั้งวัน) ──────────────────────────────────────
   ⭐ route ถามตัวนี้ก่อนเรียก RPC (ตอบ 409 เร็ว) · RPC ตรวจซ้ำใต้ล็อกด้วยเกณฑ์เดียวกัน (ครบทุกแถว + updatedAt ตรงทุกแถว)
   ⭐ แผงใช้บอก "แผนที่แก้ค้างอยู่อิงข้อมูลเก่า" หลังได้ 409 แล้วหน้าโหลดงวดใหม่มา
   ⚠️ เทียบเวลาด้วย `installmentStale` ตัวเดียวกับ PATCH รายงวด (รูปต่างแต่เวลาเดียวกันไม่ใช่ "เก่า") */
export const REPLAN_STALE_MESSAGE = 'งวดของใบนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่แล้วปรับแผนอีกครั้ง';

export function replanStale(rows = [], expected = null) {
  if (!Array.isArray(expected)) return true;
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (list.length !== expected.length) return true;
  const seen = new Map(expected.filter(Boolean).map((e) => [text(e.id), e.updatedAt]));
  if (seen.size !== list.length) return true;
  return list.some((r) => !seen.has(r.id) || !text(seen.get(r.id)) || installmentStale(r, seen.get(r.id)));
}

/** เกลี่ยยอดที่เหลือเท่ากัน — ปัดลงรายสตางค์ งวดสุดท้ายรับเศษ (กติกาเดียวกับ evenPercents/computeInstallments) */
export function replanEvenAmounts(remaining, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return [];
  const totalC = toCents(remaining);
  const base = Math.floor(totalC / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalC - base * (n - 1) : base) / 100);
}

/** เกลี่ยสัดส่วนที่เหลือเท่ากัน (หน่วย 0.01%) — งวดสุดท้ายรับเศษ (กติกาเดียวกับ paymentPlan.evenPercents) */
export function replanEvenPercents(remainingPercent, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!n) return [];
  const total = Math.round((Number(remainingPercent) || 0) * 100);
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base) / 100);
}

/**
 * ครบกำหนดรายเดือน — วันเดียวกันของทุกเดือนนับจากงวดแรก · เดือนที่สั้นกว่าใช้วันสุดท้ายของเดือน
 * ⚠️ เลขคณิตปฏิทินล้วน (ไม่มีโซนเวลา) — สตริง ISO เข้า สตริง ISO ออก
 */
export function monthlyDueDates(firstIso, count) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(firstIso));
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!match || !n) return [];
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return Array.from({ length: n }, (_, i) => {
    const index = month - 1 + i;
    const y = year + Math.floor(index / 12);
    const m = index % 12;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  });
}

/* ── ก่อน/หลัง ─────────────────────────────────────────────────────────────── */
const CHANGE_FIELDS = ['seq', 'label', 'percent', 'amount', 'dueDate', 'coversFrom', 'coversTo', 'note'];
const sameField = (field, a, b) => {
  if (field === 'amount') return toCents(a) === toCents(b);
  if (field === 'percent') return Math.round((Number(a) || 0) * 100) === Math.round((Number(b) || 0) * 100);
  if (field === 'seq') return Number(a) === Number(b);
  return (text(a) || null) === (text(b) || null);
};
const DIFF_RANK = { removed: 0, changed: 1, added: 2 };

/**
 * เทียบชุดก่อน (แถวในฐาน) กับชุดหลัง (ผลของ `buildReplanRows`) — จับคู่ด้วย id
 * @returns `[{ kind: 'removed'|'changed'|'added', before, after, fields? }]` เรียงตามเลขงวด (แถวที่ไม่เปลี่ยนไม่ขึ้น)
 */
export function replanDiff(before = [], after = []) {
  const prev = sortedRows(before);
  const next = sortedRows(after);
  const nextById = new Map(next.filter((r) => r.id).map((r) => [r.id, r]));
  const out = [];
  for (const b of prev) {
    const a = nextById.get(b.id);
    if (!a) { out.push({ kind: 'removed', before: b, after: null }); continue; }
    const fields = CHANGE_FIELDS.filter((f) => !sameField(f, b[f], a[f]));
    if (fields.length) out.push({ kind: 'changed', before: b, after: a, fields });
  }
  for (const a of next) if (!a.id) out.push({ kind: 'added', before: null, after: a });
  const key = (d) => (Number((d.kind === 'removed' ? d.before : d.after)?.seq) || 0) * 10 + DIFF_RANK[d.kind];
  return out.sort((x, y) => key(x) - key(y));
}

/**
 * ชุดสุดท้าย **ทั้งใบ** ของการปรับแผน — ป้อนทั้งจอ (พรีวิว/ยอดวิ่ง) และ route (payload ของ RPC)
 *
 * @param rows   แถวงวดในฐานทั้งใบ (อ่านสด)
 * @param draft  แถวเปิดตามลำดับในตัวแก้ `[{ id|null, label, amount|percent, dueDate, coversFrom, coversTo, note }]`
 *               ⚠️ มีเฉพาะแถวเปิด — แถวล็อกยกมาจาก `rows` ตามเดิมเสมอ · แถวเปิดที่ไม่อยู่ในร่าง = ลบ
 * @param unit   'amount' (บาท · ทาง API เสมอ) | 'percent' (สัดส่วนของยอดใบ — จอแปลงเป็นบาทด้วยตัวนี้ก่อนส่ง)
 * @returns `{ rows, view, error, errors, warnings, totals }`
 *   · rows  = payload ของ RPC เรียงตามเลขงวด `{ id, seq, label, percent, amount, dueDate, coversFrom, coversTo, note }`
 *            (แถวล็อกออกมาเท่าในฐานทุกช่อง — RPC เทียบทีละช่อง)
 *   · view  = rows + `lock` (เหตุผล) · `status` · `draftIndex` (ชี้กลับแถวร่าง) สำหรับวาดตาราง
 *   · error = ทุกข้อที่ยังไม่ผ่านในข้อความเดียว (กติกาฟอร์ม: ด่านรวมข้อความเดียว) หรือ null
 * ⭐ ยอดคิดเป็นสตางค์ (จำนวนเต็ม) — โหมด % แถวเปิดสุดท้ายรับเศษยอด · สัดส่วน = round2(ยอด/ยอดใบ) แถวเปิดสุดท้ายทำให้ Σ = 100
 * ⭐ เลขงวด: แถวล็อกคงเลขเดิม · แถวเปิดเติมเลขว่างที่น้อยสุดตามลำดับในตัวแก้ · ป้าย "งวดที่ N"/ว่าง เดินตามเลข
 */
export function buildReplanRows(order, rows = [], draft = [], { unit = 'amount', serviceRounds = false, requestById = null } = {}) {
  const current = sortedRows(rows);
  const entries = Array.isArray(draft) ? draft : [];
  const totalC = toCents(order?.totalAmount);
  const errors = [];
  const lockOf = (r) => installmentReplanLock(r, { requestById });
  const byId = new Map(current.map((r) => [r.id, r]));
  const locked = current.filter((r) => lockOf(r));
  const lockedSeqs = new Set(locked.map((r) => Number(r.seq)));
  if (totalC <= 0) errors.push('ใบนี้ยอดรวม 0 บาท — ไม่มีงวดชำระให้ปรับ');

  // ── id ของแถวร่างต้องเป็นแถวเปิดของใบนี้ ──
  const seen = new Set();
  let unknown = false;
  let duplicate = false;
  for (const entry of entries) {
    const id = text(entry?.id);
    if (!id) continue;
    if (seen.has(id)) duplicate = true;
    seen.add(id);
    const existing = byId.get(id);
    if (!existing) { unknown = true; continue; }
    const why = lockOf(existing);
    if (why) errors.push(`งวดที่ ${existing.seq} ล็อกอยู่ (${why}) — แก้ในแผนนี้ไม่ได้`);
  }
  if (unknown) errors.push('มีงวดที่ไม่ใช่งวดของใบนี้ — โหลดใหม่แล้วลองอีกครั้ง');
  if (duplicate) errors.push('มีงวดซ้ำกันในแผน — โหลดใหม่แล้วลองอีกครั้ง');

  const count = locked.length + entries.length;
  if (count < 1) errors.push('แผนต้องมีอย่างน้อย 1 งวด');
  if (count > MAX_INSTALLMENTS) errors.push(`แบ่งงวดได้ไม่เกิน ${MAX_INSTALLMENTS} งวด (ตอนนี้ ${count} งวด)`);

  // ── เลขงวด: เติมเลขว่างที่น้อยสุด ข้ามเลขของแถวล็อก ──
  let next = 1;
  const seqs = entries.map(() => {
    while (lockedSeqs.has(next)) next += 1;
    const seq = next;
    next += 1;
    return seq;
  });

  // ── ยอด (สตางค์) ──
  const lockedC = locked.reduce((sum, r) => sum + toCents(r.amount), 0);
  const lockedPct = locked.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  let amountsC;
  let percentBroken = false;
  if (unit === 'percent') {
    const pcts = entries.map((entry) => {
      const raw = entry?.percent;
      const n = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
      return Number.isFinite(n) ? round2(n) : NaN;
    });
    pcts.forEach((p, i) => { if (!Number.isFinite(p)) errors.push(`ยังไม่ได้ใส่สัดส่วนงวดที่ ${seqs[i]}`); });
    const pctSum = round2(lockedPct + pcts.reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0));
    amountsC = pcts.map((p) => (Number.isFinite(p) ? Math.round((totalC * p) / 100) : NaN));
    if (Math.abs(pctSum - 100) > 0.01 + 1e-9) {
      percentBroken = true;
      errors.push(`สัดส่วนรวมต้องเท่ากับ 100% (ตอนนี้ ${fmtPercent(pctSum)})`);
    } else if (entries.length && amountsC.every(Number.isFinite)) {
      // แถวเปิดสุดท้ายรับเศษ — Σ ยอดเท่ายอดใบถึงสตางค์ (กติกาเดียวกับ paymentPlan.computeInstallments)
      const others = amountsC.slice(0, -1).reduce((sum, c) => sum + c, 0);
      amountsC[amountsC.length - 1] = totalC - lockedC - others;
    }
  } else {
    amountsC = entries.map((entry, i) => {
      const raw = entry?.amount;
      const n = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(n)) { errors.push(`ยังไม่ได้ใส่ยอดงวดที่ ${seqs[i]}`); return NaN; }
      if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) errors.push(`ยอดงวดที่ ${seqs[i]} มีทศนิยมเกิน 2 ตำแหน่ง`);
      return Math.round(n * 100);
    });
  }
  amountsC.forEach((c, i) => { if (Number.isFinite(c) && c <= 0) errors.push(`ยอดงวดที่ ${seqs[i]} ต้องมากกว่า 0`); });

  const sumC = lockedC + amountsC.reduce((sum, c) => sum + (Number.isFinite(c) ? c : 0), 0);
  if (!percentBroken && totalC > 0 && sumC !== totalC && amountsC.every(Number.isFinite)) {
    const diff = totalC - sumC;
    errors.push(`ยอดรวมทุกงวด ${fmtMoney(sumC / 100)} ไม่เท่ายอดใบ ${fmtMoney(totalC / 100)} (รวม VAT) — `
      + `${diff > 0 ? 'ขาด' : 'เกิน'} ${fmtMoney(Math.abs(diff) / 100)}`);
  }

  // ── แถวเปิด: ป้าย · วัน · หมายเหตุ ──
  const open = entries.map((entry, i) => {
    const seq = seqs[i];
    const given = text(entry?.label);
    const label = !given || AUTO_LABEL.test(given) ? `งวดที่ ${seq}` : given;
    if (label.length > 120) errors.push(`ชื่องวดที่ ${seq} ยาวเกิน 120 ตัวอักษร`);
    const note = text(entry?.note) || null;
    if (note && note.length > 1000) errors.push(`หมายเหตุงวดที่ ${seq} ยาวเกิน 1,000 ตัวอักษร`);
    const [dueDate, coversFrom, coversTo] = [entry?.dueDate, entry?.coversFrom, entry?.coversTo].map((v) => text(v) || null);
    if ([dueDate, coversFrom, coversTo].some((v) => v && !validDay(v))) {
      errors.push(`วันที่ของงวดที่ ${seq} ไม่ถูกต้อง (ปี ค.ศ. 2000–2100)`);
    } else if (coversFrom && coversTo && coversFrom > coversTo) {
      errors.push(`งวดที่ ${seq}: วันเริ่มช่วงครอบต้องไม่เกินวันสิ้นสุด`);
    }
    return {
      id: text(entry?.id) || null, seq, label, percent: 0,
      amount: Number.isFinite(amountsC[i]) ? amountsC[i] / 100 : 0,
      dueDate, coversFrom, coversTo, note, draftIndex: i,
    };
  });
  if (serviceRounds) {
    const missing = open.filter((r) => !r.dueDate).map((r) => `งวดที่ ${r.seq}`);
    if (missing.length) errors.push(`ใบบริการต้องมีวันครบกำหนดทุกงวดที่ปรับ (${missing.join(', ')})`);
  }

  // ── สัดส่วน: round2(ยอด/ยอดใบ) · แถวเปิดสุดท้ายทำให้ Σ = 100 ──
  open.forEach((r, i) => {
    if (i < open.length - 1) r.percent = totalC > 0 ? round2((toCents(r.amount) / totalC) * 100) : 0;
  });
  if (open.length) {
    const last = open[open.length - 1];
    const others = open.slice(0, -1).reduce((sum, r) => sum + r.percent, 0);
    last.percent = round2(100 - lockedPct - others);
    if (last.percent < 0 || last.percent > 100) {
      errors.push(`สัดส่วนของงวดที่ ${last.seq} ออกนอกช่วง 0–100% — ตรวจยอดของงวดที่ล็อก`);
    }
  } else if (Math.abs(round2(lockedPct) - 100) > 0.01 + 1e-9) {
    errors.push(`สัดส่วนรวมทุกงวดต้องเท่ากับ 100% (ตอนนี้ ${fmtPercent(lockedPct)})`);
  }

  const payload = (r) => ({
    id: r.id,
    seq: Number(r.seq),
    label: r.label,
    percent: Number(r.percent),
    amount: Number(r.amount),
    dueDate: r.dueDate ?? null,
    coversFrom: r.coversFrom ?? null,
    coversTo: r.coversTo ?? null,
    note: r.note ?? null,
  });
  const view = [
    ...locked.map((r) => ({ ...payload(r), lock: lockOf(r), status: r.status || 'pending', draftIndex: null })),
    ...open.map((r) => ({
      ...payload(r), lock: null, status: byId.get(r.id)?.status || 'pending', draftIndex: r.draftIndex,
    })),
  ].sort(bySeq);
  const finalRows = view.map(payload);

  if (!errors.length && !replanDiff(current, finalRows).length) {
    errors.push('แผนยังไม่เปลี่ยน — แก้ยอด วันครบกำหนด หรือจำนวนงวดก่อนบันทึก');
  }

  const warnings = serviceRounds
    ? [...new Set(coverageWarnings(view).map((w) => ({
      overlap: 'มีช่วงครอบที่ซ้อนทับกัน',
      gap: 'มีช่วงบริการที่ไม่มีงวดไหนครอบ',
      half_range: 'มีงวดที่กรอกช่วงครอบมาข้างเดียว',
    })[w.kind]).filter(Boolean))]
    : [];

  return {
    rows: finalRows,
    view,
    errors,
    error: errors.length ? errors.join(' · ') : null,
    warnings,
    totals: {
      total: totalC / 100,
      locked: lockedC / 100,
      sum: sumC / 100,
      remaining: (totalC - sumC) / 100,
      percentSum: round2(view.reduce((sum, r) => sum + (Number(r.percent) || 0), 0)),
    },
  };
}

/**
 * body ของ PATCH action 'replan' — แถวเปิดตามลำดับงวด **เป็นบาทเสมอ** (โหมด % แปลงแล้วที่ `buildReplanRows`)
 * ⭐ route สร้างชุดสุดท้ายซ้ำด้วย `buildReplanRows(…, { unit: 'amount' })` ⇒ ได้ชุดเดียวกับที่จอพรีวิว (เทสต์ตรึง)
 * ⚠️ แถวล็อกไม่อยู่ในคำขอ — route ยกมาจากฐานเอง (จอส่งค่าแถวล็อกมา = ไม่มีผล)
 */
export function replanRequestRows(build) {
  return (Array.isArray(build?.view) ? build.view : [])
    .filter((r) => !r.lock)
    .map((r) => ({
      id: r.id || null,
      label: r.label,
      amount: r.amount,
      dueDate: r.dueDate ?? null,
      coversFrom: r.coversFrom ?? null,
      coversTo: r.coversTo ?? null,
      note: r.note ?? null,
    }));
}

/** สลับหน่วยของตัวแก้ (บาท ↔ %) — ร่างรับทั้งยอดและสัดส่วนที่คำนวณล่าสุด ⇒ ตัวเลขที่ตาเห็นไม่กระโดด */
export function replanSwitchUnit(draft = [], view = []) {
  const next = (Array.isArray(draft) ? draft : []).map((d) => ({ ...d }));
  for (const r of Array.isArray(view) ? view : []) {
    if (r?.draftIndex === null || r?.draftIndex === undefined || !next[r.draftIndex]) continue;
    next[r.draftIndex] = { ...next[r.draftIndex], amount: r.amount, percent: r.percent };
  }
  return next;
}

/* ── ผลลัพธ์ก่อนกด (paymentPlanEditPrompt ใน lib/approvalPrompt.js) ──────────────────────────────── */

/* เดือน Actual = เดือนของ approvedAt **เวลาไทย** (มติ 2026-08-21 · mig 0279) — ไม่มี approvedAt ถอยไปวันที่บนใบ */
function actualMonthLabel(order) {
  const at = order?.approvedAt ? new Date(order.approvedAt) : null;
  const key = at && !Number.isNaN(at.getTime()) ? currentMonth(at) : text(order?.orderDate).slice(0, 7);
  return formatMonthLabel(key);
}

function changeLine(change) {
  const { kind, before: b, after: a } = change;
  if (kind === 'removed') return `ลบ งวดที่ ${b.seq} ${fmtMoney(b.amount)} (ยังไม่มีการชำระ)`;
  if (kind === 'added') {
    return `เพิ่ม งวดที่ ${a.seq} ${fmtMoney(a.amount)}${a.dueDate ? ` · ครบกำหนด ${fmtDate(a.dueDate)}` : ''}`;
  }
  const fields = new Set(change.fields || []);
  const parts = [];
  if (fields.has('amount') || fields.has('percent')) {
    parts.push(`${fmtMoney(b.amount)} (${fmtPercent(b.percent)}) → ${fmtMoney(a.amount)} (${fmtPercent(a.percent)})`);
  }
  if (fields.has('label') && !AUTO_LABEL.test(text(a.label))) parts.push(`ชื่อ “${text(a.label)}”`);
  if (fields.has('dueDate')) parts.push(a.dueDate ? `ครบกำหนด ${fmtDate(a.dueDate)}` : 'ล้างวันครบกำหนด');
  if (fields.has('coversFrom') || fields.has('coversTo')) {
    parts.push(a.coversFrom || a.coversTo
      ? `ครอบบริการ ${a.coversFrom ? fmtDate(a.coversFrom) : '…'} – ${a.coversTo ? fmtDate(a.coversTo) : '…'}`
      : 'ล้างช่วงครอบบริการ');
  }
  if (fields.has('note')) parts.push(a.note ? 'แก้หมายเหตุ' : 'ล้างหมายเหตุ');
  if (!parts.length) parts.push(`ยอดคงเดิม ${fmtMoney(a.amount)}`);
  const head = Number(b.seq) === Number(a.seq) ? `งวดที่ ${a.seq}` : `งวดที่ ${b.seq} → งวดที่ ${a.seq}`;
  return `${head}: ${parts.join(' · ')}`;
}

/**
 * ข้อเท็จจริงที่จัดรูปแล้วสำหรับ `paymentPlanEditPrompt` — lib/approvalPrompt.js import ต่อไม่ได้ (หัวไฟล์นั้น)
 * @param before แถวในฐาน (มีสถานะ) · @param after ผลของ `buildReplanRows().rows`
 */
export function replanPromptFacts(order, before = [], after = [], { serviceRounds = false } = {}) {
  const prev = sortedRows(before);
  const next = sortedRows(after);
  const locked = prev.filter((r) => installmentReplanLock(r));
  const statusById = new Map(prev.map((r) => [r.id, r.status || 'pending']));
  const through = paidThrough(prev);
  const warnings = serviceRounds
    ? coverageWarnings(next.map((r) => ({ ...r, status: statusById.get(r.id) || 'pending' })))
    : [];
  return {
    orderNumber: order?.orderNumber || '',
    beforeCount: prev.length,
    afterCount: next.length,
    changes: replanDiff(prev, next).map(changeLine),
    lockedCount: locked.length,
    lockedAmountLabel: fmtMoney(locked.reduce((sum, r) => sum + toCents(r.amount), 0) / 100),
    totalLabel: fmtMoney(order?.totalAmount),
    actualAmountLabel: fmtMoney(order?.actualAmount),
    actualMonthLabel: actualMonthLabel(order),
    quotationNumber: text(order?.quotation?.quoteNumber),
    serviceRounds: Boolean(serviceRounds),
    paidThroughLabel: serviceRounds && through ? fmtDate(through) : '',
    coverageNotes: [...new Set(warnings.map((w) => ({
      overlap: 'ช่วงครอบบริการของงวดซ้อนทับกัน — ตรวจก่อนบัญชีรับรอง',
      gap: 'มีช่วงบริการที่ไม่มีงวดไหนครอบ — นัดช่วงนั้นจะลงคิวไม่ได้',
      half_range: 'มีงวดที่กรอกช่วงครอบมาข้างเดียว',
    })[w.kind]).filter(Boolean))],
    contractNumber: order?.serviceContractId ? (text(order?.serviceContract?.contractNo) || 'ที่ผูกกับใบนี้') : null,
    complete: next.length > 0 && next.every((r) => r.id && statusById.get(r.id) === 'confirmed'),
  };
}

/** เหตุผลของการปรับแผน — เกณฑ์เดียวกับ RPC (10–500 ตัวอักษร · workflow_reason_invalid) */
export function replanReasonError(reason) {
  const value = text(reason);
  if (value.length < MIN_REJECT_REASON) return `ต้องระบุเหตุผลที่ปรับแผนอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`;
  if (value.length > REPLAN_MAX_REASON) return `เหตุผลต้องไม่เกิน ${REPLAN_MAX_REASON} ตัวอักษร`;
  return null;
}

/** สรุป audit — บอกเสมอว่า Actual ไม่เปลี่ยน (คนอ่านประวัติจะถามข้อนี้ก่อน) */
export function replanAuditSummary({ orderNumber, beforeCount, afterCount, reason } = {}) {
  return `ปรับแผนงวด ${orderNumber}: ${beforeCount}→${afterCount} งวด (Actual ไม่เปลี่ยน): ${text(reason)}`;
}

/**
 * ป้าย "ปรับแผนหลังอนุมัติ" (มติ D5) — งวดจริงต่างจากแผนของ QT ไหม **โดยไม่เก็บข้อมูลเพิ่ม**
 * ⭐ เทียบจำนวนงวด + ยอด/ป้ายรายเลขงวด กับ `installmentsFromPaymentPlan` (ตัวเดียวกับที่ตั้งงวดตอนอนุมัติ)
 * ⚠️ ส่งเฉพาะงวดที่ตรึงยอดแล้วของใบ pipeline — งวดร่างเดินตาม QT สด ๆ อยู่แล้ว · ใบย้อนหลังไม่มี QT
 *   (ผู้เรียกกันสองกรณีนี้เอง) · วัด prod 23/09: ใบที่ตรึงแล้ว 181 ใบ ตรงแผน QT ครบ 181 (ป้ายไม่ขึ้นผิดสักใบ)
 */
export function installmentsReplanned(rows = [], plan = null, total = 0) {
  const list = sortedRows(rows);
  if (!list.length) return false;
  const planned = installmentsFromPaymentPlan(plan, total);
  if (planned.length !== list.length) return true;
  const bySeqPlan = new Map(planned.map((p) => [p.seq, p]));
  return list.some((r) => {
    const p = bySeqPlan.get(Number(r.seq));
    return !p || toCents(r.amount) !== toCents(p.amount) || text(r.label) !== text(p.label);
  });
}
