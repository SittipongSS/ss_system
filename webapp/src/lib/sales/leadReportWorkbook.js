// ── วาดรายงานลีดเป็นไฟล์ Excel ──────────────────────────────────────────────
//
// แยกจาก `leadReport.js` โดยตั้งใจ: ที่นั่นคือ *กติกาของรายงาน* (คอลัมน์ไหน แปลงค่ายังไง)
// ที่นี่คือ *การวาดชีต* — เทสต์จับกติกาได้โดยไม่ต้องสร้างไฟล์จริง
// รูปแบบชีตลอกจาก `master/productCategoryWorkbook.js` เพื่อให้ไฟล์ที่ระบบส่งออกหน้าตาเดียวกัน

import ExcelJS from 'exceljs';
import { LEAD_REPORT_COLUMNS, leadReportRow } from '@/lib/sales/leadReport';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const INFO_FILL = 'FFF4E8DF';
const SHEET = 'ลีด';

/**
 * @param leads  แถวจาก `sales_leads` (กรองช่วง/ขอบเขตมาแล้ว)
 * @param meta   { from, to, generatedAt, by } — บอกที่มาของไฟล์
 */
export async function buildLeadReportBuffer(leads = [], meta = {}) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Scent & Sense';
  const sheet = book.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 2 }] });

  /* บรรทัดบนสุดบอกว่าไฟล์นี้คือช่วงไหน ใครโหลด เมื่อไร — ไฟล์ Excel เดินทางต่อได้
     ไกลกว่าหน้าจอมาก ถ้าไม่ประทับไว้ อีกสองสัปดาห์ไม่มีใครรู้ว่ามันคือข้อมูลของช่วงไหน */
  const span = meta.from && meta.to ? `${meta.from} ถึง ${meta.to}` : 'ทั้งหมด (ไม่ระบุช่วง)';
  const info = sheet.addRow([`รายงานลีด · ช่วง ${span} · ${leads.length} ใบ`
    + `${meta.by ? ` · ดาวน์โหลดโดย ${meta.by}` : ''}`
    + `${meta.generatedAt ? ` · ${meta.generatedAt}` : ''}`
    + ' · วันที่ทุกช่องเป็นวันไทย (YYYY-MM-DD)']);
  info.font = { name: FONT, size: 10 };
  info.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_FILL } };
  sheet.mergeCells(1, 1, 1, LEAD_REPORT_COLUMNS.length);

  const header = sheet.addRow(LEAD_REPORT_COLUMNS.map((c) => c.label));
  header.font = { name: FONT, size: 11, bold: true, color: { argb: HEADER_TEXT } };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle' };
  });

  sheet.columns = LEAD_REPORT_COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  for (const lead of leads) {
    const shaped = leadReportRow(lead);
    const row = sheet.addRow(LEAD_REPORT_COLUMNS.map((c) => shaped[c.key]));
    row.font = { name: FONT, size: 11 };
    LEAD_REPORT_COLUMNS.forEach((c, index) => {
      if (c.money) row.getCell(index + 1).numFmt = '#,##0.00';
    });
  }

  // กรองในตัวไฟล์ — คนรับส่วนใหญ่จะหั่นตามทีม/ช่องทาง/สถานะทันทีที่เปิด
  if (leads.length) {
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2 + leads.length, column: LEAD_REPORT_COLUMNS.length },
    };
  }

  return book.xlsx.writeBuffer();
}
