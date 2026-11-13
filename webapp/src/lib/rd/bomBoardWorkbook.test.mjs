// Excel ของคิว "ลง BOM" (/rd/bom · มติเจ้าของ 04/11/2026: กดดาวน์โหลดรายการได้)
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import {
  buildBomExportBuffer, bomExportColumns, bomExportFilename, bomExportRow, bomExportSheetName, isBomExportTab,
} from './bomBoardWorkbook.js';
import { BOM_BOARD_TABS, bomBoardRows, bomTabRows } from './bomBoard.js';

const NOW = new Date('2026-11-04T09:00:00+07:00');
const TODAY = '2026-11-04';

const product = (id, over = {}) => ({
  id, fgCode: `FG-${id}`, productDescription: `ชื่อ ${id}`, productDescriptionEn: `Name ${id}`, customerId: 'C-1',
  brandName: 'แบรนด์ไทย', brandNameEn: 'Brand', categoryCode: '01-002', formulaId: 'FML-1', formulaCode: 'F-OLD',
  formulaName: 'ชื่อเก่า', scentId: 'SCT-1', volume: 50, volumeUnit: 'ml', saleUnit: 'ชิ้น',
  bomStatus: 'queued', bomRound: 1, bomSentAt: '2026-11-01T02:00:00Z', bomSentByName: 'ฝ่ายขาย ก', ...over,
});
const ctx = {
  customersById: new Map([['C-1', { id: 'C-1', arCode: 'AR-1', name: 'บริษัท ไทย', nameEn: 'Thai Co.', taxId: '0105565000001', branchCode: null }]]),
  scentsById: new Map([['SCT-1', { id: 'SCT-1', code: 'SC-01', name: 'มะลิ', producedAt: '2026-09-15', customerTradeName: 'Jasmine Night' }]]),
  formulasById: new Map([['FML-1', { id: 'FML-1', code: 'PF-001', name: 'สูตรสด', formulaDate: '2026-10-01' }]]),
};

async function sheetOf(buffer, name) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.getWorksheet(name);
}

test('แถว = ของบนจอ: สินค้า · ลูกค้า (AR/ชื่อ/Tax ID/สาขา/แบรนด์) · สูตรสด + กลิ่น + ชื่อที่ลูกค้าเรียกของกลิ่น · ปริมาตรเป็นตัวเลข', () => {
  const [row] = bomBoardRows([product('A')], ctx);
  const out = bomExportRow(row, { todayIso: TODAY });
  assert.equal(out.fgCode, 'FG-A');
  assert.equal(out.nameEn, 'Name A');
  assert.equal(out.round, 1);
  assert.equal(out.customerArCode, 'AR-1');
  assert.equal(out.customerNameTh, 'บริษัท ไทย');
  assert.equal(out.customerTaxId, '0-1055-65000-00-1');
  assert.equal(out.customerBranch, '00000', 'สาขาว่าง = สำนักงานใหญ่ (ตัวเดียวกับตาราง)');
  assert.equal(out.brand, 'Brand', 'ป้ายแบรนด์ตัวเดียวกับตาราง (brandBoth — อังกฤษก่อน)');
  assert.equal(out.formulaKind, 'สูตร');
  assert.equal(out.formulaCode, 'PF-001', 'รหัสสูตรอ่านสดจากทะเบียน ไม่ใช่สำเนาบน FG');
  assert.equal(out.formulaName, 'สูตรสด');
  // วันที่ของป้าย "PF · ชื่อ · วันที่" (มติเจ้าของ 13/11) — คอลัมน์ของตัวเอง · กลิ่นในหมายเหตุครบสามท่อน
  assert.equal(out.formulaDate, '01/10/2026');
  assert.equal(out.formulaNote, 'กลิ่น SC-01 · มะลิ · 15/09/2026');
  assert.equal(out.tradeName, 'Jasmine Night');
  assert.equal(out.volume, 50);
  assert.equal(out.saleUnit, 'ชิ้น');
  assert.equal(out.sentByName, 'ฝ่ายขาย ก');
  assert.equal(out.sentAt, '01/11/2026');
  assert.equal(out.waitingDays, 3);
});

test('ค่าว่าง = เซลล์ว่าง (กรองได้ใน Excel) · ไม่มีสูตร = ป้าย "ไม่มีสูตร" · ลูกค้าไม่อยู่ในทะเบียนไม่เดาสาขา', () => {
  const [row] = bomBoardRows([product('B', {
    customerId: 'C-X', customerName: null, brandName: null, brandNameEn: null, categoryCode: '02-024', formulaId: null, scentId: null,
    volume: null, volumeUnit: null, saleUnit: null, productDescriptionEn: null,
  })], ctx);
  const out = bomExportRow(row, { todayIso: TODAY });
  assert.equal(out.customerArCode, null);
  assert.equal(out.customerTaxId, null);
  assert.equal(out.customerBranch, null);
  assert.equal(out.brand, null);
  assert.equal(out.formulaKind, 'ไม่มีสูตร');
  assert.equal(out.formulaCode, null);
  assert.equal(out.tradeName, null);
  assert.equal(out.volume, null);
  assert.equal(out.nameEn, null);
});

test('ชุดของขวัญ: หนึ่งบรรทัดต่อสูตร · ค่าที่ขาดเป็นบรรทัดว่าง (บรรทัดยังตรงสูตร)', () => {
  const row = {
    status: 'queued',
    formula: {
      kind: 'set',
      items: [
        { code: 'F1', name: 'หนึ่ง', date: null, note: 'น้ำหอม', tradeName: null },
        { code: null, name: 'สอง', date: '2026-09-01', note: 'ก้านหอม', tradeName: 'Gift Two' },
      ],
    },
  };
  const out = bomExportRow(row);
  assert.equal(out.formulaKind, 'สูตรในชุด');
  assert.equal(out.formulaCode, 'F1\n');
  assert.equal(out.formulaName, 'หนึ่ง\nสอง');
  assert.equal(out.formulaDate, '\n01/09/2026', 'บรรทัดยังตรงสูตร');
  assert.equal(out.formulaNote, 'น้ำหอม\nก้านหอม');
  assert.equal(out.tradeName, '\nGift Two');
});

test('คอลัมน์ท้ายตามแท็บ = ช่องที่ห้าของตาราง · "รอ (วัน)" เฉพาะงานค้าง', () => {
  const keys = (tab) => bomExportColumns(tab).map((c) => c.key);
  assert.ok(keys('queued').includes('waitingDays'));
  assert.ok(!keys('queued').includes('acceptedByName'));
  assert.ok(keys('in_progress').includes('acceptedByName'));
  assert.ok(keys('returned').includes('returnReason') && !keys('returned').includes('waitingDays'));
  assert.ok(keys('done').includes('bomCode') && keys('done').includes('doneAt') && !keys('done').includes('waitingDays'));
  // แถวที่ไม่ใช่งานค้าง ไม่คิดวันรอ (ตีกลับ/เสร็จเป็นประวัติ)
  assert.equal(bomExportRow({ status: 'done', sentAt: '2026-10-01T00:00:00Z' }, { todayIso: TODAY }).waitingDays, null);
  // ทุกแท็บของจอส่งออกได้ · แท็บแปลก ๆ ไม่ได้
  for (const t of BOM_BOARD_TABS) assert.equal(isBomExportTab(t.key), true);
  assert.equal(isBomExportTab(''), false);
  assert.equal(isBomExportTab('all'), false);
});

test('ไฟล์จริง: ชื่อชีต = ป้ายแท็บ · หัวคอลัมน์ · แถวเรียงเหมือนตาราง · ตัดบรรทัดช่องสูตร', async () => {
  const rows = bomBoardRows([
    product('NEW', { bomStatus: 'done', bomDoneAt: '2026-11-03T03:00:00Z', bomDoneByName: 'RD ก', bomCode: 'BOM-9', bomUpdatedAt: '2026-11-03T03:00:00Z' }),
    product('OLD', { bomStatus: 'done', bomDoneAt: '2026-11-02T03:00:00Z', bomDoneByName: 'RD ข', bomUpdatedAt: '2026-11-02T03:00:00Z' }),
    product('Q', { bomStatus: 'queued' }),
  ], ctx);
  const shown = bomTabRows(rows, 'done');
  const sheet = await sheetOf(await buildBomExportBuffer(shown, { tab: 'done', todayIso: TODAY, now: NOW }), bomExportSheetName('done'));
  assert.ok(sheet, 'ชีตชื่อ "ลงเสร็จแล้ว"');
  assert.deepEqual(sheet.getRow(1).values.slice(1), bomExportColumns('done').map((c) => c.header));
  assert.equal(sheet.rowCount, 3, 'หัว + 2 แถวของแท็บ — แถวรอรับเรื่องไม่หลุดเข้ามา');
  const col = (key) => bomExportColumns('done').findIndex((c) => c.key === key) + 1;
  assert.equal(sheet.getRow(2).getCell(1).value, 'FG-NEW', 'ขยับล่าสุดอยู่บนสุด (ตัวเดียวกับตาราง)');
  assert.equal(sheet.getRow(2).getCell(col('bomCode')).value, 'BOM-9');
  assert.equal(sheet.getRow(2).getCell(col('doneAt')).value, '03/11/2026');
  assert.equal(sheet.getRow(3).getCell(col('bomCode')).value, null);
  assert.equal(sheet.getRow(2).getCell(col('volume')).value, 50);
  assert.equal(sheet.getRow(2).getCell(col('formulaName')).alignment?.wrapText, true);
});

test('ชื่อไฟล์ตามวันไทย + แท็บ', () => {
  // 23:30 UTC ของวันที่ 3 = วันที่ 4 ไทย
  assert.equal(bomExportFilename('in_progress', new Date('2026-11-03T23:30:00Z')), '20261104_bom_in_progress.xlsx');
});

test('ด่านซอร์ส: ตาราง กับ ไฟล์ อ่านด้วยตัวเดียวกัน · route ไฟล์เป็น GET อย่างเดียว ด่าน RD · หน้าส่งมุมมองไป', () => {
  const board = readFileSync(new URL('../../app/api/rd/bom-board/route.js', import.meta.url), 'utf8');
  const exp = readFileSync(new URL('../../app/api/rd/bom-board/export/route.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../app/rd/bom/page.js', import.meta.url), 'utf8');
  assert.match(board, /loadBomBoardRows\(supabase\)/);
  assert.match(exp, /bomOutputRows\(bomViewOf\(await loadBomBoardRows\(supabase\), view\)\.rows, view\.ids\)/);
  assert.match(exp, /if \(!canAccessRd\(user\)\) return forbidden/);
  assert.match(exp, /export const GET = /);
  assert.doesNotMatch(exp, /export const (POST|PATCH|PUT|DELETE)/, 'proxy เปิด /api/rd ไว้เฉพาะทางอ่าน');
  // ลิงก์มาจาก `bomExportUrl` (แท็บ + ค้นหา + ตัวกรอง + เรียง + กลุ่ม + id ที่ติ๊ก) ตัวเดียวกับที่ route อ่านกลับ
  assert.match(page, /<ExcelDownloadButton\s+href=\{exportLink\.url\}/);
  assert.match(page, /bomExportUrl\(viewState, \{ selectedIds: selected, visibleCount: shown\.length \}\)/);
  // ป้ายชนิดตัวเดียวกันทั้งตารางและไฟล์
  assert.match(page, /BOM_FORMULA_KIND_LABEL\[row\.formula\.kind\]/);
  assert.doesNotMatch(page, /const FORMULA_KIND_LABEL = /);
});
