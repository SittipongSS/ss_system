// ── แท็บงานของหน้างานบัญชี (รื้อรายการ SO + บัญชี PR-4a · มติเจ้าของ 09/11/2026) ─────────────────────────────
//
// ⭐ แท็บงานแทนแผงคิวสามก้อนบนทะเบียนการชำระ (รอคุณรับรอง · ยังไม่ออกใบกำกับ · เงินค้างจากใบที่ยกเลิก) และแผง
//   "ใบที่รอบัญชีปิด" ของหน้าภาพรวม /finance — ตารางเดียว เลือกแท็บตามงาน กดปุ่ม "งานถัดไป" ท้ายแถวเพื่อลงมือ
// ⭐ **แท็บ = ชุดค่าตัวกรองเดิมใน URL** ไม่ใช่มิติใหม่ — ป้ายบนเมนู (`?status=reported`) · การ์ดบนหัว · ลิงก์ในแจ้งเตือนเก่าในฐาน
//   ลงแท็บที่ถูกเองโดยไม่ต้องแก้ลิงก์ และปุ่ม Excel ยังใช้ query ชุดเดียวกับจอ ("ไฟล์ = ที่เห็น")
// ⚠️ เลขบนแท็บ = แถวที่เห็นหลังกด (กติกา #1921/#1922) — คิดที่ route จากชุดที่ถอดคีย์ของแท็บออก ตัวกรองอื่น (คำค้น · สาย · ช่วงวัน ·
//   รอบวางบิล) คงไว้ · หน่วยตามของที่ต้องทำ: แท็บรายงวดนับ "งวด" (เลขเดียวกับป้ายบนเมนูและการ์ด) · แท็บรอปิดใบนับ "ใบ"
import { filterLedger, ledgerAwaitsConfirm, ledgerInvoicePending, ledgerStatusKey } from '@/lib/finance/paymentLedger';

/* คีย์ใน URL ที่แท็บเป็นเจ้าของ — กดแท็บ = ล้างชุดนี้ทั้งหมดแล้วตั้งค่าของแท็บนั้น (ตัวกรองอื่นคงไว้) */
export const LEDGER_WORK_KEYS = Object.freeze(['status', 'taxInvoice', 'overdue', 'close', 'stranded']);

export const LEDGER_WORK_TABS = Object.freeze([
  { key: 'all', label: 'ทั้งหมด', unit: 'ใบ', blurb: 'ทุกใบที่มีงวดชำระ — ตั้งต้นเรียงใบที่ต้องตามก่อน' },
  { key: 'review', label: 'รอตรวจงวด', unit: 'งวด', blurb: 'ฝ่ายขายแจ้งว่าเงินเข้าแล้ว รอบัญชีดูหลักฐานแล้วรับรอง หรือตีกลับ' },
  { key: 'invoice', label: 'รอออกใบกำกับ', unit: 'งวด', blurb: 'เงินเข้าแล้วแต่ยังไม่ได้บันทึกใบกำกับภาษี — บริษัทเก็บ VAT ทุกงวดที่จ่ายแล้วต้องมีใบ' },
  { key: 'close', label: 'รอปิดใบ', unit: 'ใบ', blurb: 'เก็บครบทุกงวดแล้ว — ตรวจข้อมูลลูกค้า เงื่อนไขชำระ ยอดและ VAT ครั้งสุดท้ายแล้วปิดใบ · ยอด Actual ไม่เปลี่ยนจากขั้นนี้' },
  { key: 'overdue', label: 'เลยกำหนด', unit: 'งวด', blurb: 'งวดที่เลยกำหนดชำระแล้วยังไม่ได้รับรอง — ใบที่ต้องตามเงิน' },
  { key: 'rejected', label: 'ตีกลับ รอฝ่ายขาย', unit: 'งวด', blurb: 'งวดที่บัญชีตีกลับ รอฝ่ายขายแก้หลักฐานแล้วแจ้งใหม่ — ไม่ใช่งานค้างของบัญชี แต่ต้องตามได้' },
]);

/* ชุดค่าของแต่ละแท็บ · `stranded` ไม่อยู่บนแถบแท็บ (มติ "แถบโผล่เมื่อมี") — เข้าทางแถบเตือนบนหน้าเท่านั้น */
export const LEDGER_WORK_PRESETS = Object.freeze({
  all: {},
  review: { status: 'reported' },
  invoice: { taxInvoice: 'missing' },
  close: { close: '1' },
  overdue: { overdue: '1' },
  rejected: { status: 'rejected' },
  stranded: { stranded: '1' },
});

/**
 * แท็บที่ตัวกรองชุดนี้ตรงพอดี — `null` = ผสมกันเอง (เช่นการ์ดเลยกำหนดซ้อนแท็บรอตรวจ) ไม่มีแท็บไหนติด
 * ⚠️ อ่านค่าที่ผ่านตัวตัดสินแล้วของหน้า (status เป็นลิสต์ · overdue/close/stranded เป็น boolean)
 */
export function ledgerWorkTab({ status = [], taxInvoice = '', overdue = false, close = false, stranded = false } = {}) {
  const statuses = Array.isArray(status) ? status.filter(Boolean) : [];
  const set = [statuses.length > 0, Boolean(taxInvoice), Boolean(overdue), Boolean(close), Boolean(stranded)].filter(Boolean).length;
  if (!set) return 'all';
  if (set > 1) return null;
  if (close) return 'close';
  if (stranded) return 'stranded';
  if (overdue) return 'overdue';
  if (taxInvoice) return taxInvoice === 'missing' ? 'invoice' : null;
  if (statuses.length === 1 && statuses[0] === 'reported') return 'review';
  if (statuses.length === 1 && statuses[0] === 'rejected') return 'rejected';
  return null;
}

/**
 * URLSearchParams ใหม่หลังกดแท็บ — ล้างคีย์ของแท็บทุกตัว แล้วตั้งชุดค่าของแท็บที่กด · คีย์อื่น (คำค้น · มุมมอง) คงไว้
 * ⚠️ replace เดียว (เรียก setFilter หลายครั้งติดกันทับกันเอง — ดู clearDateRange ของหน้า)
 */
export function ledgerWorkParams(params, key) {
  const sp = new URLSearchParams(params?.toString?.() || '');
  LEDGER_WORK_KEYS.forEach((k) => sp.delete(k));
  const preset = LEDGER_WORK_PRESETS[key] || {};
  for (const [k, v] of Object.entries(preset)) sp.set(k, v);
  return sp;
}

const tallyOf = (list) => ({
  count: list.length,
  orders: new Set(list.map((r) => r.orderId || r.orderNumber)).size,
  amount: list.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
});

/**
 * ตัวเลขของทุกแท็บ + แถบเงินค้าง — คิดจาก **ตัวกรองชุดเดียวกันแต่ถอดคีย์ของแท็บออก** (กติกาเดียวกับ ledgerFacetTally · M10b)
 * ⭐ ตัวตัดสินแต่ละแท็บตัวเดียวกับ clause ของ filterLedger: รอตรวจ = ledgerStatusKey 'reported' (งวดติดด่านนับ Actual ไม่นับ ·
 *   เลขเดียวกับป้ายบนเมนู) · ใบกำกับ = ledgerInvoicePending · รอปิด = ชุดใบจาก route · เลยกำหนด = ธง overdue · ตีกลับ = 'rejected'
 * @returns {Record<string, {count: number, orders: number, amount: number}>}
 */
export function ledgerWorkTally(rows = [], filters = {}) {
  const base = filterLedger(rows, {
    ...filters, status: [], taxInvoice: '', overdueOnly: false, close: false, stranded: false,
  });
  const closeIds = filters.closeOrderIds;
  return {
    all: tallyOf(base),
    review: tallyOf(base.filter((r) => ledgerStatusKey(r) === 'reported')),
    invoice: tallyOf(base.filter(ledgerInvoicePending)),
    close: tallyOf(base.filter((r) => closeIds?.has?.(r.orderId))),
    overdue: tallyOf(base.filter((r) => r.overdue)),
    rejected: tallyOf(base.filter((r) => ledgerStatusKey(r) === 'rejected')),
    stranded: tallyOf(base.filter((r) => r.stranded)),
  };
}

/** เลขบนแท็บ — หน่วยตามแท็บ (งวด/ใบ) · ยังไม่โหลด = null (Segmented ไม่วาดป้าย) */
export function ledgerWorkCount(tally, key) {
  const entry = tally?.[key];
  if (!entry) return null;
  const tab = LEDGER_WORK_TABS.find((t) => t.key === key);
  return tab?.unit === 'ใบ' ? entry.orders : entry.count;
}

const firstSeq = (rows, test) => {
  const hit = (rows || []).filter(test).sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0))[0];
  return hit ? hit.seq : null;
};

/**
 * ปุ่ม "งานถัดไป" ท้ายแถวของใบหนึ่งใบ — `{ kind, label, seq }` หรือ null (ไม่มีงานของบัญชี)
 * ⭐ ลำดับตั้งต้นตามม็อก: เงินค้างบนใบยกเลิก → รอตรวจงวด → ออกใบกำกับ → ปิดใบ · อยู่ในแท็บไหน งานของแท็บนั้นขึ้นก่อน
 * ⭐ ปุ่มรายงวดเปิดลิ้นชักที่งวดนั้น (ปุ่มรับรอง/ตีกลับ/ใบกำกับ/คืนเงินอยู่ในลิ้นชักพร้อมเหตุของปุ่มที่กดไม่ได้) · "ปิดใบ" เปิดโมดัลปิดใบ
 * ⚠️ อ่านแถวที่ผ่านตัวกรองของก้อนใบ (`group.rows`) — ในแท็บรอตรวจ แถวที่เหลือคืองวดรอตรวจพอดี
 * ⚠️ งวดที่ติดด่านนับ Actual รายงวด (held) ไม่ใช่งานของบัญชี — ไม่ขึ้นปุ่มตรวจ (ledgerAwaitsConfirm)
 * @param {{ rows: object[], orderStatus?: string }} group
 * @param {{ tab?: string|null, closing?: boolean, canClose?: boolean }} options
 */
export function ledgerNextAction(group, { tab = null, closing = false, canClose = true } = {}) {
  if (!group) return null;
  const rows = group.rows || [];
  const make = {
    stranded: () => {
      const seq = firstSeq(rows, (r) => r.stranded);
      return seq === null ? null : { kind: 'stranded', label: 'จัดการเงินค้าง', seq };
    },
    review: () => {
      const seq = firstSeq(rows, ledgerAwaitsConfirm);
      return seq === null ? null : { kind: 'review', label: `ตรวจงวด ${seq}`, seq };
    },
    invoice: () => {
      const seq = firstSeq(rows, ledgerInvoicePending);
      return seq === null ? null : { kind: 'invoice', label: `ใบกำกับ งวด ${seq}`, seq };
    },
    close: () => (closing && canClose ? { kind: 'close', label: 'ปิดใบ', seq: null } : null),
    overdue: () => {
      const seq = firstSeq(rows, (r) => r.overdue);
      return seq === null ? null : { kind: 'overdue', label: `ดูงวด ${seq}`, seq };
    },
    rejected: () => {
      const seq = firstSeq(rows, (r) => ledgerStatusKey(r) === 'rejected');
      return seq === null ? null : { kind: 'rejected', label: `ดูงวด ${seq}`, seq };
    },
  };
  const order = ['stranded', 'review', 'invoice', 'close'];
  const first = tab && make[tab] ? [tab, ...order.filter((k) => k !== tab)] : order;
  for (const key of first) {
    const action = make[key]();
    if (action) return action;
  }
  return null;
}
