// ── มุมมองตารางของแท็บ "รอติดตั้ง" (ขั้นเข้าติดตั้ง PR-3b · ม็อก B1b) — ตัวตัดสินล้วน ─────────────────────────
//
// ⭐ ชุดเดียวกับตารางรายการอื่นในระบบ (มติเจ้าของ 09/11): ค้นหา · ตัวกรอง · จัดกลุ่ม + ย่อ/ขยาย · เรียง + ทิศ
//    ตั้งต้น: จัดกลุ่มตามขั้น · เรียงตามวันที่ต้องการ (ใกล้ก่อน)
// ⭐ ค้นหาเจอทุกอย่างที่ตาเห็นบนแถว (กติกา search-haystack): รหัส/ชื่อไซต์ · โซน · เลขใบ · ลูกค้า · ผู้ติดต่อ/เบอร์ · ฝ่ายขาย
import { INSTALL_QUEUE_GROUP_HINTS, INSTALL_QUEUE_GROUP_LABELS, INSTALL_QUEUE_STAGES } from './installQueueView';

export const INSTALL_FILTER_DIMENSIONS = Object.freeze([
  { key: 'stage', label: 'ขั้น' },
  { key: 'sales', label: 'ฝ่ายขาย', searchable: true },
  { key: 'customer', label: 'ลูกค้า', searchable: true },
  { key: 'owner', label: 'เจ้าของเรื่อง' },
  { key: 'when', label: 'วันที่ต้องการ' },
]);
export const EMPTY_INSTALL_FILTERS = Object.freeze({ stage: [], sales: [], customer: [], owner: [], when: [] });

export const INSTALL_GROUP_OPTIONS = Object.freeze([
  { value: 'none', label: 'ไม่จัดกลุ่ม' },
  { value: 'stage', label: 'ขั้น' },
  { value: 'order', label: 'ใบสั่งขาย' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'sales', label: 'ฝ่ายขาย' },
  { value: 'month', label: 'เดือนที่ต้องการ' },
]);
export const INSTALL_GROUP_DEFAULT = 'stage';

export const INSTALL_SORT_OPTIONS = Object.freeze([
  { value: 'wanted', label: 'วันที่ต้องการ' },
  { value: 'asked', label: 'ขอคิวล่าสุด' },
  { value: 'waiting', label: 'รอนานที่สุด' },
  { value: 'site', label: 'รหัสไซต์' },
  { value: 'customer', label: 'ลูกค้า' },
]);
export const INSTALL_SORT_DEFAULT = 'wanted';
export const INSTALL_SORT_DIR = Object.freeze({ wanted: 'asc', asked: 'desc', waiting: 'asc', site: 'asc', customer: 'asc' });

const WHEN_LABELS = Object.freeze({ overdue: 'เลยวันที่ต้องการแล้ว', week: '7 วันข้างหน้า', later: 'หลังจากนั้น', none: 'ยังไม่ระบุ' });
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const text = (v) => String(v ?? '').trim();
const salesOf = (row) => text(row.requestedByName) || 'ไม่ระบุ';
const customerOf = (row) => text(row.customerName) || 'ไม่ระบุ';
const ownerOf = (row) => row.owner || 'ไม่มี';

function whenOf(row, todayIso) {
  if (!row.requestedDate) return 'none';
  if (todayIso && row.requestedDate < todayIso) return 'overdue';
  if (todayIso) {
    const days = (Date.parse(`${row.requestedDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000;
    if (days <= 7) return 'week';
  }
  return 'later';
}

/** ตัวเลือกของตัวกรองจากแถวจริง (นับจำนวน) — `{ [dim]: [{ value, label, count }] }` */
export function installFilterOptions(rows = [], { todayIso = null } = {}) {
  const tally = (fn, label = (v) => v) => {
    const m = new Map();
    for (const r of rows) { const v = fn(r); m.set(v, (m.get(v) || 0) + 1); }
    return [...m.entries()].map(([value, count]) => ({ value, label: label(value), count }));
  };
  return {
    stage: tally((r) => r.stage, (v) => INSTALL_QUEUE_GROUP_LABELS[v] || v)
      .sort((a, b) => INSTALL_QUEUE_STAGES.indexOf(a.value) - INSTALL_QUEUE_STAGES.indexOf(b.value)),
    sales: tally(salesOf).sort((a, b) => a.label.localeCompare(b.label, 'th')),
    customer: tally(customerOf).sort((a, b) => a.label.localeCompare(b.label, 'th')),
    owner: tally(ownerOf),
    when: tally((r) => whenOf(r, todayIso), (v) => WHEN_LABELS[v] || v),
  };
}

export const installFilterCount = (filters = {}) => Object.values(filters || {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);

export function installHaystack(row) {
  return [
    row.siteCode, row.siteName, row.orderNumber, row.customerName, row.contactName, row.contactPhone, row.requestedByName,
    ...(row.zones || []).flatMap((z) => [z.code, z.name]),
  ].filter(Boolean).join(' ').toLowerCase();
}

function groupOf(row, groupBy) {
  if (groupBy === 'stage') return { key: row.stage, label: INSTALL_QUEUE_GROUP_LABELS[row.stage] || row.stage, sub: INSTALL_QUEUE_GROUP_HINTS[row.stage] || null, rank: INSTALL_QUEUE_STAGES.indexOf(row.stage) };
  if (groupBy === 'order') return { key: row.salesOrderId, label: row.orderNumber || row.salesOrderId, sub: row.customerName || null };
  if (groupBy === 'customer') return { key: customerOf(row), label: customerOf(row) };
  if (groupBy === 'sales') return { key: salesOf(row), label: salesOf(row) };
  if (groupBy === 'month') {
    if (!row.requestedDate) return { key: '~none', label: 'ยังไม่ระบุวัน' };
    const [y, m] = row.requestedDate.split('-');
    return { key: `${y}-${m}`, label: `${MONTHS[Number(m) - 1]} ${y}` };
  }
  return null;
}

function compare(a, b, sortKey, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  const pickers = {
    wanted: (r) => r.requestedDate || '9999-12-31',
    asked: (r) => r.requestedAt || '',
    waiting: (r) => r.requestedAt || '9999',
    site: (r) => r.siteCode || '',
    customer: (r) => customerOf(r),
  };
  const get = pickers[sortKey] || pickers.wanted;
  const av = get(a); const bv = get(b);
  if (av !== bv) return (sortKey === 'customer' ? String(av).localeCompare(String(bv), 'th') : (av < bv ? -1 : 1)) * sign;
  return String(a.siteCode || '').localeCompare(String(b.siteCode || ''));
}

/**
 * แถวที่ตาเห็น + กลุ่ม
 * @returns `{ rows, groups }` — `groups` = null เมื่อไม่จัดกลุ่ม · กลุ่มของขั้นเรียงตามลำดับขั้น อื่น ๆ ตามป้าย
 */
export function installQueueViewOf(rows = [], { q = '', filters = EMPTY_INSTALL_FILTERS, groupBy = INSTALL_GROUP_DEFAULT, sortKey = INSTALL_SORT_DEFAULT, sortDir = 'asc', todayIso = null } = {}) {
  const needle = text(q).toLowerCase();
  const f = { ...EMPTY_INSTALL_FILTERS, ...(filters || {}) };
  const hit = (list, value) => !list.length || list.includes(value);
  const shown = rows
    .filter((r) => !needle || installHaystack(r).includes(needle))
    .filter((r) => hit(f.stage, r.stage) && hit(f.sales, salesOf(r)) && hit(f.customer, customerOf(r))
      && hit(f.owner, ownerOf(r)) && hit(f.when, whenOf(r, todayIso)))
    .sort((a, b) => compare(a, b, sortKey, sortDir));
  if (!groupBy || groupBy === 'none') return { rows: shown, groups: null };
  const map = new Map();
  for (const row of shown) {
    const g = groupOf(row, groupBy);
    if (!map.has(g.key)) map.set(g.key, { ...g, items: [] });
    map.get(g.key).items.push(row);
  }
  const groups = [...map.values()].map((g) => ({ ...g, count: g.items.length }))
    .sort((a, b) => (groupBy === 'stage' ? a.rank - b.rank : groupBy === 'month' ? String(a.key).localeCompare(String(b.key)) : String(a.label).localeCompare(String(b.label), 'th')));
  return { rows: shown, groups };
}

