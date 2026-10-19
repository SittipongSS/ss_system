import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyStepBackBody, surveyStepBackPlan, surveyUnableNoticeBody, surveyUnableOutcome } from './surveyStepBack.js';

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

/* ── ใบที่ไม่ต้องมีนัด (ประเมินจากแบบทั้งใบ · mig 0408) ไม่ถอยขั้น ─────────────────────
   วันบนใบแบบนี้คือ **วันส่งผลที่หัวหน้ารับปาก** ไม่ใช่วันนัด — นัดเก่าที่ยังค้าง "กำลังทำ" ตอนใบพลิกเป็น
   งานโต๊ะ (ช่างตัดพื้นที่ลงหน้างานพื้นที่สุดท้าย) ปิดเป็น "เข้าไม่ได้" ทีหลังได้ ⇒ ต้องไม่ล้างคำสัญญานั้น
   (แผน survey-desk-assessment §2 แถว 36 ③) */
test('🔴 ใบงานโต๊ะไม่ถอยขั้น — needsVisit: false = null · ไม่ส่ง / true = แผนเดิมทุกตัวอักษร', () => {
  const args = { visit: visit(), before: scheduled, request: request() };
  const today = {
    patch: { committedDueDate: null, committedDueTime: null },
    reason: 'อาคารไม่อนุญาตให้เข้าวันหยุด',
    previousDueDate: '2026-09-20',
  };
  assert.equal(surveyStepBackPlan({ ...args, needsVisit: false }), null);
  // ผู้เรียกเดิมที่ไม่รู้จักคีย์นี้ = พฤติกรรมเดิม
  assert.deepEqual(surveyStepBackPlan(args), today);
  assert.deepEqual(surveyStepBackPlan({ ...args, needsVisit: true }), today);
  assert.deepEqual(surveyStepBackPlan({ ...args, needsVisit: undefined }), today);
  // เฉพาะ `false` ตรงตัวเท่านั้นที่หยุด — ค่าที่อ่านไม่ได้ไม่ทำให้ใบลงหน้างานเลิกถอยขั้นเงียบ ๆ
  assert.deepEqual(surveyStepBackPlan({ ...args, needsVisit: null }), today);
  assert.deepEqual(surveyStepBackPlan({ ...args, needsVisit: 0 }), today);
});

test('needsVisit ไม่ได้เปิดทางใหม่ — เคสที่ไม่ถอยอยู่แล้วยังไม่ถอย ไม่ว่าส่งค่าไหน', () => {
  for (const needsVisit of [true, false, undefined]) {
    assert.equal(surveyStepBackPlan({ visit: visit(), before: visit(), request: request(), needsVisit }), null);
    assert.equal(
      surveyStepBackPlan({ visit: visit({ kind: 'refill' }), before: scheduled, request: request(), needsVisit }),
      null,
    );
    assert.equal(
      surveyStepBackPlan({ visit: visit(), before: scheduled, request: request({ committedDueDate: null }), needsVisit }),
      null,
    );
  }
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

  assert.match(route, /surveyUnableOutcome\(/, 'ต้องใช้ตัวตัดสินกลาง ไม่ใช่เขียนเงื่อนไขซ้ำ');
  assert.match(route, /entityType: 'dept_request', entityId: data\.requestId, kind: 'unable'/,
    'ต้องเขียนบรรทัดลงเธรดของใบ ไม่งั้น SA ไม่ได้กระดิ่ง');

  /* 🐞 **กับดักที่ใหญ่ที่สุดของข้อนี้** — บล็อกซิงก์วันเดิมไม่ดูสถานะนัดเลย
     ⇒ PATCH นัดที่ปิดไปแล้วอีกครั้ง (แก้สรุป/แนบไฟล์) จะเขียนวันเก่ากลับลงใบ
       ⇒ ใบเด้งกลับขั้น "นัดแล้ว" เองเงียบ ๆ พร้อมวันที่ไม่มีใครจะไป */
  // + ซิงก์เฉพาะเมื่อคำขอนี้ขยับวัน/เวลาเอง หรือฟื้นนัด (`touchedSlot` · รีวิว S2b ข้อ V17 ต่อ) — ยาม holdsRequestSlot ยังอยู่
  assert.match(route, /const changed = touchedSlot && holdsRequestSlot\(data\)/,
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

/* ═══ วันบนใบต้องเป็นวันของนัดที่เพิ่งเข้าไม่ได้ (รีวิว S2b ข้อ V17 ต่อ · 19/10) ═══════════════════════════ */
test('🔴 วันบนใบเป็นของการนัดรอบใหม่ (ไม่ใช่วันของนัดนี้ และตั้งหลังนัดนี้ถูกแก้) = ไม่ถอย แค่แจ้ง · อย่างใดอย่างหนึ่งไม่จริง = ถอยตามเดิม', () => {
  const newer = request({ committedDueDate: '2026-09-22', dueCommittedAt: '2026-09-19T03:00:00Z' });
  const touched = { ...scheduled, scheduledDate: '2026-09-18', updatedAt: '2026-09-15T03:00:00Z' };
  const v = visit({ scheduledDate: '2026-09-18' });
  assert.deepEqual(surveyUnableOutcome({ visit: v, before: touched, request: newer }),
    { kind: 'notice', reason: 'อาคารไม่อนุญาตให้เข้าวันหยุด', heldDate: '2026-09-22' });
  assert.equal(surveyStepBackPlan({ visit: v, before: touched, request: newer }), null);
  // ซิงก์ค้าง: วันบนใบตั้งก่อนนัดถูกย้าย ⇒ ถอย
  const older = request({ committedDueDate: '2026-09-22', dueCommittedAt: '2026-09-10T03:00:00Z' });
  assert.equal(surveyUnableOutcome({ visit: v, before: touched, request: older }).kind, 'stepBack');
  // วันบนใบเป็นวันของนัดนี้ก่อนแก้ (ผู้จัดคิวแก้วันพร้อมตั้งเข้าไม่ได้) ⇒ ถอย
  const moved = visit({ scheduledDate: '2026-09-21' });
  assert.equal(surveyUnableOutcome({ visit: moved, before: { ...touched, scheduledDate: '2026-09-22' }, request: newer }).kind, 'stepBack');
  // ไม่มีเวลาให้เทียบ ⇒ ถอยตามเดิม · นัดไม่มีวัน (ข้อมูลเก่า) ⇒ ถอยตามเดิม
  assert.equal(surveyUnableOutcome({ visit: v, before: scheduled, request: request({ committedDueDate: '2026-09-22' }) }).kind, 'stepBack');
  assert.ok(surveyStepBackPlan({ visit: visit(), before: scheduled, request: request() }));
});

test('ข้อความแจ้ง "ไม่ถอยขั้น" มีเหตุผลเสมอ · สองแบบ (ถือวันที่ยังไม่มีนัด · วันเพิ่งถูกเปลี่ยน)', () => {
  assert.equal(surveyUnableNoticeBody({ code: 'SV-1', reason: 'ปิดร้าน', heldDate: '2026-09-22' }),
    'เข้าพื้นที่ไม่ได้ (นัด SV-1) — ใบยังถือวัน 2026-09-22 ที่ยังไม่มีนัดเข้าพื้นที่ · รอ TS ลงคิวใหม่ — ปิดร้าน');
  assert.equal(surveyUnableNoticeBody({ code: 'SV-1', reason: 'ปิดร้าน' }),
    'เข้าพื้นที่ไม่ได้ (นัด SV-1) — ใบไม่ได้ถอยขั้น เพราะวันบนใบเพิ่งถูกเปลี่ยน — ปิดร้าน');
  assert.equal(surveyUnableNoticeBody({ code: 'SV-1', reason: 'ปิดร้าน', failed: true }),
    'เข้าพื้นที่ไม่ได้ (นัด SV-1) — ถอยใบกลับขั้นลงคิวไม่สำเร็จ วันบนใบยังค้าง · รอ TS ลงคิวใหม่ — ปิดร้าน');
});
