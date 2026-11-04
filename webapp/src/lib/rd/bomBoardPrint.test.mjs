// เอกสารพิมพ์ของคิว "ลง BOM" (/rd/bom · มติเจ้าของ 04/11/2026: ปุ่มพิมพ์ออกเป็นเอกสาร + ปุ่มอยู่หัวหน้า)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bomBoardPrintReport, bomPrintColumns, bomPrintRow } from './bomBoardPrint.js';
import { bomBoardRows, bomTabRows } from './bomBoard.js';
import { buildReportPrintHTML } from '../tax/reportPrint.js';

const TODAY = '2026-11-04';
const product = (id, over = {}) => ({
  id, fgCode: `FG-${id}`, productDescription: `ชื่อ ${id}`, productDescriptionEn: `Name ${id}`, customerId: 'C-1',
  brandName: 'แบรนด์ไทย', brandNameEn: 'Brand', categoryCode: '01-002', formulaId: 'FML-1', scentId: 'SCT-1',
  volume: 50, volumeUnit: 'ml', saleUnit: 'ชิ้น', bomStatus: 'in_progress', bomRound: 2,
  bomSentAt: '2026-11-01T02:00:00Z', bomSentByName: 'ฝ่ายขาย ก', bomAcceptedByName: 'RD ข', ...over,
});
const ctx = {
  customersById: new Map([['C-1', { id: 'C-1', arCode: 'AR-1', name: 'บริษัท ไทย', nameEn: 'Thai Co.', taxId: '0105565000001', branchCode: null }]]),
  scentsById: new Map([['SCT-1', { id: 'SCT-1', code: 'SC-01', name: 'มะลิ', customerTradeName: 'Jasmine Night' }]]),
  formulasById: new Map([['FML-1', { id: 'FML-1', code: 'PF-001', name: 'สูตรสด' }]]),
};

test('แถวเอกสาร = หน้าตาเดียวกับตาราง: สินค้า · ลูกค้า (Tax ID/สาขา/แบรนด์) · สูตร + กลิ่น + ลูกค้าเรียก · ปริมาตร · ส่งโดย/รอ/รับโดย', () => {
  const [row] = bomBoardRows([product('A')], ctx);
  const out = bomPrintRow(row, { todayIso: TODAY });
  assert.equal(out.product, 'FG-A\nชื่อ A\nName A\nส่งรอบที่ 2');
  assert.equal(out.customer, 'AR-1\nบริษัท ไทย\nThai Co.\nTax ID 0-1055-65000-00-1 · สาขา 00000\nแบรนด์ Brand');
  assert.equal(out.kind, 'สูตร');
  assert.equal(out.formula, 'PF-001 สูตรสด\nกลิ่น มะลิ\nลูกค้าเรียก “Jasmine Night”');
  assert.equal(out.volume, '50 ml\nต่อ 1 ชิ้น');
  assert.equal(out.status, 'ฝ่ายขาย ก\n01/11/2026 · รอ 3 วัน\nรับโดย RD ข');
});

test('ช่องท้ายตามแท็บ — ตีกลับ: เหตุผล + ใคร/วันไหน · ลงเสร็จ: รหัส BOM (ไม่มี = บอกตรง ๆ) + หมายเหตุ', () => {
  const [ret] = bomBoardRows([product('R', { bomStatus: 'returned', bomReturnReason: 'ปริมาตรผิด', bomReturnedByName: 'RD ข', bomReturnedAt: '2026-11-03T03:00:00Z' })], ctx);
  assert.equal(bomPrintRow(ret).status, 'ปริมาตรผิด\nRD ข · 03/11/2026');
  const [done] = bomBoardRows([product('D', { bomStatus: 'done', bomDoneByName: 'RD ข', bomDoneAt: '2026-11-03T03:00:00Z', bomNote: 'ลงครบ' })], ctx);
  assert.equal(bomPrintRow(done).status, 'ไม่ระบุรหัส BOM\nRD ข · 03/11/2026\nลงครบ');
  assert.deepEqual(bomPrintColumns('returned').map((c) => c.label).at(-1), 'ตีกลับ');
  assert.deepEqual(bomPrintColumns('done').map((c) => c.label).at(-1), 'ลงเสร็จ');
  assert.deepEqual(bomPrintColumns('queued').map((c) => c.label).at(-1), 'ส่งโดย');
});

test('ชุดของขวัญ: ป้ายชนิดบอกจำนวนสูตร · ทุกสูตรอยู่ในช่องเดียว · ไม่มีสูตร = บอกว่าไม่มีสูตร', () => {
  const set = bomPrintRow({ status: 'queued', formula: { kind: 'set', items: [
    { code: 'F1', name: 'หนึ่ง', note: 'น้ำหอม', tradeName: null },
    { code: null, name: 'สอง', note: 'ก้านหอม', tradeName: 'Gift Two' },
  ] } });
  assert.equal(set.kind, 'สูตรในชุด (2)');
  assert.equal(set.formula, 'F1 หนึ่ง\nน้ำหอม\nสอง\nก้านหอม\nลูกค้าเรียก “Gift Two”');
  const none = bomPrintRow({ status: 'queued', formula: { kind: 'none', items: [] } });
  assert.equal(none.kind, 'ไม่มีสูตร');
  assert.equal(none.formula, 'ไม่มีสูตร');
  assert.equal(none.customer, '-', 'ลูกค้าไม่อยู่ในทะเบียน = ไม่เดา Tax ID/สาขา');
});

test('รายงานรูปกลาง: ชื่อบอกแท็บ · แถวตามลำดับตาราง · ยอดรวมท้าย · เปลือกรายงานวาดได้ (A4 แนวนอน)', () => {
  const rows = bomTabRows(bomBoardRows([
    product('LATE', { bomSentAt: '2026-11-03T02:00:00Z' }),
    product('EARLY', { bomSentAt: '2026-10-30T02:00:00Z' }),
    product('Q', { bomStatus: 'queued' }),
  ], ctx), 'in_progress');
  const report = bomBoardPrintReport(rows, { tab: 'in_progress', todayIso: TODAY });
  assert.equal(report.title, 'รายการลง BOM — กำลังลง');
  assert.deepEqual(report.rows.map((r) => r.product.split('\n')[0]), ['FG-EARLY', 'FG-LATE'], 'ส่งก่อนอยู่บนสุด · แท็บอื่นไม่หลุดเข้ามา');
  assert.equal(report.summary._label, 'รวม 2 รายการ');
  const html = buildReportPrintHTML(report, {}, {}, { toolbar: false });
  assert.match(html, /รายการลง BOM — กำลังลง/);
  assert.match(html, /FG-EARLY/);
  assert.match(html, /ลูกค้าเรียก “Jasmine Night”/);
  assert.match(html, /รวม 2 รายการ/);
});

test('แท็บว่าง: เอกสารบอก "ไม่มีรายการในแท็บนี้" (ไม่ใช่คำของรายงานช่วงวันที่) · รายงานเดิมยังได้คำเดิม', () => {
  const html = buildReportPrintHTML(bomBoardPrintReport([], { tab: 'returned' }), {}, {}, { toolbar: false });
  assert.match(html, /ไม่มีรายการในแท็บนี้/);
  assert.doesNotMatch(html, /ไม่มีข้อมูลในช่วงที่เลือก/);
  const legacy = buildReportPrintHTML({ title: 'x', columns: [{ key: 'a', label: 'A' }], rows: [] }, {}, {}, { toolbar: false });
  assert.match(legacy, /ไม่มีข้อมูลในช่วงที่เลือก/);
});

test('ด่านซอร์ส: ปุ่มพิมพ์ + Excel อยู่หัวหน้า (headerRight) ไม่ใช่แถบเครื่องมือของตาราง · พิมพ์จากแถวบนจอ', () => {
  const page = readFileSync(new URL('../../app/rd/bom/page.js', import.meta.url), 'utf8');
  const header = page.slice(page.indexOf('headerRight={('), page.indexOf('<div className="flex flex-col gap-4">'));
  const toolbar = page.slice(page.indexOf('toolbar={('), page.indexOf('{loadError ? (', page.indexOf('toolbar={(')));
  // พิมพ์จากแถวที่ออกจริง (ติ๊กชนะ · ไม่ติ๊ก = ทุกแถวที่แสดง) — `bomOutputRows` ตัวเดียวกับ route Excel
  assert.match(header, /openReportPrintWindow\(bomBoardPrintReport\(outputRows, \{ tab, todayIso: today \}\)\)/);
  assert.match(page, /const outputRows = useMemo\(\(\) => bomOutputRows\(shown, selected\), \[shown, selected\]\);/);
  assert.match(header, /<ExcelDownloadButton/);
  assert.match(header, /พิมพ์ \/ PDF/);
  assert.doesNotMatch(toolbar, /ExcelDownloadButton|openReportPrintWindow/);
});
