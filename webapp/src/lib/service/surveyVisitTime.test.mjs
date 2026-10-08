// ── เวลาเข้าประเมินบนรายงาน (มติเจ้าของข้อ 8) ──────────────────────────────────────────
//
// ⭐ ฉบับลูกค้าพิมพ์เวลาที่บันทึกไว้ก็ต่อเมื่อ **เชื่อได้** — ของจริง RQ-AS-26090186 เก็บ 17:45–17:45 (0 นาที)
//   ซึ่งคือนาทีที่หัวหน้ากดปิดนัดย้อนหลัง ไม่ใช่เวลาที่อยู่หน้างาน ⇒ พิมพ์เวลานัด "12:00 น. (ตามนัด)" แทน
//   ฉบับภายในบอกทั้งสองค่า
import test from 'node:test';
import assert from 'node:assert/strict';
import { visitTimeCredible, visitTimeText } from './surveyVisitTime.js';

const base = {
  scheduledDate: '2026-09-25', startTime: '12:00', endTime: null,
  actualDate: '2026-09-25', actualStartTime: '13:05', actualEndTime: '14:10', actualEndDate: null,
};

test('เชื่อได้: มีเวลาเริ่มและเวลาจบ และจบหลังเริ่ม', () => {
  assert.equal(visitTimeCredible(base), true);
});

test('🔴 ไม่เชื่อ: 0 นาที (ของจริง — เริ่ม = จบ = นาทีที่กดปิดนัด)', () => {
  assert.equal(visitTimeCredible({ ...base, actualStartTime: '17:45', actualEndTime: '17:45' }), false);
  // ฐานเก็บ time เป็น HH:MM:SS — วินาทีต่างกันก็ยังเป็นนาทีเดียวกัน
  assert.equal(visitTimeCredible({ ...base, actualStartTime: '17:45:03', actualEndTime: '17:45:41' }), false);
});

test('ไม่เชื่อ: ขาดตราเวลาตัวใดตัวหนึ่ง · จบก่อนเริ่มในวันเดียวกัน', () => {
  assert.equal(visitTimeCredible({ ...base, actualEndTime: null }), false);
  assert.equal(visitTimeCredible({ ...base, actualStartTime: null }), false);
  assert.equal(visitTimeCredible({ ...base, actualStartTime: '', actualEndTime: '' }), false);
  assert.equal(visitTimeCredible({ ...base, actualStartTime: '15:00', actualEndTime: '14:00' }), false);
  assert.equal(visitTimeCredible(null), false);
  assert.equal(visitTimeCredible({ ...base, actualStartTime: 'บ่าย', actualEndTime: '14:00' }), false);
});

test('ไม่เชื่อ: นัดถูกปิดพร้อมการส่งผล (หัวหน้าปิดให้ · ช่างไม่ได้กดส่งงาน)', () => {
  assert.equal(visitTimeCredible(base, { closedBySend: true }), false);
});

test('เชื่อได้: งานข้ามวัน — เวลาจบน้อยกว่าเวลาเริ่มได้เมื่อมีวันที่เสร็จหลังวันเข้า (mig 0386)', () => {
  const overnight = { ...base, actualStartTime: '14:00', actualEndTime: '09:00', actualEndDate: '2026-09-26' };
  assert.equal(visitTimeCredible(overnight), true);
  // วันที่เสร็จ = วันเข้า (หรือก่อน) ไม่นับเป็นข้ามวัน
  assert.equal(visitTimeCredible({ ...overnight, actualEndDate: '2026-09-25' }), false);
});

test('ฉบับลูกค้า · เชื่อได้ = ช่วงเวลาที่บันทึก', () => {
  assert.equal(visitTimeText(base, { version: 'customer' }), '13:05–14:10 น.');
  assert.equal(visitTimeText({ ...base, actualStartTime: '13:05:00', actualEndTime: '14:10:59' }, { version: 'customer' }),
    '13:05–14:10 น.');
});

test('🔴 ฉบับลูกค้า · ไม่เชื่อ = เวลานัด "(ตามนัด)" — ของจริงต้องได้ 12:00 น. (ตามนัด)', () => {
  const real = { ...base, actualStartTime: '17:45', actualEndTime: '17:45' };
  assert.equal(visitTimeText(real, { version: 'customer' }), '12:00 น. (ตามนัด)');
  // นัดมีเวลาจบด้วย = พิมพ์เป็นช่วง
  assert.equal(visitTimeText({ ...real, endTime: '13:30' }, { version: 'customer' }), '12:00–13:30 น. (ตามนัด)');
  // ไม่มีทั้งเวลาจริงที่เชื่อได้และเวลานัด = ขีด (ไม่เดา)
  assert.equal(visitTimeText({ ...real, startTime: null }, { version: 'customer' }), '—');
});

test('ฉบับลูกค้าไม่เคยพิมพ์เวลาที่ไม่เชื่อ และไม่บอกเหตุภายใน', () => {
  const real = { ...base, actualStartTime: '17:45', actualEndTime: '17:45' };
  const text = visitTimeText(real, { version: 'customer' });
  assert.ok(!text.includes('17:45'));
  assert.ok(!text.includes('ปิดงาน'));
  assert.ok(!text.includes('บันทึก'));
});

test('ฉบับภายใน · บอกทั้งเวลานัดและเวลาที่บันทึก พร้อมเหตุที่ไม่เชื่อ', () => {
  const real = { ...base, actualStartTime: '17:45', actualEndTime: '17:45' };
  assert.equal(visitTimeText(real, { version: 'internal' }), '12:00 · บันทึก 17:45–17:45 (ปิดงานย้อนหลัง)');
  assert.equal(visitTimeText(base, { version: 'internal' }), '12:00 · 13:05–14:10');
  // ปิดพร้อมส่งผล: มีแต่เวลาเริ่ม ไม่มีเวลาจบ
  assert.equal(
    visitTimeText({ ...base, actualEndTime: null }, { version: 'internal', closedBySend: true }),
    '12:00 · บันทึก 13:05 (ปิดพร้อมส่งผล)',
  );
  // ไม่มีตราเวลาเลย
  assert.equal(
    visitTimeText({ ...base, actualStartTime: null, actualEndTime: null }, { version: 'internal' }),
    '12:00 · ไม่มีเวลาเข้าจริง',
  );
  // ไม่มีเวลานัด
  assert.equal(visitTimeText({ ...base, startTime: null }, { version: 'internal' }), '— · 13:05–14:10');
});

test('งานข้ามวัน: บอกวันที่เสร็จ ไม่ใช่ช่วงเวลาที่อ่านแล้วถอยหลัง', () => {
  const overnight = { ...base, actualStartTime: '14:00', actualEndTime: '09:00', actualEndDate: '2026-09-26' };
  assert.equal(visitTimeText(overnight, { version: 'customer' }), '14:00 น. – 26/09/2026 09:00 น.');
  assert.equal(visitTimeText(overnight, { version: 'internal' }), '12:00 · 14:00 – 26/09/2026 09:00');
});

test('`credible` ที่ตรึงไว้ในภาพนิ่งชนะการคิดใหม่ — กระดาษที่ตรึงแล้วต้องไม่เปลี่ยนเมื่อกติกาเปลี่ยน', () => {
  assert.equal(visitTimeText(base, { version: 'customer', credible: false }), '12:00 น. (ตามนัด)');
});
