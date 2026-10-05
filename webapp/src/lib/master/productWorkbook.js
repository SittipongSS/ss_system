// ── ไฟล์ Excel ของทะเบียนสินค้า (ปุ่ม "ส่งออก Excel" บนหน้ารายการ) ──────────
//
// คอลัมน์ตามที่ผู้ใช้สั่ง (2026-08-28): FG · ชื่อ · ปริมาตร · ราคาผลิต
// ⭐ ราคาผลิตแตกเป็นสามคอลัมน์เหมือนบนจอ (ก่อน VAT · ยอด VAT · รวม VAT) — คนรับไฟล์
//    ไม่ต้องคิด 1.07 เอง และไม่ต้องเดาว่าเลขในไฟล์คือก่อนหรือรวม VAT
// ⭐ ปริมาตรแยกเป็น "ตัวเลข" กับ "หน่วย" เพราะเซลล์ตัวเลขใน Excel พก "ml" ไปด้วยไม่ได้
//    — ยัดเป็น "30 ml" ทั้งก้อนแล้วผู้รับ sort/sum ไม่ได้ ซึ่งคือเหตุผลเดียวที่ขอไฟล์
//
// ⭐ สูตรสามคอลัมน์ (มติผู้ใช้ 2026-10-05): รหัสสูตร · ชื่อสูตร · วันที่สูตร — แยกคอลัมน์ให้กรอง/ค้นด้วยรหัสได้ตรง
//    · ชุดของขวัญ (01-037 · mig 0403) หลายสูตร = **หลายบรรทัดในเซลล์เดียว แถวละ 1 FG เหมือนเดิม** บรรทัดที่ n ของสามคอลัมน์
//      คือสูตรตัวเดียวกัน · ชื่อสูตรนำด้วยหมวด ("น้ำหอมสำหรับผิวกาย: …") · ชิ้นที่ไม่มีเป็นขีดเพื่อให้บรรทัดตรงกัน
//    · ไม่แตกเป็นหลายแถวต่อ FG — คนรับไฟล์ sum ราคาผลิต/นับจำนวน FG แล้วจะนับชุดซ้ำ
//    · FG ที่ไม่ผูกสูตร = เซลล์ว่าง (กติกาเดียวกับราคาที่ยังไม่ตั้ง)
//
// ⚠️ ราคาผลิตเป็นข้อมูลลับ — คนที่ไม่มีสิทธิ์เห็น (`canSeeProductCostUser`) ต้องได้
//    ไฟล์ที่ **ไม่มีสามคอลัมน์นี้เลย** ไม่ใช่คอลัมน์ว่าง · ตัวตัดสินอยู่ที่ route
//    ที่ส่ง `includeCost` เข้ามา ไม่ใช่ที่นี่
import ExcelJS from 'exceljs';
import { costPriceVat, VAT_RATE_LABEL } from '@/lib/master/costVat';
import { fmtDate, productNameBoth } from '@/lib/format';
import { DEFAULT_VOLUME_UNIT } from '@/lib/master/units';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const SHEET = 'สินค้า';
const MONEY = '#,##0.00';
const DASH = '—';
// ความสูงต่อบรรทัดของแถวหลายสูตร (pt) — สระ/วรรณยุกต์ไทยบนล่างต้องการมากกว่า 15 ของค่าตั้งต้น
const LINE_HEIGHT_PT = 18;
const VOLUME = '#,##0.##';

const BASE_COLUMNS = [
  { key: 'fgCode', header: 'FG Code', width: 24 },
  { key: 'name', header: 'ชื่อสินค้า', width: 46 },
  { key: 'formulaCode', header: 'รหัสสูตร', width: 20 },
  { key: 'formulaName', header: 'ชื่อสูตร', width: 44 },
  { key: 'formulaDate', header: 'วันที่สูตร', width: 14 },
  { key: 'volume', header: 'ปริมาตร', width: 12 },
  { key: 'volumeUnit', header: 'หน่วย', width: 10 },
];
const COST_COLUMNS = [
  { key: 'costExVat', header: 'ราคาผลิต (ก่อน VAT)', width: 20 },
  { key: 'costVat', header: `VAT ${VAT_RATE_LABEL}`, width: 14 },
  { key: 'costIncVat', header: 'ราคาผลิต (รวม VAT)', width: 20 },
];

const textOf = (value) => String(value ?? '').trim();
const dateOf = (value) => (value ? fmtDate(value) : DASH);

/**
 * สูตรของ FG เป็นบรรทัด `[{ code, name, date }]` — ชุดของขวัญได้บรรทัดละสูตร (ชื่อนำด้วยหมวด) · FG สูตรเดี่ยวได้บรรทัดเดียว
 * · ไม่ผูกสูตร = `[]` (เซลล์ว่าง) · สินค้ารุ่นก่อนทะเบียนสูตรที่มีแต่ข้อความ `formulaName` ค้าง = พิมพ์ข้อความนั้น (หน้ารายละเอียดก็โชว์)
 * @param product แถวสินค้า — route เติม `formulaComponents` (ชุดของขวัญ) และค่าสดจากทะเบียนสูตรให้ก่อน
 */
export function productFormulaLines(product) {
  const parts = Array.isArray(product?.formulaComponents) ? product.formulaComponents : [];
  if (parts.length) {
    return parts.map((row) => ({
      code: textOf(row.formulaCode) || DASH,
      name: `${textOf(row.categoryName) || textOf(row.categoryCode) || DASH}: ${textOf(row.formulaName) || DASH}`,
      date: dateOf(row.formulaDate),
    }));
  }
  const code = textOf(product?.formulaCode);
  const name = textOf(product?.formulaName);
  if (!product?.formulaId && !code && !name) return [];
  return [{ code: code || DASH, name: name || DASH, date: dateOf(product?.formulaDate) }];
}

/** ชื่อไฟล์: YYYYMMDD_products.xlsx ตามเวลาไทย (รูปเดียวกับ export หมวดสินค้า) */
export function productExportFilename(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}_products.xlsx`;
}

export async function buildProductExportBuffer(rows = [], { includeCost = false, now = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SS System';
  workbook.created = now;
  workbook.modified = now;
  workbook.calcProperties.fullCalcOnLoad = false;

  const sheet = workbook.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  sheet.columns = includeCost ? [...BASE_COLUMNS, ...COST_COLUMNS] : BASE_COLUMNS;

  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  for (const product of rows) {
    // ⚠️ ราคาผลิตที่ยังไม่ตั้ง = เซลล์ว่าง ไม่ใช่ 0 — 0 บาทคือ "ตั้งไว้ที่ศูนย์"
    // ซึ่งเป็นคำตอบคนละอันกับ "ยังไม่มีราคา" (กฎค่าว่างของระบบ)
    const cost = costPriceVat(product.costPrice);
    const volume = product.volume == null || product.volume === '' ? null : Number(product.volume);
    const lines = productFormulaLines(product);
    const column = (key) => (lines.length ? lines.map((line) => line[key]).join('\n') : null);
    const row = sheet.addRow({
      fgCode: product.fgCode || '',
      name: productNameBoth(product) || '',
      formulaCode: column('code'),
      formulaName: column('name'),
      formulaDate: column('date'),
      volume: Number.isFinite(volume) ? volume : null,
      volumeUnit: product.volumeUnit || DEFAULT_VOLUME_UNIT,
      ...(includeCost ? {
        costExVat: cost.exVat, costVat: cost.vat, costIncVat: cost.incVat,
      } : {}),
    });
    row.font = { name: FONT, size: 11 };
    row.alignment = { vertical: 'middle' };
    row.getCell('volume').numFmt = VOLUME;
    // ชุดของขวัญหลายสูตร: ตัดบรรทัดในเซลล์ + ชิดบนทั้งแถว + ความสูงตามจำนวนบรรทัด (ไม่ตั้งเอง Excel โชว์แค่บรรทัดแรก)
    if (lines.length > 1) {
      row.alignment = { vertical: 'top' };
      for (const key of ['formulaCode', 'formulaName', 'formulaDate']) {
        row.getCell(key).alignment = { vertical: 'top', wrapText: true };
      }
      row.height = lines.length * LINE_HEIGHT_PT;
    }
    if (includeCost) {
      for (const key of ['costExVat', 'costVat', 'costIncVat']) row.getCell(key).numFmt = MONEY;
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
  return workbook.xlsx.writeBuffer();
}
