// ── ตะกร้าไฟล์บังคับ: ข้อความไฟล์ใหญ่เกินต้องไม่ถูกล้างในชุดเดียวกัน (ผลรีวิวรอบแก้ S4) ─────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredFilesPick } from './requiredFilesPick.js';

const SPEC = { accept: '.pdf,.jpg,.png', rejectText: 'รับเฉพาะ PDF/รูป' };
const file = (name) => ({ name, type: '', size: 1000 });

test('🔴 ชุดที่มีไฟล์ใหญ่เกินถูกทิ้ง (site.jpg เข้า) = ไม่ล้างคำเตือนไฟล์ใหญ่', () => {
  const site = file('site.jpg');
  const out = requiredFilesPick(SPEC, [], [site], { oversizeInBatch: true });
  assert.deepEqual(out.files, [site]);
  assert.equal(out.typeMessage, '');
  assert.equal(out.clearOversize, false);
});

test('ชุดเดียวมีทั้งไฟล์ใหญ่และชนิดผิด = สองข้อความค้างคู่กัน', () => {
  const out = requiredFilesPick(SPEC, [], [file('site.jpg'), file('notes.docx')], { oversizeInBatch: true });
  assert.equal(out.files.length, 1);
  assert.equal(out.typeMessage, SPEC.rejectText);
  assert.equal(out.clearOversize, false);
});

test('ชุดเพิ่มที่สะอาด = ล้างทั้งสองข้อความ · ลบไฟล์ = ล้างทั้งสอง · ref ของไฟล์เดิมไม่หลุด', () => {
  const a = file('a.pdf');
  const held = { file: a, ref: { id: 'ATT-1' } };
  const b = file('b.png');
  const clean = requiredFilesPick(SPEC, [held], [a, b]);
  assert.deepEqual(clean.files, [held, b]);
  assert.equal(clean.typeMessage, '');
  assert.equal(clean.clearOversize, true);
  const removed = requiredFilesPick(SPEC, [held, b], [b], { oversizeInBatch: false });
  assert.deepEqual(removed.files, [b]);
  assert.equal(removed.typeMessage, '');
  assert.equal(removed.clearOversize, true);
});
