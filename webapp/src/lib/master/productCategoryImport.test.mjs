import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  planProductCategoryImport,
  PRODUCT_CATEGORY_IMPORT_HEADERS as HEADERS,
} from './productCategoryImport';
import {
  buildProductCategoryExportBuffer,
  buildProductCategoryTemplateBuffer,
  parseProductCategoryWorkbook,
} from './productCategoryWorkbook';

const current = [
  { id: 1, mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '001', nameTh: 'เดิมหนึ่ง', nameEn: 'OLD ONE', note: null, isActive: true, updatedAt: '2026-07-19T01:00:00.000Z' },
  { id: 2, mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '002', nameTh: 'เดิมสอง', nameEn: 'OLD TWO', note: null, isActive: true, updatedAt: '2026-07-19T01:00:00.000Z' },
];

const raw = (overrides = {}) => ({
  rowNumber: 2,
  mainCategoryCode: '01',
  mainCategoryName: 'ODM',
  typeCode: '001',
  nameTh: 'เดิมหนึ่ง',
  nameEn: 'OLD ONE',
  status: 'ใช้งาน',
  note: '',
  recordId: '1',
  expectedUpdatedAt: '2026-07-19T01:00:00.000Z',
  ...overrides,
});

test('template round-trips current rows with version and hidden row metadata', async () => {
  const buffer = await buildProductCategoryTemplateBuffer(current, { now: new Date('2026-07-19T02:00:00.000Z') });
  const parsed = await parseProductCategoryWorkbook(buffer);
  assert.equal(parsed.templateVersion, 'PC-IMPORT-1');
  assert.equal(parsed.exportedAt, '2026-07-19T02:00:00.000Z');
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], {
    rowNumber: 2,
    mainCategoryCode: '01', mainCategoryName: 'ODM', typeCode: '001',
    nameTh: 'เดิมหนึ่ง', nameEn: 'OLD ONE', status: 'ใช้งาน', note: '',
    recordId: '1', expectedUpdatedAt: '2026-07-19T01:00:00.000Z', formulaFields: [],
  });
});

test('preview classifies create, update, lifecycle and unchanged rows', () => {
  const result = planProductCategoryImport([
    raw(),
    raw({ rowNumber: 3, recordId: '2', typeCode: '002', nameTh: 'ชื่อใหม่', expectedUpdatedAt: current[1].updatedAt }),
    raw({ rowNumber: 4, recordId: '', expectedUpdatedAt: '', typeCode: '003', nameTh: 'เพิ่มใหม่', nameEn: '' }),
  ], current);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.summary.update, 1);
  assert.equal(result.summary.create, 1);
  assert.equal(result.committable, true);

  const lifecycle = planProductCategoryImport([
    raw({ status: 'พักใช้งาน' }),
  ], [current[0]]);
  assert.equal(lifecycle.rows[0].action, 'deactivate');
});

test('missing workbook rows never deactivate or delete current categories', () => {
  const result = planProductCategoryImport([raw()], current);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].action, 'unchanged');
  assert.equal(result.summary.deactivate, 0);
  assert.equal(result.hasChanges, false);
  assert.equal(result.committable, false);
});

test('duplicate codes and inconsistent main names block the whole preview', () => {
  const duplicate = planProductCategoryImport([raw(), raw({ rowNumber: 3 })], current);
  assert.equal(duplicate.summary.error, 2);
  assert.equal(duplicate.committable, false);

  const groupConflict = planProductCategoryImport([
    raw({ mainCategoryName: 'ชื่อ A' }),
    raw({ rowNumber: 3, recordId: '2', typeCode: '002', mainCategoryName: 'ชื่อ B', expectedUpdatedAt: current[1].updatedAt }),
  ], current);
  assert.equal(groupConflict.summary.error, 2);
});

test('renaming a main category requires every existing child in the workbook', () => {
  const incomplete = planProductCategoryImport([
    raw({ mainCategoryName: 'ชื่อใหม่' }),
  ], current);
  assert.equal(incomplete.rows[0].action, 'error');
  assert.match(incomplete.rows[0].errors.join(' '), /ต้องมีหมวดรองครบทั้งกลุ่ม/);

  const complete = planProductCategoryImport([
    raw({ mainCategoryName: 'ชื่อใหม่' }),
    raw({ rowNumber: 3, recordId: '2', typeCode: '002', nameTh: 'เดิมสอง', nameEn: 'OLD TWO', mainCategoryName: 'ชื่อใหม่', expectedUpdatedAt: current[1].updatedAt }),
  ], current);
  assert.equal(complete.summary.update, 2);
  assert.equal(complete.committable, true);
});

test('edited immutable codes and stale timestamps become blocking conflicts', () => {
  const editedCode = planProductCategoryImport([
    raw({ typeCode: '099' }),
  ], current);
  assert.equal(editedCode.rows[0].action, 'error');
  assert.match(editedCode.rows[0].errors.join(' '), /รหัสหมวดเดิมถูกแก้ไข/);

  const stale = planProductCategoryImport([
    raw({ expectedUpdatedAt: '2026-07-18T01:00:00.000Z' }),
  ], current);
  assert.equal(stale.rows[0].action, 'conflict');
  assert.match(stale.rows[0].errors.join(' '), /ถูกแก้ไขหลังจากสร้างไฟล์/);
});

test('formula cells are reported and never become committable values', async () => {
  const buffer = await buildProductCategoryTemplateBuffer([current[0]]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('หมวดสินค้า');
  const nameColumn = sheet.getRow(1).values.findIndex((value) => value === HEADERS.nameTh);
  sheet.getRow(2).getCell(nameColumn).value = { formula: '="Injected"', result: 'Injected' };
  const modified = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseProductCategoryWorkbook(modified);
  const result = planProductCategoryImport(parsed.rows, [current[0]]);
  assert.equal(result.rows[0].action, 'error');
  assert.match(result.rows[0].errors.join(' '), /ห้ามใช้สูตร/);
});

test('read-only export carries numeric usage and date cells', async () => {
  const buffer = await buildProductCategoryExportBuffer([{
    ...current[0],
    createdAt: '2026-07-18T01:00:00.000Z',
    usage: { products: 91, deals: 39, projects: 6 },
  }], { now: new Date('2026-07-19T02:00:00.000Z') });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('ข้อมูลปัจจุบัน');
  assert.equal(sheet.getRow(2).getCell(8).value, 91);
  assert.equal(sheet.getRow(2).getCell(9).value, 39);
  assert.equal(sheet.getRow(2).getCell(10).value, 6);
  assert.ok(sheet.getRow(2).getCell(11).value instanceof Date);
});
