// ── วาดรายงาน FC เป็นไฟล์ Excel แบบ "กริดรายเดือน" ──────────────────────────
//
// แยกจาก `forecastBreakdown.js` โดยตั้งใจ: ที่นั่นคือ *กติกาของตัวเลข* (บรรทัดมาจากไหน
// ปันส่วนยังไง) ที่นี่คือ *การวาดชีต* — เทสต์จับกติกาได้โดยไม่ต้องสร้างไฟล์จริง
// รูปแบบชีตลอกจาก `leadReportWorkbook.js` เพื่อให้ไฟล์ที่ระบบส่งออกหน้าตาเดียวกัน
//
// ⭐ รูปที่ผู้ใช้ขอ (2026-09-02): **แถวเป็นราย deal-บรรทัด (หมวด · ปริมาตร · จำนวน)
//    และเดือนเป็นคอลัมน์** ⇒ เปิดมาเห็นทั้งปีในหน้าจอเดียว บวกคอลัมน์ได้ตรง ๆ
//    ไม่ต้อง pivot ก่อน · แถวสรุปรายหมวดใช้รูปเดียวกันเป๊ะ เปลี่ยนแค่ว่าแถวคืออะไร

import ExcelJS from 'exceljs';
import { gridForecastLines, monthsInRows, summarizeForecastLines } from '@/lib/sales/forecastBreakdown';
import { STAGE_LABELS } from '@/lib/salesPlanning';
import { TEAM_LABELS } from '@/lib/permissions';
import { fmtNumber } from '@/lib/format';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const INFO_FILL = 'FFF4E8DF';
const TOTAL_FILL = 'FFF7F4EE';
const NA = '—';

const MONTH_LABEL = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/* ⚠️ ต้องเขียนไว้บนหัวไฟล์ทั้งสองชีต — ไฟล์นี้เดินทางไปถึงคนที่ไม่ได้อยู่ในระบบ
   ถ้าเขาเอาไปเทียบกับแดชบอร์ดแล้วเดือนไม่ตรง จะกลายเป็นเรื่องว่า "เลขไหนถูก"
   ทั้งที่มันตอบคนละคำถาม (ของต้องเสร็จเมื่อไร vs รายได้ลงเดือนไหน) */
const MONTH_AXIS_NOTE = 'เดือนในตารางคือ "วันที่สิ้นสุด" ของดีล = เดือนที่ลูกค้าต้องการรับของ'
  + ' (ดีลสหมิตรใช้เดือนที่ลูกค้าขอของ) — ไม่ใช่เดือนที่ปิดยอด'
  + ' ⇒ **ทั้งการกระจายรายเดือนและยอดรวมทั้งปี ต่างจากแดชบอร์ดโดยเจตนา** เพราะ'
  + ' (ก) ดีลที่ปิดปีนี้แต่ส่งของปีหน้าจะย้ายไปอยู่ไฟล์ของปีหน้า และ'
  + ' (ข) ไฟล์นี้ไม่รวมดีลที่แพ้แล้ว · เทียบยอดกับแดชบอร์ดตรง ๆ ไม่ได้';

/** `2026-09` → `ก.ย. 26` — หัวคอลัมน์ต้องสั้นพอให้ 12 เดือนอยู่ในจอเดียว
 *  ⭐ เดือนในกริดคือเดือนของ `endDate` = **วันที่ลูกค้าต้องการรับของ** ไม่ใช่เดือนปิดยอด
 *     (มติผู้ใช้ 2026-09-02) */
export function monthColumnLabel(month) {
  const [year, index] = String(month || '').split('-');
  const label = MONTH_LABEL[Number(index) - 1];
  return label ? `${label} ${String(year).slice(-2)}` : String(month || '');
}

/* คอลัมน์ที่อยู่ **ซ้ายมือของกริด** — ตัวระบุว่าแถวนี้คืออะไร
   แยกสองชุดเพราะสองชีตตอบคนละคำถาม แต่กริดเดือนทางขวาเหมือนกันเป๊ะ */
export const SUMMARY_LEAD_COLUMNS = [
  { key: 'categoryCode', label: 'รหัสหมวด', width: 11 },
  { key: 'categoryName', label: 'ชื่อหมวด', width: 28 },
  { key: 'unit', label: 'หน่วยขาย', width: 12 },
  { key: 'volume', label: 'ขนาด/หน่วย', width: 12, number: true },
  { key: 'qty', label: 'จำนวนรวม', width: 13, number: true },
  { key: 'volumeTotal', label: 'ปริมาตรรวม', width: 14, number: true },
  { key: 'volumeUnit', label: 'หน่วยปริมาตร', width: 12 },
  { key: 'dealCount', label: 'จำนวนดีล', width: 10, number: true },
  { key: 'guessedAmount', label: '⚠ ยอดที่เดาเดือน', width: 16, money: true },
];

export const DEAL_LEAD_COLUMNS = [
  { key: 'dealCode', label: 'รหัสดีล', width: 15 },
  { key: 'dealTitle', label: 'ชื่อดีล', width: 34 },
  { key: 'customerName', label: 'ลูกค้า', width: 28 },
  { key: 'ownerName', label: 'ผู้ดูแล (AE)', width: 20 },
  { key: 'team', label: 'ทีม', width: 8 },
  { key: 'stage', label: 'ขั้น', width: 14 },
  { key: 'monthBasisLabel', label: 'เดือนมาจาก', width: 15 },
  { key: 'sourceLabel', label: 'ที่มา FC', width: 13 },
  { key: 'quoteNumber', label: 'เลขที่ใบเสนอราคา', width: 18 },
  { key: 'categoryCode', label: 'รหัสหมวด', width: 11 },
  { key: 'categoryName', label: 'ชื่อหมวด', width: 26 },
  { key: 'fgCode', label: 'รหัส FG', width: 14 },
  { key: 'description', label: 'รายละเอียด', width: 34 },
  { key: 'qty', label: 'จำนวน', width: 11, number: true },
  { key: 'unit', label: 'หน่วยขาย', width: 12 },
  { key: 'volume', label: 'ปริมาตร/หน่วย', width: 13, number: true },
  { key: 'volumeTotal', label: 'ปริมาตรรวม', width: 13, number: true },
  { key: 'volumeUnit', label: 'หน่วยปริมาตร', width: 12 },
  { key: 'unitPrice', label: 'ราคา/หน่วย', width: 13, money: true },
  { key: 'amount', label: 'มูลค่าบรรทัด', width: 14, money: true },
];

const SOURCE_LABEL = { quotation: 'ใบเสนอราคา', manual: 'กรอกเอง' };

/* ⚠️ แถวที่เดือนไม่ได้มาจาก "วันที่สิ้นสุด" ต้องอ่านออกทันที — ไม่งั้นฝ่ายวางแผนผลิต
   จะเชื่อว่าเป็นเดือนส่งของจริงทั้งไฟล์ ทั้งที่ 42% ของยอดยังเป็นเดือนที่ถอยมาจาก
   วันปิดการขาย (ดีลต้นทางที่ยังไม่รู้วันส่ง) */
const MONTH_BASIS_LABEL = {
  endDate: 'วันสิ้นสุด',
  demandMonth: 'เดือนที่ลูกค้าขอ (สหมิตร)',
  expectedCloseDate: '⚠ ถอยจากวันปิด',
  forecastMonth: '⚠ ถอยจากเดือน FC',
};

/* เดือนที่ "รู้จริง" — สองที่มานี้คือวันรับของจริง ส่วนที่เหลือคือเดาจากวันปิดการขาย
   ⚠️ ชีตสรุปต้องบอกสัดส่วนของที่เดา ไม่ใช่โชว์แต่ชีตรายดีล — ของจริง 2026-09-02
      47% ของยอดในชีตสรุปเป็นเดือนที่ถอยมา ถ้าไม่บอก ฝ่ายวางแผนอ่านทั้งชีตเป็นวันส่งจริง */


const cell = (value) => (value === null || value === undefined || value === '' ? NA : value);

/* วาดหนึ่งชีต = คอลัมน์ระบุแถว + กริดเดือน + คอลัมน์รวม
 * ⚠️ **แถวรวมท้ายตารางเป็นตัวเลขจริง ไม่ใช่สูตร** — คนรับส่วนใหญ่กรอง/ซ่อนแถวทันที
 *    ที่เปิด ถ้าเป็น SUM ของช่วง ตัวเลขจะเปลี่ยนตามการกรองแล้วไม่ตรงกับหัวไฟล์อีก */
function paintGridSheet(sheet, leadColumns, months, rows, infoText) {
  const monthKeys = months;
  const width = leadColumns.length + monthKeys.length + 1;

  const info = sheet.addRow([infoText]);
  info.font = { name: FONT, size: 10 };
  info.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_FILL } };
  sheet.mergeCells(1, 1, 1, width);

  const header = sheet.addRow([
    ...leadColumns.map((c) => c.label),
    ...monthKeys.map(monthColumnLabel),
    'รวมทั้งปี',
  ]);
  header.font = { name: FONT, size: 11, bold: true, color: { argb: HEADER_TEXT } };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.columns = [
    ...leadColumns.map((c) => ({ key: c.key, width: c.width })),
    ...monthKeys.map((month) => ({ key: month, width: 14 })),
    { key: 'total', width: 16 },
  ];
  // ตรึงหัวตาราง **และคอลัมน์ระบุแถว** — เลื่อนไปเดือน ธ.ค. แล้วยังต้องรู้ว่าแถวไหน
  sheet.views = [{ state: 'frozen', xSplit: leadColumns.length, ySplit: 2 }];

  const monthTotals = monthKeys.map(() => 0);
  let grandTotal = 0;

  for (const shaped of rows) {
    const values = [
      ...leadColumns.map((c) => cell(shaped[c.key])),
      ...monthKeys.map((month) => cell(shaped.months?.[month])),
      cell(shaped.total ?? shaped.fcAmount),
    ];
    const row = sheet.addRow(values);
    row.font = { name: FONT, size: 11 };
    leadColumns.forEach((c, index) => {
      if (typeof shaped[c.key] !== 'number') return;
      if (c.money) row.getCell(index + 1).numFmt = '#,##0.00';
      else if (c.number) row.getCell(index + 1).numFmt = '#,##0.###';
    });
    monthKeys.forEach((month, index) => {
      const at = leadColumns.length + index + 1;
      row.getCell(at).numFmt = '#,##0.00';
      monthTotals[index] += Number(shaped.months?.[month] || 0);
    });
    row.getCell(width).numFmt = '#,##0.00';
    grandTotal += Number(shaped.total ?? shaped.fcAmount ?? 0);
  }

  if (rows.length) {
    const totalRow = sheet.addRow([
      'รวม',
      ...leadColumns.slice(1).map(() => ''),
      ...monthTotals.map((value) => Math.round(value * 100) / 100),
      Math.round(grandTotal * 100) / 100,
    ]);
    totalRow.font = { name: FONT, size: 11, bold: true };
    totalRow.eachCell((c, index) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
      if (index > leadColumns.length) c.numFmt = '#,##0.00';
    });
    // กรองครอบเฉพาะแถวข้อมูล — ถ้าคลุมแถวรวมด้วย มันจะถูกกรองหายไปพร้อมแถวอื่น
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2 + rows.length, column: width },
    };
  }
}

/**
 * @param lines   บรรทัดจาก forecastBreakdownOfDeal + บริบทของดีล (month/dealCode/…)
 * @param meta    { year, months, generatedAt, by, categoryNames }
 */
export async function buildForecastReportBuffer(lines = [], meta = {}) {
  const categoryNames = meta.categoryNames || new Map();
  const months = meta.months?.length ? meta.months : monthsInRows(lines);
  const named = (row) => ({
    ...row,
    categoryName: row.categoryCode ? (categoryNames.get(row.categoryCode) || null) : null,
  });

  const book = new ExcelJS.Workbook();
  book.creator = 'Scent & Sense';

  const total = lines.reduce((sum, row) => sum + Number(row.fcAmount || 0), 0);
  /* ⭐ ประทับยอดรวมไว้บนหัวไฟล์ — ไฟล์ Excel เดินทางไกลกว่าหน้าจอมาก คนรับต้องเทียบ
     กับแดชบอร์ดได้ทันทีโดยไม่ต้องเปิดระบบ · ถ้าสองเลขไม่ตรงกันจะได้รู้ตั้งแต่วินาทีแรก
     ⚠️ ยอดนี้เป็น **ก่อน VAT** เหมือน FC ทุกที่ในระบบ ต้องเขียนกำกับไว้เสมอ */
  /* ⭐ ขอบเขตต้องอยู่บนหัวไฟล์เสมอ — หัวหน้าทีมโหลดได้เฉพาะทีมตัวเอง ถ้าไฟล์ไม่บอก
     แล้วถูกส่งต่อ คนรับจะอ่านยอดของทีมเดียวเป็นยอดทั้งบริษัท */
  const stamp = `รายงาน FC ตามเดือนที่ลูกค้ารับของ · ปี ${meta.year || 'ทั้งหมด'}`
    + ` · ขอบเขต ${meta.scopeLabel || 'ทั้งบริษัท'}`
    + ` · ${lines.length} บรรทัด · รวม ${fmtNumber(total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท (ก่อน VAT)`
    + `${meta.by ? ` · ดาวน์โหลดโดย ${meta.by}` : ''}`
    + `${meta.generatedAt ? ` · ${meta.generatedAt}` : ''}`;

  const summary = book.addWorksheet('สรุปรายหมวด');
  paintGridSheet(summary, SUMMARY_LEAD_COLUMNS, months,
    summarizeForecastLines(lines, months).map(named),
    `${stamp} · ${MONTH_AXIS_NOTE}`
    + ' · ยอดรวมของชีตนี้เท่ากับชีต "รายดีล" เสมอ · ช่องว่าง (—) = เดือนนั้นไม่มียอด ไม่ใช่ศูนย์');

  const detail = book.addWorksheet('รายดีล');
  paintGridSheet(detail, DEAL_LEAD_COLUMNS, months,
    gridForecastLines(lines, months).map((row) => ({
      ...named(row),
      /* ⚠️ แปลงคำที่เป็น enum อังกฤษก่อนลงไฟล์ — ไฟล์นี้ไปถึงคนที่ไม่ได้อยู่ในระบบ
         'timeline_proposed' / 'deposit_pending' ในคอลัมน์ "ขั้น" อ่านไม่ออก */
      stage: STAGE_LABELS?.[row.stage] || row.stage,
      team: TEAM_LABELS?.[row.team] || row.team,
      sourceLabel: SOURCE_LABEL[row.source] || row.source,
      monthBasisLabel: MONTH_BASIS_LABEL[row.monthBasis] || MONTH_BASIS_LABEL.expectedCloseDate,
    })),
    `${stamp} · ${MONTH_AXIS_NOTE}`
    + ' · หนึ่งแถว = หนึ่งบรรทัดของดีล · ยอดในช่องเดือนคือ "ส่วนแบ่งของบรรทัดในยอด FC"'
    + ' ซึ่งต่างจาก "มูลค่าบรรทัด" เมื่อใบเสนอราคามีส่วนลดท้ายใบ');

  return book.xlsx.writeBuffer();
}

/** ชื่อไฟล์ — ปีอยู่ในชื่อเพราะไฟล์พวกนี้ถูกเก็บต่อในโฟลเดอร์ของฝ่ายวางแผน
 *  ⚠️ **ทีมต้องอยู่ในชื่อด้วยเมื่อเป็นไฟล์ของทีมเดียว** — หัวหน้าสามทีมโหลดวันเดียวกัน
 *     แล้วส่งเข้าโฟลเดอร์เดียวกัน ชื่อซ้ำจะทับกันเงียบ ๆ และไม่มีใครรู้ว่าเหลือของทีมไหน */
export function forecastReportFilename(year, stampDay, scopeLabel) {
  const team = scopeLabel && scopeLabel !== 'ทั้งบริษัท'
    ? `-${String(scopeLabel).replace(/\s+/g, '')}`
    : '';
  return `FC-by-category-${year || 'all'}${team}-${stampDay}.xlsx`;
}
