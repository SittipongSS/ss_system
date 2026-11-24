import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installmentChipText, installmentRejectLines, installmentStatusLine } from './salesOrderMoneyText.js';

const money = (over = {}) => ({ tracked: true, installments: [{ seq: 1, kind: 'pending' }], next: null, ...over });
const payment = (over = {}) => ({ tracked: true, paid: 0, count: 1, complete: false, overdue: 0, reviewing: 0, rejected: 0, stranded: 0, refunded: 0, nextDue: null, ...over });

test('คำของชิป: หัว = งวด n/N · สถานะ · รายละเอียด = ยอด · กำหนด · จ่าย · ใบกำกับ', () => {
  const { head, note } = installmentChipText({ seq: 2, kind: 'confirmed', amount: 128400, dueDate: '2026-11-30', paidOn: '2026-11-29', taxInvoiceNo: 'IV6911-0001' }, 4);
  assert.equal(head, 'งวด 2/4 · ชำระแล้ว');
  assert.equal(note, '฿128,400.00 · กำหนด 30/11/2026 · จ่าย 29/11/2026 · ใบกำกับ IV6911-0001');
  assert.match(installmentChipText({ seq: 1, kind: 'confirmed', amount: 1 }, 1).note, /ยังไม่ออกใบกำกับ/);
  assert.doesNotMatch(installmentChipText({ seq: 1, kind: 'confirmed', amount: 1, opening: true }, 1).note, /ยังไม่ออกใบกำกับ/, 'งวดยกมาออกใบในระบบเดิม');
  assert.doesNotMatch(installmentChipText({ seq: 1, kind: 'plan', amount: 1, paidOn: '2026-11-01' }, 1).note, /จ่าย/, 'ชิปตามแผนไม่พูดวันจ่าย');
});

test('บรรทัดงวด: เลยกำหนดมาก่อนพร้อมจำนวนวัน (แดง)', () => {
  const line = installmentStatusLine({ money: money({ next: { seq: 1, dueDate: '2026-10-28', overdueDays: 12 } }), payment: payment({ overdue: 1 }) });
  assert.deepEqual(line, { tone: 'cell-num-bad', text: 'เลยกำหนด 12 วัน · งวด 1 (28/10/2026)' });
});

test('บรรทัดงวด: ใบยังไม่อนุมัติ (งวดยังไม่ตรึง) ไม่พูด "รอลูกค้าชำระ"', () => {
  assert.equal(installmentStatusLine({ money: money({ tracked: false, installments: [{ seq: 1, kind: 'plan' }] }), payment: null }).text,
    'ตามแผนใน QT · เริ่มติดตามหลังอนุมัติ');
  assert.equal(installmentStatusLine({ money: money({ installments: [{ seq: 1, kind: 'plan' }, { seq: 2, kind: 'prepaid' }] }), payment: payment() }).text,
    'ยังไม่ส่งให้บัญชี · เริ่มติดตามหลังใบอนุมัติ');
});

test('บรรทัดงวด: วันที่ = payment.nextDue ตัวเดียวกับการเรียง "กำหนดชำระ"', () => {
  assert.equal(installmentStatusLine({ money: money({ next: { seq: 2, dueDate: '2026-11-30' } }), payment: payment({ nextDue: '2026-11-30' }) }).text,
    'ถัดไป งวด 2 · 30/11/2026');
  assert.equal(installmentStatusLine({ money: money({ next: { seq: 1, dueDate: null } }), payment: payment() }).text, 'ถัดไป งวด 1 · ยังไม่ตั้งวัน');
  // มีงวดรอบัญชีตรวจ = คำสถานะเดิม + วันกำหนด (ไม่หายไปจากแถวที่เรียงตามกำหนด)
  assert.deepEqual(installmentStatusLine({ money: money({ next: null }), payment: payment({ reviewing: 1, nextDue: '2026-12-01' }) }),
    { tone: '', text: 'รอบัญชีรับรอง 1 งวด · กำหนด 01/12/2026' });
  assert.equal(installmentStatusLine({ money: money(), payment: payment({ complete: true, paid: 1 }) }).text, 'เก็บครบแล้ว');
});

test('ไฟล์คำไม่อ่าน paymentDueDate ค่าตายของใบ', () => {
  const src = readFileSync(new URL('./salesOrderMoneyText.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /paymentDueDate/);
});

test('เหตุผลตีกลับ (เจ้าของ 24/11/2026): กล่องลอยของชิปพูดเหตุผล · บรรทัดใต้ชิปเฉพาะงวดตีกลับที่มีเหตุผล · เกินสองงวด = "และอีก n"', () => {
  assert.match(installmentChipText({ seq: 1, kind: 'rejected', amount: 1, rejectedReason: 'สลิปยอดไม่ตรง' }, 1).note, /เหตุผลตีกลับ: สลิปยอดไม่ตรง$/);
  assert.doesNotMatch(installmentChipText({ seq: 1, kind: 'reported', amount: 1, rejectedReason: 'ค่าค้าง' }, 1).note, /เหตุผล/);
  const one = installmentRejectLines({ money: money({ installments: [
    { seq: 1, kind: 'confirmed' }, { seq: 2, kind: 'rejected', rejectedReason: 'สลิปไม่ชัด' }, { seq: 3, kind: 'rejected', rejectedReason: null },
  ] }) });
  assert.deepEqual(one, { lines: [{ seq: 2, text: 'บัญชีตีกลับงวด 2: สลิปไม่ชัด' }], more: 0 });
  const many = installmentRejectLines({ money: money({ installments: [1, 2, 3, 4].map((seq) => ({ seq, kind: 'rejected', rejectedReason: `เหตุ ${seq}` })) }) });
  assert.deepEqual(many.lines.map((l) => l.seq), [1, 2]);
  assert.equal(many.more, 2);
  assert.deepEqual(installmentRejectLines({ money: null }), { lines: [], more: 0 });
});

test('หน้ารายการ SO: เหตุผลที่ใบถูกตีกลับใต้รางขั้น (เฉพาะสถานะ rejected) + เหตุผลงวดใต้ชิปผ่านชิ้นเดียวกัน', () => {
  const page = readFileSync(new URL('../../app/sales-planning/sales-orders/page.js', import.meta.url), 'utf8');
  assert.match(page, /<RejectReasonLine className="mt-1\.5" text=\{salesOrderDocRejectText\(row\)\} \/>/);
  const cells = readFileSync(new URL('../../components/salesPlanning/SalesOrderMoneyCells.js', import.meta.url), 'utf8');
  assert.match(cells, /rejects\.lines\.map\(\(r\) => <RejectReasonLine key=\{r\.seq\} text=\{r\.text\} \/>\)/);
});
