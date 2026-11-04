// มุมมองของคิว "ลง BOM" — ค้นหา · กรอง · เรียง · จัดกลุ่ม · เลือก → พิมพ์/ดาวน์โหลด (มติเจ้าของ 04/11/2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOM_EXPORT_URL_MAX, EMPTY_BOM_FILTERS, bomExportUrl, bomFilterCount, bomFilterOptions, bomOutputRows, bomSearchText,
  bomViewOf, bomViewStateFromQuery, filterBomRows, groupBomRows, sortBomRows,
} from './bomBoardView.js';
import { bomBoardRows } from './bomBoard.js';

const product = (id, over = {}) => ({
  id, fgCode: `FG-${id}`, productDescription: `ชื่อ ${id}`, customerId: 'C-1', brandName: 'แบรนด์ ก', brandNameEn: null,
  categoryCode: '01-002', formulaId: 'FML-1', scentId: 'SCT-1', volume: 50, volumeUnit: 'ml',
  bomStatus: 'queued', bomSentAt: '2026-11-01T02:00:00Z', bomSentByName: 'ฝ่ายขาย ก', bomUpdatedAt: '2026-11-01T02:00:00Z', ...over,
});
const ctx = {
  customersById: new Map([
    ['C-1', { id: 'C-1', arCode: 'AR-1', name: 'บริษัท หนึ่ง', taxId: '0105565000001' }],
    ['C-2', { id: 'C-2', arCode: 'AR-2', name: 'บริษัท สอง' }],
  ]),
  scentsById: new Map([['SCT-1', { id: 'SCT-1', code: 'SC-01', name: 'มะลิ', customerTradeName: 'Jasmine Night' }]]),
  formulasById: new Map([['FML-1', { id: 'FML-1', code: 'PF-001', name: 'สูตรหนึ่ง' }]]),
};
const ROWS = bomBoardRows([
  product('A', { bomSentAt: '2026-10-30T02:00:00Z', volume: 30 }),
  product('B', { customerId: 'C-2', brandName: null, bomSentByName: 'ฝ่ายขาย ข', bomSentAt: '2026-11-02T02:00:00Z', volume: 100 }),
  product('C', { categoryCode: '02-024', formulaId: null, scentId: null, bomSentAt: '2026-11-01T02:00:00Z', volume: null }),
  product('D', { bomStatus: 'done', bomCode: 'BOM-9', bomDoneByName: 'RD ข', bomAcceptedByName: 'RD ข' }),
], ctx);
const ids = (rows) => rows.map((r) => r.id);

test('ค้นหา: ตาเห็นบนแถว = ค้นเจอ (FG · ลูกค้า · Tax ID ทั้งตัวเลขล้วนและแบบมีขีด · สูตร · กลิ่น · ชื่อที่ลูกค้าเรียก · รหัส BOM)', () => {
  for (const needle of ['fg-a', 'ar-1', 'บริษัท หนึ่ง', '0105565000001', '0-1055-65000-00-1', 'pf-001', 'มะลิ', 'jasmine', 'แบรนด์ ก']) {
    assert.ok(ids(filterBomRows(ROWS, { q: needle })).includes('A'), needle);
  }
  assert.deepEqual(ids(filterBomRows(ROWS, { q: 'bom-9' })), ['D']);
  assert.ok(bomSearchText(ROWS[0]).includes('ฝ่ายขาย ก'));
});

test('ตัวกรอง: ห้ามิติ · ภายในมิติ = หรือ · ข้ามมิติ = และ · "ไม่ระบุ" เลือกได้', () => {
  assert.deepEqual(ids(filterBomRows(ROWS, { filters: { ...EMPTY_BOM_FILTERS, customers: ['C-2'] } })), ['B']);
  assert.deepEqual(ids(filterBomRows(ROWS, { filters: { ...EMPTY_BOM_FILTERS, customers: ['C-1', 'C-2'], senders: ['ฝ่ายขาย ข'] } })), ['B']);
  assert.deepEqual(ids(filterBomRows(ROWS, { filters: { ...EMPTY_BOM_FILTERS, kinds: ['none'] } })), ['C']);
  assert.deepEqual(ids(filterBomRows(ROWS, { filters: { ...EMPTY_BOM_FILTERS, brands: ['__none'] } })), ['B']);
  assert.equal(bomFilterCount({ ...EMPTY_BOM_FILTERS, customers: ['C-1'], kinds: ['set'] }), 2);
  const opts = bomFilterOptions(ROWS);
  assert.deepEqual(opts.customers.map((o) => o.label), ['AR-1 · บริษัท หนึ่ง', 'AR-2 · บริษัท สอง']);
  assert.equal(opts.brands.at(-1).value, '__none', '"ไม่ระบุ" ท้ายสุด');
  assert.ok(opts.acceptors.some((o) => o.label === 'RD ข'));
});

test('เรียง: ตามคิว = ลำดับแท็บ (มาก→น้อย กลับหัว) · แบบอื่นเรียงจริง · ค่าว่างท้ายเสมอ', () => {
  const queued = bomViewOf(ROWS, { tab: 'queued' }).rows;
  assert.deepEqual(ids(queued), ['A', 'C', 'B'], 'ส่งก่อนอยู่บนสุด');
  assert.deepEqual(ids(sortBomRows(queued, { sortKey: 'queue', sortDir: 'desc' })), ['B', 'C', 'A']);
  assert.deepEqual(ids(sortBomRows(queued, { sortKey: 'volume', sortDir: 'desc' })), ['B', 'A', 'C'], 'ไม่มีปริมาตรไปท้าย');
  assert.deepEqual(ids(sortBomRows(queued, { sortKey: 'volume', sortDir: 'asc' })), ['A', 'B', 'C'], 'ไม่มีปริมาตรไปท้ายทั้งสองทิศ');
  assert.deepEqual(ids(sortBomRows(queued, { sortKey: 'customer', sortDir: 'desc' })), ['B', 'A', 'C']);
  assert.deepEqual(ids(sortBomRows(queued, { sortKey: 'bogus' })), ['A', 'C', 'B'], 'แบบที่ไม่รู้จัก = ตามคิว');
});

test('จัดกลุ่ม: ลำดับถังตามแถวแรกที่เรียงมา · ถัง "ไม่ระบุ" ท้าย · ลำดับที่ออก = คลี่ถังตามจอ', () => {
  const view = bomViewOf(ROWS, { tab: 'queued', groupBy: 'brand' });
  assert.deepEqual(view.groups.map((g) => g.label), ['แบรนด์ ก', 'ไม่ระบุแบรนด์']);
  assert.deepEqual(ids(view.rows), ['A', 'C', 'B'], 'แถวไม่มีแบรนด์ไปท้ายตามถัง');
  const byCustomer = groupBomRows(view.rows, 'customer');
  assert.deepEqual(byCustomer.map((g) => [g.label, g.sub, g.count]), [['บริษัท หนึ่ง', 'AR-1', 2], ['บริษัท สอง', 'AR-2', 1]]);
  assert.equal(groupBomRows(view.rows, 'none'), null);
  assert.equal(bomViewOf(ROWS, { tab: 'queued', groupBy: 'nope' }).groups, null);
});

test('🔴 แถวที่ออก: ที่ติ๊กชนะทุกอย่าง (ลำดับตามจอ) · ไม่ติ๊ก = ทุกแถวที่แสดงอยู่ (ไม่ใช่ทั้งคิว)', () => {
  const shown = bomViewOf(ROWS, { tab: 'queued', filters: { ...EMPTY_BOM_FILTERS, customers: ['C-1'] } }).rows;
  assert.deepEqual(ids(bomOutputRows(shown, new Set())), ['A', 'C'], 'ไม่ติ๊ก = ที่กรองแล้ว ไม่ใช่ B ด้วย');
  assert.deepEqual(ids(bomOutputRows(shown, new Set(['C', 'A']))), ['A', 'C'], 'ลำดับตามจอ ไม่ใช่ลำดับที่ติ๊ก');
  assert.deepEqual(ids(bomOutputRows(shown, ['C'])), ['C']);
});

test('🔴 ลิงก์ Excel ⇄ route: มุมมองเดินทางครบ (แท็บ/คำค้น/ตัวกรอง/เรียง/กลุ่ม/ที่ติ๊ก) แล้ว route ได้แถวเดียวกับจอ', () => {
  const state = {
    tab: 'queued', q: 'บริษัท', filters: { ...EMPTY_BOM_FILTERS, customers: ['C-1', 'C-2'], brands: ['แบรนด์, จุลภาค'] },
    sortKey: 'volume', sortDir: 'desc', groupBy: 'customer',
  };
  const { url, tooLong } = bomExportUrl(state, { selectedIds: new Set(['A']), visibleCount: 3 });
  assert.equal(tooLong, false);
  const back = bomViewStateFromQuery(new URL(url, 'http://x').searchParams);
  assert.deepEqual(back.filters.customers, ['C-1', 'C-2']);
  assert.deepEqual(back.filters.brands, ['แบรนด์, จุลภาค'], 'ป้ายที่มีจุลภาคไม่แตก (ใช้คีย์ซ้ำ)');
  assert.equal(back.q, 'บริษัท');
  assert.equal(back.sortKey, 'volume');
  assert.equal(back.sortDir, 'desc');
  assert.equal(back.groupBy, 'customer');
  assert.deepEqual(back.ids, ['A']);
  // ไม่ติ๊ก หรือ ติ๊กครบทุกแถวที่แสดง = ไม่ส่ง id (เท่ากับ "ทุกแถวที่แสดงอยู่")
  assert.doesNotMatch(bomExportUrl(state, { selectedIds: new Set(), visibleCount: 3 }).url, /[?&]id=/);
  assert.doesNotMatch(bomExportUrl(state, { selectedIds: new Set(['A', 'B', 'C']), visibleCount: 3 }).url, /[?&]id=/);
  // ค่าตั้งต้นไม่ลงลิงก์ · ค่าแปลก ๆ ตกไปค่าตั้งต้น
  assert.equal(bomExportUrl({ tab: 'done', sortKey: 'queue', sortDir: 'asc', groupBy: 'none' }).url, '/api/rd/bom-board/export?tab=done');
  const odd = bomViewStateFromQuery(new URLSearchParams('tab=queued&sort=hack&group=hack&dir=sideways'));
  assert.deepEqual([odd.sortKey, odd.groupBy, odd.sortDir], ['queue', 'none', 'asc']);
  // ติ๊กเยอะจนลิงก์ยาวเกิน = บอก (จอเตือน) ไม่ตัดแถวทิ้งเงียบ
  const many = new Set(Array.from({ length: 60 }, (_, i) => `PRD-00000000-0000-0000-0000-${String(i).padStart(12, '0')}`));
  assert.equal(bomExportUrl({ tab: 'done' }, { selectedIds: many, visibleCount: 100 }).tooLong, true);
  assert.ok(BOM_EXPORT_URL_MAX >= 1800);
});
