import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOM_BOARD_PRODUCT_COLUMNS, BOM_BOARD_TABS, BOM_TODO_STATUSES, bomBoardRows, bomBoardTotals, bomFormulaView, bomTabRows, bomWaitingDays } from './bomBoard.js';

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
  assert.deepEqual(bomFormulaView({ categoryCode: '02-020', scentId: 'SCT-2' }, { scentsById }), { kind: 'scent', items: [{ code: 'SC-02', name: 'กลิ่นส้ม', tradeName: null }] });
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

/* ── มติเจ้าของ 03/11: ช่องลูกค้าเพิ่มเลขผู้เสียภาษี/สาขา + แบรนด์ · สูตร/กลิ่นเพิ่มชื่อที่ลูกค้าเรียก (อ่านสดจากทะเบียน) ── */
test('ช่องลูกค้า: เลขผู้เสียภาษี + สาขาจากทะเบียนลูกค้า · แบรนด์จาก FG', () => {
  const customers = new Map([['C-1', { id: 'C-1', arCode: 'AR-903', name: 'บริษัท อาเตโพเล่ จำกัด', taxId: '0105559000000', branchCode: '00000' }]]);
  const [row] = bomBoardRows([p('A', { brandName: 'อาเต้', brandNameEn: 'ARTE' })], { customersById: customers });
  assert.equal(row.customerTaxId, '0105559000000');
  assert.equal(row.customerBranchCode, '00000');
  assert.deepEqual([row.brandName, row.brandNameEn], ['อาเต้', 'ARTE']);
  const [orphan] = bomBoardRows([p('B', { customerId: 'C-X' })], { customersById: customers });
  assert.deepEqual([orphan.customerTaxId, orphan.brandName], [null, null]);
  assert.match(BOM_BOARD_PRODUCT_COLUMNS, /"brandName", "brandNameEn"/);
});

test('สูตร/กลิ่น: รหัส/ชื่อสูตรอ่านสดจากทะเบียน (สำเนาบน FG เป็นสำรอง) · ชื่อที่ลูกค้าเรียกมาจากกลิ่นที่เดียว (มติ 04/11)', () => {
  // ทะเบียนสูตรมีค่าเก่าค้างในคอลัมน์ — ต้องไม่ถูกใช้
  const formulasById = new Map([['FML-1', { id: 'FML-1', code: 'PF-NEW', name: 'ชื่อใหม่ในทะเบียน', customerTradeName: 'ค่าเก่าของสูตร' }]]);
  const scents = new Map([['SCT-1', { id: 'SCT-1', code: 'SC-01', name: 'กลิ่นมะลิ', customerTradeName: 'Jasmine Night' }]]);
  const live = bomFormulaView(p('A'), { formulasById, scentsById: scents });
  assert.deepEqual(live.items[0], { code: 'PF-NEW', name: 'ชื่อใหม่ในทะเบียน', note: 'กลิ่น กลิ่นมะลิ', tradeName: 'Jasmine Night' });
  // กลิ่นไม่มีชื่อที่ลูกค้าเรียก = ไม่มีบรรทัดนี้ (ไม่ถอยไปใช้ของสูตร)
  const noTrade = bomFormulaView(p('A'), { formulasById, scentsById });
  assert.equal(noTrade.items[0].tradeName, null);
  // ไม่เจอในทะเบียน = ใช้สำเนาบน FG
  const copy = bomFormulaView(p('A'), { scentsById });
  assert.deepEqual([copy.items[0].code, copy.items[0].name], ['F-001', 'สูตรหนึ่ง']);
  // หัวน้ำหอม = ของกลิ่น · ชุดของขวัญ = ของกลิ่นของแต่ละสูตรในชุด (loader แนบ scentTradeName)
  assert.equal(bomFormulaView({ categoryCode: '02-020', scentId: 'SCT-1' }, { scentsById: scents }).items[0].tradeName, 'Jasmine Night');
  const set = bomFormulaView({ categoryCode: '01-037' }, { giftSetRows: [
    { formulaCode: 'F1', formulaName: 'หนึ่ง', customerTradeName: 'ค่าเก่าของสูตร', scentTradeName: 'Gift One' },
    { formulaCode: 'F2', formulaName: 'สอง' },
  ] });
  assert.deepEqual(set.items.map((i) => i.tradeName), ['Gift One', null]);
});

test('ด่านซอร์ส: route อ่านเลขผู้เสียภาษี/สาขา · สูตรสด + ชื่อที่ลูกค้าเรียก · หน้าโชว์ครบ', () => {
  const route = readFileSync(new URL('../../app/api/rd/bom-board/route.js', import.meta.url), 'utf8');
  assert.match(route, /\.from\('customers'\)\.select\('id, "arCode", name, "nameEn", "taxId", "branchCode"'\)/);
  assert.match(route, /\.from\('scents'\)\.select\('id, code, name, "customerTradeName"'\)/);
  assert.match(route, /\.from\('formulas'\)\.select\('id, code, name'\)/, 'ไม่อ่านชื่อที่ลูกค้าเรียกของสูตร (อยู่ที่กลิ่น)');
  assert.match(route, /formulasById: new Map\(formulas\.map\(\(f\) => \[f\.id, f\]\)\),/);
  const page = readFileSync(new URL('../../app/rd/bom/page.js', import.meta.url), 'utf8');
  assert.match(page, /Tax ID \{row\.customerTaxId \? fmtNationalId\(row\.customerTaxId\) : NA\} · สาขา \{branchValue\(row\.customerBranchCode\)\}/);
  assert.match(page, /แบรนด์ \{brandBoth\(row\.brandName, row\.brandNameEn\)\}/);
  assert.match(page, /ลูกค้าเรียก “\{item\.tradeName\}”/);
  const store = readFileSync(new URL('../master/giftSetFormulasStore.js', import.meta.url), 'utf8');
  assert.match(store, /scentTradeName: scentById\.get\(formula\?\.scentId\)\?\.customerTradeName \|\| null,/);
  assert.match(store, /\.from\('scents'\)\.select\('id, name, "customerTradeName"'\)/);
  // ป้ายชนิดอยู่บนสุดของช่อง · ชื่อที่ลูกค้าเรียกต่อจากบรรทัดกลิ่น
  assert.ok(page.indexOf('FORMULA_KIND_LABEL[row.formula.kind]') < page.indexOf('<ul className={styles.items}>'));
  assert.ok(page.indexOf('{item.note ?') < page.indexOf('{item.tradeName ?'));
});
