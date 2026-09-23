// ── "แจ้งกำหนดส่ง / ลงคิวเข้าพื้นที่" — ตรรกะของโมดัลกลาง (มติเจ้าของ 23/09) ─────────────
//
// ⭐ ตัวนี้ถูกยกออกจาก `app/requests/[id]/page.js` เพื่อให้หน้าจัดคิวใช้ฟอร์มเดียวกัน ⇒ เทสต์ล็อก
//    ว่า **ข้อความ · ค่าตั้งต้น · ก้อนที่ส่ง เท่ากับของเดิมบนหน้าใบทุกตัวอักษร** — ย้าย ไม่ใช่เขียนใหม่
//    (ค่าที่คาดไว้ข้างล่างลอกมาจากโค้ดเดิมของหน้าใบที่ origin/main f2162535)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMIT_DUE_REASON_MAX, commitDueBlocker, commitDueDefaults, commitDueGaps, commitDueLabels,
  commitDueMode, commitDuePayload,
} from './commitDue.js';
import { surveyScheduleError } from '../service/surveyVisit.js';

const survey = {
  id: 'DR-1', docNo: 'AS-26090001', kind: 'site_survey', dept: 'TS', siteId: 'SVS-1',
  status: 'acknowledged', acknowledgedAt: '2026-09-20T02:00:00.000Z',
  requestedDueDate: '2026-09-25', requestedDueTime: '10:00', requestedResultDate: '2026-09-29',
  committedDueDate: null, committedDueTime: null, committedResultDate: null, assigneeId: null,
};
const requeued = {
  ...survey, committedDueDate: '2026-09-24', committedDueTime: '13:30:00',
  committedResultDate: '2026-09-27', assigneeId: 'U2', dueCommittedAt: '2026-09-21T02:00:00.000Z',
};
const rd = {
  id: 'DR-2', docNo: 'RQ-26090002', kind: 'formula_dev', dept: 'RD',
  status: 'acknowledged', acknowledgedAt: '2026-09-20T02:00:00.000Z',
  requestedDueDate: '2026-10-01', committedDueDate: null, items: [],
};
/* รอบแก้: แถวรอบต่อที่ยังไม่ส่ง เกิดหลังการแจ้งวันครั้งล่าสุด ⇒ `dueIsStale` */
const rdRework = {
  ...rd, committedDueDate: '2026-09-01', dueCommittedAt: '2026-09-01T00:00:00Z',
  items: [{ id: 'I2', derivedFromItemId: 'I1', createdAt: '2026-09-05T00:00:00Z' }],
};
const technicians = [{ id: 'U1', name: 'สมชาย ใจดี' }, { id: 'U2', name: 'สมศักดิ์ รุ่งเรือง' }];

test('โหมดอ่านจากทะเบียนหัวข้อ (needs site) — ผู้เรียกส่งโหมดเองไม่ได้', () => {
  assert.equal(commitDueMode(survey), 'site');
  assert.equal(commitDueMode(rd), 'date');
  assert.equal(commitDueMode({ kind: 'info' }), 'date');
  assert.equal(commitDueMode(null), 'date');
});

test('⭐ ป้ายทุกตัว = ข้อความเดิมบนหน้าใบ (ใบประเมิน · ลงคิวใหม่ · RD · รอบแก้)', () => {
  assert.deepEqual(commitDueLabels(survey), {
    action: 'ลงคิวเข้าพื้นที่',
    hint: undefined,
    title: 'ลงคิวเข้าพื้นที่',
    submit: 'ลงคิว',
    okMsg: 'ลงคิวแล้ว — นัดขึ้นตารางเจ้าหน้าที่เรียบร้อย',
    dateLabel: 'วันนัดเข้าพื้นที่',
    dateHint: 'เป็นวันที่ TS แจ้ง และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง · ผู้ขอต้องการรับงาน 25/09/2026',
    timeHint: 'เว้นว่าง = ไปทั้งวัน · ผู้ขอต้องการช่วง 10:00',
    resultLabel: 'วันที่จะส่งผลประเมิน',
    resultHint: 'ต้องไม่มาก่อนวันนัดเข้าพื้นที่ · ผู้ขอต้องการผลวันที่ 29/09/2026',
    assigneeHint: 'นัดขึ้นตารางของคนนี้เมื่อวัน/เวลาอยู่ในช่วงที่ไซต์ให้เข้า · นอกช่วง = จอดเป็นร่างในแท็บรอจัด',
  });
  const again = commitDueLabels(requeued, { requeue: true });
  assert.equal(again.action, 'ลงคิวใหม่');
  assert.equal(again.hint, 'ใบมีวันแล้วแต่นัดยังไม่ขึ้นตารางเจ้าหน้าที่');
  assert.equal(again.title, 'ลงคิวเข้าพื้นที่', 'หัวโมดัลของเดิมไม่ดูธงลงคิวใหม่');
  assert.equal(again.submit, 'ลงคิว');

  const plain = commitDueLabels(rd);
  assert.equal(plain.action, 'แจ้งกำหนดส่ง');
  assert.equal(plain.title, 'แจ้งกำหนดส่ง');
  assert.equal(plain.submit, 'แจ้งกำหนดส่ง');
  assert.equal(plain.okMsg, 'แจ้งกำหนดส่งแล้ว');
  assert.equal(plain.dateLabel, 'วันกำหนดส่ง');
  assert.equal(plain.hint, undefined);

  const rework = commitDueLabels(rdRework);
  assert.equal(rework.action, 'แจ้งวันส่งรอบแก้');
  assert.equal(rework.title, 'แจ้งวันส่งของรอบแก้');
  assert.equal(rework.hint, 'รอบก่อนแจ้งไว้ 01/09/2026');
  assert.equal(rework.dateHint,
    'เป็นวันที่ RD แจ้ง และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง · รอบก่อนแจ้งไว้ 01/09/2026 · ผู้ขอต้องการรับงาน 01/10/2026');

  const surveyRework = commitDueLabels({ ...rdRework, kind: 'site_survey', dept: 'TS' });
  assert.equal(surveyRework.action, 'ลงคิวรอบใหม่');
  assert.equal(surveyRework.title, 'ลงคิวรอบใหม่');
});

/* 🐞 UAT 24/09: Postgres คืน time เป็น '11:00:00' ⇒ คำใบ้เคยพิมพ์ "ผู้ขอต้องการช่วง 11:00:00" ข้างการ์ดที่พิมพ์
   "ช่วง 11:00" (toHHMM) — ค่าเดียวกันสองหน้าตาบนจอเดียว ⇒ คำใบ้ตัดวินาทีด้วยตัวเดียวกับการ์ด */
test('🐞 คำใบ้เวลาตัดวินาทีของเวลาจากฐานข้อมูล (11:00:00 → 11:00)', () => {
  assert.equal(commitDueLabels({ ...survey, requestedDueTime: '11:00:00' }).timeHint,
    'เว้นว่าง = ไปทั้งวัน · ผู้ขอต้องการช่วง 11:00');
  assert.equal(commitDueLabels({ ...survey, requestedDueTime: null }).timeHint, 'เว้นว่าง = ไปทั้งวัน');
});

/* 🐞 รีวิว 24/09: คำใบ้ใต้ตัวเลือกคนเคยบอกเด็ดขาดว่า "นัดจะขึ้นตารางและงานวันนี้ของคนนี้" — ผิดทุกครั้งที่ด่าน ④
   (ช่วงเวลาที่ไซต์ให้เข้า) ไม่ผ่าน: `createSurveyVisit` จอดนัดเป็นร่างที่ไม่อยู่บนตารางของใคร · server บอก `_warning`
   ทีหลัง แต่ฟอร์มพูดตรงข้ามไปก่อนแล้ว ⇒ คำใบ้ต้องบอกเงื่อนไข ไม่ใช่สัญญา */
test('🐞 คำใบ้ตัวเลือกคนไม่สัญญาว่านัดขึ้นตารางเสมอ — บอกทางที่นัดเป็นร่าง', () => {
  const hint = commitDueLabels(survey).assigneeHint;
  assert.match(hint, /ช่วงที่ไซต์ให้เข้า/);
  assert.match(hint, /ร่าง/);
  assert.doesNotMatch(hint, /^นัดจะขึ้นตาราง/);
  assert.equal(commitDueLabels(rd).assigneeHint, '', 'แจ้งกำหนดส่งไม่มีตัวเลือกคน');
});

test('⭐ ค่าตั้งต้น: ใบประเมิน = วัน/เวลาที่ผู้ขอต้องการ · ลงคิวใหม่ = ของเดิมบนใบ · หัวข้ออื่น = วันนี้', () => {
  assert.deepEqual(commitDueDefaults(survey, { today: '2026-09-23' }), {
    date: '2026-09-25', time: '10:00', resultDate: '2026-09-29', assigneeId: '', reason: '',
  });
  assert.deepEqual(commitDueDefaults({ ...survey, requestedDueDate: null, requestedDueTime: null }, { today: '2026-09-23' }), {
    date: '2026-09-23', time: '', resultDate: '2026-09-29', assigneeId: '', reason: '',
  });
  assert.deepEqual(commitDueDefaults(requeued, { requeue: true, today: '2026-09-23' }), {
    date: '2026-09-24', time: '13:30', resultDate: '2026-09-27', assigneeId: 'U2', reason: '',
  });
  assert.deepEqual(commitDueDefaults(rd, { today: '2026-09-23' }), {
    date: '2026-09-23', time: '', resultDate: '', assigneeId: '', reason: '',
  }, 'หัวข้ออื่นไม่ตั้งต้นด้วยวันที่ผู้ขอต้องการ — ฝ่ายเป็นคนกำหนด');
  // ไม่ส่ง today = วันไทยของวันนี้ (ไม่ว่าง)
  assert.match(commitDueDefaults(rd).date, /^\d{4}-\d{2}-\d{2}$/);
});

test('⭐ ก้อน PATCH = ก้อนเดิมของหน้าใบเป๊ะ (ใบประเมิน · หัวข้ออื่น)', () => {
  const form = { date: '2026-09-25', time: '10:00', resultDate: '2026-09-29', assigneeId: 'U1', reason: 'ลูกค้าสะดวกเช้า' };
  assert.deepEqual(commitDuePayload(survey, form, { technicians }), {
    action: 'commit-due',
    committedDueDate: '2026-09-25',
    reason: 'ลูกค้าสะดวกเช้า',
    committedDueTime: '10:00',
    committedResultDate: '2026-09-29',
    assigneeId: 'U1',
    assigneeName: 'สมชาย ใจดี',
  });
  // ช่องว่าง = null (ไปทั้งวัน) · ไม่รู้จักคน = ชื่อ null (server อ่านชื่อจากทะเบียนเอง)
  assert.deepEqual(commitDuePayload(survey, { ...form, time: '', resultDate: '', assigneeId: 'U9' }, { technicians }), {
    action: 'commit-due', committedDueDate: '2026-09-25', reason: 'ลูกค้าสะดวกเช้า',
    committedDueTime: null, committedResultDate: null, assigneeId: 'U9', assigneeName: null,
  });
  assert.deepEqual(commitDuePayload(rd, { ...form, date: '2026-10-01', reason: '' }, { technicians }), {
    action: 'commit-due', committedDueDate: '2026-10-01', reason: '',
  }, 'หัวข้ออื่นไม่ส่งช่องของการลงคิว');
});

test('⭐ ด่านปุ่มส่งบอกทุกช่องที่ขาดในครั้งเดียว — ข้อแรกตรงกับที่ server ตอบ', () => {
  const empty = { date: '', time: '', resultDate: '', assigneeId: '', reason: '' };
  assert.deepEqual(commitDueGaps(survey, empty), [
    'ต้องระบุวันนัดเข้าพื้นที่',
    'ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ',
    'ต้องระบุวันที่จะส่งผลประเมิน',
  ]);
  const payload = commitDuePayload(survey, empty, { technicians });
  assert.equal(commitDueGaps(survey, empty)[0], surveyScheduleError(payload, survey));
  assert.deepEqual(commitDueGaps(survey, { date: '2026-09-25', time: '25:99', resultDate: '2026-09-20', assigneeId: 'U1' }), [
    'เวลานัดไม่ถูกต้อง',
    'วันที่จะส่งผลประเมินต้องไม่มาก่อนวันนัดเข้าพื้นที่',
  ]);
  assert.deepEqual(commitDueGaps({ ...survey, siteId: null }, { date: '2026-09-25', resultDate: '2026-09-26', assigneeId: 'U1' }), [
    'ใบนี้ไม่มีสถานที่ — ลงคิวไม่ได้',
  ]);
  assert.deepEqual(commitDueGaps(survey, { date: '2026-09-25', resultDate: '2026-09-25', assigneeId: 'U1' }), []);
  assert.equal(commitDueBlocker(survey, { date: '2026-09-25', resultDate: '2026-09-25', assigneeId: 'U1' }), '');
  assert.equal(commitDueBlocker(survey, empty),
    'ต้องระบุวันนัดเข้าพื้นที่ · ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ · ต้องระบุวันที่จะส่งผลประเมิน');

  // หัวข้ออื่น: วันอย่างเดียว (ข้อความเดียวกับ commitDueRequestError)
  assert.deepEqual(commitDueGaps(rd, { date: '' }), ['ต้องระบุวันกำหนดส่ง']);
  assert.deepEqual(commitDueGaps(rd, { date: '2026-10-01' }), []);
  // หมายเหตุยาวเกิน = ตีกลับเหมือน server
  assert.equal(COMMIT_DUE_REASON_MAX, 500);
  assert.deepEqual(commitDueGaps(rd, { date: '2026-10-01', reason: 'ก'.repeat(501) }), ['เหตุผลยาวเกิน 500 ตัวอักษร']);
});
