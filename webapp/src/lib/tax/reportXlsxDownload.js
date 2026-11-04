// ── ดาวน์โหลดรายงานรูปกลางเป็น .xlsx จากจอ (ไม่ผ่าน server) ─────────────────────────────────────────────
// ใช้เมื่อจอถือแถวที่ผู้ใช้เห็นอยู่แล้วครบ (ตารางยื่นชำระของ RA · มติเจ้าของ 04/11 "Excel แบน") — ไฟล์จึงเป็นแถวชุดเดียวกับจอ
// โดยไม่ต้องสร้างตัวกรองชุดที่สองฝั่ง server · ไม่มีการอ่านข้อมูลเพิ่ม (ไม่มีสิทธิ์อะไรให้ตรวจซ้ำ)
// ⚠️ exceljs หนัก ⇒ `import()` ตอนกดเท่านั้น (ไม่ลากเข้า bundle ของหน้า) · ตัววางแผ่นตัวเดียวกับ server (`reportWorkbook.js`)
import { fillReportWorkbook } from '@/lib/tax/reportWorkbook';
import { businessDayKey, businessTimeKey } from '@/lib/datePeriods';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** ชื่อไฟล์ทรงเดียวกับไฟล์จาก server (`YYMMDD-HHMM_report-<ชนิด>.xlsx` · server มีวินาทีด้วย) · เวลาไทย */
export function reportXlsxFileName(kind, now = new Date().toISOString()) {
  const day = (businessDayKey(now) || '').replace(/-/g, '').slice(2);
  const time = (businessTimeKey(now) || '').replace(/:/g, '');
  return `${day}-${time}_report-${kind}.xlsx`;
}

/** สร้างไฟล์แล้วสั่งดาวน์โหลด — พลาด = throw (ผู้เรียกบอกผู้ใช้) */
export async function downloadReportXlsx(report, fileName) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = fillReportWorkbook(new ExcelJS.Workbook(), report);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
