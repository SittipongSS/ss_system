// ── ไฟล์ Excel ของทะเบียนลูกค้า (ปุ่ม "ดาวน์โหลด Excel" บนหน้า /database/customers · 04/11/2026) ─────────
//
// ⭐ แถว = **เท่าที่ตาเห็นบนจอ** (กติกาเดียวกับ Excel ทะเบียนสินค้า/สูตร) — route กรองด้วย `filterCustomers`
//   ตัวเดียวกับจอ · เรียงตามรหัส AR (เลขเรียงแบบตัวเลข AR-306 มาก่อน AR-1001)
// ⭐ คอลัมน์ = ข้อมูลหลักของใบลูกค้า แยกช่องละเรื่องให้กรอง/ค้นใน Excel ได้ตรง
//   · ชื่อไทย/อังกฤษคนละคอลัมน์ (ลูกค้าที่มีภาษาเดียว อีกช่องว่าง — ไม่เติมจากอีกภาษา คนรับไฟล์จะรู้ว่ายังไม่กรอก)
//   · เลขผู้เสียภาษีเป็น **ข้อความ** ไม่ใช่ตัวเลข — Excel ตัดศูนย์นำหน้า/โชว์เป็น 1.05E+12 ถ้าเป็นตัวเลข
//   · สาขา = เลข 5 หลัก ('00000' = สำนักงานใหญ่) รูปเดียวกับคอลัมน์สาขาบนตาราง (`branchValue`)
//   · ที่อยู่จัดส่งว่างในฐาน = ใช้ที่อยู่ออกเอกสาร ⇒ ไฟล์เขียนที่อยู่ออกเอกสารให้เลย (คนรับไฟล์ไม่ต้องรู้กติกากระจก)
//   · วางบิลและกำหนดชำระ = ประโยคเดียวกับการ์ดบนหน้าลูกค้า (`customerCreditSummary`)
// ⚠️ ค่าที่ไม่มี = เซลล์ว่าง (null) ไม่ใช่ขีด — คนรับไฟล์กรอง "ว่าง" ใน Excel ได้ (กติกาเดียวกับ Excel สูตร)
// รูปแบบชีตลอกจาก `productWorkbook.js` (ฟอนต์ · หัวตาราง · ชื่อไฟล์) — ไฟล์ที่ระบบส่งออกหน้าตาเดียวกัน
import ExcelJS from 'exceljs';
import { fmtDate, fmtPhone } from '@/lib/format';
import { approvalStatusOf } from '@/lib/master/approvalStatus';
import { masterRecordTeams } from '@/lib/master/approvalControl';
import { brandEn, brandTh } from '@/lib/master/brands';
import { customerCreditSummary } from '@/lib/master/customerCredit';
import { branchValue } from '@/lib/master/thaiAddress';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const SHEET = 'ลูกค้า';

export const CUSTOMER_EXPORT_COLUMNS = Object.freeze([
  { key: 'arCode', header: 'รหัสลูกค้า (AR)', width: 14 },
  { key: 'name', header: 'ชื่อลูกค้า (ไทย)', width: 40 },
  { key: 'nameEn', header: 'ชื่อลูกค้า (อังกฤษ)', width: 40 },
  { key: 'customerType', header: 'ประเภทลูกค้า', width: 16 },
  { key: 'origin', header: 'ไทย/ต่างประเทศ', width: 14 },
  { key: 'taxId', header: 'เลขผู้เสียภาษี', width: 18 },
  { key: 'branchCode', header: 'สาขา', width: 10 },
  { key: 'phone', header: 'โทรศัพท์', width: 16 },
  { key: 'contactPerson', header: 'ผู้ติดต่อหลัก', width: 24 },
  { key: 'contactPhone', header: 'โทรผู้ติดต่อ', width: 16 },
  { key: 'email', header: 'อีเมล', width: 28 },
  { key: 'address', header: 'ที่อยู่ออกเอกสาร', width: 60 },
  { key: 'shippingAddress', header: 'ที่อยู่จัดส่ง', width: 60 },
  { key: 'brands', header: 'แบรนด์', width: 36 },
  { key: 'teams', header: 'ทีมดูแล', width: 12 },
  { key: 'credit', header: 'วางบิลและกำหนดชำระ', width: 36 },
  { key: 'approvalStatus', header: 'สถานะอนุมัติ', width: 14 },
  { key: 'active', header: 'การใช้งาน', width: 12 },
  { key: 'createdAt', header: 'วันที่สร้าง', width: 14 },
]);

const APPROVAL_LABELS = Object.freeze({ pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' });
const CUSTOMER_TYPE_LABELS = Object.freeze({ company: 'นิติบุคคล', individual: 'บุคคลธรรมดา' });

const textOf = (value) => String(value ?? '').trim();
const orNull = (value) => textOf(value) || null;

/* แบรนด์ในไฟล์ = **สองภาษา** "EN (TH)" — บนจอโชว์ภาษาเดียว (`brandLabel`: EN ก่อน) เพราะชิปรก แต่ไฟล์คือข้อมูล
   คนรับไฟล์ต้องเห็นชื่อไทยด้วย (ค้นบนจอก็เจอทั้งสองภาษา) · มีภาษาเดียว = ภาษานั้น · ชื่อเหมือนกัน = ไม่ซ้ำ */
function brandCellOf(brand) {
  const en = brandEn(brand);
  const th = brandTh(brand);
  if (en && th && en !== th) return `${en} (${th})`;
  return en || th;
}

/**
 * แถวของไฟล์ — ไม่แตะ ExcelJS (เทสต์ได้โดยไม่สร้างไฟล์)
 * @param customer แถวลูกค้าเต็มแถว (`GET /api/customers?manage=1`)
 */
export function customerExportRow(customer) {
  const c = customer || {};
  const status = approvalStatusOf(c);
  const address = orNull(c.address);
  return {
    arCode: orNull(c.arCode),
    name: orNull(c.name),
    nameEn: orNull(c.nameEn),
    // ค่าที่ไม่ใช่ 'individual' = นิติบุคคล — ค่าตั้งต้นเดียวกับฟอร์มและ API
    customerType: CUSTOMER_TYPE_LABELS[c.customerType === 'individual' ? 'individual' : 'company'],
    origin: c.isForeign === true ? 'ต่างประเทศ' : 'ไทย',
    taxId: orNull(c.taxId),
    branchCode: branchValue(c.branchCode),
    phone: c.phone ? fmtPhone(c.phone) : null,
    contactPerson: orNull(c.contactPerson),
    contactPhone: c.contactPhone ? fmtPhone(c.contactPhone) : null,
    email: orNull(c.email),
    address,
    shippingAddress: orNull(c.shippingAddress) || address,
    brands: (c.brands || []).map(brandCellOf).filter(Boolean).join(', ') || null,
    teams: masterRecordTeams(c).join(', ') || null,
    credit: customerCreditSummary(c) || null,
    approvalStatus: APPROVAL_LABELS[status] || status,
    active: c.isActive === false ? 'เลิกใช้' : 'ใช้งาน',
    createdAt: c.createdAt ? fmtDate(c.createdAt) : null,
  };
}

/** เรียงตามรหัส AR แบบตัวเลข (AR-306 ก่อน AR-1001) · ไม่มีรหัสไปท้าย */
export function sortCustomersForExport(rows = []) {
  return [...rows].sort((a, b) => {
    const x = textOf(a?.arCode);
    const y = textOf(b?.arCode);
    if (!x !== !y) return x ? -1 : 1;
    return x.localeCompare(y, 'th', { numeric: true });
  });
}

/** ชื่อไฟล์: YYYYMMDD_customers.xlsx ตามเวลาไทย (รูปเดียวกับ export ทะเบียนสินค้า) */
export function customerExportFilename(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}_customers.xlsx`;
}

export async function buildCustomerExportBuffer(rows = [], { now = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SS System';
  workbook.created = now;
  workbook.modified = now;
  workbook.calcProperties.fullCalcOnLoad = false;

  // ตรึงหัว + สองคอลัมน์แรก (รหัส · ชื่อไทย) — เลื่อนไปขวาแล้วยังรู้ว่าแถวนี้คือใคร
  const sheet = workbook.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  sheet.columns = CUSTOMER_EXPORT_COLUMNS.map((c) => ({ ...c }));

  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  for (const customer of rows) {
    const row = sheet.addRow(customerExportRow(customer));
    row.font = { name: FONT, size: 11 };
    // ชิดบนทั้งแถว — ที่อยู่ยาวตัดหลายบรรทัด ช่องอื่นต้องอยู่บรรทัดเดียวกับบรรทัดแรกของมัน
    row.alignment = { vertical: 'top' };
    for (const key of ['address', 'shippingAddress']) {
      row.getCell(key).alignment = { vertical: 'top', wrapText: true };
    }
    // เลขผู้เสียภาษี/สาขาเป็นข้อความเสมอ — กันศูนย์นำหน้าหายตอนผู้รับแก้เซลล์แล้วกด Enter
    row.getCell('taxId').numFmt = '@';
    row.getCell('branchCode').numFmt = '@';
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
  return workbook.xlsx.writeBuffer();
}
