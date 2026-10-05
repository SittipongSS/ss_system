import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { buildProductExportBuffer, productExportFilename, productFormulaLines } from './productWorkbook.js';

const NOW = new Date('2026-08-28T09:00:00+07:00');
const ROWS = [
  { fgCode: 'FG-001', productDescription: 'น้ำหอม A', productDescriptionEn: 'Perfume A', volume: 30, volumeUnit: 'ml', costPrice: 100 },
  { fgCode: 'FG-002', productDescription: 'ไม่มีราคา', volume: null, volumeUnit: null, costPrice: null },
];

async function sheetOf(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.getWorksheet('สินค้า');
}
const headers = (sheet) => sheet.getRow(1).values.slice(1);

test('มีสิทธิ์เห็นต้นทุน → ได้คอลัมน์ราคาผลิตสามตัว และเลขถูก', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer(ROWS, { includeCost: true, now: NOW }));
  assert.deepEqual(headers(sheet), [
    'FG Code', 'ชื่อสินค้า', 'รหัสสูตร', 'ชื่อสูตร', 'วันที่สูตร', 'ปริมาตร', 'หน่วย',
    'ราคาผลิต (ก่อน VAT)', 'VAT 7%', 'ราคาผลิต (รวม VAT)',
  ]);
  const row = sheet.getRow(2);
  assert.equal(row.getCell(1).value, 'FG-001');
  assert.equal(row.getCell(6).value, 30);   // ปริมาตรต้องเป็น "ตัวเลข" ไม่ใช่ "30 ml"
  assert.equal(row.getCell(7).value, 'ml');
  assert.equal(row.getCell(8).value, 100);
  assert.equal(Math.round(row.getCell(9).value * 100) / 100, 7);
  assert.equal(Math.round(row.getCell(10).value * 100) / 100, 107);
});

test('ไม่มีสิทธิ์ → ไฟล์ต้องไม่มีคอลัมน์ราคาผลิตเลย (ไม่ใช่คอลัมน์ว่าง)', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer(ROWS, { includeCost: false, now: NOW }));
  assert.deepEqual(headers(sheet), ['FG Code', 'ชื่อสินค้า', 'รหัสสูตร', 'ชื่อสูตร', 'วันที่สูตร', 'ปริมาตร', 'หน่วย']);
  assert.equal(sheet.getRow(1).cellCount, 7);
});

// 0 บาท = "ตั้งราคาไว้ที่ศูนย์" · ยังไม่ตั้งราคา = เซลล์ว่าง — คนละคำตอบกัน
test('สินค้าที่ยังไม่ตั้งราคา/ไม่มีปริมาตร → เซลล์ว่าง ไม่ใช่ 0', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer(ROWS, { includeCost: true, now: NOW }));
  const row = sheet.getRow(3);
  for (const col of [6, 8, 9, 10]) assert.equal(row.getCell(col).value, null, `คอลัมน์ ${col}`);
  assert.equal(row.getCell(7).value, 'ml'); // หน่วยว่างถอยไปค่าตั้งต้น
});

// ชื่อในไฟล์ = ชื่อเดียวกับที่ตาเห็นบนตาราง (productNameBoth = ไทยก่อน ถอยไปอังกฤษ)
test('ชื่อสินค้าตรงกับที่โชว์บนจอ · ไม่มีชื่อไทยจึงถอยไปอังกฤษ', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer([
    ...ROWS,
    { fgCode: 'FG-003', productDescriptionEn: 'English Only', volume: 5 },
  ], { includeCost: false, now: NOW }));
  assert.equal(sheet.getRow(2).getCell(2).value, 'น้ำหอม A');
  assert.equal(sheet.getRow(3).getCell(2).value, 'ไม่มีราคา');
  assert.equal(sheet.getRow(4).getCell(2).value, 'English Only');
});

test('ชื่อไฟล์ใช้วันที่ตามเวลาไทย', () => {
  assert.equal(productExportFilename(NOW), '20260828_products.xlsx');
  // 2026-08-29T00:30 ไทย = 28 ส.ค. 17:30Z — ต้องได้ 29 ไม่ใช่ 28
  assert.equal(productExportFilename(new Date('2026-08-29T00:30:00+07:00')), '20260829_products.xlsx');
});

/* ── สูตรสามคอลัมน์ (มติผู้ใช้ 2026-10-05) ───────────────────────────────────────────── */
const SINGLE = {
  fgCode: 'FG-518-01-002-1895', productDescription: 'เฟิร์ส ธิงส์', volume: 30, volumeUnit: 'ml',
  formulaId: 'FML-1', formulaCode: 'PF5180601', formulaName: 'FIRST THINGS FIRST OPEN WINDOW EDP', formulaDate: '2026-07-31',
};
const GIFT = {
  fgCode: 'FG-0609-01-037-10048', productDescription: 'อินเนอร์ ดิสคัฟเวอรี เซ็ต', volume: 2, volumeUnit: 'pcs', formulaId: null,
  formulaComponents: [
    { categoryCode: '01-002', categoryName: 'น้ำหอมสำหรับผิวกาย', formulaCode: 'PF85901', formulaName: 'Midnight #1', formulaDate: '2026-09-10' },
    { categoryCode: '01-006', categoryName: 'ก้านหอมปรับอากาศ', formulaCode: null, formulaName: 'Midnight Reed', formulaDate: null },
  ],
};

test('FG สูตรเดี่ยว: รหัส · ชื่อ · วันที่ (DD/MM/YYYY) แยกสามคอลัมน์', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer([SINGLE], { includeCost: false, now: NOW }));
  const row = sheet.getRow(2);
  assert.deepEqual([3, 4, 5].map((c) => row.getCell(c).value), ['PF5180601', 'FIRST THINGS FIRST OPEN WINDOW EDP', '31/07/2026']);
});

test('ชุดของขวัญ: หลายบรรทัดในเซลล์เดียว แถวละ 1 FG · บรรทัดที่ n ตรงกันทุกคอลัมน์ · ชื่อนำด้วยหมวด · ชิ้นที่ไม่มีเป็นขีด', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer([GIFT, SINGLE], { includeCost: false, now: NOW }));
  assert.equal(sheet.rowCount, 3, 'ไม่แตกแถวต่อสูตร — sum/นับ FG แล้วไม่ซ้ำ');
  const row = sheet.getRow(2);
  assert.equal(row.getCell(3).value, 'PF85901\n—');
  assert.equal(row.getCell(4).value, 'น้ำหอมสำหรับผิวกาย: Midnight #1\nก้านหอมปรับอากาศ: Midnight Reed');
  assert.equal(row.getCell(5).value, '10/09/2026\n—');
  for (const col of [3, 4, 5]) assert.equal(row.getCell(col).alignment?.wrapText, true, `คอลัมน์ ${col} ต้องตัดบรรทัด`);
  assert.ok(row.height >= 2 * 18, 'ความสูงพอสำหรับสองบรรทัด');
  assert.equal(sheet.getRow(3).getCell(3).value, 'PF5180601', 'แถวสูตรเดี่ยวไม่โดนผลกระทบ');
  assert.notEqual(sheet.getRow(3).getCell(3).alignment?.wrapText, true);
});

test('FG ไม่ผูกสูตร = เซลล์ว่าง · ข้อความสูตรรุ่นก่อนทะเบียน (ไม่มี formulaId) ยังพิมพ์ตามที่หน้ารายละเอียดโชว์', () => {
  assert.deepEqual(productFormulaLines({ fgCode: 'FG-X' }), []);
  assert.deepEqual(productFormulaLines({ formulaId: null, formulaName: '', formulaCode: null }), []);
  assert.deepEqual(productFormulaLines({ formulaId: null, formulaName: 'ชื่อกลิ่นเก่า', formulaCode: null }), [
    { code: '—', name: 'ชื่อกลิ่นเก่า', date: '—' },
  ]);
  // ผูกสูตรแต่สูตรยังไม่มีรหัส/วันที่ (สูตรร่าง) = ขีด
  assert.deepEqual(productFormulaLines({ formulaId: 'FML-9', formulaName: 'Secret Valley #1' }), [
    { code: '—', name: 'Secret Valley #1', date: '—' },
  ]);
  // ชุดของขวัญที่ยังไม่ผูกสูตร = ว่างเหมือน FG ทั่วไป · หมวดหาชื่อไม่เจอ = ใช้รหัสหมวด
  assert.deepEqual(productFormulaLines({ formulaComponents: [] }), []);
  assert.equal(productFormulaLines({ formulaComponents: [{ categoryCode: '01-022', formulaName: 'X' }] })[0].name, '01-022: X');
});

test('route export อ่านสูตรสดจากทะเบียน + รายการของชุดของขวัญ ก่อนสร้างไฟล์', () => {
  const route = readFileSync(new URL('../../app/api/products/export/route.js', import.meta.url), 'utf8');
  assert.match(route, /buildProductExportBuffer\(await withFormulas\(supabase, rows\)/);
  assert.match(route, /loadProductFormulasMany\(/);
  assert.match(route, /\.from\('formulas'\)/);
});
