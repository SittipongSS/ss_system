// ── Report → .xlsx (exceljs) ──────────────────────────────────────────────
// Turns the uniform report shape from lib/tax/reports.js into an Excel buffer.
// Server-only (Node runtime): exceljs is a Node lib — import only from an API
// route with `runtime = 'nodejs'`. Money columns get a THB number format; the
// summary row is appended bold at the bottom.
import ExcelJS from 'exceljs';

const MONEY_FMT = '#,##0.00';

const fmtDateCell = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d;
};

export async function reportToXlsxBuffer(reportData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบสรรพสามิต';
  wb.created = new Date();
  
  const reports = Array.isArray(reportData) ? reportData : [reportData];
  
  for (const report of reports) {
    const ws = wb.addWorksheet(report.title?.slice(0, 31) || 'Report');

    // Title row
    const cols = report.columns || [];
    ws.mergeCells(1, 1, 1, Math.max(cols.length, 1));
    const titleCell = ws.getCell(1, 1);
    titleCell.value = report.title || 'รายงาน';
    titleCell.font = { bold: true, size: 14 };

    // Header row (row 3)
    const headerRowIdx = 3;
    const header = ws.getRow(headerRowIdx);
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

    // Auto-ish widths
    cols.forEach((c, i) => {
      const headerLen = (c.label || '').length;
      ws.getColumn(i + 1).width = Math.min(40, Math.max(12, headerLen + 4, c.money ? 16 : 0, c.multiline ? 26 : 0));
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
