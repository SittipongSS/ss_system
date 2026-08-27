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
];

export const ORDER_SORT_OPTIONS = [
  { value: 'month', label: 'งวด' },
  { value: 'amount', label: 'ยอดที่นับ' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'orderNumber', label: 'เลขที่ใบ' },
];

export const ORDER_SORT_DEFAULT = 'month';

/* ทิศทางตั้งต้นของแต่ละแบบเรียง — เปลี่ยนแบบเรียงต้องตั้งทิศให้ด้วย
   เงินคนอ่านคาดหวังมากไปน้อย · งวดคาดหวังใหม่ไปเก่า · ชื่อคาดหวัง ก→ฮ
   (กติกาเดียวกับทะเบียนการชำระ — คงทิศเดิมข้ามแบบแล้วกดครั้งแรกได้ลำดับที่ไม่มีใครอยากได้) */
export const ORDER_SORT_DIR = {
  month: 'desc',
  amount: 'desc',
  customer: 'asc',
  orderNumber: 'asc',
};

export const FINANCE_STATE_OPTIONS = [
  { value: 'approved', label: 'บัญชีตรวจแล้ว' },
  { value: 'pending', label: 'รอบัญชีตรวจ' },
];

/** ขั้นบัญชีของใบ — null/ค่าอื่น = ยังไม่ผ่าน (ดูเหตุผลบนหัวไฟล์) */
export const financeStateOf = (order) => (order?.financeStatus === 'approved' ? 'approved' : 'pending');

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
export function filterOrders(orders = [], { q = '', owners = [], teams = [], finance = [] } = {}) {
  return orders.filter((order) => {
    if (!matchesQuery(order, q)) return false;
    if (owners.length && !owners.includes(order.ownerId)) return false;
    if (teams.length && !teams.includes(order.team)) return false;
    if (finance.length && !finance.includes(financeStateOf(order))) return false;
    return true;
  });
}

/** เรียงใบ — เทียบข้อความด้วย localeCompare ภาษาไทย ไม่ใช่ `<` ดิบ (ลำดับ ก-ฮ ผิด) */
export function sortOrders(orders = [], key = ORDER_SORT_DEFAULT, dir = ORDER_SORT_DIR[key]) {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (order) => {
    if (key === 'amount') return Number(order?.amount || 0);
    if (key === 'customer') return String(order?.customerName || '');
    if (key === 'orderNumber') return String(order?.orderNumber || '');
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
export function groupOrders(orders = [], groupBy = 'none', { teamLabels = {} } = {}) {
  const total = (list) => list.reduce((sum, order) => sum + Number(order?.amount || 0), 0);
  if (groupBy === 'none' || !ORDER_GROUP_OPTIONS.some((option) => option.value === groupBy)) {
    return [{ key: 'all', label: null, orders, total: total(orders), count: orders.length }];
  }

  const buckets = new Map();
  for (const order of orders) {
    const key = groupBy === 'owner' ? (order.ownerId || '—')
      : groupBy === 'team' ? (order.team || '—')
        : (order.customerId || order.customerName || '—');
    const label = groupBy === 'owner' ? (order.ownerName || 'ไม่ระบุผู้รับผิดชอบ')
      : groupBy === 'team' ? (teamLabels[order.team] || order.team || 'ไม่ระบุทีม')
        : (order.customerName || 'ไม่ระบุลูกค้า');
    if (!buckets.has(key)) buckets.set(key, { key, label, orders: [] });
    buckets.get(key).orders.push(order);
  }

  // กลุ่มใหญ่ (ยอดรวมมากสุด) อยู่บน — คนเปิดรายงานมองหาก้อนใหญ่ก่อนเสมอ
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, total: total(bucket.orders), count: bucket.orders.length }))
    .sort((a, b) => b.total - a.total);
}
