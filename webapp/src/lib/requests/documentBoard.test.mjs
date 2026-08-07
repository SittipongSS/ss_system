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
