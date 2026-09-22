/* ตรรกะของตาราง "ใบสั่งขาย" ในรายงานยอดขาย — กรอง · เรียง · จัดกลุ่ม
 *
 * ⭐ แยกออกมาเป็นโมดูลบริสุทธิ์เพราะเป็นกฎที่ **พังเงียบ** ได้ทั้งชุด: กรองผิดหนึ่งเงื่อนไข
 * แล้วยอดรวมท้ายตารางก็ผิดตาม โดยที่หน้าจอยังเรนเดอร์ปกติทุกอย่าง
 *
 * ⚠️ `financeStatus` ของใบเก่าเป็น `null` (mig 0250 จงใจไม่ backfill) — ทุกที่ที่ตัดสิน
 * เรื่องนี้ต้องอ่านว่า "ยังไม่ผ่านบัญชี" เหมือน `pending` ไม่งั้นตัวกรองกับป้ายบนจอ
 * จะพูดคนละเรื่องกับใบชุดเดิม
 */

export const ORDER_GROUP_OPTIONS = [
  { value: 'none', label: 'ไม่จัดกลุ่ม' },
  { value: 'owner', label: 'ผู้รับผิดชอบ' },
  { value: 'team', label: 'ทีม' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'month', label: 'งวด' },
];

export const ORDER_SORT_OPTIONS = [
  { value: 'approvedAt', label: 'อนุมัติเมื่อ' },
  { value: 'month', label: 'งวด' },
  { value: 'amount', label: 'ยอดที่นับ' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'orderNumber', label: 'เลขที่ใบ' },
];

/* ⭐ ตั้งต้นเรียงตามวันอนุมัติ (2026-09-22) — ช่วงวันมีหลายใบในงวดเดียวกัน เรียงแค่งวดแล้วลำดับในวันไม่มีความหมาย */
export const ORDER_SORT_DEFAULT = 'approvedAt';

/** ค่าในตัวกรองที่แทน "ไม่มี" — ใบที่ไม่ระบุทีม/ไม่มีเจ้าของต้องไล่ได้ (มันคือส่วนที่ทำให้ยอดไม่ตรง) */
export const NONE_VALUE = '__none__';

export const ORDER_KIND_OPTIONS = [{ value: 'free', label: 'ไม่คิดเงิน' }];

/* ทิศทางตั้งต้นของแต่ละแบบเรียง — เปลี่ยนแบบเรียงต้องตั้งทิศให้ด้วย
   เงินคนอ่านคาดหวังมากไปน้อย · งวดคาดหวังใหม่ไปเก่า · ชื่อคาดหวัง ก→ฮ
   (กติกาเดียวกับทะเบียนการชำระ — คงทิศเดิมข้ามแบบแล้วกดครั้งแรกได้ลำดับที่ไม่มีใครอยากได้) */
export const ORDER_SORT_DIR = {
  approvedAt: 'desc',
  month: 'desc',
  amount: 'desc',
  customer: 'asc',
  orderNumber: 'asc',
};

/* ⭐ ขั้นบัญชีตามลำดับปัจจุบัน (มติผู้ใช้ 2026-08-30): AE Sup อนุมัติ → เก็บเงินครบทุกงวด → **บัญชีปิดใบ**
   ป้ายตาม FINANCE_STATUS_LABELS ของ lib/sales/salesOrderFinanceApproval (รอปิดใบ / ปิดใบแล้ว)
   🐞 เดิมเขียน "บัญชีตรวจแล้ว / รอบัญชีตรวจ" ซึ่งเป็นลำดับเก่าก่อน 30/08 และนับใบยอด 0 เป็น "รอตรวจ"
      ทั้งที่ใบยอด 0 ไม่เข้าแกนบัญชีเลย (financeStatus ว่างตลอด) ⇒ ตัวกรอง "รอ" พองเกินจริง (ตรวจ 2026-09-22) */
export const FINANCE_STATE_OPTIONS = [
  { value: 'approved', label: 'ปิดใบแล้ว' },
  { value: 'pending', label: 'รอปิดใบ' },
  { value: 'none', label: 'ไม่ผ่านบัญชี (ยอด 0)' },
];

/* ป้ายสั้นบนแถวใบ + โทน — จอกับไฟล์ Excel ใช้ชุดเดียวกัน
   `rejected` = ค่าเก่าที่เขียนใหม่ไม่ได้แล้ว (ถอด action ออก 30/08) แต่ CHECK ยังรับ — ต้องอ่านออกถ้าโผล่มา */
export const FINANCE_STATE_BADGE = {
  approved: { label: 'ปิดใบแล้ว', tone: 'success' },
  pending: { label: 'รอปิดใบ', tone: 'warning' },
  none: { label: 'ไม่ผ่านบัญชี', tone: '' },
  rejected: { label: 'บัญชีตีกลับ', tone: 'danger' },
};

/** ขั้นบัญชีของใบ — ใบยอด 0 (financeStatus ว่าง) ไม่เข้าแกนบัญชี = 'none' ·
 *  null/ค่าอื่นของใบที่มียอด = ยังไม่ปิด (ใบเก่าก่อน mig 0250 · ดูเหตุผลบนหัวไฟล์) */
export const financeStateOf = (order) => {
  if (order?.financeStatus === 'approved') return 'approved';
  if (order?.financeStatus === 'rejected') return 'rejected';
  if (!order?.financeStatus && Number(order?.totalAmount ?? order?.amount ?? 0) <= 0) return 'none';
  return 'pending';
};

const text = (value) => String(value ?? '').toLowerCase();

/** ตรงกับคำค้นไหม — เลขที่ใบ · ใบเสนอราคา · ชื่อลูกค้า · รหัสลูกค้า · ชื่อผู้รับผิดชอบ */
export function matchesQuery(order, q) {
  const needle = text(q).trim();
  if (!needle) return true;
  return [order?.orderNumber, order?.quoteNumber, order?.customerName, order?.customerId, order?.ownerName]
    .some((field) => text(field).includes(needle));
}

/**
 * กรองใบตามเงื่อนไขที่ผู้ใช้ตั้ง — ทุกกลุ่มเป็น "และ" ระหว่างกลุ่ม, "หรือ" ในกลุ่ม
 * กลุ่มที่ไม่ได้เลือกอะไรเลย = ไม่กรองด้วยกลุ่มนั้น (ไม่ใช่กรองทิ้งหมด)
 */
export function filterOrders(orders = [], {
  q = '', owners = [], teams = [], finance = [], months = [], kinds = [],
} = {}) {
  return orders.filter((order) => {
    if (!matchesQuery(order, q)) return false;
    if (owners.length && !owners.includes(order.ownerId || NONE_VALUE)) return false;
    if (teams.length && !teams.includes(order.team || NONE_VALUE)) return false;
    if (finance.length && !finance.includes(financeStateOf(order))) return false;
    if (months.length && !months.includes(order.month)) return false;
    if (kinds.includes('free') && !order.free) return false;
    return true;
  });
}

/** จำนวนตัวกรองที่ใช้อยู่ — ป้ายเลขบนปุ่มตัวกรองนับของที่ **มีผลจริง** (ไม่ใช่ร่าง · ตรวจ 2026-09-22) */
export const activeFilterCount = (filters = {}) => ['owners', 'teams', 'finance', 'months', 'kinds']
  .reduce((sum, key) => sum + (filters[key]?.length || 0), 0);

/**
 * ใบที่รวมเป็นยอดของเซลล์ที่กดในตาราง "แยกยอด" — ตัวตัดสินเดียวของทั้งการกรองและการนับ "ใบ"
 * @param drill { kind: 'month'|'total'|'team'|'person', month, months[], team, ownerId }
 *   month  = ใบของงวดนั้น
 *   total  = ใบของทุกงวดที่นับ (months)
 *   team   = ทีมตามดีล (null = ไม่ระบุทีม · ต้องมีเจ้าของ) ในเดือนที่แยกยอด (months)
 *   person = (เจ้าของ, ทีมของแถว) ในเดือนที่แยกยอด (months)
 */
export function ordersForDrill(orders = [], drill = null) {
  if (!drill) return orders;
  const inMonths = (o) => !drill.months || drill.months.includes(o.month);
  if (drill.kind === 'month') return orders.filter((o) => o.month === drill.month);
  if (drill.kind === 'total') return orders.filter(inMonths);
  if (drill.kind === 'team') {
    return orders.filter((o) => o.ownerId && (o.team || null) === (drill.team || null) && inMonths(o));
  }
  if (drill.kind === 'person') {
    return orders.filter((o) => o.ownerId === drill.ownerId && (o.team || null) === (drill.team || null) && inMonths(o));
  }
  return orders;
}

/**
 * รวมของใบที่เจาะมาเทียบกับยอดในตาราง — ✓ ตรง / ✗ ต่าง (บอกเหตุถ้ารู้)
 * @param expected   ขายจริงของเซลล์ที่กด
 * @param drilled    ใบจาก ordersForDrill
 * @param historyMonths งวดในเจาะที่ยอดมาจากการกรอกมือ — ส่วนต่างที่มาจากเดือนพวกนี้คือ "ไม่มีใบ"
 */
export function drillCheck(expected, drilled = [], { historyMonths = [] } = {}) {
  const total = drilled.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const gap = Number(expected || 0) - total;
  if (Math.abs(gap) <= 1) return { ok: true, total, gap: 0, reason: null };
  return { ok: false, total, gap, reason: historyMonths.length ? 'history' : null };
}

/** เรียงใบ — เทียบข้อความด้วย localeCompare ภาษาไทย ไม่ใช่ `<` ดิบ (ลำดับ ก-ฮ ผิด) */
export function sortOrders(orders = [], key = ORDER_SORT_DEFAULT, dir = ORDER_SORT_DIR[key]) {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (order) => {
    if (key === 'amount') return Number(order?.amount || 0);
    if (key === 'customer') return String(order?.customerName || '');
    if (key === 'orderNumber') return String(order?.orderNumber || '');
    if (key === 'approvedAt') return String(order?.approvedAt || '');
    return String(order?.month || '');
  };
  return [...orders].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    const cmp = typeof av === 'number' ? av - bv : av.localeCompare(bv, 'th');
    // ตัวตัดสินสุดท้ายคงที่เสมอ — ไม่งั้นแถวที่ค่าเท่ากันสลับตำแหน่งทุกครั้งที่เรนเดอร์
    return cmp !== 0 ? cmp * sign : String(a?.orderNumber || '').localeCompare(String(b?.orderNumber || ''), 'th');
  });
}

/**
 * จัดกลุ่มใบ → `[{ key, label, orders, total, count }]`
 * `groupBy: 'none'` คืนกลุ่มเดียวที่ไม่มีป้าย เพื่อให้ผู้เรียกวาดตารางด้วยโค้ดชุดเดียว
 */
export function groupOrders(orders = [], groupBy = 'none', { teamLabels = {}, monthLabel = (m) => m } = {}) {
  const total = (list) => list.reduce((sum, order) => sum + Number(order?.amount || 0), 0);
  if (groupBy === 'none' || !ORDER_GROUP_OPTIONS.some((option) => option.value === groupBy)) {
    return [{ key: 'all', label: null, orders, total: total(orders), count: orders.length }];
  }

  const buckets = new Map();
  for (const order of orders) {
    const key = groupBy === 'owner' ? (order.ownerId || '—')
      : groupBy === 'team' ? (order.team || '—')
        : groupBy === 'month' ? (order.month || '—')
          : (order.customerId || order.customerName || '—');
    const label = groupBy === 'owner' ? (order.ownerName || 'ไม่ระบุผู้รับผิดชอบ')
      : groupBy === 'team' ? (teamLabels[order.team] || order.team || 'ไม่ระบุทีม')
        : groupBy === 'month' ? (monthLabel(order.month) || 'ไม่ระบุงวด')
          : (order.customerName || 'ไม่ระบุลูกค้า');
    if (!buckets.has(key)) buckets.set(key, { key, label, orders: [], latest: '' });
    const bucket = buckets.get(key);
    bucket.orders.push(order);
    /* ชื่อกลุ่ม = ชื่อบนใบล่าสุด — ลูกค้ารหัสเดียวมีชื่อบนเอกสารได้หลายรุ่น (เปลี่ยนชื่อบริษัท)
       เดิมเอาชื่อจากใบที่เรียงมาก่อน ⇒ เปลี่ยนแบบเรียงแล้วชื่อกลุ่มสลับ (ตรวจ 2026-09-22) */
    const stamp = String(order.approvedAt || order.month || '');
    if (stamp > bucket.latest) { bucket.latest = stamp; bucket.label = label; }
  }

  // กลุ่มใหญ่ (ยอดรวมมากสุด) อยู่บน — คนเปิดรายงานมองหาก้อนใหญ่ก่อนเสมอ · งวดเรียงตามเวลา (ใหม่ก่อน)
  const shaped = [...buckets.values()]
    .map(({ latest, ...bucket }) => ({ ...bucket, total: total(bucket.orders), count: bucket.orders.length }));
  return groupBy === 'month'
    ? shaped.sort((a, b) => String(b.key).localeCompare(String(a.key)))
    : shaped.sort((a, b) => b.total - a.total);
}
