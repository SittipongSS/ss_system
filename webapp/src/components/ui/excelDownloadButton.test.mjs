import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filenameFromDisposition } from '../../lib/ui/contentDisposition.js';

/* ปุ่มดาวน์โหลด Excel ตัวกลาง + ตัวเลือกงวดรวม (มติผู้ใช้ 2026-09-22 "ใช้เหมือนกัน")
   ล็อก: ชื่อไฟล์ไทยอ่านจาก filename* ก่อน · สามหน้าใช้ของกลางคู่เดียว ไม่กลับไปเขียนตัวเลือก/ปุ่มเอง */

test('ชื่อไฟล์: filename* (UTF-8 · ไทย) ชนะ filename ธรรมดา · ไม่มี header = ชื่อสำรอง', () => {
  const header = `attachment; filename="sales-report.xlsx"; filename*=UTF-8''${encodeURIComponent('รายงานยอดขาย_2026-09.xlsx')}`;
  assert.equal(filenameFromDisposition(header), 'รายงานยอดขาย_2026-09.xlsx');
  assert.equal(filenameFromDisposition('attachment; filename="FC-by-category-2026-2026-09-22.xlsx"'), 'FC-by-category-2026-2026-09-22.xlsx');
  assert.equal(filenameFromDisposition(null, 'leads.xlsx'), 'leads.xlsx');
});

test('สามหน้าใช้ตัวเลือกงวดกลาง + ปุ่ม Excel กลาง', () => {
  const read = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
  for (const rel of [
    'app/sales-planning/targets/report/page.js',
    'app/sales-planning/leads/page.js',
    'app/sales-planning/deals/page.js',
  ]) {
    const page = read(rel);
    assert.match(page, /useReportPeriod\(/, `${rel} ต้องใช้ useReportPeriod`);
    assert.match(page, /<ReportPeriodControl/, `${rel} ต้องใช้ ReportPeriodControl`);
    assert.match(page, /<ExcelDownloadButton/, `${rel} ต้องใช้ ExcelDownloadButton`);
    assert.doesNotMatch(page, /<DayRangePicker|<MonthRangePicker/, `${rel} ห้ามวางตัวเลือกช่วงเอง`);
  }
});
