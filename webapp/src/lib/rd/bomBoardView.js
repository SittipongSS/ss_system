// ── มุมมองของคิว "ลง BOM" — ค้นหา · กรอง · เรียง · จัดกลุ่ม · เลือกแถว (มติเจ้าของ 04/11/2026) ──────────────────
//
// ⭐ เจ้าของ: "ทั้งการพิมพ์และการดาวน์โหลด อยากให้กรองและเลือกตามในระบบ … หากไม่เลือกก็ดาวน์โหลดทั้งหมด"
//   ⇒ **ตัวเดียว** ที่จอ เอกสารพิมพ์ และไฟล์ Excel (route) เรียก — ตัดสินว่าแถวไหนออก และออกลำดับไหน
//   (บทเรียนเดียวกับ `filterFormulas`/`filterProducts`: ตัวกรองจอ = ตัวกรองไฟล์ · เขียนสองที่เมื่อไรไฟล์ไม่ตรงจอ)
// ⭐ แถวที่ออก = ที่ติ๊กไว้ **ชนะทุกอย่าง** · ไม่ติ๊ก = ทุกแถวที่แสดงอยู่ (แท็บ + ค้นหา + ตัวกรอง) — กติกาเดียวกับรายงาน /tax
//   ("โหลดตามที่เห็นบนจอเสมอ · ที่ติ๊กเลือกไว้ชนะทุกอย่าง" · ReportExportActions)
// ⭐ ลำดับที่ออก = ลำดับบนจอ: แท็บ (`bomTabRows`) → เรียง → จัดกลุ่ม (`bucketList` · ถัง "ไม่ระบุ" ท้าย) แล้วคลี่เป็นแถวเดียว
// ⚠️ ไฟล์นี้ไม่แตะ React/DOM/DB — route ฝั่ง server import ได้ (ตัวเทียบค่ามาจาก `lib/sortCompare.js` ไม่ใช่ hook)
import { compareSortValues } from '@/lib/sortCompare';
import { bucketList } from '@/lib/listGrouping';
import { fmtDate, fmtNationalId } from '@/lib/format';
import { brandBoth } from '@/lib/master/brands';
import { BOM_FORMULA_KIND_LABEL, bomTabRows } from '@/lib/rd/bomBoard';

const NONE = '__none';
const text = (value) => String(value ?? '').trim();

/* ── ตัวกรอง (ปุ่ม "ตัวกรอง" · FilterPopover) — ห้ามิติที่ตาเห็นบนแถว ─────────────────────────────── */
export const BOM_FILTER_DIMENSIONS = Object.freeze([
  { key: 'customers', label: 'ลูกค้า', param: 'customer', searchable: true },
  { key: 'brands', label: 'แบรนด์', param: 'brand', searchable: true },
  { key: 'kinds', label: 'ชนิด', param: 'kind' },
  { key: 'senders', label: 'ส่งโดย', param: 'sender', searchable: true },
  { key: 'acceptors', label: 'รับเรื่องโดย', param: 'acceptor', searchable: true },
]);
export const EMPTY_BOM_FILTERS = Object.freeze(Object.fromEntries(BOM_FILTER_DIMENSIONS.map((d) => [d.key, []])));

/* ค่าของแต่ละมิติบนแถวหนึ่ง — กุญแจใช้ **id ก่อนชื่อ** (ลูกค้าชื่อซ้ำได้) · ว่าง = NONE (ตัวเลือก "ไม่ระบุ") */
const customerKey = (row) => row?.customerId || (text(row?.customerNameTh) ? `name:${text(row.customerNameTh)}` : NONE);
const brandLabelOf = (row) => text(brandBoth(row?.brandName, row?.brandNameEn));
const DIMENSION_VALUE = {
  customers: customerKey,
  brands: (row) => brandLabelOf(row) || NONE,
  kinds: (row) => row?.formula?.kind || 'none',
  senders: (row) => text(row?.sentByName) || NONE,
  acceptors: (row) => text(row?.acceptedByName) || NONE,
};
const customerLabel = (row) => [text(row?.customerArCode), text(row?.customerNameTh || row?.customerNameEn)].filter(Boolean).join(' · ');
const DIMENSION_LABEL = {
  customers: (row) => customerLabel(row) || 'ไม่ระบุลูกค้า',
  brands: (row) => brandLabelOf(row) || 'ไม่ระบุแบรนด์',
  kinds: (row) => BOM_FORMULA_KIND_LABEL[row?.formula?.kind || 'none'],
  senders: (row) => text(row?.sentByName) || 'ไม่ระบุผู้ส่ง',
  acceptors: (row) => text(row?.acceptedByName) || 'ยังไม่มีคนรับเรื่อง',
};

/** ตัวเลือกของแต่ละมิติจากแถวที่ส่งมา · "ไม่ระบุ" ท้ายสุด · ที่เหลือเรียงตามป้าย
 *  ⚠️ หน้าส่ง **ทุกแถวทุกแท็บ** — ตัวกรองค้างข้ามแท็บ ถ้าตัวเลือกมาจากแท็บเดียว ค่าที่เลือกไว้จะหายจากรายการ
 *     ตอนสลับแท็บ แล้วตารางว่างโดยไม่มีทางเห็นว่ากรองอะไรอยู่ */
export function bomFilterOptions(rows = []) {
  const out = {};
  for (const dim of BOM_FILTER_DIMENSIONS) {
    const seen = new Map();
    for (const row of rows || []) {
      const value = DIMENSION_VALUE[dim.key](row);
      if (!seen.has(value)) seen.set(value, DIMENSION_LABEL[dim.key](row));
    }
    out[dim.key] = [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => (a.value === NONE) - (b.value === NONE) || compareSortValues(a.label, b.label, 'asc'));
  }
  return out;
}

/** จำนวนมิติที่กรองอยู่ (เลขบนปุ่มตัวกรอง) */
export const bomFilterCount = (filters = {}) => BOM_FILTER_DIMENSIONS.filter((d) => (filters[d.key] || []).length > 0).length;

/* ── ค้นหา — ตาเห็นบนแถว = ต้องค้นเจอ (กติกา search-haystack) ─────────────────────────────────── */
export function bomSearchText(row) {
  const items = row?.formula?.items || [];
  const taxDigits = text(row?.customerTaxId).replace(/\D/g, '');
  return [
    row?.fgCode, row?.nameTh, row?.nameEn,
    row?.customerArCode, row?.customerNameTh, row?.customerNameEn,
    taxDigits, taxDigits ? fmtNationalId(taxDigits) : null,
    row?.brandName, row?.brandNameEn,
    BOM_FORMULA_KIND_LABEL[row?.formula?.kind || 'none'],
    // + วันที่บนป้าย "PF · ชื่อ · วันที่" (มติเจ้าของ 13/11)
    ...items.flatMap((item) => [item.code, item.name, item.date ? fmtDate(item.date) : null, item.note, item.tradeName]),
    row?.volume != null ? `${row.volume} ${row?.volumeUnit || ''}` : null, row?.saleUnit,
    row?.sentByName, row?.acceptedByName, row?.returnedByName, row?.returnReason,
    row?.doneByName, row?.bomCode, row?.bomNote,
  ].map(text).filter(Boolean).join('\n').toLocaleLowerCase('th');
}

/** แถวที่ผ่านคำค้น + ตัวกรอง (ลำดับเดิม) */
export function filterBomRows(rows = [], { q = '', filters = EMPTY_BOM_FILTERS } = {}) {
  const needle = text(q).toLocaleLowerCase('th');
  const active = BOM_FILTER_DIMENSIONS
    .map((d) => [d.key, new Set(filters?.[d.key] || [])])
    .filter(([, set]) => set.size > 0);
  return (rows || []).filter((row) => {
    if (needle && !bomSearchText(row).includes(needle)) return false;
    return active.every(([key, set]) => set.has(DIMENSION_VALUE[key](row)));
  });
}

/* ── เรียง (ปุ่ม "เรียง" · SortMenu) ─────────────────────────────────────────────────────────── */
// "ตามคิว" = ลำดับของแท็บ (งานค้าง: ส่งก่อนขึ้นก่อน · ตีกลับ/เสร็จ: ขยับล่าสุดขึ้นก่อน) — ทิศ "มาก → น้อย" กลับหัวลำดับนั้น
export const BOM_SORT_DEFAULT = 'queue';
export const BOM_SORT_OPTIONS = Object.freeze([
  { value: 'queue', label: 'ตามคิว' },
  { value: 'sentAt', label: 'วันที่ส่ง' },
  { value: 'movedAt', label: 'ขยับล่าสุด' },
  { value: 'fgCode', label: 'รหัส FG' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'volume', label: 'ปริมาตร' },
]);
/* ทิศตั้งต้นของแต่ละแบบ — เปลี่ยนแบบเรียง = ตั้งทิศนี้ให้ด้วย (กติกาเดียวกับรายงานยอดขาย) */
export const BOM_SORT_DIR = Object.freeze({ queue: 'asc', sentAt: 'asc', movedAt: 'desc', fgCode: 'asc', customer: 'asc', volume: 'desc' });
const SORT_VALUE = {
  sentAt: (row) => text(row?.sentAt) || null,
  movedAt: (row) => text(row?.updatedAt) || null,
  fgCode: (row) => text(row?.fgCode) || null,
  customer: (row) => text(row?.customerArCode) || text(row?.customerNameTh) || null,
  volume: (row) => (row?.volume != null && Number.isFinite(Number(row.volume)) ? Number(row.volume) : null),
};
const isSortKey = (key) => BOM_SORT_OPTIONS.some((o) => o.value === key);

/** เรียงแถวที่อยู่ในลำดับของแท็บแล้ว — แบบที่ไม่รู้จัก = ตามคิว · เท่ากัน = คงลำดับคิว (sort เสถียร) */
export function sortBomRows(rows = [], { sortKey = BOM_SORT_DEFAULT, sortDir = 'asc' } = {}) {
  const list = [...(rows || [])];
  const key = isSortKey(sortKey) ? sortKey : BOM_SORT_DEFAULT;
  if (key === 'queue') return sortDir === 'desc' ? list.reverse() : list;
  const get = SORT_VALUE[key];
  return list.sort((a, b) => compareSortValues(get(a), get(b), sortDir === 'desc' ? 'desc' : 'asc'));
}

/* ── จัดกลุ่ม (ปุ่ม "จัดกลุ่ม" · GroupMenu + TableGroupRow) ─────────────────────────────────────── */
export const BOM_GROUP_OPTIONS = Object.freeze([
  { value: 'none', label: 'ไม่จัดกลุ่ม' },
  { value: 'customer', label: 'ลูกค้า' },
  { value: 'brand', label: 'แบรนด์' },
  { value: 'kind', label: 'ชนิด' },
  { value: 'sender', label: 'ผู้ส่ง' },
]);
const GROUP_DESCRIBE = {
  customer: (row) => {
    const key = customerKey(row);
    return key === NONE
      ? { key: NONE, label: 'ไม่ระบุลูกค้า', missing: true }
      : { key, label: text(row?.customerNameTh || row?.customerNameEn) || 'ไม่ระบุชื่อ', sub: text(row?.customerArCode) || null };
  },
  brand: (row) => {
    const label = brandLabelOf(row);
    return label ? { key: `brand:${label}`, label } : { key: NONE, label: 'ไม่ระบุแบรนด์', missing: true };
  },
  kind: (row) => {
    const kind = row?.formula?.kind || 'none';
    return { key: `kind:${kind}`, label: BOM_FORMULA_KIND_LABEL[kind], missing: kind === 'none' };
  },
  sender: (row) => {
    const name = text(row?.sentByName);
    return name ? { key: `sender:${name}`, label: name } : { key: NONE, label: 'ไม่ระบุผู้ส่ง', missing: true };
  },
};

/** ถังของกลุ่ม (`bucketList`) — ไม่จัดกลุ่ม/แบบที่ไม่รู้จัก = `null` */
export function groupBomRows(sortedRows = [], groupBy = 'none') {
  return bucketList(sortedRows, GROUP_DESCRIBE[groupBy]);
}

/* ── รวมทั้งเส้น ─────────────────────────────────────────────────────────────────────────────── */

/**
 * แถวที่แสดงในแท็บ เรียงและจัดกลุ่มแล้ว — `{ rows (แบน · ลำดับเดียวกับจอ), groups (null = ไม่จัดกลุ่ม) }`
 * @param state `{ tab, q, filters, sortKey, sortDir, groupBy }`
 */
export function bomViewOf(allRows = [], state = {}) {
  const tabRows = bomTabRows(allRows, state.tab);
  const sorted = sortBomRows(filterBomRows(tabRows, state), state);
  const groups = groupBomRows(sorted, state.groupBy);
  return { rows: groups ? groups.flatMap((g) => g.items) : sorted, groups };
}

/** แถวที่จะพิมพ์/ส่งออก: ที่ติ๊กไว้ชนะ (ลำดับตามจอ) · ไม่ติ๊ก = ทุกแถวที่แสดงอยู่ */
export function bomOutputRows(viewRows = [], selectedIds = null) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  return ids.size ? (viewRows || []).filter((row) => ids.has(row.id)) : [...(viewRows || [])];
}

/* ── สถานะมุมมอง ⇄ query ของ route ส่งออก (GET · ค่าซ้ำได้ ⇒ ใช้คีย์ซ้ำ ไม่ใช่คั่นจุลภาค: ป้ายแบรนด์มีจุลภาคได้) ── */
export const BOM_EXPORT_URL_MAX = 1800; // เพดานเดียวกับลิงก์ดาวน์โหลดของ /tax (MAX_DOWNLOAD_URL)

/**
 * ลิงก์ส่งออกของมุมมองนี้ — `ids` ส่งเฉพาะตอนติ๊กบางแถว (ติ๊กครบทุกแถวที่แสดง = เท่ากับไม่ติ๊ก ไม่ต้องส่ง)
 * @returns {{ url: string, tooLong: boolean }}
 */
export function bomExportUrl(state = {}, { selectedIds = null, visibleCount = 0 } = {}) {
  const sp = new URLSearchParams();
  sp.set('tab', state.tab || '');
  if (text(state.q)) sp.set('q', text(state.q));
  for (const dim of BOM_FILTER_DIMENSIONS) for (const value of state.filters?.[dim.key] || []) sp.append(dim.param, value);
  if (state.sortKey && state.sortKey !== BOM_SORT_DEFAULT) sp.set('sort', state.sortKey);
  if (state.sortDir === 'desc') sp.set('dir', 'desc');
  if (state.groupBy && state.groupBy !== 'none') sp.set('group', state.groupBy);
  const ids = selectedIds instanceof Set ? [...selectedIds] : [...(selectedIds || [])];
  if (ids.length && ids.length < visibleCount) for (const id of ids) sp.append('id', id);
  const url = `/api/rd/bom-board/export?${sp.toString()}`;
  return { url, tooLong: url.length > BOM_EXPORT_URL_MAX };
}

/** อ่านสถานะมุมมองกลับจาก query (route) — ค่าแปลก ๆ ตกไปค่าตั้งต้น ไม่ throw */
export function bomViewStateFromQuery(searchParams) {
  const sp = searchParams;
  const filters = Object.fromEntries(BOM_FILTER_DIMENSIONS.map((d) => [d.key, sp.getAll(d.param).filter(Boolean)]));
  const sortKey = isSortKey(sp.get('sort')) ? sp.get('sort') : BOM_SORT_DEFAULT;
  const groupBy = BOM_GROUP_OPTIONS.some((o) => o.value === sp.get('group')) ? sp.get('group') : 'none';
  return {
    tab: sp.get('tab') || '',
    q: sp.get('q') || '',
    filters,
    sortKey,
    sortDir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
    groupBy,
    ids: sp.getAll('id').filter(Boolean),
  };
}
