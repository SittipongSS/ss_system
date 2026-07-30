// คิวงานของช่าง (S-3) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeFormDefaults, groupVisits, missingEvidence, openCount } from './myVisits.js';
import { normalizeVisitInput } from './rounds.js';

const TODAY = '2026-07-30';
const v = (over = {}) => ({
  id: 'V1', siteId: 'S1', kind: 'refill', scheduledDate: TODAY,
  status: 'scheduled', assigneeId: 'U1', ...over,
});

test('⭐ นัดค้าง (เลยวันแล้วยังไม่ปิด) แยกเป็นกลุ่มของตัวเอง — ถ้าปนอยู่ท้ายรายการจะเลื่อนหลุดจอจนไม่มีใครเห็น', () => {
  const groups = groupVisits([
    v({ id: 'A', scheduledDate: '2026-07-27' }),
    v({ id: 'B', scheduledDate: '2026-07-28' }),
    v({ id: 'C' }),
  ], TODAY);
  assert.deepEqual(groups.overdue.map((r) => r.id), ['A', 'B']);
  assert.deepEqual(groups.today.map((r) => r.id), ['C']);
});

test('นัดที่เลยวันแล้วแต่ปิดไปแล้ว = ประวัติ ไม่ใช่ของค้าง', () => {
  const groups = groupVisits([
    v({ id: 'A', scheduledDate: '2026-07-27', status: 'done', actualDate: '2026-07-27' }),
  ], TODAY);
  assert.deepEqual(groups.overdue, []);
});

test('⭐ นัดที่เพิ่งปิดวันนี้ยังอยู่ในกลุ่มวันนี้ — ช่างต้องเห็นว่าทำอะไรไปแล้วและกดกลับไปแก้ได้', () => {
  const groups = groupVisits([v({ id: 'C', status: 'done', actualDate: TODAY })], TODAY);
  assert.deepEqual(groups.today.map((r) => r.id), ['C']);
  assert.equal(openCount(groups).today, 0);
});

test('แยกวันนี้ / พรุ่งนี้ / ถัดไป', () => {
  const groups = groupVisits([
    v({ id: 'C' }),
    v({ id: 'D', scheduledDate: '2026-07-31' }),
    v({ id: 'E', scheduledDate: '2026-08-05' }),
  ], TODAY);
  assert.deepEqual(groups.tomorrow.map((r) => r.id), ['D']);
  assert.deepEqual(groups.later.map((r) => r.id), ['E']);
});

test('นัดที่ยกเลิก/เลื่อนแล้วไม่โผล่ในคิวช่างเลย', () => {
  const groups = groupVisits([
    v({ id: 'X', status: 'cancelled' }),
    v({ id: 'Y', status: 'rescheduled' }),
  ], TODAY);
  assert.deepEqual([...groups.overdue, ...groups.today, ...groups.tomorrow, ...groups.later], []);
});

test('ในวันเดียวกันเรียงตามเวลา · ไม่ระบุเวลาไปท้าย', () => {
  const groups = groupVisits([
    v({ id: 'A' }),
    v({ id: 'B', startTime: '13:00' }),
    v({ id: 'C', startTime: '09:00' }),
  ], TODAY);
  assert.deepEqual(groups.today.map((r) => r.id), ['C', 'B', 'A']);
});

test('⭐ ฟอร์มปิดงานเติมวันที่เข้าจริงเป็น "วันนี้" ไม่ใช่วันที่นัด — คนปิดงานตอนทำเสร็จจริง', () => {
  const form = closeFormDefaults(v({ scheduledDate: '2026-07-27', startTime: '10:00:00', endTime: '11:00:00' }), { todayIso: TODAY });
  assert.equal(form.actualDate, TODAY);
  assert.equal(form.actualStartTime, '10:00');
  assert.equal(form.actualEndTime, '11:00');
});

test('นัดที่ไม่ระบุเวลา → เวลาจบเติมจาก "ตอนนี้" ถ้ามี', () => {
  const form = closeFormDefaults(v(), { todayIso: TODAY, nowHHMM: '15:42' });
  assert.equal(form.actualStartTime, '');
  assert.equal(form.actualEndTime, '15:42');
});

test('⭐ รูปและลายเซ็นไม่บังคับ แต่ต้องบอกว่าขาด — ไม่ใช่เงียบ (มติผู้ใช้ 2026-07-30)', () => {
  assert.deepEqual(missingEvidence({}), ['ยังไม่มีรูปหน้างาน', 'ยังไม่มีลายเซ็นผู้รับงาน']);
  assert.deepEqual(
    missingEvidence({ attachments: [{ url: 'x' }], customerSignatureUrl: 'y' }),
    [],
  );
});

test('⭐ ปิดงานได้โดยไม่มีรูป/ลายเซ็น — ถ้าบล็อก ช่างจะไปบันทึกย้อนหลังแล้วเวลาผิดทั้งชุด', () => {
  const { value, error } = normalizeVisitInput({
    siteId: 'S1', kind: 'refill', scheduledDate: TODAY,
    status: 'done', actualDate: TODAY, actualStartTime: '10:05', actualEndTime: '10:50',
  });
  assert.equal(error, null);
  assert.equal(value.status, 'done');
  assert.deepEqual(value.attachments, []);
  assert.equal(value.customerSignatureUrl, null);
});

test('ไฟล์แนบเก็บเฉพาะแถวที่มีลิงก์จริง · ชนิดแปลก ๆ ตกเป็น other', () => {
  const { value } = normalizeVisitInput({
    siteId: 'S1', kind: 'refill', scheduledDate: TODAY,
    attachments: [
      { url: 'https://drive/1', name: 'ก่อนซ่อม', kind: 'before' },
      { url: '', name: 'ว่าง' },
      { url: 'https://drive/2', kind: 'ไม่รู้จัก' },
    ],
  });
  assert.deepEqual(value.attachments, [
    { url: 'https://drive/1', name: 'ก่อนซ่อม', kind: 'before' },
    { url: 'https://drive/2', name: 'ไฟล์แนบ', kind: 'other' },
  ]);
});
