import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyStepBackBody, surveyStepBackPlan } from './surveyStepBack.js';

const visit = (over = {}) => ({
  id: 'SV1', kind: 'survey', requestId: 'REQ1', status: 'unable',
  unableReason: 'อาคารไม่อนุญาตให้เข้าวันหยุด', ...over,
});
const request = (over = {}) => ({
  id: 'REQ1', status: 'acknowledged', committedDueDate: '2026-09-20',
  answeredAt: null, cancelledAt: null, ...over,
});
const scheduled = { ...visit(), status: 'scheduled', unableReason: null };

/* §5E ② มติข้อ 23 — ใบถอยกลับขั้นลงคิว ไม่ใช่แค่เลื่อนนัด */
test('🔑 ไปแล้วเข้าไม่ได้ = ล้างวันบนใบ ⇒ ใบไหลกลับเข้าคิว "ยังไม่ลงวัน"', () => {
  const plan = surveyStepBackPlan({ visit: visit(), before: scheduled, request: request() });
  assert.deepEqual(plan.patch, { committedDueDate: null, committedDueTime: null });
  assert.equal(plan.previousDueDate, '2026-09-20');
  assert.match(plan.reason, /อาคารไม่อนุญาต/);
});

/* 🔴 ห้ามแตะ status/acknowledgedAt — TS รับเรื่องไปแล้วจริง ๆ
   และ statuses.js ห้ามเพิ่มค่าใหม่ลง REQUEST_STATUSES */
test('🔴 ถอยขั้นแตะแค่วัน ไม่แตะสถานะใบ', () => {
  const plan = surveyStepBackPlan({ visit: visit(), before: scheduled, request: request() });
  assert.deepEqual(Object.keys(plan.patch).sort(), ['committedDueDate', 'committedDueTime']);
});

/* ⚠️ PATCH นัดที่ปิดไปแล้วซ้ำ ต้องไม่ล้างวันที่ TS เพิ่งลงใหม่ */
test('⚠️ นัดที่เป็น unable อยู่แล้ว แก้ซ้ำต้องไม่ถอยขั้นอีกรอบ', () => {
  assert.equal(surveyStepBackPlan({ visit: visit(), before: visit(), request: request() }), null);
});

test('เข้าได้แล้ว (done/partial) ไม่ถอยขั้น — ใบต้องเดินหน้าต่อ', () => {
  for (const status of ['done', 'partial']) {
    assert.equal(
      surveyStepBackPlan({ visit: visit({ status }), before: scheduled, request: request() }),
      null,
      status,
    );
  }
});

/* ⚠️ ใบที่ส่งผลไปแล้ว/ยกเลิกแล้ว ไม่ถอย — นัดที่ปิดทีหลังคือการเก็บประวัติ
   ไม่ใช่การเปลี่ยนก้าวของใบ (เกณฑ์เดียวกับ surveyEditLockError: answeredAt ตัวเดียว) */
test('⚠️ ใบที่จบไปแล้วไม่ถอยขั้น', () => {
  const cases = [
    request({ answeredAt: '2026-09-10T00:00:00Z' }),
    request({ cancelledAt: '2026-09-10T00:00:00Z', status: 'cancelled' }),
    request({ status: 'closed' }),
    request({ committedDueDate: null }),   // ไม่เคยลงวัน = ไม่มีอะไรให้ถอย
  ];
  for (const r of cases) {
    assert.equal(surveyStepBackPlan({ visit: visit(), before: scheduled, request: r }), null);
  }
});

test('นัดชนิดอื่น/ไม่มีใบต้นเรื่อง ไม่เกี่ยว', () => {
  assert.equal(surveyStepBackPlan({ visit: visit({ kind: 'refill' }), before: scheduled, request: request() }), null);
  assert.equal(surveyStepBackPlan({ visit: visit({ requestId: null }), before: scheduled, request: request() }), null);
  assert.equal(surveyStepBackPlan({ visit: visit(), before: scheduled, request: null }), null);
});

/* 🔴 SA ต้องได้ **เหตุผล** ไม่ใช่รู้แค่ว่าวันหาย (แผน §5E ②) */
test('🔴 ข้อความในเธรดต้องมีทั้งเหตุผลและวันเดิม', () => {
  const body = surveyStepBackBody({ reason: 'อาคารปิดปรับปรุง', previousDueDate: '2026-09-20' });
  assert.match(body, /ขั้นลงคิว/);
  assert.match(body, /2026-09-20/);
  assert.match(body, /อาคารปิดปรับปรุง/);
});

/* ── ยามผูกกับซอร์สจริง — ด่านถูกหมดแต่ถ้า route ไม่เรียกก็ไม่มีผล ────────── */
test('🔴 route ของนัดต้องเรียกตัวถอยขั้น และซิงก์วันเฉพาะนัดที่ยังกินสิทธิ์', () => {
  const route = readFileSync(
    new URL('../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');

  assert.match(route, /surveyStepBackPlan\(/, 'ต้องใช้ตัวตัดสินกลาง ไม่ใช่เขียนเงื่อนไขซ้ำ');
  assert.match(route, /entityType: 'dept_request', entityId: data\.requestId, kind: 'unable'/,
    'ต้องเขียนบรรทัดลงเธรดของใบ ไม่งั้น SA ไม่ได้กระดิ่ง');

  /* 🐞 **กับดักที่ใหญ่ที่สุดของข้อนี้** — บล็อกซิงก์วันเดิมไม่ดูสถานะนัดเลย
     ⇒ PATCH นัดที่ปิดไปแล้วอีกครั้ง (แก้สรุป/แนบไฟล์) จะเขียนวันเก่ากลับลงใบ
       ⇒ ใบเด้งกลับขั้น "นัดแล้ว" เองเงียบ ๆ พร้อมวันที่ไม่มีใครจะไป */
  assert.match(route, /const changed = holdsRequestSlot\(data\)/,
    'ซิงก์วันต้องกันด้วย holdsRequestSlot ไม่งั้นวันผีถูกเขียนกลับ');
});

/* ป้ายเธรดต้องลงทะเบียน ไม่งั้นกระดิ่งขึ้นว่า "ข้อความ" (โรคเดิมของ kind `answer`) */
test('🪤 kind "unable" ต้องมีป้ายในทะเบียนของ dept_request', async () => {
  const { UPDATE_KINDS } = await import('@/lib/master/updateTypes');
  assert.ok(Object.hasOwn(UPDATE_KINDS.dept_request, 'unable'),
    'ไม่มีป้าย = กระดิ่งขึ้นว่า "ข้อความ" และหายตอนกดซ่อนเหตุการณ์ระบบ');
  assert.equal(UPDATE_KINDS.dept_request.unable.narrative, true);
});

/* ช่างต้องมีทางปิดเป็น "เข้าไม่ได้" จริง — ก่อนหน้านี้ไม่มีจอไหนทำได้เลย */
test('🐞 จอปิดงานของช่างต้องมีเส้น "ไปแล้วเข้าไม่ได้" พร้อมช่องเหตุผล', () => {
  const sheet = readFileSync(
    new URL('../../components/service/CloseVisitSheet.js', import.meta.url), 'utf8');
  assert.match(sheet, /ไปแล้วเข้าไม่ได้/);
  assert.match(sheet, /unableReason/, 'ต้องส่งเหตุผลไปกับ payload');
  assert.match(sheet, /unableTooShort/, 'ต้องกันเหตุผลสั้นก่อนถึง server');
});
