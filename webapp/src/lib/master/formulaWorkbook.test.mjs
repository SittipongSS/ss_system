// ม-158 · Excel ทะเบียนสูตร + Ingredient List (มติเจ้าของ 03/11/2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import {
  FORMULA_EXPORT_COLUMNS, buildFormulaExportBuffer, formulaExportFilename, formulaExportRow,
} from './formulaWorkbook.js';
import { filterFormulas, sortFormulasNewestFirst } from './formulaFilter.js';
import { FORMULA_STATUS_LABELS } from './formulas.js';

const NOW = new Date('2026-11-03T09:00:00+07:00');
const CTX = {
  categoryLabel: (code) => ({ '01-002': '01-002 EDP · น้ำหอม' }[code] || code),
  scentLabel: (id) => ({ S1: 'SC-1 · Rose' }[id] || null),
  arCodeOf: (id) => ({ C1: 'AR-306' }[id] || null),
};
const ROWS = [
  {
    id: 'F1', code: 'PF1', name: 'Rose EDP', categoryCode: '01-002', scentId: 'S1', customerId: 'C1', customerName: 'บริษัท ก',
    customerTradeName: 'Rosy', formulaDate: '2026-10-01', status: 'active', ingredientList: 'Alcohol Denat.,\nParfum, Aqua',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'F2', code: null, name: 'สูตรฐาน', categoryCode: null, scentId: null, customerId: null, customerName: null,
    formulaDate: null, status: 'draft', ingredientList: null, createdAt: '2026-11-01T00:00:00Z',
  },
];

async function sheetOf(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.getWorksheet('สูตร');
}

test('หัวคอลัมน์ · Ingredient List ท้ายสุด · ค่าตรงกับแถว', async () => {
  const sheet = await sheetOf(await buildFormulaExportBuffer(ROWS, CTX, { now: NOW }));
  assert.deepEqual(sheet.getRow(1).values.slice(1), FORMULA_EXPORT_COLUMNS.map((c) => c.header));
  assert.equal(FORMULA_EXPORT_COLUMNS.at(-1).header, 'Ingredient List');
  const row = sheet.getRow(2);
  assert.equal(row.getCell(1).value, 'PF1');
  assert.equal(row.getCell(3).value, '01-002 EDP · น้ำหอม');
  assert.equal(row.getCell(4).value, 'SC-1 · Rose');
  assert.equal(row.getCell(5).value, 'AR-306');
  assert.equal(row.getCell(10).value, 'Alcohol Denat.,\nParfum, Aqua');
  assert.equal(row.getCell(10).alignment?.wrapText, true);
});

test('ค่าว่าง = เซลล์ว่าง (กรองได้ใน Excel) · สูตรฐานบอกว่า "สูตรฐาน" ไม่ใช่ช่องว่าง', () => {
  const row = formulaExportRow(ROWS[1], CTX);
  assert.equal(row.code, null);
  assert.equal(row.category, null);
  assert.equal(row.scent, null);
  assert.equal(row.customerArCode, null);
  assert.equal(row.customerName, 'สูตรฐาน');
  assert.equal(row.ingredientList, null);
  assert.equal(row.status, FORMULA_STATUS_LABELS.draft);
});

test('ชื่อไฟล์ตามวันไทย', () => {
  // 23:30 UTC ของวันที่ 2 = วันที่ 3 ไทย
  assert.equal(formulaExportFilename(new Date('2026-11-02T23:30:00Z')), '20261103_formulas.xlsx');
});

test('🔴 ตัวกรองจอ = ตัวกรองไฟล์ — สถานะ · ชนิด · คำค้น (รวมค้นด้วยชื่อสารใน Ingredient List)', () => {
  const ctx = { categories: [], scentNameOf: (id) => (id === 'S1' ? 'Rose' : null), arIndex: new Map([['C1', 'AR-306']]) };
  assert.deepEqual(filterFormulas(ROWS, { status: 'active' }, ctx).map((f) => f.id), ['F1']);
  assert.deepEqual(filterFormulas(ROWS, { kind: 'base' }, ctx).map((f) => f.id), ['F2']);
  assert.deepEqual(filterFormulas(ROWS, { search: 'ar-306' }, ctx).map((f) => f.id), ['F1']);
  assert.deepEqual(filterFormulas(ROWS, { search: 'rose' }, ctx).map((f) => f.id), ['F1']);
  assert.deepEqual(filterFormulas(ROWS, { search: 'parfum' }, ctx).map((f) => f.id), ['F1']);
  assert.deepEqual(sortFormulasNewestFirst(ROWS).map((f) => f.id), ['F2', 'F1']);
  // หน้าจอกับ route เรียกตัวเดียวกัน
  const page = readFileSync(new URL('../../app/database/formulas/page.js', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../../app/api/master/formulas/export/route.js', import.meta.url), 'utf8');
  assert.match(page, /filterFormulas\(/);
  assert.match(route, /filterFormulas\(/);
  assert.match(page, /\/api\/master\/formulas\/export\?/);
});
