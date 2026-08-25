// ── การ์ด "สรุปใบนี้" ทรงเดียวทุกหัวข้อ (มติผู้ใช้ 2026-08-25) ─────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPanelSummary } from './panelSummary.js';

const req = (items, over = {}) => ({
  id: 'R1', dept: 'RD', requesterDept: 'SA', status: 'acknowledged', items, ...over,
});
const row = (lineKind, over = {}) => ({
  id: `x${Math.random()}`, lineKind, answerStatus: 'pending', ackAt: '2026-08-01', ...over,
});

test('⭐ แกนสามแถวเหมือนกันทุกหัวข้อ · ตำแหน่งคงที่ · ป้ายเป็นชื่อฝ่ายจริง', () => {
  const s = requestPanelSummary(req([
    row('document'),                                     // รอ RD ส่ง
    row('document', { readyAt: '2026-08-05' }),          // รอ SA ยืนยันรับ
    row('document', { answerStatus: 'declined' }),       // ไม่ถูกเลือก
  ]), 'document');
  assert.deepEqual(s.rows.map((r) => r.id), ['dept', 'requester', 'refused']);
  // ⚠️ ช่องไฟรอบรหัสฝ่าย — "รอ RD" ไม่ใช่ "รอRD" (กติกาของ requestWaitLabel)
  assert.deepEqual(s.rows.map((r) => r.label), ['รอ RD', 'รอ SA', 'ไม่ถูกเลือก']);
  assert.deepEqual(s.rows.map((r) => r.value), [1, 1, 1]);
});

test('⭐ ตัวเลขนำ = จบแบบได้ของ / ทั้งหมด · คำใต้เป็นภาษาของหัวข้อ', () => {
  const docs = requestPanelSummary(req([
    row('document', { answerStatus: 'done' }),
    row('document'),
  ]), 'document');
  assert.deepEqual(docs.lead, { done: 1, total: 2, caption: 'ได้รับแล้ว', complete: false });

  // ฝ่ายบัญชีใช้จอเดียวกันแต่คำต่างกัน — ทะเบียนคำอยู่ที่ไฟล์นี้ที่เดียว
  const bills = requestPanelSummary(req([row('billing_doc')]), 'billing_doc');
  assert.equal(bills.lead.caption, 'ออกให้แล้ว');
  assert.equal(requestPanelSummary(req([row('product_dev')]), 'product_dev').lead.caption, 'ได้สูตรแล้ว');
  assert.equal(requestPanelSummary(req([row('scent_dev')]), 'scent_dev').lead.caption, 'ลูกค้าตอบแล้ว');
});

test('🔴 "ไม่ถูกเลือก" นับเฉพาะ declined — รอบแก้ไม่ใช่การถูกปฏิเสธ', () => {
  // แถวที่ลูกค้าขอแก้ก็ settled เหมือนกัน แต่งานไปต่อที่แถวใหม่ · นับรวมเมื่อไร
  // ใบที่ขอแก้สองรอบจะอ่านว่าถูกปฏิเสธไปสองรายการ
  const s = requestPanelSummary(req([
    row('scent_dev', { sentAt: '2026-08-07', outcome: 'revise' }),
    row('scent_dev', { derivedFromItemId: 'a' }),
  ]), 'scent_dev');
  assert.equal(s.rows.find((r) => r.id === 'refused').value, 0);
});

test('🔴 ตัวเลขนำนับ "ได้ของ" ไม่ใช่ "จบ" — ใบที่ถูกปฏิเสธทั้งใบต้องไม่อ่านว่าเสร็จครบ', () => {
  const s = requestPanelSummary(req([
    row('document', { answerStatus: 'declined' }),
    row('document', { answerStatus: 'declined' }),
  ]), 'document');
  assert.deepEqual(s.lead, { done: 0, total: 2, caption: 'ได้รับแล้ว', complete: false });
  assert.equal(s.rows.find((r) => r.id === 'refused').value, 2);
});

test('ครบแล้วติดธง complete — การ์ดใช้ทาสีเขียวโดยไม่ต้องอ่านเลข', () => {
  const s = requestPanelSummary(req([row('document', { answerStatus: 'done' })]), 'document');
  assert.equal(s.lead.complete, true);
});

test('สายกลิ่นวัดที่ลูกค้าตอบ ไม่ใช่ที่ส่งแล้ว — ของที่ส่งไปแล้วยังไม่รู้ผล', () => {
  const s = requestPanelSummary(req([
    row('scent_dev', { readyAt: '2026-08-05', pickedUpAt: '2026-08-06', sentAt: '2026-08-07' }),
  ]), 'scent_dev');
  assert.equal(s.lead.done, 0);
  assert.equal(s.rows.find((r) => r.id === 'requester').value, 1, 'รอ SA บันทึกคำตอบ');
});

test('ใบที่ยังไม่มีบรรทัด = ไม่มีการ์ด (หัวข้อเธรดล้วนใช้รางของใบแทน)', () => {
  assert.equal(requestPanelSummary(req([]), 'document'), null);
  // กรองตามรูปร่างจริง — ใบที่มีแต่แถวของสายอื่นก็ยังว่าง
  assert.equal(requestPanelSummary(req([row('scent_dev')]), 'document'), null);
});
