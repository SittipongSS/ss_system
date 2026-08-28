import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildProductExportBuffer, productExportFilename } from './productWorkbook.js';

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
    'FG Code', 'ชื่อสินค้า', 'ปริมาตร', 'หน่วย',
    'ราคาผลิต (ก่อน VAT)', 'VAT 7%', 'ราคาผลิต (รวม VAT)',
  ]);
  const row = sheet.getRow(2);
  assert.equal(row.getCell(1).value, 'FG-001');
  assert.equal(row.getCell(3).value, 30);   // ปริมาตรต้องเป็น "ตัวเลข" ไม่ใช่ "30 ml"
  assert.equal(row.getCell(4).value, 'ml');
  assert.equal(row.getCell(5).value, 100);
  assert.equal(Math.round(row.getCell(6).value * 100) / 100, 7);
  assert.equal(Math.round(row.getCell(7).value * 100) / 100, 107);
});

test('ไม่มีสิทธิ์ → ไฟล์ต้องไม่มีคอลัมน์ราคาผลิตเลย (ไม่ใช่คอลัมน์ว่าง)', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer(ROWS, { includeCost: false, now: NOW }));
  assert.deepEqual(headers(sheet), ['FG Code', 'ชื่อสินค้า', 'ปริมาตร', 'หน่วย']);
  assert.equal(sheet.getRow(1).cellCount, 4);
});

// 0 บาท = "ตั้งราคาไว้ที่ศูนย์" · ยังไม่ตั้งราคา = เซลล์ว่าง — คนละคำตอบกัน
test('สินค้าที่ยังไม่ตั้งราคา/ไม่มีปริมาตร → เซลล์ว่าง ไม่ใช่ 0', async () => {
  const sheet = await sheetOf(await buildProductExportBuffer(ROWS, { includeCost: true, now: NOW }));
  const row = sheet.getRow(3);
  for (const col of [3, 5, 6, 7]) assert.equal(row.getCell(col).value, null, `คอลัมน์ ${col}`);
  assert.equal(row.getCell(4).value, 'ml'); // หน่วยว่างถอยไปค่าตั้งต้น
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
