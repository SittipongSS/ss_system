import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOM_BOARD_TABS, BOM_TODO_STATUSES, bomBoardRows, bomBoardTotals, bomFormulaView, bomTabRows, bomWaitingDays } from './bomBoard.js';

const p = (id, over = {}) => ({
  id, fgCode: `FG-${id}`, productDescription: `ชื่อ ${id}`, customerId: 'C-1', customerName: 'ชื่อที่ประทับ',
  categoryCode: '01-002', formulaId: 'FML-1', formulaCode: 'F-001', formulaName: 'สูตรหนึ่ง', scentId: 'SCT-1',
  volume: 50, volumeUnit: 'ml', bomStatus: 'queued', bomSentAt: '2026-11-01T02:00:00Z', ...over,
});
const customersById = new Map([['C-1', { id: 'C-1', arCode: 'AR-1058', name: 'บริษัท ไทย', nameEn: 'Thai Co.' }]]);
const scentsById = new Map([['SCT-1', { id: 'SCT-1', code: 'SC-01', name: 'กลิ่นมะลิ' }], ['SCT-2', { id: 'SCT-2', code: 'SC-02', name: 'กลิ่นส้ม' }]]);

test('แถวของคิว: AR + ชื่อไทย/อังกฤษอ่านสดจากทะเบียน · สินค้าที่ยังไม่ส่งไม่ขึ้น', () => {
  const rows = bomBoardRows([p('A'), p('B', { bomStatus: null })], { customersById, scentsById });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerArCode, 'AR-1058');
  assert.equal(rows[0].customerNameTh, 'บริษัท ไทย');
  assert.equal(rows[0].customerNameEn, 'Thai Co.');
  assert.equal(rows[0].formula.kind, 'formula');
  assert.equal(rows[0].formula.items[0].note, 'กลิ่น กลิ่นมะลิ');
  // ลูกค้าไม่อยู่ในทะเบียน = ใช้ชื่อที่ประทับบนสินค้า
  const orphan = bomBoardRows([p('C', { customerId: 'C-X' })], { customersById });
  assert.equal(orphan[0].customerNameTh, 'ชื่อที่ประทับ');
  assert.equal(orphan[0].customerArCode, null);
});

test('สูตร/กลิ่นตามหมวด — หัวน้ำหอมโชว์กลิ่น · ชุดของขวัญโชว์ทุกแถวสูตร · ไม่มีสูตร = none', () => {
  assert.deepEqual(bomFormulaView({ categoryCode: '02-020', scentId: 'SCT-2' }, { scentsById }), { kind: 'scent', items: [{ code: 'SC-02', name: 'กลิ่นส้ม' }] });
  const set = bomFormulaView({ categoryCode: '01-037' }, { giftSetRows: [{ formulaCode: 'F1', formulaName: 'หนึ่ง', categoryName: 'น้ำหอม' }, { formulaCode: 'F2', formulaName: 'สอง', categoryName: 'ก้านหอม' }] });
  assert.equal(set.kind, 'set');
  assert.equal(set.items.length, 2);
  assert.equal(bomFormulaView({ categoryCode: '02-024' }).kind, 'none');
});

test('ยอด + แท็บ: ค้าง = รอรับเรื่อง + กำลังลง (ตัวเดียวกับป้ายเมนู) · รอนานสุดนับเฉพาะที่ค้าง', () => {
  const rows = bomBoardRows([
    p('A', { bomSentAt: '2026-10-30T02:00:00Z' }),
    p('B', { bomStatus: 'in_progress', bomSentAt: '2026-11-02T02:00:00Z' }),
    p('C', { bomStatus: 'returned', bomSentAt: '2026-10-01T02:00:00Z' }),
    p('D', { bomStatus: 'done', bomSentAt: '2026-09-01T02:00:00Z' }),
  ], { customersById });
  const totals = bomBoardTotals(rows, { todayIso: '2026-11-03' });
  assert.deepEqual([totals.queued, totals.in_progress, totals.returned, totals.done, totals.todo], [1, 1, 1, 1, 2]);
  assert.equal(totals.maxDays, 4);
  assert.deepEqual([...BOM_TODO_STATUSES], ['queued', 'in_progress']);
  assert.deepEqual(BOM_BOARD_TABS.map((t) => t.key), ['queued', 'in_progress', 'returned', 'done']);
});

test('เรียง: งานค้างส่งก่อนขึ้นก่อน · ตีกลับ/เสร็จ ขยับล่าสุดขึ้นก่อน', () => {
  const rows = bomBoardRows([
    p('A', { bomSentAt: '2026-11-02T02:00:00Z' }),
    p('B', { bomSentAt: '2026-10-30T02:00:00Z' }),
    p('C', { bomStatus: 'done', bomUpdatedAt: '2026-10-01T00:00:00Z' }),
    p('D', { bomStatus: 'done', bomUpdatedAt: '2026-11-01T00:00:00Z' }),
  ], { customersById });
  assert.deepEqual(bomTabRows(rows, 'queued').map((r) => r.id), ['B', 'A']);
  assert.deepEqual(bomTabRows(rows, 'done').map((r) => r.id), ['D', 'C']);
  assert.equal(bomWaitingDays({ bomSentAt: '2026-11-01T20:00:00Z' }, '2026-11-03'), 2);
  assert.equal(bomWaitingDays({}, '2026-11-03'), null);
});

test('ป้ายเมนูนับด้วยชุดสถานะเดียวกับหน้า + route อ่านไม่เลือกราคาผลิต (รูปโค้ด)', () => {
  const counts = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  assert.match(counts, /in\('bomStatus', BOM_TODO_STATUSES\)/);
  const board = readFileSync(new URL('./bomBoard.js', import.meta.url), 'utf8');
  const cols = board.slice(board.indexOf('BOM_BOARD_PRODUCT_COLUMNS'), board.indexOf("].join(', ')"));
  assert.doesNotMatch(cols, /costPrice|factoryProfit|materialCost/);
});
