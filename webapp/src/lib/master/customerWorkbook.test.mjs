// Excel ทะเบียนลูกค้า (ปุ่ม "ดาวน์โหลด Excel" บนหน้า /database/customers · 04/11/2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import {
  CUSTOMER_EXPORT_COLUMNS, buildCustomerExportBuffer, customerExportFilename, customerExportRow, sortCustomersForExport,
} from './customerWorkbook.js';
import { customerCreditSummary } from './customerCredit.js';

const NOW = new Date('2026-11-04T09:00:00+07:00');
const COMPANY = {
  id: 'CUS-1', arCode: 'AR-1001', name: 'บริษัท ก จำกัด', nameEn: 'Kor Co., Ltd.', customerType: 'company',
  taxId: '0105555012345', branchCode: '00000', phone: '021234567', contactPerson: 'คุณเอ', contactPhone: '0812345678',
  email: 'a@kor.co.th', address: '1 ถนนสุขุมวิท กรุงเทพฯ 10110', shippingAddress: '9 โกดัง บางนา 10260',
  brands: [{ th: 'โรส', en: 'Rose' }], teams: ['B2B', 'MT'], approvalStatus: 'approved', isActive: true,
  creditTerms: '30 วัน', createdAt: '2026-08-31T18:30:00Z',
};
const PERSON = {
  id: 'CUS-2', arCode: 'AR-306', name: null, nameEn: 'John Smith', customerType: 'individual', isForeign: true,
  taxId: 'GB123', branchCode: '', address: '10 Downing St', shippingAddress: null, brands: [], team: 'B2C',
  approvalStatus: null, isActive: false,
};

async function sheetOf(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.getWorksheet('ลูกค้า');
}

test('หัวคอลัมน์ตรงชุดที่ประกาศ · แถวแรกของข้อมูลคือลูกค้า', async () => {
  const sheet = await sheetOf(await buildCustomerExportBuffer([COMPANY], { now: NOW }));
  assert.deepEqual(sheet.getRow(1).values.slice(1), CUSTOMER_EXPORT_COLUMNS.map((c) => c.header));
  const row = sheet.getRow(2);
  assert.equal(row.getCell(1).value, 'AR-1001');
  assert.equal(row.getCell(2).value, 'บริษัท ก จำกัด');
  assert.equal(row.getCell(3).value, 'Kor Co., Ltd.');
  assert.equal(sheet.rowCount, 2);
});

test('เลขผู้เสียภาษี/สาขาเป็นข้อความ — ศูนย์นำหน้าไม่หาย', async () => {
  const sheet = await sheetOf(await buildCustomerExportBuffer([COMPANY], { now: NOW }));
  const col = (key) => CUSTOMER_EXPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
  assert.equal(sheet.getRow(2).getCell(col('taxId')).value, '0105555012345');
  assert.equal(sheet.getRow(2).getCell(col('branchCode')).value, '00000');
  assert.equal(sheet.getRow(2).getCell(col('taxId')).numFmt, '@');
});

test('แถวนิติบุคคลครบทุกช่อง · เครดิตเป็นประโยคเดียวกับการ์ดหน้าลูกค้า', () => {
  const row = customerExportRow(COMPANY);
  assert.equal(row.customerType, 'นิติบุคคล');
  assert.equal(row.origin, 'ไทย');
  assert.equal(row.shippingAddress, '9 โกดัง บางนา 10260');
  // ไฟล์ได้ทั้งสองภาษา (จอโชว์ภาษาเดียว) · แบรนด์รูปเก่าเป็นข้อความ TH ล้วนก็อ่านได้
  assert.equal(row.brands, 'Rose (โรส)');
  assert.equal(customerExportRow({ ...COMPANY, brands: ['ลิลลี่', { th: '', en: 'Mint' }, { th: 'Sun', en: 'Sun' }] }).brands, 'ลิลลี่, Mint, Sun');
  assert.equal(row.teams, 'B2B, MT');
  assert.equal(row.credit, customerCreditSummary(COMPANY));
  assert.equal(row.credit, '30 วัน (ข้อความเดิม)');
  assert.equal(row.approvalStatus, 'อนุมัติแล้ว');
  assert.equal(row.active, 'ใช้งาน');
  // 01:30 ไทยของ 1 ก.ย. — วันที่ต้องเป็นวันไทย ไม่ใช่วัน UTC (31/08)
  assert.equal(row.createdAt, '01/09/2026');
});

test('บุคคลต่างชาติ · ชื่อมีภาษาเดียว · ที่อยู่จัดส่งว่าง = ที่อยู่ออกเอกสาร · ค่าว่าง = null', () => {
  const row = customerExportRow(PERSON);
  assert.equal(row.name, null);
  assert.equal(row.nameEn, 'John Smith');
  assert.equal(row.customerType, 'บุคคลธรรมดา');
  assert.equal(row.origin, 'ต่างประเทศ');
  assert.equal(row.branchCode, '00000');
  assert.equal(row.shippingAddress, '10 Downing St');
  assert.equal(row.brands, null);
  assert.equal(row.teams, 'B2C');
  assert.equal(row.credit, null);
  assert.equal(row.phone, null);
  // แถวก่อน mig 0027 (NULL) = อนุมัติแล้ว — นิยามเดียวกับป้ายบนจอ
  assert.equal(row.approvalStatus, 'อนุมัติแล้ว');
  assert.equal(row.active, 'เลิกใช้');
  assert.equal(row.createdAt, null);
});

test('เรียงตามรหัส AR แบบตัวเลข · ไม่มีรหัสไปท้าย', () => {
  const sorted = sortCustomersForExport([{ arCode: 'AR-1001' }, { arCode: '' }, { arCode: 'AR-306' }, { arCode: 'AR-1000' }]);
  assert.deepEqual(sorted.map((c) => c.arCode), ['AR-306', 'AR-1000', 'AR-1001', '']);
});

test('ชื่อไฟล์ตามวันไทย', () => {
  assert.equal(customerExportFilename(NOW), '20261104_customers.xlsx');
  assert.equal(customerExportFilename(new Date('2026-11-04T18:30:00Z')), '20261105_customers.xlsx');
});

test('route: GET · ด่าน customers:view · กรองด้วย filterCustomers ตัวเดียวกับจอ', () => {
  const route = readFileSync(new URL('../../app/api/customers/export/route.js', import.meta.url), 'utf8');
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.match(route, /canUser\(user, 'customers:view'\)/);
  assert.match(route, /filterCustomers\(customers,/);
  assert.match(route, /manage=1/);
});

test('หน้าทะเบียน: ปุ่มส่งตัวกรองครบสี่ตัว · ไม่ซ่อนตาม canEdit', () => {
  const page = readFileSync(new URL('../../app/database/customers/page.js', import.meta.url), 'utf8');
  assert.match(page, /<ExcelDownloadButton/);
  for (const key of ['q', 'status', 'team', 'inactive']) assert.match(page, new RegExp(`params\\.set\\("${key}"`));
  assert.match(page, /\/api\/customers\/export/);
  assert.doesNotMatch(page, /const headerRight = canEdit \?/);
});
