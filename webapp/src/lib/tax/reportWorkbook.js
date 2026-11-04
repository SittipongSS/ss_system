// ── รายงานรูปกลาง → แผ่นงาน Excel (exceljs) — ตัวเดียวของฝั่ง server และฝั่งจอ ───────────────────────────
// รูปรายงาน `{ title, columns, rows, summary }` จาก lib/tax/reports.js (และรายงานที่จอประกอบเอง เช่น ตารางยื่นชำระของ RA)
//   · server: `reportToXlsxBuffer` (lib/tax/exportExcel.js · route ที่ runtime = 'nodejs')
//   · จอ: `downloadReportXlsx` (lib/tax/reportXlsxDownload.js · import exceljs แบบ dynamic ตอนกดปุ่ม)
// ⚠️ ไฟล์นี้ไม่ import exceljs เอง — ผู้เรียกส่ง workbook เข้ามา ⇒ ฝั่งจอไม่ลาก exceljs เข้า bundle หลัก
// ทรงแผ่น: แถว 1 ชื่อรายงาน (merge) · แถว 2 ว่าง · แถว 3 หัวตาราง · แถวข้อมูล · แถวสรุปตัวหนา
// `report.excel` (ไม่บังคับ): `{ freezeHeader, autoFilter }` — ตรึงหัวตาราง / ปุ่มกรองบนหัว (ตารางแบนที่ผู้ใช้กรอง/เรียงต่อใน Excel)

const MONEY_FMT = '#,##0.00';
const HEADER_ROW = 3;

const fmtDateCell = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d;
};

/** เติมรายงาน (หนึ่งก้อนหรือหลายก้อน = หลายแผ่น) ลง workbook ของ exceljs */
export function fillReportWorkbook(wb, reportData) {
  wb.creator = 'ระบบสรรพสามิต';
  wb.created = new Date();

  const reports = Array.isArray(reportData) ? reportData : [reportData];

  for (const report of reports) {
    const ws = wb.addWorksheet(report.title?.slice(0, 31) || 'Report');

    // Title row
    // `only: 'print'` = a column laid out for paper (e.g. status + registration number in
    // one cell) — Excel gets the separate columns instead, so it can filter/sort them
    const cols = (report.columns || []).filter((c) => c.only !== 'print');
    ws.mergeCells(1, 1, 1, Math.max(cols.length, 1));
    const titleCell = ws.getCell(1, 1);
    titleCell.value = report.title || 'รายงาน';
    titleCell.font = { bold: true, size: 14 };

    // Header row (row 3)
    const header = ws.getRow(HEADER_ROW);
    cols.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC17A52' } };
      cell.alignment = { vertical: 'middle' };
    });

    // Data rows
    (report.rows || []).forEach((r) => {
      const row = ws.addRow(cols.map((c) => (c.date ? fmtDateCell(r[c.key]) : r[c.key] ?? '')));
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.money || c.num) cell.numFmt = c.money ? MONEY_FMT : '#,##0';
        if (c.date) cell.numFmt = 'dd/mm/yyyy';
        if (c.multiline) cell.alignment = { wrapText: true, vertical: 'top' };
      });
    });
    const lastDataRow = HEADER_ROW + (report.rows || []).length;

    // Summary row (bold)
    if (report.summary) {
      const s = report.summary;
      const vals = cols.map((c, i) => {
        if (i === 0) return s._label || 'รวม';
        return s[c.key] ?? '';
      });
      const row = ws.addRow(vals);
      row.font = { bold: true };
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if ((c.money || c.num) && typeof s[c.key] === 'number') cell.numFmt = c.money ? MONEY_FMT : '#,##0';
      });
    }

    // Auto-ish widths (`width` ของคอลัมน์ชนะ — คอลัมน์สั้นที่หัวยาวไม่ต้องกว้างตามหัว)
    cols.forEach((c, i) => {
      const headerLen = (c.label || '').length;
      ws.getColumn(i + 1).width = c.width
        || Math.min(40, Math.max(12, headerLen + 4, c.money ? 16 : 0, c.multiline ? 26 : 0));
    });

    // ตรึงหัว / ปุ่มกรอง — เฉพาะรายงานที่ขอ (รายงานเดิมของ /tax · บัญชี · สหมิตร หน้าตาเท่าเดิม)
    if (report.excel?.freezeHeader) ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
    if (report.excel?.autoFilter && cols.length) {
      ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: Math.max(lastDataRow, HEADER_ROW), column: cols.length } };
    }
  }
  return wb;
}
