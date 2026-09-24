// ── "แจ้งกำหนดส่ง / ลงคิวเข้าพื้นที่" — ตรรกะของโมดัลกลาง (มติเจ้าของ 23/09) ─────────────
//
// ⭐ ตัวนี้ถูกยกออกจาก `app/requests/[id]/page.js` เพื่อให้หน้าจัดคิวใช้ฟอร์มเดียวกัน ⇒ เทสต์ล็อก
//    ว่า **ข้อความ · ค่าตั้งต้น · ก้อนที่ส่ง เท่ากับของเดิมบนหน้าใบทุกตัวอักษร** — ย้าย ไม่ใช่เขียนใหม่
//    (ค่าที่คาดไว้ข้างล่างลอกมาจากโค้ดเดิมของหน้าใบที่ origin/main f2162535)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMIT_DUE_REASON_MAX, WISH_APPLY_TEXT, WISH_SAME_TEXT, commitDueBlocker, commitDueDefaults, commitDueGaps,
  commitDueHeader, commitDueJobRows, commitDueLabels, commitDueMode, commitDueOutcome, commitDuePayload, commitDueWishes,
} from './commitDue.js';
import { surveyScheduleError } from '../service/surveyVisit.js';
import { surveyRequestRow } from '../service/scheduleQueueView.js';

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
    /* ⭐ มติ 24/09 แบบ A: ลงคิวเข้าพื้นที่ไม่มีประโยคอธิบายระบบ (pain 19) · วันที่ผู้ขอต้องการเป็นชิป */
    dateHint: '',
    resultLabel: 'วันที่จะส่งผลประเมิน',
    /* ⭐ เวลา/วันส่งผลที่ผู้ขอต้องการย้ายไปเป็นชิปข้างช่อง (`commitDueWishes`) — คำใบ้เหลือแค่กติกาลำดับวัน
       · "เว้นว่าง = ไปทั้งวัน" คือแผ่น "ไม่ระบุเวลา" ของช่องเวลา ⇒ ไม่มี `timeHint` แล้ว */
    resultHint: 'ต้องไม่มาก่อนวันนัดเข้าพื้นที่',
    /* 🐞 รีวิว UAT 24/09: `assigneeHint` ("…นอกช่วง = จอดเป็นร่าง") ถอดทิ้ง — ทายผิด (ดูเทสต์ข้างล่าง) */
    notePlaceholder: 'เช่น นัดผู้จัดการไซต์ก่อนเข้า · แลกบัตรที่ รปภ.',
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
  // รอบแก้ของใบประเมินยังเห็นวันของรอบก่อน — เป็นวันไทย ไม่ใช่ 01/09/2026 (หลักการข้อ 9 ของแบบ A)
  assert.equal(surveyRework.dateHint, 'รอบก่อนแจ้งไว้ อ. 1 ก.ย.');
});

/* ⭐ มติ 24/09 แบบ A (pain 17 · 19) — ช่องหมายเหตุพูดเรื่องของงานตัวเอง · คำใบ้วันไม่ใช่คำของคนทำระบบ */
test('⭐ ตัวอย่างในช่องหมายเหตุตามงาน · คำใบ้วันของลงคิวเข้าพื้นที่ไม่มีประโยคอธิบายระบบ', () => {
  assert.equal(commitDueLabels(survey).notePlaceholder, 'เช่น นัดผู้จัดการไซต์ก่อนเข้า · แลกบัตรที่ รปภ.');
  assert.equal(commitDueLabels(rd).notePlaceholder, 'เช่น รอวัตถุดิบเข้าวันที่ 25 — ส่งได้หลังจากนั้น', 'แจ้งกำหนดส่งคงของเดิม');
  assert.doesNotMatch(commitDueLabels(survey).dateHint, /เป็นตัวที่ใช้นับว่าเลยกำหนด/);
  assert.doesNotMatch(commitDueLabels(survey).dateHint, /ผู้ขอต้องการ/, 'ความต้องการของผู้ขอเป็นชิป ไม่ใช่คำใบ้ที่ซ้ำค่าในช่อง');
  assert.match(commitDueLabels(rd).dateHint, /^เป็นวันที่ RD แจ้ง และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง/, 'แจ้งกำหนดส่งคงของเดิม');
});

/* 🐞 UAT 24/09: Postgres คืน time เป็น '11:00:00' ⇒ คำใบ้เคยพิมพ์ "ผู้ขอต้องการช่วง 11:00:00" ข้างการ์ดที่พิมพ์
   "ช่วง 11:00" (toHHMM) — ค่าเดียวกันสองหน้าตาบนจอเดียว ⇒ คำใบ้ตัดวินาทีด้วยตัวเดียวกับการ์ด */
test('🐞 เวลาที่ผู้ขอต้องการตัดวินาทีของเวลาจากฐานข้อมูล (11:00:00 → 11:00) — ตอนนี้อยู่บนชิป ไม่ใช่คำใบ้', () => {
  const wish = commitDueWishes({ ...survey, requestedDueTime: '11:00:00' }, { date: '2026-09-25', time: '11:00' }).visit;
  assert.equal(wish.value, 'ศ. 25 ก.ย. · 11:00');
  assert.equal(wish.same, true, 'ค่าที่กรอก 11:00 ตรงกับ 11:00:00 ของฐานข้อมูล');
  assert.equal(commitDueWishes({ ...survey, requestedDueTime: null }, { date: '2026-09-25', time: '' }).visit.value, 'ศ. 25 ก.ย.');
  // ไม่มีคำใบ้เวลาที่ซ้ำค่าในช่องอีก (pain 14)
  assert.equal('timeHint' in commitDueLabels(survey), false);
  assert.doesNotMatch(commitDueLabels(survey).resultHint, /ผู้ขอต้องการ/);
});

/* 🐞 รีวิว UAT 24/09 (high): คำใบ้ "…นอกช่วง = จอดเป็นร่างในแท็บรอจัด" (และบรรทัดผลลัพธ์ที่ใช้คำนี้บนหน้าใบ)
   ทายผิด — server สร้างนัดจากไซต์ที่ `loadSurveySite` select แค่ id/code/name/customerId ⇒ ด่าน ④ ไม่เห็นช่วงเวลา
   และนัดลงตารางช่างเสมอ (ทดสอบกับรูปไซต์จริงที่ surveyVisit.test.mjs) ⇒ ไม่มีคำที่ทายว่าจะเป็นร่างเหลืออยู่ */
test('🐞 ลงคิวไม่มีคำไหนทายว่านัดจะจอดเป็นร่าง (server ไม่ได้ตรวจช่วงเข้าไซต์ของงานสำรวจ)', () => {
  for (const request of [survey, rd]) {
    const labels = commitDueLabels(request);
    assert.equal('assigneeHint' in labels, false);
    for (const [key, text] of Object.entries(labels)) {
      if (typeof text === 'string') assert.doesNotMatch(text, /จอดเป็นร่าง/, key);
    }
  }
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

/* ═══ โมดัลจัดคิวแบบ A (มติเจ้าของ 24/09) — หัว · งานนี้ · ชิปผู้ขอ · บรรทัดผลลัพธ์ ═══════════════
   fixture จาก BRIEF §C2 (mockups/schedule-modal/BRIEF.md) · วันนี้ พฤ. 24 ก.ย. 2026 */
const TODAY = '2026-09-24';
const hostel = {
  id: 'SVS-9', code: 'ST-1011-01-BKK-1162', name: 'หอม คุ้กกิ้ง โฮสเทล', customerName: 'บริษัท หอมคุ้กกิ้งโฮสเทล จำกัด',
  routeZone: 'BKK', accessDays: [], accessFrom: '10:00', accessTo: '20:00',
};
const c2 = {
  ...survey, id: 'DR-192', docNo: 'RQ-AS-26090192', siteId: 'SVS-9',
  title: 'ประเมินพื้นที่สำหรับติดตั้งเครื่องกระจายกลิ่น',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-09-23T03:00:00.000Z',
  acknowledgedByName: 'Apisith Pattangthani',
  requestedDueDate: '2026-10-01', requestedDueTime: '11:00:00', requestedResultDate: '2026-10-09',
};
const c2Form = { date: '2026-10-01', time: '11:00', resultDate: '2026-10-09', assigneeId: '', reason: '' };
const crew = [{ id: 'PK', name: 'Peera Khantawee' }, { id: 'VT', name: 'Veerachai Teratumtada' }];

test('⭐ หัวโมดัลลงคิว: ชื่องาน · ชิป "ประเมินพื้นที่" · RQ + ผู้ขอ · บรรทัดไซต์ (รหัส · ชื่อ · ลูกค้า)', () => {
  assert.deepEqual(commitDueHeader(c2, { site: hostel }), {
    title: 'ลงคิวเข้าพื้นที่',
    kind: { key: 'survey', label: 'ประเมินพื้นที่' },
    status: null,
    origin: 'RQ-AS-26090192 · ผู้ขอ Lalida Chaiwanna',
    context: { code: 'ST-1011-01-BKK-1162', name: 'หอม คุ้กกิ้ง โฮสเทล', customer: 'บริษัท หอมคุ้กกิ้งโฮสเทล จำกัด' },
  });
  // หน้าใบคำร้อง: ไซต์จาก `req.surveySite` (ไม่มีชื่อลูกค้าในแถวไซต์) ⇒ ถอยไปชื่อลูกค้าของใบ
  assert.equal(commitDueHeader({ ...c2, customerName: 'บจก. หอม' }, { site: { code: 'ST-1', name: 'x' } }).context.customer, 'บจก. หอม');
  assert.equal(commitDueHeader(c2).context, null, 'ไม่มีไซต์ในมือ = ไม่มีบรรทัดไซต์');
  const plain = commitDueHeader(rd, { site: hostel });
  assert.equal(plain.title, 'แจ้งกำหนดส่ง');
  assert.equal(plain.kind, null);
  assert.equal(plain.context, null);
});

test('⭐ "งานนี้" ของลงคิว — คำชุดเดียวกับการ์ดคำร้องบนหน้าจัดคิว', () => {
  const rows = commitDueJobRows(c2, { site: hostel, todayIso: TODAY, siteLoad: { assets: 0, packs: 0 } });
  assert.deepEqual(rows.map((r) => [r.label, r.value, r.sub || '']), [
    ['งาน', 'ประเมินพื้นที่', ''],
    ['เรื่อง', 'ประเมินพื้นที่สำหรับติดตั้งเครื่องกระจายกลิ่น', ''],
    ['ที่ไหน', 'เขต BKK', ''],
    ['ผู้ขอ', 'Lalida Chaiwanna', 'ส่งเมื่อ พ. 23 ก.ย. · ค้างมา 1 วัน'],
    ['ต้องการ', 'เข้า พฤ. 1 ต.ค. · ช่วง 11:00', 'ผล ศ. 9 ต.ค.'],
    ['ที่มา', 'คำร้องประเมินพื้นที่', 'รับเรื่องแล้ว โดย Apisith Pattangthani'],
  ]);
  assert.equal(rows[0].kind, 'survey');
  assert.equal(rows[0].extra, '0 จุด · 0 แพ็ค', 'รู้ภาระของไซต์แล้วเป็นศูนย์ (ไซต์ใหม่) = บอกศูนย์');
  assert.deepEqual(rows[5].badge, { label: 'ขั้น 2/2', tone: 'info' });

  // คำเดียวกับการ์ด (surveyRequestRow) ไม่ใช่เขียนใหม่
  const card = surveyRequestRow(c2, { todayIso: TODAY, sitesById: new Map([[hostel.id, hostel]]) });
  assert.ok(card.who.sub.startsWith(rows[3].sub), 'อายุคำร้อง');
  assert.equal(card.status.label, rows[5].badge.label, 'ป้ายขั้น');
  assert.ok(card.status.text.startsWith(rows[5].sub), '"รับเรื่องแล้ว โดย …"');

  // หน้าใบ: ไม่รู้ภาระ = ไม่มีตัวเลขต่อท้าย · ไซต์ไม่มีเขต/วิธีเข้า = ถอยไปที่อยู่
  const onRequestPage = commitDueJobRows(c2, { site: { id: 'SVS-9', address: '12 ถ.สุขุมวิท' }, todayIso: TODAY });
  assert.equal(onRequestPage[0].extra, '');
  assert.equal(onRequestPage[2].value, '12 ถ.สุขุมวิท');
  assert.equal(commitDueJobRows(c2, { todayIso: TODAY })[2].value, '—');

  // ลงคิวใหม่: ที่มาบอกนัดเดิม
  const again = commitDueJobRows({ ...c2, committedDueDate: '2026-09-20', surveyVisit: { id: 'V1', code: 'SV-26090015', status: 'unable' } }, { todayIso: TODAY });
  assert.deepEqual(again[5].badge, { label: 'ลงคิวใหม่', tone: 'warning' });
  assert.equal(again[5].sub, 'นัดเดิม SV-26090015 ทำไม่ได้');
  assert.deepEqual(commitDueJobRows(rd, { todayIso: TODAY }), [], 'แจ้งกำหนดส่งไม่มีแผง "งานนี้"');
});

test('⭐ ชิปผู้ขอ: ตรงกัน = "ตรงกัน" · ไม่ตรง = ปุ่ม "ใช้ตามผู้ขอ" พร้อมค่าที่จะเติม (pain 14)', () => {
  assert.equal(WISH_SAME_TEXT, 'ตรงกัน');
  assert.equal(WISH_APPLY_TEXT, 'ใช้ตามผู้ขอ');
  const same = commitDueWishes(c2, c2Form);
  assert.deepEqual(same.visit, {
    key: 'visit', lead: 'ผู้ขอต้องการ', value: 'พฤ. 1 ต.ค. · 11:00', same: true, patch: { date: '2026-10-01', time: '11:00' },
  });
  assert.deepEqual(same.result, {
    key: 'result', lead: 'ผู้ขอต้องการผล', value: 'ศ. 9 ต.ค.', same: true, patch: { resultDate: '2026-10-09' },
  });
  const moved = commitDueWishes(c2, { ...c2Form, date: '2026-10-02', resultDate: '2026-10-12' });
  assert.equal(moved.visit.same, false);
  assert.equal(moved.result.same, false);
  // กด "ใช้ตามผู้ขอ" = เอา patch ทับฟอร์ม แล้วชิปกลับเป็น "ตรงกัน"
  const applied = { ...c2Form, date: '2026-10-02', resultDate: '2026-10-12', ...moved.visit.patch, ...moved.result.patch };
  assert.equal(commitDueWishes(c2, applied).visit.same, true);
  assert.equal(commitDueWishes(c2, applied).result.same, true);
  assert.equal(commitDueWishes(c2, { ...c2Form, time: '13:00' }).visit.same, false, 'เวลาไม่ตรงก็ไม่ตรง');
  // ผู้ขอไม่ระบุเวลา = วันตรงก็ตรง · ปุ่มไม่ล้างเวลาที่กรอกไว้
  const anyTime = commitDueWishes({ ...c2, requestedDueTime: null }, { ...c2Form, time: '14:00' });
  assert.equal(anyTime.visit.value, 'พฤ. 1 ต.ค.');
  assert.equal(anyTime.visit.same, true);
  assert.deepEqual(anyTime.visit.patch, { date: '2026-10-01' });
  // ผู้ขอไม่ได้ระบุ = ไม่มีชิป · แจ้งกำหนดส่งไม่มีชิป
  assert.deepEqual(commitDueWishes({ ...c2, requestedDueDate: null, requestedResultDate: null }, c2Form), { visit: null, result: null });
  assert.deepEqual(commitDueWishes(rd, { date: '2026-10-01' }), { visit: null, result: null });
});

test('⭐ บรรทัดผลลัพธ์ของลงคิว (BRIEF C2): ขาดคน · ขึ้นตาราง · นอกช่วงเข้าไซต์ = ยังขึ้นตาราง (เตือน) · หน้าใบบอกแน่นอน', () => {
  assert.deepEqual(commitDueOutcome(c2, c2Form, { site: hostel, technicians: crew }), {
    tone: 'warn', lands: null, text: 'ยังลงคิวไม่ได้ — ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ',
  });
  assert.deepEqual(commitDueOutcome(c2, { ...c2Form, assigneeId: 'PK' }, { site: hostel, technicians: crew }), {
    tone: 'ok', lands: 'scheduled', text: 'จะขึ้นตารางของ Peera Khantawee · พฤ. 1 ต.ค. 11:00 · ส่งผลภายใน ศ. 9 ต.ค.',
  });
  /* 🐞 รีวิว UAT 24/09 (high): 21:00 บนไซต์ 10:00–20:00 เคยบอก "จะจอดเป็นร่าง…" แต่ server ลงตารางช่าง ⇒ บอกว่า
     ขึ้นตาราง แล้วเตือนเรื่องช่วงเวลา (เตือน ไม่ห้าม) */
  assert.deepEqual(commitDueOutcome(c2, { ...c2Form, assigneeId: 'PK', time: '21:00' }, { site: hostel, technicians: crew }), {
    tone: 'warn', lands: 'scheduled',
    text: 'จะขึ้นตารางของ Peera Khantawee · พฤ. 1 ต.ค. 21:00 · ส่งผลภายใน ศ. 9 ต.ค. · นอกช่วงเข้าไซต์ 10:00–20:00 (เตือนเท่านั้น)',
  });
  assert.equal(commitDueOutcome(c2, { ...c2Form, assigneeId: 'PK', time: '' }, { site: hostel, technicians: crew }).text,
    'จะขึ้นตารางของ Peera Khantawee · พฤ. 1 ต.ค. ทั้งวัน · ส่งผลภายใน ศ. 9 ต.ค.');
  /* หน้าใบคำร้อง (ไม่เห็นช่วงเข้าไซต์) — 🐞 รีวิว UAT 24/09 (pain 16): เคยตอบกั๊กสองทาง ("…นอกช่วง = จอดเป็นร่าง")
     แต่ผลของ server ไม่ขึ้นกับช่วงเข้าไซต์ ⇒ บอกได้แน่นอนเหมือนหน้าจัดคิว (แค่ไม่มีคำเตือนเรื่องช่วงเวลา) */
  assert.deepEqual(commitDueOutcome(c2, { ...c2Form, assigneeId: 'PK', time: '21:00' }, { site: { id: 'SVS-9' }, accessKnown: false, technicians: crew }), {
    tone: 'ok', lands: 'scheduled', text: 'จะขึ้นตารางของ Peera Khantawee · พฤ. 1 ต.ค. 21:00 · ส่งผลภายใน ศ. 9 ต.ค.',
  });
  assert.equal(commitDueOutcome(c2, { ...c2Form, assigneeId: 'PK' }, { technicians: crew }).lands, 'scheduled', 'ไม่มีไซต์ในมือก็ขึ้นตาราง');
  // เลือกคนที่เกินภาระ (Veerachai 14 จุด + ไซต์ 0) — เตือนเหมือนตัวเลือก ไม่บล็อก
  const veer = { state: 'ok', people: [{ id: 'VT', name: 'Veerachai Teratumtada', visits: 3, assets: 14, packs: 5, assisting: 0 }] };
  assert.deepEqual(commitDueOutcome(c2, { ...c2Form, assigneeId: 'VT' }, { site: hostel, technicians: crew, load: veer, siteLoad: { assets: 0, packs: 0 } }), {
    tone: 'warn', lands: 'scheduled',
    text: 'จะขึ้นตารางของ Veerachai Teratumtada · พฤ. 1 ต.ค. 11:00 · ส่งผลภายใน ศ. 9 ต.ค. · เกินภาระ 12 จุด (เตือนเท่านั้น)',
  });
  // ขาดหลายช่อง = บอกทุกช่องในครั้งเดียว (ข้อความชุดเดียวกับปุ่ม)
  const empty = { date: '', time: '', resultDate: '', assigneeId: '', reason: '' };
  assert.equal(commitDueOutcome(c2, empty, { site: hostel }).text, `ยังลงคิวไม่ได้ — ${commitDueBlocker(c2, empty)}`);
  // แจ้งกำหนดส่ง
  assert.deepEqual(commitDueOutcome(rd, { date: '2026-10-01' }), { tone: 'info', lands: null, text: 'จะแจ้งผู้ขอว่ากำหนดส่ง พฤ. 1 ต.ค.' });
  assert.equal(commitDueOutcome(rd, { date: '' }).text, 'ยังแจ้งกำหนดส่งไม่ได้ — ต้องระบุวันกำหนดส่ง');
});
