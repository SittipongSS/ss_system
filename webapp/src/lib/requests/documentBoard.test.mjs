// ── ตารางสรุปของขอเอกสาร (P5) ───────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentBoard, documentTotals } from './documentBoard.js';

const row = (over = {}) => ({ id: 'DRI-1', lineKind: 'document', docType: 'coa', ...over });

test('รับทั้งคำศัพท์ของ RD และของบัญชี — กฎเดียวกัน คนละชุดคำ', () => {
  const rows = documentBoard([
    row(),
    row({ id: 'b', lineKind: 'billing_doc', docType: 'tax_invoice' }),
    // แถวรูปร่างอื่นในใบเดียวกันต้องไม่ปน
    { id: 'c', lineKind: 'product_dev', label: 'เทียนหอม' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'COA — Certificate of Analysis');
});

test('ชนิดที่ไม่รู้จักคืนค่าดิบ — ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก', () => {
  const [r] = documentBoard([row({ docType: 'อะไรสักอย่าง' })]);
  assert.equal(r.name, 'อะไรสักอย่าง');
});

test('🔴 "ได้รับแล้ว" กับ "ให้ไม่ได้" จบเหมือนกันแต่คนละความหมาย', () => {
  // ⚠️ รวมสองอันเป็น "จบแล้ว" เมื่อไร ใบที่ฝ่ายตอบว่าให้ไม่ได้ทั้งใบจะอ่านเหมือน
  // ได้เอกสารครบ ซึ่งเป็นคนละสถานการณ์กันสิ้นเชิง
  const rows = documentBoard([
    row({ id: 'a', answerStatus: 'done' }),
    row({ id: 'b', answerStatus: 'declined', declineReason: 'ล็อตนี้ยังไม่ได้ทดสอบ' }),
    row({ id: 'c' }),
  ]);
  const t = documentTotals(rows);
  assert.deepEqual(t, { asked: 3, received: 1, refused: 1, waiting: 1 });
  assert.equal(rows[1].declineReason, 'ล็อตนี้ยังไม่ได้ทดสอบ');
});

// ── แถบ "มาแล้ว / ให้ไม่ได้" ต้องนับได้จริง (ม-85) ────────────────────────
test('⭐ received/refused นับจากสายที่เดินได้จริง — ไม่ใช่ 0 ตลอดกาล', async () => {
  const { documentBoard, documentTotals } = await import('./documentBoard.js');
  const { hopPatch } = await import('./hops.js');
  const base = { lineKind: 'document', answerStatus: 'pending', ackAt: 'x', readyAt: 'y' };
  const rows = documentBoard([
    // ผู้ขอกด "ได้รับแล้ว" — ทางเดียวที่เขียน answerStatus=done ให้แถวเอกสาร
    { id: 'A', docType: 'ifra', ...base, ...hopPatch('receive', { at: '2026-08-05' }) },
    // ฝ่ายกด "ให้ไม่ได้" + เหตุผล
    { id: 'B', docType: 'msds', lineKind: 'document', answerStatus: 'pending', ackAt: 'x',
      ...hopPatch('refuse', { note: 'ต้องขอจากซัพพลายเออร์' }) },
    { id: 'C', docType: 'coa', ...base },                            // ส่งแล้ว รอผู้ขอรับ
  ]);
  const totals = documentTotals(rows);
  assert.equal(totals.received, 1);
  assert.equal(totals.refused, 1);
  assert.equal(totals.waiting, 1);
  // เหตุผลติดแถว — ไม่ต้องไปหาในเธรด
  assert.equal(rows.find((r) => r.id === 'B').declineReason, 'ต้องขอจากซัพพลายเออร์');
});

test('ป้ายขั้นฉบับเอกสาร — ready/done/declined อ่านความหมายเอกสาร ไม่ใช่สายพัฒนา', async () => {
  const { documentBoard } = await import('./documentBoard.js');
  const label = (row) => documentBoard([{ id: 'X', docType: 'coa', ...row }])[0].stageLabel;
  // ป้ายตามคำของก้าวที่ทำให้เกิด — ก้าวส่งชื่อ "ส่งงาน" ทุกสายแล้ว (2026-08-15)
  assert.equal(label({ lineKind: 'document', ackAt: 'x', readyAt: 'y' }), 'ส่งงานแล้ว');   // เดิม "ส่งเอกสารแล้ว"
  assert.equal(label({ lineKind: 'document', answerStatus: 'done' }), 'ได้รับแล้ว');        // เดิม "เสร็จแล้ว"
  assert.equal(label({ lineKind: 'document', answerStatus: 'declined', declineReason: 'r' }), 'ปฏิเสธ'); // เดิม "ไม่ถูกเลือก"
  assert.equal(label({ lineKind: 'document', ackAt: 'x' }), 'กำลังทำ');                     // ชุดกลางตามเดิม
});

/* 🐞 **ชื่อชนิดต้องมาจากทะเบียนของรูปร่างนั้น** (เจอตอน UAT ของ B-5)
   เดิมอ่านจากชุดของ RD อย่างเดียว ⇒ บรรทัดของบัญชีขึ้นเป็นค่าดิบ `billing_note`
   บนตารางสรุป ทั้งที่การ์ดรายแถวข้างล่างแสดง "ใบวางบิล" ถูกต้อง — จอเดียวเรียกของ
   สิ่งเดียวกันสองชื่อ */
test('ชื่อชนิดเอกสารอ่านจากทะเบียนของฝ่ายนั้น ไม่ใช่ของ RD เสมอ', () => {
  const [fn] = documentBoard([{ id: 'i1', lineKind: 'billing_doc', docType: 'billing_note' }]);
  assert.equal(fn.name, 'ใบวางบิล');
  const [tax] = documentBoard([{ id: 'i2', lineKind: 'billing_doc', docType: 'tax_invoice' }]);
  assert.equal(tax.name, 'ใบกำกับภาษี');
  // ชุดของ RD ต้องไม่เพี้ยนตาม
  const [rd] = documentBoard([{ id: 'i3', lineKind: 'document', docType: 'ifra' }]);
  assert.equal(rd.name, 'IFRA Certificate');
  // ⚠️ ชนิดที่ไม่รู้จักยังคืนค่าดิบ — ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก
  const [old] = documentBoard([{ id: 'i4', lineKind: 'billing_doc', docType: 'ของเก่า' }]);
  assert.equal(old.name, 'ของเก่า');
});
