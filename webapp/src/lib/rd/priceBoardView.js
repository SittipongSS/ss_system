// ── มุมมองของหน้า "ราคา + Ingredient List" — ค้นหา · กรอง · จัดกลุ่ม · เรียง (มติเจ้าของ 09/11/2026) ─────────────
//
// ⭐ เจ้าของ: *“ตาราง อยากให้ จัดกลุ่ม เรียง กรอง ค้นหา ได้เหมือนตารางอื่นๆ ในระบบ”* ⇒ ลอกแพตเทิร์นคิวลง BOM
//   (`bomBoardView.js` · ปุ่มกลาง FilterPopover · GroupMenu · SortMenu · ถัง "ไม่ระบุ" ท้ายสุด) ให้ครบสามแท็บ
//   · งานค้างในคำร้อง — หน่วย = แถวคำร้อง (`priceBoardRows`) · จัดกลุ่มตามใบเป็นค่าตั้งต้น (มติ ม-153 เดิม)
//   · กลิ่น / สูตร   — หน่วย = ตัวในทะเบียน (`priceRegistryRows`) · ค่าตั้งต้นเห็นเฉพาะ "ยังไม่ครบ"
// ⚠️ ไฟล์นี้ไม่แตะ React/DOM/DB — ตัวเทียบค่ามาจาก `lib/sortCompare.js` · ชื่อหมวดส่งมาจากจอ (`categoryLabel`)
import { compareSortValues } from '@/lib/sortCompare';
import { bucketList } from '@/lib/listGrouping';
import { ROW_STAGE_LABELS } from '@/lib/requests/rowStage';
import { compareBoardRows } from '@/lib/rd/priceBoard';
import { REGISTRY_INGREDIENT_STATES, REGISTRY_PRICE_STATES } from '@/lib/rd/priceRegistry';

const NONE = '__none';
const text = (value) => String(value ?? '').trim();

export const PRICE_TABS = Object.freeze([
  { key: 'requests', label: 'งานค้างในคำร้อง' },
  { key: 'scents', label: 'กลิ่น' },
  { key: 'formulas', label: 'สูตร' },
]);
export const isPriceTab = (key) => PRICE_TABS.some((t) => t.key === key);

/* ⭐ แท็บทะเบียน: เปิดมาเห็นเฉพาะ "ยังไม่ครบ" — คำถามของเจ้าของคือ "อันไหนยังไม่ใส่" · "ครบแล้ว/ทั้งหมด" กดดูได้ */
export const PRICE_PROGRESS_OPTIONS = Object.freeze([
  { value: 'todo', label: 'ยังไม่ครบ' },
  { value: 'done', label: 'ครบแล้ว' },
  { value: 'all', label: 'ทั้งหมด' },
]);

/* ── ค่าของแต่ละมิติ — กุญแจใช้ id ก่อนชื่อ (ลูกค้าชื่อซ้ำได้) · ว่าง = NONE ("ไม่ระบุ") ────────────────────── */
const customerKey = (row) => row?.customerId
  || (text(row?.customerArCode) ? `ar:${text(row.customerArCode)}` : '')
  || (text(row?.customerName) ? `name:${text(row.customerName)}` : NONE);
const customerLabel = (row) => [text(row?.customerArCode), text(row?.customerName)].filter(Boolean).join(' · ') || 'ไม่ระบุลูกค้า';
const REQUEST_KIND_LABEL = Object.freeze({ formula: 'สูตร', scent: 'กลิ่น (หัวน้ำหอม)', none: 'ยังไม่ผูกทะเบียน' });
const requestKind = (row) => row?.registry?.kind || 'none';
const categoryKey = (row) => text(row?.categoryCode) || NONE;

/* หมวดของสูตร — "รหัส ชื่อ" (ชื่อมาจากจอ: ชุดหมวดเป็น master ที่จอโหลดผ่านแคชอยู่แล้ว) */
const categoryText = (row, opts) => {
  const code = text(row?.categoryCode);
  if (!code) return 'ยังไม่ระบุหมวด';
  const name = text(opts?.categoryLabel?.(code));
  return name ? `${code} ${name}` : code;
};

const DIMENSIONS = {
  customers: { label: 'ลูกค้า', searchable: true, value: customerKey, text: customerLabel },
  stages: {
    label: 'ขั้น', value: (row) => row?.stage || NONE,
    text: (row) => ROW_STAGE_LABELS[row?.stage] || 'ไม่ระบุขั้น',
  },
  kinds: { label: 'ชนิด', value: requestKind, text: (row) => REQUEST_KIND_LABEL[requestKind(row)] },
  categories: { label: 'หมวด', searchable: true, value: categoryKey, text: categoryText },
  prices: {
    label: 'ราคา', value: (row) => row?.priceState || NONE,
    text: (row) => REGISTRY_PRICE_STATES[row?.priceState]?.label || 'ไม่ระบุ',
  },
  ingredients: {
    label: 'Ingredient List', value: (row) => row?.ingredientState || NONE,
    text: (row) => REGISTRY_INGREDIENT_STATES[row?.ingredientState]?.label || 'ไม่ระบุ',
  },
};

/** มิติของตัวกรองแต่ละแท็บ — ตาเห็นบนแถวทุกตัว */
export const PRICE_FILTER_DIMENSIONS = Object.freeze({
  requests: ['customers', 'stages', 'kinds'],
  scents: ['customers', 'prices'],
  formulas: ['customers', 'categories', 'prices', 'ingredients'],
});
const dimsOf = (tab) => PRICE_FILTER_DIMENSIONS[tab] || [];
export const emptyPriceFilters = (tab) => Object.fromEntries(dimsOf(tab).map((key) => [key, []]));

/** กลุ่มของ FilterPopover — `[{ key, label, searchable }]` */
export const priceFilterDimensions = (tab) => dimsOf(tab).map((key) => ({
  key, label: DIMENSIONS[key].label, searchable: !!DIMENSIONS[key].searchable,
}));

/* ลำดับตายตัวของมิติที่เป็นสถานะ (ของที่ต้องทำก่อนขึ้นก่อน) — ไม่ใช่เรียงตามป้าย */
const STATE_ORDER = {
  stages: ['awaiting_price', 'awaiting_ingredients'],
  prices: ['missing', 'blocked', 'expired', 'ready'],
  ingredients: ['missing', 'ready', 'none'],
  kinds: ['formula', 'scent', 'none'],
};

/**
 * ตัวเลือกของแต่ละมิติจาก **ทุกแถวของแท็บ** (ไม่ใช่เฉพาะที่ผ่านตัวกรอง/ช่อง "ยังไม่ครบ") — ค่าที่เลือกไว้ต้องไม่หาย
 * จากรายการตอนสลับ "ครบแล้ว" ไม่งั้นตารางว่างโดยไม่เห็นว่ากรองอะไรอยู่ (บทเรียนเดียวกับ `bomFilterOptions`)
 */
export function priceFilterOptions(tab, rows = [], opts = {}) {
  const out = {};
  for (const key of dimsOf(tab)) {
    const dim = DIMENSIONS[key];
    const seen = new Map();
    for (const row of rows || []) {
      const value = dim.value(row);
      if (!seen.has(value)) seen.set(value, dim.text(row, opts));
    }
    const order = STATE_ORDER[key];
    out[key] = [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => (a.value === NONE) - (b.value === NONE)
        || (order ? order.indexOf(a.value) - order.indexOf(b.value) : compareSortValues(a.label, b.label, 'asc')));
  }
  return out;
}

/** จำนวนมิติที่กรองอยู่ (เลขบนปุ่มตัวกรอง) */
export const priceFilterCount = (tab, filters = {}) => dimsOf(tab).filter((key) => (filters?.[key] || []).length > 0).length;

/* ── ค้นหา — ตาเห็นบนแถว = ต้องค้นเจอ (กติกา search-haystack) ─────────────────────────────────────────── */
export function priceSearchText(tab, row, opts = {}) {
  const parts = tab === 'requests'
    ? [
      row?.docNo, row?.title, row?.customerName, row?.customerArCode, row?.requestedByName,
      row?.label, row?.name, row?.registry?.code, row?.registry?.name, row?.registry?.categoryCode,
      REQUEST_KIND_LABEL[requestKind(row)], ROW_STAGE_LABELS[row?.stage],
    ]
    : [
      row?.code, row?.name, row?.customerName, row?.customerArCode, row?.customerTradeName,
      row?.scent?.code, row?.scent?.name,
      row?.categoryCode ? categoryText(row, opts) : null,
      REGISTRY_PRICE_STATES[row?.priceState]?.label,
      row?.ingredientState && row.ingredientState !== 'none' ? `Ingredient List ${REGISTRY_INGREDIENT_STATES[row.ingredientState].label}` : null,
      // ค้นด้วยชื่อสารได้ (กติกาเดียวกับทะเบียนสูตร · ม-158)
      row?.ingredient?.current,
      ...(row?.sources || []).flatMap((s) => [s.docNo, s.label]),
    ];
  return parts.map(text).filter(Boolean).join('\n').toLocaleLowerCase('th');
}

/** แถวที่ผ่านคำค้น + ตัวกรอง + ช่อง "ยังไม่ครบ/ครบแล้ว" (แท็บทะเบียน) — ลำดับเดิม */
export function filterPriceRows(tab, rows = [], { q = '', filters = {}, progress = 'todo' } = {}, opts = {}) {
  const needle = text(q).toLocaleLowerCase('th');
  const active = dimsOf(tab)
    .map((key) => [key, new Set(filters?.[key] || [])])
    .filter(([, set]) => set.size > 0);
  return (rows || []).filter((row) => {
    if (tab !== 'requests') {
      if (progress === 'todo' && row?.complete) return false;
      if (progress === 'done' && !row?.complete) return false;
    }
    if (needle && !priceSearchText(tab, row, opts).includes(needle)) return false;
    return active.every(([key, set]) => set.has(DIMENSIONS[key].value(row)));
  });
}

/* ── เรียง ────────────────────────────────────────────────────────────────────────────────────────────────── */
// "รอนานสุดก่อน" = ลำดับเดิมของหน้า (คอนเฟิร์มก่อนขึ้นก่อน) — ทิศ "มาก → น้อย" กลับหัวลำดับนั้น
export const PRICE_SORT_DEFAULT = 'waiting';
export const PRICE_SORT_OPTIONS = Object.freeze({
  requests: [
    { value: 'waiting', label: 'รอนานสุดก่อน' },
    { value: 'code', label: 'รหัสกลิ่น/สูตร' },
    { value: 'docNo', label: 'เลขที่คำร้อง' },
    { value: 'customer', label: 'ลูกค้า' },
  ],
  scents: [
    { value: 'waiting', label: 'คอนเฟิร์มก่อนขึ้นก่อน' },
    { value: 'confirmedLast', label: 'คอนเฟิร์มล่าสุด' },
    { value: 'code', label: 'รหัสกลิ่น' },
    { value: 'name', label: 'ชื่อกลิ่น' },
    { value: 'customer', label: 'ลูกค้า' },
  ],
  formulas: [
    { value: 'waiting', label: 'คอนเฟิร์มก่อนขึ้นก่อน' },
    { value: 'confirmedLast', label: 'คอนเฟิร์มล่าสุด' },
    { value: 'code', label: 'รหัสสูตร' },
    { value: 'name', label: 'ชื่อสูตร' },
    { value: 'category', label: 'หมวด' },
    { value: 'customer', label: 'ลูกค้า' },
  ],
});
/* ทิศตั้งต้นของแต่ละแบบ — เปลี่ยนแบบเรียง = ตั้งทิศนี้ให้ด้วย (กติกาเดียวกับรายงานยอดขาย/คิวลง BOM) */
export const PRICE_SORT_DIR = Object.freeze({ waiting: 'asc', confirmedLast: 'desc', code: 'asc', docNo: 'asc', name: 'asc', category: 'asc', customer: 'asc' });
const SORT_VALUE = {
  code: (row) => text(row?.registry ? row.registry.code : row?.code) || null,
  docNo: (row) => text(row?.docNo) || null,
  name: (row) => text(row?.name) || null,
  category: (row) => text(row?.categoryCode) || null,
  customer: (row) => text(row?.customerArCode) || text(row?.customerName) || null,
  confirmedLast: (row) => text(row?.lastConfirmedAt) || null,
};
const isSortKey = (tab, key) => (PRICE_SORT_OPTIONS[tab] || []).some((o) => o.value === key);

/* ลำดับคิวของแท็บทะเบียน — คอนเฟิร์มก่อนขึ้นก่อน · ไม่มีวันไปท้าย · ปิดท้ายด้วยรหัสให้นิ่ง */
function compareRegistryQueue(a, b) {
  const ad = a.firstConfirmedAt || '', bd = b.firstConfirmedAt || '';
  if (!ad !== !bd) return ad ? -1 : 1;
  if (ad !== bd) return ad < bd ? -1 : 1;
  return compareSortValues(text(a.code) || null, text(b.code) || null, 'asc') || String(a.id).localeCompare(String(b.id));
}

/** เรียงแถว — แบบที่ไม่รู้จัก = ตามคิว · เท่ากัน = คงลำดับคิว (sort เสถียร) */
export function sortPriceRows(tab, rows = [], { sortKey = PRICE_SORT_DEFAULT, sortDir = 'asc' } = {}) {
  const queue = [...(rows || [])].sort(tab === 'requests' ? compareBoardRows : compareRegistryQueue);
  const key = isSortKey(tab, sortKey) ? sortKey : PRICE_SORT_DEFAULT;
  if (key === 'waiting') return sortDir === 'desc' ? queue.reverse() : queue;
  const get = SORT_VALUE[key];
  return queue.sort((a, b) => compareSortValues(get(a), get(b), sortDir === 'desc' ? 'desc' : 'asc'));
}

/* ── จัดกลุ่ม ─────────────────────────────────────────────────────────────────────────────────────────────── */
export const PRICE_GROUP_OPTIONS = Object.freeze({
  requests: [
    { value: 'request', label: 'ใบคำร้อง' },
    { value: 'customer', label: 'ลูกค้า' },
    { value: 'stage', label: 'ขั้น' },
    { value: 'none', label: 'ไม่จัดกลุ่ม' },
  ],
  scents: [
    { value: 'none', label: 'ไม่จัดกลุ่ม' },
    { value: 'customer', label: 'ลูกค้า' },
    { value: 'price', label: 'สถานะราคา' },
  ],
  formulas: [
    { value: 'none', label: 'ไม่จัดกลุ่ม' },
    { value: 'missing', label: 'สิ่งที่ขาด' },
    { value: 'customer', label: 'ลูกค้า' },
    { value: 'category', label: 'หมวด' },
  ],
});
/* ค่าตั้งต้น — งานค้างในคำร้องจัดกลุ่มตามใบ (ใบที่ครบทุกรายการ = RD ตอบใบนั้นแล้ว ⇒ ต้องเห็นว่าเหลือกี่รายการในใบ) */
export const PRICE_GROUP_DEFAULT = Object.freeze({ requests: 'request', scents: 'none', formulas: 'none' });

const MISSING_GROUPS = [
  { key: 'missing:both', label: 'ขาดทั้งราคาและ Ingredient List', test: (r) => r.needsPrice && r.needsIngredient },
  { key: 'missing:price', label: 'ขาดราคา', test: (r) => r.needsPrice },
  { key: 'missing:ingredient', label: 'ขาด Ingredient List', test: (r) => r.needsIngredient },
  { key: 'missing:none', label: 'ครบแล้ว', test: () => true },
];
const GROUP_DESCRIBE = {
  request: (row) => ({
    key: `request:${row?.requestId}`,
    label: [text(row?.docNo) || 'คำร้อง', text(row?.customerName)].filter(Boolean).join(' · '),
    sub: text(row?.customerArCode) || null,
  }),
  customer: (row) => {
    const key = customerKey(row);
    return key === NONE
      ? { key: NONE, label: 'ไม่ระบุลูกค้า', missing: true }
      : { key: `customer:${key}`, label: text(row?.customerName) || 'ไม่ระบุชื่อ', sub: text(row?.customerArCode) || null };
  },
  stage: (row) => ({ key: `stage:${row?.stage}`, label: ROW_STAGE_LABELS[row?.stage] || 'ไม่ระบุขั้น' }),
  price: (row) => ({ key: `price:${row?.priceState}`, label: REGISTRY_PRICE_STATES[row?.priceState]?.label || 'ไม่ระบุ' }),
  category: (row, opts) => (text(row?.categoryCode)
    ? { key: `category:${text(row.categoryCode)}`, label: categoryText(row, opts) }
    : { key: NONE, label: 'ยังไม่ระบุหมวด', missing: true }),
  missing: (row) => {
    const g = MISSING_GROUPS.find((m) => m.test(row));
    return { key: g.key, label: g.label };
  },
};
/* กลุ่มที่เป็นสถานะเรียงตายตัว (ของที่ต้องทำก่อนขึ้นก่อน) — ไม่ใช่ตามลำดับที่แถวแรกโผล่ */
const GROUP_ORDER = {
  stage: STATE_ORDER.stages.map((s) => `stage:${s}`),
  price: STATE_ORDER.prices.map((s) => `price:${s}`),
  missing: MISSING_GROUPS.map((g) => g.key),
};
const isGroupKey = (tab, key) => (PRICE_GROUP_OPTIONS[tab] || []).some((o) => o.value === key);

/** ถังของกลุ่ม (`bucketList`) — ไม่จัดกลุ่ม/แบบที่ไม่รู้จัก = `null` */
export function groupPriceRows(tab, sortedRows = [], groupBy = 'none', opts = {}) {
  if (!isGroupKey(tab, groupBy) || groupBy === 'none') return null;
  const describe = GROUP_DESCRIBE[groupBy];
  const buckets = bucketList(sortedRows, (row) => describe(row, opts));
  const order = GROUP_ORDER[groupBy];
  if (!buckets || !order) return buckets;
  return [...buckets].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/** ค่าตั้งต้นของมุมมองหนึ่งแท็บ */
export const defaultPriceView = (tab) => ({
  q: '',
  filters: emptyPriceFilters(tab),
  sortKey: PRICE_SORT_DEFAULT,
  sortDir: PRICE_SORT_DIR[PRICE_SORT_DEFAULT],
  groupBy: PRICE_GROUP_DEFAULT[tab] || 'none',
  progress: 'todo',
});
export const DEFAULT_PRICE_VIEWS = Object.freeze(Object.fromEntries(PRICE_TABS.map((t) => [t.key, defaultPriceView(t.key)])));

/** มุมมองที่จำไว้ (sessionStorage) ผสมค่าตั้งต้น — ค่าที่ไม่รู้จัก (เวอร์ชันเก่า) ตกไปค่าตั้งต้นของแท็บ */
export function priceViewState(tab, saved = {}) {
  const base = defaultPriceView(tab);
  const view = { ...base, ...(saved || {}) };
  return {
    ...view,
    q: typeof view.q === 'string' ? view.q : '',
    filters: { ...base.filters, ...(view.filters && typeof view.filters === 'object' ? view.filters : {}) },
    sortKey: isSortKey(tab, view.sortKey) ? view.sortKey : base.sortKey,
    sortDir: view.sortDir === 'desc' ? 'desc' : 'asc',
    groupBy: isGroupKey(tab, view.groupBy) ? view.groupBy : base.groupBy,
    progress: PRICE_PROGRESS_OPTIONS.some((o) => o.value === view.progress) ? view.progress : base.progress,
  };
}

/**
 * แถวที่แสดงในแท็บ เรียงและจัดกลุ่มแล้ว — `{ rows (แบน · ลำดับเดียวกับจอ), groups (null = ไม่จัดกลุ่ม) }`
 * @param state `{ q, filters, progress, sortKey, sortDir, groupBy }` · `opts.categoryLabel(code)` = ชื่อหมวด
 */
export function priceViewOf(tab, allRows = [], state = {}, opts = {}) {
  const sorted = sortPriceRows(tab, filterPriceRows(tab, allRows, state, opts), state);
  const groups = groupPriceRows(tab, sorted, state.groupBy, opts);
  return { rows: groups ? groups.flatMap((g) => g.items) : sorted, groups };
}
