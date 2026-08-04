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
  assert.equal(paginateBillLines(lines).length, 3);
  const html = buildBillPrintHTML({
    id: 'BILL-1',
    items: lines.map((line) => ({
      id: line.id,
      quantity: 1,
      totalTax: 10,
      product: { fgCode: `FG-${line.id}`, productDescription: `สินค้า ${line.id}` },
    })),
  });
  assert.equal((html.match(/class="sheet explicit-page"/g) || []).length, 3);
  assert.match(html, /หน้า 3 \/ 3/);
  assert.equal((html.match(/ยอดแจ้งชำระสุทธิ/g) || []).length, 1);
});

// C1 (2026-07-26): เดิมกันที่หน้าสุดท้ายไว้ก่อน เศษเลยไปกองหน้าแรก/หน้ากลาง —
// 9 แถวได้ [1, 8] · 13 แถวได้ [5, 8] · 21 แถวได้ [12, 1, 8] (หน้ากลางบรรทัดเดียว)
// จึงเปลี่ยนเป็นเติมจากหน้าแรกแล้วให้เศษตกหน้าสุดท้าย
//
// 2026-08-05: ความจุลดจาก 12/8 เป็น 9/11/7/6 ตอนใบภาษีย้ายมาใช้เปลือกเอกสารกลาง
// (ชุดเดียวกับใบเสนอราคา) — แถวสูงขึ้นเป็น 3 บรรทัดต่อแถว วัดจริงได้ 17.5mm ของเดิม
// 12 แถวจึงล้นกระดาษแล้วโดน overflow:hidden ตัดทิ้งเงียบ ๆ · หน้าแรกรับได้น้อยกว่า
// หน้ากลางเพราะเสียที่ให้กล่องข้อมูลลูกค้า และหน้าที่ถือท้ายเอกสารรับได้น้อยที่สุด
const BILL_FIRST = 9;
const BILL_MIDDLE = 11;
const BILL_LAST = 7;
const BILL_SINGLE = 6;

test('excise bill pages fill from the front — no orphan single-line page before the last', () => {
  const pageSizes = (count) => paginateBillLines(Array.from({ length: count }, (_, i) => i)).map((p) => p.length);

  assert.deepEqual(pageSizes(7), [6, 1]);
  assert.deepEqual(pageSizes(9), [8, 1]);
  assert.deepEqual(pageSizes(13), [9, 4]);
  assert.deepEqual(pageSizes(20), [9, 10, 1]);
  assert.deepEqual(pageSizes(21), [9, 11, 1]);
  assert.deepEqual(pageSizes(29), [9, 11, 8, 1]);

  // ≤ 6 แถวจบในหน้าเดียวพร้อมยอดรวม + ลายเซ็น
  for (const count of [1, 5, 6]) assert.deepEqual(pageSizes(count), [count]);
  assert.deepEqual(paginateBillLines([]), [[]]);

  // ค่าคงที่ของเลย์เอาต์ — เกินเมื่อไรแถวจะถูกตัดทิ้งโดยไม่มีใครเห็น
  // (หน้าสุดท้ายว่างเปล่า = ยอดรวมกับลายเซ็นลอยอยู่หน้าเดียว ห้ามเกิดเช่นกัน)
  for (let count = 1; count <= 200; count += 1) {
    const sizes = pageSizes(count);
    const last = sizes[sizes.length - 1];
    assert.equal(sizes.reduce((a, b) => a + b, 0), count, `รวมแถวไม่ครบที่ ${count}`);
    assert.ok(last >= 1, `หน้าสุดท้ายของ ${count} แถวว่างเปล่า`);
    assert.ok(last <= (sizes.length === 1 ? BILL_SINGLE : BILL_LAST), `หน้าสุดท้ายของ ${count} แถวมี ${last} แถว`);
    sizes.slice(0, -1).forEach((size, index) => {
      const capacity = index === 0 ? BILL_FIRST : BILL_MIDDLE;
      assert.ok(size <= capacity, `หน้า ${index + 1} ของ ${count} แถวมี ${size} > ${capacity}`);
    });
  }
});

test('excise payment notice uses its pinned controlled form and document number', () => {
  const html = buildBillPrintHTML({
    id: 'TAX-1',
    taxNoticeNumber: 'ET-26070001-0',
    taxNoticeStandardSnapshot: {
      titleTh: 'ใบแจ้งชำระค่าภาษีทดสอบ',
      titleEn: 'TEST EXCISE PAYMENT NOTICE',
      formCode: 'FM-TAX-99',
      revision: '02',
      effectiveDate: '2026-07-26',
      accentKey: 'amber',
    },
    items: [],
  });
  assert.match(html, /ET-26070001-0/);
  assert.match(html, /FM-TAX-99: Rev\. No\.02\. 26\/07\/2569/);
  assert.match(html, /TEST EXCISE PAYMENT NOTICE/);
  assert.match(html, /ใบแจ้งชำระค่าภาษีทดสอบ/);
  assert.doesNotMatch(html, /ใบวางบิล/);
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
  assert.match(html, /ผู้ประสานงาน \(AC\).*ผู้จัดทำทดสอบ/s);
  assert.match(html, /ผู้ตรวจสอบ.*ผู้ตรวจสอบทดสอบ/s);
});
