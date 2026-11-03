// ── ไฟล์ Excel ของทะเบียนสูตร (ปุ่ม "ดาวน์โหลด Excel" บนหน้ารายการ · ม-158 · มติเจ้าของ 03/11/2026) ───────────
//
// ⭐ เจ้าของขอให้ Ingredient List ออกใน Excel ทะเบียนสูตร (ซึ่งยังไม่เคยมี) ⇒ ไฟล์นี้เกิดพร้อม ม-158
//   แถว = เท่าที่ตาเห็นบนจอ (route กรองด้วย `filterFormulas` ตัวเดียวกับจอ) · เรียงใหม่สุดก่อนเหมือนตาราง
// ⭐ คอลัมน์ = ของที่ตารางโชว์ + Ingredient List ท้ายสุด (ข้อความยาว ตัดบรรทัดในเซลล์)
//   · ลูกค้าแยก "รหัสลูกค้า (AR)" กับ "ชื่อลูกค้า" — คนรับไฟล์กรองด้วยรหัสได้ตรง (กติกาเดียวกับสามคอลัมน์สูตรของ Excel สินค้า)
//   · ไม่มีราคา — ราคาอยู่ทะเบียนวัสดุ (มีรุ่น/วันหมดอายุ) ไฟล์นี้ตอบ "สูตรอะไรมีอะไรอยู่ข้างใน" ไม่ใช่ราคา
// รูปแบบชีตลอกจาก `productWorkbook.js` (ฟอนต์ · หัวตาราง · ชื่อไฟล์) — ไฟล์ที่ระบบส่งออกหน้าตาเดียวกัน
import ExcelJS from 'exceljs';
import { fmtDate } from '@/lib/format';
import { FORMULA_STATUS_LABELS } from '@/lib/master/formulas';
import { INGREDIENT_LIST_LABEL } from '@/lib/master/ingredientList';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const SHEET = 'สูตร';

export const FORMULA_EXPORT_COLUMNS = Object.freeze([
  { key: 'code', header: 'รหัสสูตร', width: 20 },
  { key: 'name', header: 'ชื่อสูตร', width: 40 },
  { key: 'category', header: 'หมวดสินค้า', width: 34 },
  { key: 'scent', header: 'กลิ่นที่ใช้', width: 30 },
  { key: 'customerArCode', header: 'รหัสลูกค้า (AR)', width: 14 },
  { key: 'customerName', header: 'ชื่อลูกค้า', width: 36 },
  { key: 'customerTradeName', header: 'ชื่อที่ลูกค้าเรียก', width: 28 },
  { key: 'formulaDate', header: 'วันที่สูตร', width: 14 },
  { key: 'status', header: 'สถานะ', width: 14 },
  { key: 'ingredientList', header: INGREDIENT_LIST_LABEL, width: 70 },
]);

const textOf = (value) => String(value ?? '').trim();

/**
 * แถวของไฟล์ — ไม่แตะ ExcelJS (เทสต์ได้โดยไม่สร้างไฟล์)
 * @param ctx `{ categoryLabel(code), scentLabel(id), arCodeOf(customerId) }` — route ประกอบจากทะเบียนจริง
 * ⚠️ ค่าที่ไม่มี = เซลล์ว่าง (null) ไม่ใช่ขีด — คนรับไฟล์กรอง "ว่าง" ใน Excel ได้ (กติกาเดียวกับราคาที่ยังไม่ตั้งของ Excel สินค้า)
 */
export function formulaExportRow(formula, ctx = {}) {
  const { categoryLabel = (c) => c, scentLabel = () => null, arCodeOf = () => null } = ctx;
  return {
    code: textOf(formula?.code) || null,
    name: textOf(formula?.name) || null,
    category: formula?.categoryCode ? (categoryLabel(formula.categoryCode) || formula.categoryCode) : null,
    scent: formula?.scentId ? (scentLabel(formula.scentId) || null) : null,
    customerArCode: formula?.customerId ? (arCodeOf(formula.customerId) || null) : null,
    // สูตรฐาน (ไม่ผูกลูกค้า) บอกตรง ๆ — เซลล์ว่างอ่านเป็น "ไม่รู้ลูกค้า" ซึ่งผิด
    customerName: formula?.customerId || formula?.customerName ? (textOf(formula.customerName) || null) : 'สูตรฐาน',
    customerTradeName: textOf(formula?.customerTradeName) || null,
    formulaDate: formula?.formulaDate ? fmtDate(formula.formulaDate) : null,
    status: FORMULA_STATUS_LABELS[formula?.status] || formula?.status || null,
    ingredientList: textOf(formula?.ingredientList) || null,
  };
}

/** ชื่อไฟล์: YYYYMMDD_formulas.xlsx ตามเวลาไทย (รูปเดียวกับ export ทะเบียนสินค้า) */
export function formulaExportFilename(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}_formulas.xlsx`;
}

export async function buildFormulaExportBuffer(rows = [], ctx = {}, { now = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SS System';
  workbook.created = now;
  workbook.modified = now;
  workbook.calcProperties.fullCalcOnLoad = false;

  const sheet = workbook.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  sheet.columns = FORMULA_EXPORT_COLUMNS.map((c) => ({ ...c }));

  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  for (const formula of rows) {
    const row = sheet.addRow(formulaExportRow(formula, ctx));
    row.font = { name: FONT, size: 11 };
    // ชิดบนทั้งแถว — Ingredient List ตัดหลายบรรทัด ช่องอื่นต้องอยู่บรรทัดเดียวกับบรรทัดแรกของมัน
    row.alignment = { vertical: 'top' };
    row.getCell('ingredientList').alignment = { vertical: 'top', wrapText: true };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
  return workbook.xlsx.writeBuffer();
}
