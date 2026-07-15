import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBillPrintHTML, paginateBillLines } from './tax/billPrint.js';
import { buildReportPrintHTML, paginateReportRows } from './tax/reportPrint.js';
import { buildGanttPrintHTML, paginateTimelineGroups } from './pm/ganttPrint.js';

test('tax report preview uses explicit landscape pages and keeps summary on the final page', () => {
  const rows = Array.from({ length: 37 }, (_, index) => ({ name: `row-${index + 1}`, amount: index + 1 }));
  assert.equal(paginateReportRows(rows).length, 3);
  const html = buildReportPrintHTML({
    title: 'รายงานทดสอบ',
    columns: [{ key: 'name', label: 'รายการ' }, { key: 'amount', label: 'ยอด', money: true }],
    rows,
    summary: { _label: 'รวม', amount: 703 },
  });
  assert.equal((html.match(/class="sheet explicit-page"/g) || []).length, 3);
  assert.match(html, /หน้า 3 \/ 3/);
  assert.equal((html.match(/class="sum"/g) || []).length, 1);
});

test('excise bill preview splits item lines and renders totals once on the final page', () => {
  const lines = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
  assert.equal(paginateBillLines(lines).length, 2);
  const html = buildBillPrintHTML({
    id: 'BILL-1',
    items: lines.map((line) => ({
      id: line.id,
      quantity: 1,
      totalTax: 10,
      product: { fgCode: `FG-${line.id}`, productDescription: `สินค้า ${line.id}` },
    })),
  });
  assert.equal((html.match(/class="sheet explicit-page"/g) || []).length, 2);
  assert.match(html, /หน้า 2 \/ 2/);
  assert.equal((html.match(/ยอดวางบิลสุทธิ/g) || []).length, 1);
});

test('Project Timeline preview has explicit work pages and a final approval page', () => {
  const taskEntries = Array.from({ length: 30 }, (_, taskIndex) => ({ task: { id: taskIndex }, taskIndex }));
  assert.equal(paginateTimelineGroups([{ phase: 'งานหลัก', phaseNum: 1, tasks: taskEntries }]).length, 2);
  const html = buildGanttPrintHTML({
    code: 'PJ-001',
    name: 'โครงการทดสอบ',
    customerName: 'ลูกค้าทดสอบ',
    aeOwner: 'ผู้ดูแลทดสอบ',
    preparedBy: 'ผู้จัดทำทดสอบ',
    aeSupervisor: 'ผู้ตรวจสอบทดสอบ',
    tasks: Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      phase: 'งานหลัก',
      name: `งาน ${index + 1}`,
      startDate: '2026-07-01',
      finishDate: '2026-07-02',
      durationDays: 2,
      status: 'Pending',
    })),
  });
  assert.equal((html.match(/class="sheet explicit-page/g) || []).length, 3);
  assert.match(html, /หน้า 3 \/ 3/);
  assert.equal((html.match(/การรับรองเอกสาร Project Timeline/g) || []).length, 1);
  assert.match(html, /ผู้ดูแล \(AE\).*ผู้ดูแลทดสอบ/s);
  assert.match(html, /ผู้จัดทำ \(AC\).*ผู้จัดทำทดสอบ/s);
  assert.match(html, /ผู้ตรวจสอบ.*ผู้ตรวจสอบทดสอบ/s);
});
