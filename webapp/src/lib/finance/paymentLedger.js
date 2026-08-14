// ── ทะเบียนการชำระรวมทุกใบสั่งขาย (โมดูลบัญชีและการเงิน) ────────────────────
//
// คำสั่งตั้งต้น (2026-08-13): *"เอาตารางการชำระของทุก SO ออกมารวมอยู่ในที่เดียว
// ซึ่งราคาต้องมีการอ้างอิง QT SO และสามารถดาวน์โหลด"*
//
// ⭐ **คอลัมน์ประกาศไว้ที่เดียว** (`LEDGER_COLUMNS`) แล้วทั้งตารางบนเว็บและไฟล์
// Excel อ่านจากชุดเดียวกัน — ของที่ควรเป็นตารางเดียวกันแต่เขียนสองที่จะเพี้ยนหากัน
// เสมอ (บทเรียนเดียวกับกฎ "ฟอร์มเดียวสองทางเรียก" ใน AGENTS.md) · ที่นี่เจ็บกว่า
// เพราะไฟล์ที่บัญชีดาวน์โหลดไปคือของที่เอาไปกระทบยอดจริง ถ้าคอลัมน์ไม่ตรงกับที่เห็น
// บนจอ คนจะเถียงกันว่าตัวเลขไหนถูกโดยไม่มีใครรู้ว่าต่างกันตรงไหน
//
// ⚠️ **`reported` ไม่นับว่าเก็บเงินได้** — นับเฉพาะ `confirmed` (กติกาจาก mig 0245:
// SA แจ้งเองนับเอง = ไม่มีด่าน) · ยอด "เก็บได้" ทุกตัวในไฟล์นี้จึงนับจาก confirmed เท่านั้น

import { fmtMonthYear } from '@/lib/format';

/** สถานะงวด → ป้ายไทย + โทนสี (ชุดเดียวกับที่การ์ดในใบ SO ใช้) */
export const LEDGER_STATUS = {
  pending: { label: 'รอชำระ', tone: 'neutral' },
  reported: { label: 'รอบัญชีตรวจ', tone: 'info' },
  confirmed: { label: 'เก็บเงินแล้ว', tone: 'success' },
  rejected: { label: 'ถูกตีกลับ', tone: 'danger' },
};

export const LEDGER_STATUS_KEYS = Object.keys(LEDGER_STATUS);

/**
 * แถวเดียวของทะเบียน — แบนราบพอที่ทั้งตารางและ Excel ใช้ได้โดยไม่ต้องไล่ join ต่อ
 *
 * ⚠️ ทุกอย่างที่มาจาก QT เป็น **snapshot ตอนอนุมัติใบ** (`label` `percent` `amount`)
 * ห้ามคำนวณใหม่จาก QT ปัจจุบัน — ใบที่เซ็นไปแล้วต้องอ่านได้เท่าเดิมตลอดไป
 */
export function ledgerRow({ installment, order, quotation, customer, todayIso = null }) {
  if (!installment || !order) return null;
  const status = installment.status || 'pending';
  const due = installment.dueDate || null;
  return {
    id: installment.id,
    // ── อ้างอิงเอกสาร: ทั้งเลขที่ (สำหรับคนอ่าน) และ id (สำหรับลิงก์) ──
    orderId: order.id,
    orderNumber: order.orderNumber || '',
    quotationId: order.quotationId || quotation?.id || null,
    quoteNumber: quotation?.quoteNumber || '',
    customerName: customer?.name || order.customerName || '',
    customerCode: customer?.arCode || '',
    /* สองขั้นแรกของราง — พกมากับแถวเพื่อให้ก้อน (`groupLedgerByOrder`) ประกอบราง
       ได้โดยไม่ต้องยิง API ซ้ำ · ขั้นที่สามคำนวณจากงวดในก้อนเอง */
    orderStatus: order.status || null,
    financeStatus: order.financeStatus || null,
    team: order.team || null,
    ownerName: order.ownerName || '',

    // ── ตัวงวด (snapshot จาก QT) ──
    seq: installment.seq,
    label: installment.label || '',
    percent: Number(installment.percent) || 0,
    amount: Number(installment.amount) || 0,

    dueDate: due,
    paidOn: installment.paidOn || null,
    status,
    statusLabel: LEDGER_STATUS[status]?.label || status,
    /* เลยกำหนด = มีวันกำหนด ยังไม่ confirmed และวันนั้นผ่านไปแล้ว
       ⚠️ งวดที่ "รอบัญชีตรวจ" ก็เลยกำหนดได้ — เงินอาจเข้าแล้วแต่ยังไม่มีใครรับรอง
       ซึ่งเป็นภาระของบัญชี ไม่ใช่ของลูกค้า จึงต้องยังขึ้นธง */
    overdue: Boolean(due && status !== 'confirmed' && todayIso && String(due) < String(todayIso)),
    reportedByName: installment.reportedByName || '',
    confirmedByName: installment.confirmedByName || '',
    rejectedReason: installment.rejectedReason || '',
    evidenceCount: Array.isArray(installment.evidence) ? installment.evidence.length : 0,
    /* ⭐ ชื่อไฟล์หลักฐาน — คิวรับรองบนหน้าทะเบียนต้อง **โชว์หลักฐานก่อนให้กด**
       (มติผู้ใช้ 2026-08-13) ไม่งั้นคนกดคอนเฟิร์มโดยไม่เห็นสิ่งที่กำลังรับรอง
       ⚠️ เอาแค่ชื่อไฟล์ ไม่ส่ง path/URL — ทางเปิดไฟล์คือ route ที่ตรวจสิทธิ์เอง
       (`/api/sales-planning/sales-orders/[id]/payment-file?installment=&i=`) */
    evidence: (Array.isArray(installment.evidence) ? installment.evidence : [])
      .map((file, index) => ({ index, fileName: file?.fileName || `ไฟล์ ${index + 1}` })),
  };
}

/**
 * งวดที่ **รอบัญชีรับรอง** — คิวงานที่ฝ่ายบัญชีเปิดหน้ามาเพื่อทำ (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ *"คิวงาน ข อยู่บน ทะเบียน ก อยู่ล่าง"* — หน้านี้ถูกใช้เป็นคิวมาตลอดทั้งที่ชื่อ
 * "ทะเบียน" · แยกของที่ **ต้องทำวันนี้** ออกมาไว้บนสุด ส่วนทะเบียนเต็มไว้ค้นและดาวน์โหลด
 *
 * ⚠️ เรียง **เลยกำหนดก่อน แล้วยอดมากก่อน** — ต่างจากทะเบียนข้างล่างที่เรียงตามใบ
 * เพราะคิวตอบคำถาม "ทำอันไหนก่อน" ไม่ใช่ "ใบไหนเป็นยังไง"
 * ⚠️ นับจาก **แถวที่กรองแล้ว** เสมอ — ตัวกรองบนหน้าคุมทั้งคิวและทะเบียน ไม่งั้น
 * คนกรองดูลูกค้ารายเดียวแล้วคิวยังโชว์ของคนอื่นอยู่ = สองส่วนบนหน้าเดียวพูดคนละเรื่อง
 */
export function pendingConfirmations(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.status === 'reported')
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (Number(b.amount) || 0) - (Number(a.amount) || 0);
    });
}

/**
 * นิยามคอลัมน์ชุดเดียวของทะเบียน — ตารางบนเว็บและ Excel ใช้ตัวนี้ร่วมกัน
 *
 * `money` / `num` / `date` บอก Excel ว่าจะจัดรูปเซลล์ยังไง (ดู lib/tax/exportExcel.js
 * ซึ่งเป็นตัวเขียน .xlsx กลาง — อยู่ใต้โฟลเดอร์ tax เพราะเขียนที่นั่นก่อน แต่ไม่ผูกกับภาษี)
 */
export const LEDGER_COLUMNS = [
  { key: 'orderNumber', label: 'เลขที่ SO' },
  { key: 'quoteNumber', label: 'อ้างอิง QT' },
  { key: 'customerName', label: 'ลูกค้า' },
  { key: 'seq', label: 'งวดที่', num: true },
  { key: 'label', label: 'รายละเอียดงวด' },
  { key: 'percent', label: 'สัดส่วน (%)', num: true },
  { key: 'amount', label: 'ยอดงวด', money: true },
  { key: 'dueDate', label: 'กำหนดชำระ', date: true },
  { key: 'paidOn', label: 'วันที่จ่ายจริง', date: true },
  { key: 'statusLabel', label: 'สถานะ' },
  { key: 'reportedByName', label: 'ผู้แจ้งชำระ' },
  { key: 'confirmedByName', label: 'ผู้รับรอง (บัญชี)' },
];

/**
 * ยอดรวมของชุดแถวที่กรองแล้ว
 *
 * ⚠️ `collected` นับเฉพาะ confirmed · `awaiting` คือเงินที่ SA บอกว่าเข้าแล้วแต่บัญชี
 * ยังไม่รับรอง ซึ่งเป็น **คิวงานของบัญชี** ไม่ใช่ยอดที่เก็บได้ ⇒ แยกช่องกันคนละช่อง
 */
export function ledgerSummary(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const sum = (pick) => list.filter(pick).reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  return {
    count: list.length,
    totalAmount: sum(() => true),
    collectedAmount: sum((r) => r.status === 'confirmed'),
    awaitingAmount: sum((r) => r.status === 'reported'),
    outstandingAmount: sum((r) => r.status !== 'confirmed'),
    overdueCount: list.filter((r) => r.overdue).length,
    overdueAmount: sum((r) => r.overdue),
    awaitingCount: list.filter((r) => r.status === 'reported').length,
  };
}

/* ── สถานะการเก็บเงินระดับ "ใบ" ───────────────────────────────────────────
   คำถามแรกของบัญชีคือ *"ใบไหนยังเก็บไม่ครบ"* ซึ่งเป็นคุณสมบัติของ **ใบ** ไม่ใช่ของงวด
   ⇒ กรองด้วยสถานะงวดตอบไม่ได้ (ใบที่เก็บครบแล้วยังมีงวดสถานะ confirmed อยู่ดี)

   ⭐ **กรองที่ API ไม่ใช่ที่หน้าเว็บ** — ทะเบียนนี้สัญญาไว้ว่าไฟล์ Excel ที่ดาวน์โหลด
   คือของที่เห็นบนจอ · กรองระดับใบไว้ฝั่งหน้าเว็บอย่างเดียวเมื่อไร ไฟล์กับจอจะคนละชุด
   ทันที และตัวเลขสรุปด้านบนก็จะนับของที่ตาไม่เห็น */
export const ORDER_STATE_OPEN = 'open';
export const ORDER_STATE_DONE = 'done';

export const LEDGER_ORDER_STATES = {
  [ORDER_STATE_OPEN]: 'ยังเก็บไม่ครบ',
  [ORDER_STATE_DONE]: 'เก็บครบแล้ว',
};

/**
 * ดัชนี id ใบ → สถานะการเก็บเงินของทั้งใบ
 *
 * ⚠️ ต้องคิดจากงวด **ทั้งหมดก่อนกรอง** เสมอ · เก็บครบ = ทุกงวดของใบ `confirmed`
 * (กติกา mig 0245 — `reported` ยังไม่นับว่าเก็บได้)
 */
export function orderStateIndex(rows = []) {
  const tally = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.orderId) continue;
    const current = tally.get(row.orderId) || { total: 0, confirmed: 0 };
    current.total += 1;
    if (row.status === 'confirmed') current.confirmed += 1;
    tally.set(row.orderId, current);
  }
  const states = new Map();
  for (const [orderId, { total, confirmed }] of tally) {
    states.set(orderId, total > 0 && confirmed === total ? ORDER_STATE_DONE : ORDER_STATE_OPEN);
  }
  return states;
}

/**
 * กรองทะเบียน — ทุกตัวกรองว่าง = ไม่กรอง
 *
 * ⚠️ ช่วงวันที่กรองที่ **กำหนดชำระ** ไม่ใช่วันที่จ่ายจริง เพราะคำถามหลักของบัญชีคือ
 * "เดือนนี้ต้องเก็บอะไรบ้าง" · งวดที่ยังไม่มีกำหนดจะหลุดช่วงเสมอ ซึ่งถูกแล้ว —
 * มันยังไม่ถูกนัดว่าจะเก็บเมื่อไร (ต้องไปตามที่ใบ ไม่ใช่ในรายงานรอบเดือน)
 */
export function filterLedger(rows = [], {
  status = [], from = null, to = null, q = '', overdueOnly = false,
  orderState = [], orderStates = null,
} = {}) {
  const wanted = Array.isArray(status) ? status.filter(Boolean) : [];
  const wantedOrders = Array.isArray(orderState) ? orderState.filter(Boolean) : [];
  const needle = String(q || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (wanted.length && !wanted.includes(r.status)) return false;
    /* ⚠️ สถานะระดับ **ใบ** ต้องมาจากดัชนีที่คิดจากงวดทั้งหมดของใบ (`orderStateIndex`)
       ไม่ใช่จากงวดที่เหลือหลังกรอง — กรองสถานะงวดเป็น "รอชำระ" เมื่อไร ทุกใบจะดู
       เหมือนยังเก็บไม่ครบทันที ทั้งที่บางใบเก็บครบไปแล้ว */
    if (wantedOrders.length && !wantedOrders.includes(orderStates?.get(r.orderId) || ORDER_STATE_OPEN)) return false;
    if (overdueOnly && !r.overdue) return false;
    if (from && (!r.dueDate || String(r.dueDate) < String(from))) return false;
    if (to && (!r.dueDate || String(r.dueDate) > String(to))) return false;
    if (needle) {
      const hay = [r.orderNumber, r.quoteNumber, r.customerName, r.customerCode, r.label]
        .join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * เรียงลำดับตั้งต้น — **ของที่ต้องทำก่อนอยู่บนสุด**
 *
 * เลยกำหนด → รอบัญชีตรวจ → ที่เหลือเรียงตามกำหนดชำระ · งวดที่ยังไม่มีกำหนดไปท้ายสุด
 * (ไม่ใช่บนสุดแบบที่ค่าว่างมักจะเป็น) เพราะมันยังไม่ถูกนัด จึงยังไม่ใช่งานของสัปดาห์นี้
 */
export function sortLedger(rows = []) {
  const rank = (r) => (r.overdue ? 0 : r.status === 'reported' ? 1 : 2);
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return String(a.dueDate) < String(b.dueDate) ? -1 : 1;
    }
    if (a.orderNumber !== b.orderNumber) return a.orderNumber < b.orderNumber ? -1 : 1;
    return (a.seq || 0) - (b.seq || 0);
  });
}

/** ชุดข้อมูลสำหรับตัวเขียน .xlsx กลาง — รูปเดียวกับที่รายงานภาษีใช้ */
export function ledgerReport(rows = [], { title = 'ทะเบียนการชำระ (ทุกใบสั่งขาย)' } = {}) {
  const summary = ledgerSummary(rows);
  return {
    title,
    columns: LEDGER_COLUMNS,
    rows,
    summary: {
      _label: `รวม ${summary.count} งวด`,
      amount: summary.totalAmount,
    },
  };
}

/**
 * จับงวดของ **ใบเดียวกัน** มารวมเป็นก้อนเดียว (มติผู้ใช้ 2026-08-13)
 *
 * > *"อยากกรุป SO เลขเดียวกัน แล้วเปิดขยาย"*
 *
 * ⭐ ทะเบียนนี้เรียงตาม **ความด่วนของงวด** ⇒ งวดของใบเดียวกันกระจายอยู่คนละที่ของ
 * ตารางได้ (งวด 1 เลยกำหนดอยู่บนสุด งวด 2 รอชำระอยู่ล่างสุด) · บัญชีที่กำลังโทรตาม
 * ลูกค้ารายหนึ่งต้องกวาดตาทั้งหน้าเพื่อประกอบภาพของใบเดียว
 *
 * ⚠️ **ความด่วนของก้อน = ความด่วนของงวดที่ด่วนที่สุดในก้อน** ไม่ใช่ค่าเฉลี่ย —
 * ใบที่มีงวดเลยกำหนดหนึ่งงวดต้องอยู่บนสุด ไม่ว่างวดอื่นจะเรียบร้อยแค่ไหน
 * ⚠️ จัดกลุ่มด้วย `orderId` ไม่ใช่ `orderNumber` — เลขที่ซ้ำกันได้ข้ามฉบับแก้ (Rev.)
 * และแถวที่ใบถูกลบไปแล้วจะไม่มีเลขที่เลย
 */
export function groupLedgerByOrder(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const key = row.orderId || row.orderNumber || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        quotationId: row.quotationId,
        quoteNumber: row.quoteNumber,
        customerName: row.customerName,
        customerCode: row.customerCode,
        orderStatus: row.orderStatus,
        financeStatus: row.financeStatus,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map((group) => {
      const rowsInOrder = sortLedger(group.rows);
      const summary = ledgerSummary(rowsInOrder);
      return {
        ...group,
        // ในก้อนเรียงตาม **งวดที่** เพราะคนอ่านคาดว่างวด 1 มาก่อนงวด 2 เสมอ
        // (ต่างจากลำดับของก้อนซึ่งเรียงตามความด่วน)
        rows: [...rowsInOrder].sort((a, b) => (a.seq || 0) - (b.seq || 0)),
        summary,
        paidCount: rowsInOrder.filter((r) => r.status === 'confirmed').length,
        count: rowsInOrder.length,
        overdue: rowsInOrder.some((r) => r.overdue),
        awaiting: rowsInOrder.filter((r) => r.status === 'reported').length,
        rejected: rowsInOrder.filter((r) => r.status === 'rejected').length,
        complete: rowsInOrder.length > 0 && rowsInOrder.every((r) => r.status === 'confirmed'),
        // งวดที่ด่วนที่สุด — ใช้ทั้งจัดลำดับก้อนและโชว์บนแถวที่ยุบอยู่
        lead: rowsInOrder[0] || null,
        /* กำหนดชำระที่ต้องตามต่อไป = งวดที่ **ยังเก็บไม่ได้** และมีวันใกล้ที่สุด
           ⚠️ ข้ามงวดที่ confirmed แล้ว — วันของงวดที่จบไปแล้วไม่ใช่สิ่งที่ต้องตาม
           ⚠️ ทั้งใบเก็บครบ หรือทุกงวดที่เหลือยังไม่มีกำหนด ⇒ null (หน้าเว็บโชว์ขีด)
           มีไว้เพราะแถวที่ยุบอยู่เคยปล่อยคอลัมน์กำหนดชำระว่างทั้งคอลัมน์ */
        nextDue: rowsInOrder
          .filter((r) => r.status !== 'confirmed' && r.dueDate)
          .map((r) => r.dueDate)
          .sort()[0] || null,
      };
    })
    .sort((a, b) => {
      const rank = (g) => (g.overdue ? 0 : g.awaiting ? 1 : g.complete ? 3 : 2);
      const byRank = rank(a) - rank(b);
      if (byRank) return byRank;
      // ในระดับเดียวกัน ใบที่มีกำหนดใกล้ที่สุดมาก่อน · ไม่มีกำหนดไปท้าย
      const aDue = a.lead?.dueDate || null;
      const bDue = b.lead?.dueDate || null;
      if (aDue !== bDue) {
        if (!aDue) return 1;
        if (!bDue) return -1;
        return String(aDue) < String(bDue) ? -1 : 1;
      }
      return String(a.orderNumber || '') < String(b.orderNumber || '') ? -1 : 1;
    });
}

/**
 * แปลงก้อนหนึ่งใบให้อยู่ในรูปที่ `salesOrderListTrack` กิน (มติผู้ใช้ 2026-08-13)
 *
 * ⭐ *"ให้พูดภาษาเดียวกับตาราง SO ที่เพิ่งรื้อ"* — ทะเบียนนี้กับตารางรายการ SO ตอบ
 * คำถามเดียวกัน ("ใบนี้ค้างที่ใคร") ⇒ ต้องใช้ **ฟังก์ชันเดียวกัน** ไม่ใช่วาดรางอีกชุด
 * ที่หน้าตาเหมือนแต่ตรรกะแยก ซึ่งจะเพี้ยนหากันในสามเดือน
 *
 * ⚠️ ขั้นที่สาม (เก็บเงิน) ประกอบจากงวด **ในก้อนนี้เอง** ไม่ใช่จาก `salesOrderPaymentCell`
 * ของฝั่ง API ⇒ ตัวเลขตรงกับที่ตาเห็นบนแถวเสมอ แม้ตัวกรองจะตัดบางงวดออกไป
 */
export function groupAsOrder(group) {
  if (!group) return null;
  return {
    status: group.orderStatus,
    financeStatus: group.financeStatus,
    payment: {
      tracked: true,
      paid: group.paidCount,
      count: group.count,
      complete: group.complete,
      overdue: group.rows.filter((r) => r.overdue).length,
      reviewing: group.awaiting,
      rejected: group.rejected,
    },
  };
}

/** ป้ายสรุปของใบที่ยุบอยู่ — เรื่องเดียวที่ด่วนที่สุด (กติกาเดียวกับตารางรายการ SO) */
export function groupNote(group) {
  if (!group) return null;
  if (group.overdue) return { label: 'เลยกำหนด', tone: 'danger' };
  if (group.rejected) return { label: `ตีกลับ ${group.rejected} งวด`, tone: 'danger' };
  if (group.awaiting) return { label: `รอรับรอง ${group.awaiting} งวด`, tone: 'warning' };
  if (group.complete) return { label: 'เก็บครบแล้ว', tone: 'success' };
  return { label: 'รอลูกค้าชำระ', tone: 'neutral' };
}

/* ══ มุมมองของทะเบียน: เรียง · จัดกลุ่ม (มติผู้ใช้ 2026-08-15) ═══════════════
   ทั้งสองอย่างทำงานที่ระดับ **ใบ** (ผลลัพธ์ของ `groupLedgerByOrder`) ไม่ใช่ระดับงวด
   — หน่วยที่บัญชีลงมือคือใบ ("โทรตามใบนี้") ⇒ เรียง/จัดกลุ่มระดับงวดจะหั่นใบเดียว
   ไปคนละที่ของตาราง ซึ่งเป็นอาการเดิมที่ `groupLedgerByOrder` ถูกสร้างมาแก้

   ⚠️ อยู่ในไฟล์นี้ ไม่ใช่ในหน้าเว็บ เพราะเป็นตรรกะของทะเบียนที่ต้องมีเทสต์คุม
   หน้าเว็บเป็นแค่คนวาด (กฎเดียวกับ `LEDGER_COLUMNS` ที่ประกาศครั้งเดียว) */

/** ตัวเลือกการเรียง + ทิศทางตั้งต้นของแต่ละแบบ (ป้ายบนปุ่ม "เรียง") */
export const LEDGER_SORT_OPTIONS = [
  { value: 'urgent', label: 'ความด่วน', dir: 'asc' },
  { value: 'due', label: 'กำหนดถัดไป', dir: 'asc' },
  { value: 'outstanding', label: 'ยอดค้างรับ', dir: 'desc' },
  { value: 'customer', label: 'ลูกค้า', dir: 'asc' },
  { value: 'order', label: 'เลขที่ใบ', dir: 'desc' },
];

export const LEDGER_SORT_DEFAULT = 'urgent';

/** ทิศทางตั้งต้นของแบบเรียงหนึ่ง ๆ — ยอดเงินเริ่มจากมากไปน้อย วันเริ่มจากใกล้ก่อน */
export const ledgerSortDir = (key) =>
  LEDGER_SORT_OPTIONS.find((option) => option.value === key)?.dir || 'asc';

/**
 * เรียงก้อนใบตามที่ผู้ใช้เลือก
 *
 * ⚠️ `urgent` = **ลำดับที่ `groupLedgerByOrder` จัดมาแล้ว** (เลยกำหนด → รอรับรอง →
 * ค้าง → เก็บครบ) ไม่คิดใหม่ที่นี่ ไม่งั้นมีกติกาความด่วนสองชุดที่เพี้ยนหากันได้
 * ⚠️ **ใบที่ยังไม่มีกำหนดอยู่ท้ายเสมอ ไม่ว่าเรียงขึ้นหรือลง** — กติกาเดียวกับ
 * `sortLedger`: ยังไม่ถูกนัดวัน = ยังไม่ใช่งานของสัปดาห์นี้ · สลับทิศแล้วมันโผล่ขึ้น
 * หัวตารางเมื่อไร คนจะอ่านว่า "ด่วนที่สุด" ซึ่งตรงข้ามกับความจริง
 */
export function sortLedgerGroups(groups = [], key = LEDGER_SORT_DEFAULT, dir = null) {
  const list = [...(Array.isArray(groups) ? groups : [])];
  const direction = dir === 'desc' ? -1 : 1;
  if (key === 'urgent') return direction === 1 ? list : list.reverse();

  const text = (value) => String(value || '');
  return list.sort((a, b) => {
    if (key === 'due') {
      const aDue = a.nextDue || null;
      const bDue = b.nextDue || null;
      if (!aDue !== !bDue) return aDue ? -1 : 1;   // ไม่มีกำหนด = ท้ายเสมอ
      if (aDue !== bDue) return (String(aDue) < String(bDue) ? -1 : 1) * direction;
    } else if (key === 'outstanding') {
      const diff = (a.summary?.outstandingAmount || 0) - (b.summary?.outstandingAmount || 0);
      if (diff) return diff * direction;
    } else if (key === 'customer') {
      const byName = text(a.customerName).localeCompare(text(b.customerName), 'th');
      if (byName) return byName * direction;
    }
    // ตัวตัดสินสุดท้ายเหมือนกันทุกแบบ: เลขที่ใบ ⇒ ลำดับนิ่ง ไม่สลับเองระหว่างโหลด
    const byOrder = text(a.orderNumber).localeCompare(text(b.orderNumber), 'th');
    return key === 'order' ? byOrder * direction : byOrder;
  });
}

/** ตัวเลือกการจัดกลุ่ม (ป้ายบนปุ่ม "จัดกลุ่ม") */
export const LEDGER_GROUP_OPTIONS = [
  { value: 'none', label: 'ไม่จัดกลุ่ม' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'dueMonth', label: 'เดือนที่ต้องเก็บ' },
  { value: 'state', label: 'สถานะการเก็บ' },
];

/** ป้ายของกลุ่ม "สถานะการเก็บ" — ชุดเดียวกับ `groupNote` ย่อให้เหลือ 5 หมวด */
const STATE_BUCKETS = [
  { key: 'overdue', label: 'เลยกำหนด', match: (g) => g.overdue },
  { key: 'rejected', label: 'มีงวดถูกตีกลับ', match: (g) => g.rejected > 0 },
  { key: 'awaiting', label: 'รอบัญชีรับรอง', match: (g) => g.awaiting > 0 },
  { key: 'complete', label: 'เก็บครบแล้ว', match: (g) => g.complete },
  { key: 'waiting', label: 'รอลูกค้าชำระ', match: () => true },
];

/**
 * ยุบก้อนใบเป็น "ถัง" ตามหัวข้อที่เลือก — คืน `null` เมื่อไม่จัดกลุ่ม
 *
 * ⭐ **ลำดับของถัง = ลำดับที่ใบแรกของถังโผล่ในรายการที่เรียงไว้แล้ว** ไม่ใช่เรียง
 * ตามชื่อถัง — ผู้ใช้เพิ่งเลือกวิธีเรียงไป ถ้าจัดกลุ่มแล้วลำดับพลิกเป็นอย่างอื่น
 * เท่ากับปุ่ม "เรียง" ถูกยกเลิกเงียบ ๆ · ในถังก็คงลำดับเดิมด้วยเหตุผลเดียวกัน
 * ⚠️ ถัง "ไม่ระบุ" (ไม่มีลูกค้า / ยังไม่มีกำหนด) ไปท้ายเสมอ
 */
export function groupLedgerBuckets(groups = [], groupBy = 'none') {
  if (!groupBy || groupBy === 'none') return null;
  const list = Array.isArray(groups) ? groups : [];
  const buckets = new Map();

  for (const group of list) {
    let key; let label; let sub = null; let missing = false;
    if (groupBy === 'customer') {
      // กุญแจใช้รหัส AR ก่อน (ชื่อซ้ำกันได้) · ใบที่ยังไม่มีรหัสจับด้วยชื่อ
      key = group.customerCode || String(group.customerName || '').trim() || '__none';
      label = group.customerName || 'ไม่ระบุลูกค้า';
      sub = group.customerCode || null;
      missing = key === '__none';
    } else if (groupBy === 'dueMonth') {
      const month = group.nextDue ? String(group.nextDue).slice(0, 7) : null;
      key = month || '__none';
      label = month ? fmtMonthYear(`${month}-01`, { locale: 'th' }) : 'ยังไม่มีกำหนด';
      missing = !month;
    } else {
      const bucket = STATE_BUCKETS.find((candidate) => candidate.match(group));
      key = bucket.key;
      label = bucket.label;
    }

    const current = buckets.get(key) || { key, label, sub, missing, groups: [], outstanding: 0 };
    if (!current.sub && sub) current.sub = sub;
    current.groups.push(group);
    current.outstanding += group.summary?.outstandingAmount || 0;
    buckets.set(key, current);
  }

  const ordered = [...buckets.values()].map((bucket) => ({ ...bucket, count: bucket.groups.length }));
  return ordered.sort((a, b) => (a.missing === b.missing ? 0 : a.missing ? 1 : -1));
}
