// ── ไฟล์ที่ส่งออกต้องเปิดได้จริงและมีเนื้อตรงตามที่ตั้งใจ ────────────────────
//
// สร้างไฟล์แล้ว **อ่านกลับด้วย exceljs** — เทสต์ที่เช็คแค่ว่า "ได้ buffer มา" ผ่านได้
// แม้ไฟล์จะเปิดไม่ออก ซึ่งเป็นอาการที่ผู้ใช้เจอเป็นคนแรกเสมอ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildLeadReportBuffer } from './leadReportWorkbook.js';
import { LEAD_REPORT_COLUMNS } from './leadReport.js';

const LEADS = [
  {
    id: 'LEAD-a1', contactName: 'สมชาย ใจดี', company: 'บริษัท ก จำกัด',
    phone: '0812345678', email: 'a@b.co', channel: 'phone', serviceInterest: 'other',
    budget: 250000, budgetMax: 400000, team: 'KA', assigneeName: 'Sittipong K.',
    status: 'contacted', createdAt: '2026-07-31T17:30:00.000Z',   // 1 ส.ค. เวลาไทย
    followUpAt: '2026-09-02', createdByName: 'Marketing S&S',
  },
  { id: 'LEAD-b2', contactName: 'ลูกค้า ข', channel: 'walkin', status: 'new', createdAt: '2026-08-05T03:00:00.000Z' },
];

async function reopen(buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  return book.getWorksheet('ลีด');
}

test('ไฟล์เปิดกลับได้ หัวคอลัมน์ตรงกับทะเบียน', async () => {
  const sheet = await reopen(await buildLeadReportBuffer(LEADS, { from: '2026-08-01', to: '2026-08-27' }));
  assert.ok(sheet, 'ต้องมีชีตชื่อ "ลีด"');
  const header = sheet.getRow(2).values.slice(1);
  assert.deepEqual(header, LEAD_REPORT_COLUMNS.map((c) => c.label));
});

/* บรรทัดบนสุดคือที่มาของไฟล์ — Excel เดินทางต่อได้ไกลกว่าหน้าจอ ถ้าไม่ประทับไว้
   อีกสองสัปดาห์ไม่มีใครรู้ว่ามันคือข้อมูลช่วงไหน */
test('บรรทัดแรกบอกช่วง จำนวนใบ และคนโหลด', async () => {
  const sheet = await reopen(await buildLeadReportBuffer(LEADS, {
    from: '2026-08-01', to: '2026-08-27', by: 'Admin S&S', generatedAt: '2026-08-27 09:00',
  }));
  const info = String(sheet.getRow(1).getCell(1).value);
  assert.match(info, /2026-08-01 ถึง 2026-08-27/);
  assert.match(info, /2 ใบ/);
  assert.match(info, /Admin S&S/);
  assert.match(info, /วันไทย/);
});

test('แถวข้อมูลใช้ป้ายไทยและวันไทย', async () => {
  const sheet = await reopen(await buildLeadReportBuffer(LEADS, {}));
  const at = (label) => LEAD_REPORT_COLUMNS.findIndex((c) => c.label === label) + 1;
  const row = sheet.getRow(3);
  assert.equal(row.getCell(at('ชื่อผู้ติดต่อ')).value, 'สมชาย ใจดี');
  assert.equal(row.getCell(at('ช่องทาง')).value, 'โทรเข้า');
  assert.equal(row.getCell(at('ทีม')).value, 'Key Account');
  assert.equal(row.getCell(at('สถานะ')).value, 'ติดต่อแล้ว');
  // 31 ก.ค. 17:30Z = 1 ส.ค. เวลาไทย — ไฟล์ต้องบอกวันไทย
  assert.equal(row.getCell(at('วันที่รับ')).value, '2026-08-01');
  assert.equal(row.getCell(at('งบต่ำสุด')).value, 250000);
});

test('ใบที่ยังไม่มีค่า ช่องว่างจริง ไม่ใช่ขีด', async () => {
  const sheet = await reopen(await buildLeadReportBuffer(LEADS, {}));
  const at = (label) => LEAD_REPORT_COLUMNS.findIndex((c) => c.label === label) + 1;
  const row = sheet.getRow(4);
  assert.equal(row.getCell(at('ชื่อผู้ติดต่อ')).value, 'ลูกค้า ข');
  for (const label of ['ผู้รับผิดชอบ', 'ทีม', 'เหตุผลที่ไม่ไปต่อ']) {
    const v = row.getCell(at(label)).value;
    assert.ok(v === null || v === '', `${label} ต้องว่าง ได้ ${JSON.stringify(v)}`);
  }
});

test('ไม่มีลีดในช่วง = ไฟล์ยังเปิดได้ มีแต่หัวคอลัมน์', async () => {
  const sheet = await reopen(await buildLeadReportBuffer([], { from: '2026-01-01', to: '2026-01-02' }));
  assert.deepEqual(sheet.getRow(2).values.slice(1), LEAD_REPORT_COLUMNS.map((c) => c.label));
  assert.match(String(sheet.getRow(1).getCell(1).value), /0 ใบ/);
});
