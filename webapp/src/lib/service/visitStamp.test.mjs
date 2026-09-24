// ── ประทับเวลาเข้าจริงที่ server + ปิดงานข้ามวัน (มติเจ้าของ 24/09 ข้อ 4 · mig 0386) ─────
//
// 🐞 ที่มา (พิสูจน์ด้วย PGlite + CHECK ของ 0300 ตัวจริงก่อนแก้): เริ่ม 24/09 14:00 แล้วส่งงาน 25/09 09:00
//   ⇒ ประทับได้ 14:00 → 09:00 บนวันที่ 24/09 ⇒ ฐานตีกลับเป็นอังกฤษดิบ · เริ่ม 09:00 จบวันถัดไป 10:00 ผ่านแต่เหลือ 1 ชม.
//   ⇒ ตัวประทับต้องเก็บ **วันที่เสร็จจริง** เมื่อไม่ใช่วันเดียวกับวันเข้า
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampVisitInput, stampVisitTimes } from './visitStamp.js';
import { normalizeVisitInput } from './rounds.js';
import { closeFormDefaults, closeVisitPayload } from './myVisits.js';

// เวลาไทย = UTC+7
const at = (thaiDate, thaiTime) => new Date(`${thaiDate}T${thaiTime}:00+07:00`).toISOString();
const started = { status: 'done', actualDate: '2026-09-24', actualStartTime: '14:00', actualEndTime: null };

test('🔴 ส่งงานวันถัดไป = เก็บวันที่เสร็จจริง · เวลาเริ่มของช่างคงเดิม', () => {
  const out = stampVisitTimes(started, { stamp: 'end', nowIso: at('2026-09-25', '09:00'), hasEndDateColumn: true });
  assert.equal(out.actualDate, '2026-09-24', 'วันเข้าจริงยังเป็นวันที่กดเริ่ม');
  assert.equal(out.actualStartTime, '14:00');
  assert.equal(out.actualEndTime, '09:00');
  assert.equal(out.actualEndDate, '2026-09-25');
});

test('ปิดวันเดียวกัน = วันที่เสร็จว่าง (NULL = วันเดียวกัน — ไม่มีสองแบบแทนค่าเดียวกัน)', () => {
  const out = stampVisitTimes(started, { stamp: 'end', nowIso: at('2026-09-24', '16:30'), hasEndDateColumn: true });
  assert.equal(out.actualEndTime, '16:30');
  assert.equal(out.actualEndDate, null);
});

test('⚠️ "วันถัดไป" คือวันไทย ไม่ใช่วัน UTC — 17:30Z ของวันที่ 24 คือ 00:30 ของวันที่ 25 ที่ไทย', () => {
  const out = stampVisitTimes(started, { stamp: 'end', nowIso: '2026-09-24T17:30:00.000Z', hasEndDateColumn: true });
  assert.equal(out.actualEndTime, '00:30');
  assert.equal(out.actualEndDate, '2026-09-25');
});

test('ฐานยังไม่รัน 0386 (แถวไม่มีคอลัมน์) = ไม่ใส่คีย์เลย · พฤติกรรมเดิมทุกอย่าง', () => {
  const out = stampVisitTimes(started, { stamp: 'end', nowIso: at('2026-09-25', '09:00'), hasEndDateColumn: false });
  assert.ok(!('actualEndDate' in out), 'คีย์ของคอลัมน์ที่ไม่มี = PostgREST ตีกลับทั้งคำขอ');
  assert.equal(out.actualEndTime, '09:00');
});

test('ไม่เคยกดเริ่ม: เวลาเริ่ม = ตอนนี้ (เดิม) และไม่ใช่งานข้ามวัน แม้วันเข้าจริงจะเป็นวันนัดเก่า', () => {
  const never = { status: 'done', actualDate: '2026-09-22', actualStartTime: null, actualEndTime: null };
  const out = stampVisitTimes(never, { stamp: 'end', nowIso: at('2026-09-24', '10:00'), hasEndDateColumn: true });
  assert.equal(out.actualStartTime, '10:00');
  assert.equal(out.actualEndTime, '10:00');
  assert.equal(out.actualEndDate, null, 'เริ่ม = จบ ในนาทีเดียวกัน — ห้ามได้งานยาวสองวันที่ไม่มีใครกดเริ่ม');
});

test('กดเริ่ม = ประทับวันกับเวลาเริ่มจากนาฬิกาเดียวกัน · ยังไม่มีเวลาจบ/วันเสร็จ', () => {
  const out = stampVisitTimes({ status: 'in_progress', actualDate: null }, {
    stamp: 'start', nowIso: at('2026-09-24', '08:15'), hasEndDateColumn: true,
  });
  assert.equal(out.actualDate, '2026-09-24');
  assert.equal(out.actualStartTime, '08:15');
  assert.equal(out.actualEndTime, null);
  assert.equal(out.actualEndDate, null);
  const legacy = stampVisitTimes({ status: 'in_progress', actualDate: null }, {
    stamp: 'start', nowIso: at('2026-09-24', '08:15'), hasEndDateColumn: false,
  });
  assert.ok(!('actualEndDate' in legacy), 'ฐานยังไม่รัน 0386 = ไม่ใส่คีย์ของคอลัมน์ที่ไม่มี');
});

test('ไม่ใช่ปุ่มจับเวลา (ฟอร์มแก้) = คืนค่าเดิม ไม่ประทับอะไร · ไม่แก้ของที่ส่งมา', () => {
  const input = { ...started, actualEndTime: '09:00', actualEndDate: '2026-09-25' };
  const out = stampVisitTimes(input, { stamp: null, nowIso: at('2026-09-26', '10:00'), hasEndDateColumn: true });
  assert.deepEqual(out, input);
  const again = stampVisitTimes(started, { stamp: 'end', nowIso: at('2026-09-25', '09:00'), hasEndDateColumn: true });
  assert.notEqual(again, started);
  assert.equal(started.actualEndTime, null, 'ของที่ส่งมาต้องไม่ถูกแก้ในที่');
});

/* ══ เส้นทางของ PATCH /api/service/visits/[id] ตามลำดับจริง (รีวิว 24/09) ══════════════════════
   stampVisitInput → normalizeVisitInput → stampVisitTimes · ลำดับตรึงด้วยซอร์สของ route ในเทสต์สุดท้าย */
const routePatch = (before, body, nowIso) => {
  const input = stampVisitInput(before, body);
  const { value, error } = normalizeVisitInput(input, { existingKind: before.kind });
  if (error) return { error };
  return {
    patch: body.stamp === 'start' || body.stamp === 'end'
      ? stampVisitTimes(value, { stamp: body.stamp, nowIso, hasEndDateColumn: 'actualEndDate' in before })
      : value,
  };
};
// นัด 08:00–10:00 · กดเริ่มจริง 14:00 (ช้ากว่าเวลานัดจบ) · แถวจากฐานที่รัน 0386 แล้ว
const lateStart = {
  id: 'V-1', siteId: 'S1', kind: 'refill', status: 'in_progress', scheduledDate: '2026-09-24',
  startTime: '08:00:00', endTime: '10:00:00', actualDate: '2026-09-24',
  actualStartTime: '14:00:00', actualEndTime: null, actualEndDate: null,
};
/* รูปคำขอของแผ่นปิดงานรุ่นก่อนแก้ — ฟอร์มเติมเวลานัดจบมาเป็น "เวลาจบจริง" (จอที่เปิดค้างไว้ยังส่งรูปนี้ได้) */
const oldSheetBody = {
  actualDate: '2026-09-24', actualStartTime: '14:00', actualEndTime: '10:00', summary: 'เติมน้ำหอมครบ',
  attachments: [], customerSignatureUrl: null, closeFromAssets: false, status: 'done', stamp: 'end',
};

test('🐞 แผ่นปิดงาน: เริ่มช้ากว่าเวลานัดจบ ปิดงานวันเดียวกันได้ — ไม่ตรวจเวลาจบที่กำลังจะถูกทับ', () => {
  const out = routePatch(lateStart, oldSheetBody, at('2026-09-24', '16:10'));
  assert.equal(out.error, undefined);
  assert.equal(out.patch.status, 'done');
  assert.equal(out.patch.actualStartTime, '14:00', 'เวลาเริ่มที่ช่างประทับไว้ ไม่ใช่เวลาบนฟอร์ม');
  assert.equal(out.patch.actualEndTime, '16:10');
  assert.equal(out.patch.actualEndDate, null);
});

test('🐞 แผ่นปิดงาน: เริ่มช้ากว่าเวลานัดจบแล้วปิดงานวันถัดไป = งานข้ามวัน ไม่ใช่ 400', () => {
  const out = routePatch(lateStart, oldSheetBody, '2026-09-25T02:00:00.000Z'); // 09:00 ไทย วันที่ 25
  assert.equal(out.error, undefined);
  assert.equal(out.patch.actualDate, '2026-09-24');
  assert.equal(out.patch.actualStartTime, '14:00');
  assert.equal(out.patch.actualEndTime, '09:00');
  assert.equal(out.patch.actualEndDate, '2026-09-25');
});

test('ฟอร์มปิดงานไม่เติมเวลานัดเป็นเวลาจริงแล้ว — คำขอจากแผ่นรุ่นนี้ไม่มีเวลาปลอมติดไป', () => {
  const form = closeFormDefaults(lateStart, { todayIso: '2026-09-24' });
  assert.equal(form.actualStartTime, '14:00');
  assert.equal(form.actualEndTime, '', 'เวลานัดจบ 10:00 ไม่ใช่เวลาจบจริง');
  const body = closeVisitPayload(lateStart, { ...form, status: 'done' });
  assert.equal(body.stamp, 'end');
  assert.equal(routePatch(lateStart, body, at('2026-09-24', '16:10')).patch.actualEndTime, '16:10');
});

test('ไม่เคยกดเริ่ม + แผ่นส่งเวลานัดเริ่มมา = เวลาเริ่มเป็น "ตอนนี้" (ตัวประทับ) ไม่ใช่เวลานัด', () => {
  const never = { ...lateStart, status: 'scheduled', actualDate: null, actualStartTime: null };
  const out = routePatch(never, { ...oldSheetBody, actualStartTime: '08:00' }, at('2026-09-24', '11:30'));
  assert.equal(out.error, undefined);
  assert.equal(out.patch.actualStartTime, '11:30');
  assert.equal(out.patch.actualEndTime, '11:30');
});

test('ฟอร์มแก้ (ไม่ใช่ปุ่มจับเวลา) ยังตรวจเวลาที่คนพิมพ์ตามเดิม — ด่านไม่ได้ถูกปิดทิ้ง', () => {
  const done = { ...lateStart, status: 'done', actualEndTime: '16:00:00' };
  const out = routePatch(done, { actualStartTime: '17:00', actualEndTime: '16:00' }, at('2026-09-24', '18:00'));
  assert.match(out.error, /เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด/);
  assert.equal(stampVisitInput(done, { actualEndTime: '18:00' }).actualEndTime, '18:00');
});

test('ฐานยังไม่รัน 0386 — ตัวเตรียมค่าไม่เติมคีย์ actualEndDate ให้แถวที่ไม่มีคอลัมน์', () => {
  const { actualEndDate, ...legacyRow } = lateStart;
  const input = stampVisitInput(legacyRow, { ...oldSheetBody, actualEndDate: '2026-09-25' });
  assert.ok(!('actualEndDate' in input));
  assert.equal(input.actualEndTime, null);
});

/* 🐞 รีวิว 24/09 — นัดที่ปิดข้ามวันแล้วถูกเปิดกลับ (ฟอร์มแก้นัดคืน "นัดไว้") ยังถือวันเข้า/เวลาจบ/วันเสร็จของรอบเก่า */
test('🔴 เปิดกลับแล้วเริ่มใหม่: รอบใหม่ไม่ต่อกับรอบเก่า — ไม่ได้งานสี่วันที่ไม่มีใครทำ', () => {
  const reopened = {
    ...lateStart, status: 'scheduled', actualDate: '2026-09-24',
    actualStartTime: '14:00:00', actualEndTime: '09:00:00', actualEndDate: '2026-09-25',
  };
  const started = routePatch(reopened, { status: 'in_progress', stamp: 'start' }, at('2026-09-28', '10:00'));
  assert.equal(started.error, undefined);
  assert.equal(started.patch.actualDate, '2026-09-28');
  assert.equal(started.patch.actualStartTime, '10:00');
  assert.equal(started.patch.actualEndTime, null);
  assert.equal(started.patch.actualEndDate, null);

  const row = { ...reopened, ...started.patch };
  const ended = routePatch(row, { status: 'done', stamp: 'end' }, at('2026-09-28', '12:00'));
  assert.equal(ended.error, undefined);
  assert.equal(ended.patch.actualDate, '2026-09-28');
  assert.equal(ended.patch.actualStartTime, '10:00');
  assert.equal(ended.patch.actualEndTime, '12:00');
  assert.equal(ended.patch.actualEndDate, null, 'เริ่มและจบวันเดียวกัน');
});

test('route ตรวจค่าผ่าน `stampVisitInput` ก่อนประทับ — ลำดับเดียวกับเทสต์ข้างบน', () => {
  const route = readFileSync(new URL('../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');
  const normalizeAt = route.indexOf('normalizeVisitInput(stampVisitInput(before, body), { existingKind: before.kind })');
  const stampAt = route.indexOf('patch = stampVisitTimes(patch, {');
  assert.ok(normalizeAt > 0, 'route ต้องตรวจจากค่าที่เตรียมโดย stampVisitInput');
  assert.ok(stampAt > normalizeAt, 'ตรวจก่อน แล้วค่อยประทับ');
});
