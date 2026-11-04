// ── Report → .xlsx (exceljs) ──────────────────────────────────────────────
// Turns the uniform report shape from lib/tax/reports.js into an Excel buffer.
// Server-only (Node runtime): exceljs is a Node lib — import only from an API
// route with `runtime = 'nodejs'`. Money columns get a THB number format; the
// summary row is appended bold at the bottom.
// ⭐ ตัววางแผ่นอยู่ที่ `lib/tax/reportWorkbook.js` — ตัวเดียวกับไฟล์ที่จอสร้างเอง (`reportXlsxDownload.js`)
import ExcelJS from 'exceljs';
import { fillReportWorkbook } from '@/lib/tax/reportWorkbook';

export async function reportToXlsxBuffer(reportData) {
  const wb = fillReportWorkbook(new ExcelJS.Workbook(), reportData);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
