// ── ประเมินจากแบบบนหน้าคำร้อง (งวด S2a · กลุ่ม F) — งานของใบ · โมดัลรับปากวันส่งผล · หัวใบ ──────────
//
// ⭐ ล็อกสิ่งที่จอของงวด S2b จะวาด: แถบ "ตอนนี้" ของงานโต๊ะสี่ขั้น · ชื่อขั้นบนราง · แถวพื้นที่ (ชิป · แบบ n ·
//    เพิ่มโดย TS) · แถบแจ้งเหนือตาราง · การ์ดด่านสองฝั่ง · โมดัล "รับปากวันส่งผล" / "เลื่อนวันส่งผล" · ช่องวันบนหัวใบ
// 🔴 ทุกข้อมีคู่เทียบของใบลงหน้างาน — ใบที่ไม่มีพื้นที่จากแบบต้องได้ค่าของวันนี้ทุกตัวอักษร
//    (ใบลงหน้างานล้วนทั้งก้อนถูกตรึงอีกชั้นที่ `surveyMethodGolden.test.mjs`)
// ฟิกซ์เจอร์: ใบ RQ-AS-26100312 ของบรีฟม็อก — เคส A (สามพื้นที่จากแบบ) · เคส B (ผสม · นัด SV-26100011 อ. 13 ต.ค.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { surveyJobView } from './surveyJob.js';
import { surveyDeskResultDate, SURVEY_DESK_RESCHEDULE_REASON_ERROR } from './surveyVisit.js';
import { SURVEY_METHOD_CHIP, SURVEY_METHOD_LABEL, SURVEY_METHOD_RESULT_DATE_LABEL } from './surveyMethodSwitch.js';
import {
  commitDueBlocker, commitDueDefaults, commitDueGaps, commitDueHeader, commitDueJobRows, commitDueLabels,
  commitDueMode, commitDueOutcome, commitDuePayload, commitDueWishes, deskRescheduleView,
} from '../requests/commitDue.js';
import { requestHeaderFacts } from '../requests/headerFacts.js';
import { rescheduleRequestError } from '../requests/stages.js';

const TODAY = '2026-10-09';
const DRAWING = { method: 'drawing' };
const SALES = { isOpener: true, isRequesterSide: true };
const HEAD = { canDecide: true, canWork: true };
const VIEWERS = [['ฝ่ายขาย', SALES], ['หัวหน้า', HEAD]];

const zones = (over = {}) => ([
  { id: 'z1', zoneName: 'Lobby ชั้น 1', zoneCode: 'ZN-1160-10301', zoneFloor: '01', status: 'ok',
    parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [], ...over },
  { id: 'z2', zoneName: 'ห้องประชุม ชั้น 2', zoneCode: 'ZN-1160-10302', zoneFloor: '02', status: 'ok',
    parts: [{ id: 'p', widthM: 6, lengthM: 5, heightM: 2.8 }], spots: [], ...over },
  { id: 'z3', zoneName: 'ห้อง Spa ชั้น 3', zoneCode: 'ZN-1160-10303', zoneFloor: '03', status: 'ok',
    parts: [], spots: [], ...over },
]);
const visit = (over = {}) => ({
  id: 'v1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-13', startTime: '10:00:00',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: [],
  createdByName: 'Apisith Pattangthani', createdAt: '2026-10-08T08:15:00Z', ...over,
});
/* ใบงานโต๊ะที่รับเรื่องแล้ว ยังไม่รับปากวันส่งผล (เคส A) */
const ask = (over = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26100312', team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-08T07:50:00Z',
  acknowledgedAt: '2026-10-08T08:12:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
  assigneeId: 'u-head', assigneeName: 'Arnon Aunsapwilai',
  requestedDueDate: '2026-10-13', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-15',
  committedDueDate: null, committedResultDate: null,
  surveyVisit: null, surveyZones: zones(DRAWING), surveyFilesByZone: {},
  ...over,
});
const PROMISED = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' };
const SENT = { ...PROMISED, status: 'answered', answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai' };
/* เคส B — พื้นที่ที่สามประเมินจากแบบ อีกสองพื้นที่ช่างยังต้องไปวัด */
const mixedZones = () => zones().map((z, i) => (i === 2 ? { ...z, ...DRAWING } : z));
const spotFile = (spotId) => ({ docType: 'survey_spot', mimeType: 'image/jpeg', fileName: null, metadata: { spotId } });
const job = (request, viewer = SALES, today = TODAY) => surveyJobView({ request, today, viewer });
const nowBand = (view) => ({ headline: view.now.headline, sub: view.now.sub, next: view.now.next, turn: view.now.turn });
const everyText = (view) => JSON.stringify([view.now, view.steps, view.zones.drawingBanner]);

/* ── 1) แถบ "ตอนนี้" ───────────────────────────────────────────────────────────── */
test('⭐ แถบตอนนี้ · งานโต๊ะสี่ขั้น — ถ้อยคำตรงตัวทั้งหัวข้อ บรรทัดรอง และตาใคร (ฝ่ายขายกับหัวหน้าอ่านเหมือนกัน)', () => {
  for (const [who, viewer] of VIEWERS) {
    const pending = job(ask({ status: 'pending', acknowledgedAt: null, acknowledgedByName: null }), viewer);
    assert.equal(pending.stage, 'pending', who);
    assert.deepEqual(nowBand(pending), {
      headline: 'รอ TS รับเรื่อง',
      sub: 'ใบนี้ประเมินจากแบบ — ไม่มีการเข้าพื้นที่ · หัวหน้า TS จะรับเรื่องแล้วแจ้งวันส่งผล',
      next: null,
      turn: { side: 'TS', who: 'หัวหน้า TS' },
    }, who);

    const queue = job(ask(), viewer);
    assert.equal(queue.stage, 'desk-queue', who);
    assert.deepEqual(nowBand(queue), {
      headline: 'รอหัวหน้า TS แจ้งวันส่งผล',
      sub: 'ประเมินจากแบบ — ไม่ลงคิว ไม่มีนัดเข้าพื้นที่ · ผู้ขอต้องการผล พฤ. 15 ต.ค.',
      next: null,
      turn: { side: 'TS', who: 'หัวหน้า TS' },
    }, who);

    const working = job(ask(PROMISED), viewer);
    assert.equal(working.stage, 'desk-working', who);
    assert.deepEqual(nowBand(working), {
      headline: 'กำลังประเมินจากแบบ — จะส่งผล พฤ. 15 ต.ค.',
      sub: 'Arnon Aunsapwilai รับผิดชอบ · กรอกขนาดจากแบบแล้ว 2 / 3 พื้นที่',
      next: null,
      turn: { side: 'TS', who: 'Arnon Aunsapwilai' },
    }, who);

    const overdue = job(ask(PROMISED), viewer, '2026-10-18');
    assert.equal(overdue.stage, 'desk-overdue', who);
    assert.deepEqual(nowBand(overdue), {
      headline: 'เลยวันที่จะส่งผลมา 3 วัน',
      sub: 'หัวหน้า TS ส่งผล หรือเลื่อนวันส่งผล',
      next: null,
      turn: { side: 'TS', who: 'Arnon Aunsapwilai' },
    }, who);
    assert.equal(overdue.now.tone, 'danger', who);
  }
});

test('แถบตอนนี้ · งานโต๊ะ: ผู้ขอไม่ระบุวันรับผล = ไม่มีท่อนท้าย · ไม่มีผู้รับผิดชอบ = "หัวหน้า TS" · ตัดออกหมดไม่นับ 0 / 0', () => {
  assert.equal(job(ask({ requestedResultDate: null })).now.sub, 'ประเมินจากแบบ — ไม่ลงคิว ไม่มีนัดเข้าพื้นที่');

  const nobody = job(ask({ ...PROMISED, assigneeId: null, assigneeName: null, acknowledgedByName: null }));
  assert.equal(nobody.now.sub, 'หัวหน้า TS รับผิดชอบ · กรอกขนาดจากแบบแล้ว 2 / 3 พื้นที่');
  assert.deepEqual(nobody.now.turn, { side: 'TS', who: 'หัวหน้า TS' });

  // พื้นที่ที่ถูกตัดไม่อยู่ทั้งตัวตั้งและตัวหาร — z3 (ยังไม่มีขนาด) ถูกตัด ⇒ 2 / 2
  const cutOne = zones(DRAWING).map((z, i) => (i === 2 ? { ...z, status: 'cut', cutReason: 'ลูกค้าไม่เอาแล้ว' } : z));
  assert.equal(job(ask({ ...PROMISED, surveyZones: cutOne })).now.sub, 'Arnon Aunsapwilai รับผิดชอบ · กรอกขนาดจากแบบแล้ว 2 / 2 พื้นที่');

  // ฝ่ายอื่นที่ไม่ใช่ TS — ชื่อฝ่ายมาจากใบ ไม่ได้ฝังคำว่า TS
  const sv = job(ask({ dept: 'SV' }));
  assert.equal(sv.now.headline, 'รอหัวหน้า SV แจ้งวันส่งผล');
  assert.deepEqual(sv.now.turn, { side: 'SV', who: 'หัวหน้า SV' });
});

test('🔴 แถบตอนนี้ · งานโต๊ะไม่มีคำว่า "วัดแล้ว" และไม่มีมาตรวัด — แม้นัดเดิมปิดแล้ว และแม้มีการส่งกลับค้างจากตอนยังลงหน้างาน', () => {
  const sendBack = { pending: true, sentBack: { at: '2026-10-08T08:00:00Z', byName: 'Arnon Aunsapwilai', items: ['ถ่ายภาพกว้างใหม่'] }, done: null };
  const shapes = [
    ['รอแจ้งวัน', ask(), 'desk-queue'],
    ['กำลังประเมิน', ask(PROMISED), 'desk-working'],
    ['นัดเดิมปิดแล้ว', ask({ ...PROMISED, surveyVisit: visit({ status: 'done', actualDate: '2026-10-08', actualStartTime: '10:12:00', actualEndTime: '11:40:00' }) }), 'desk-working'],
    ['ส่งกลับค้าง', ask({ ...PROMISED, surveyVisit: visit({ status: 'done', actualEndTime: '11:40:00' }), surveySendBack: sendBack }), 'desk-working'],
    ['เลยวัน', ask({ ...PROMISED, committedDueDate: '2026-10-07', committedResultDate: '2026-10-07' }), 'desk-overdue'],
  ];
  for (const [name, request, stage] of shapes) {
    for (const [who, viewer] of VIEWERS) {
      const view = job(request, viewer);
      assert.equal(view.stage, stage, `${name} · ${who}`);
      assert.notEqual(view.stage, 'sent-back', `${name} · ${who}`);
      assert.equal(view.now.progress, null, `${name} · ${who}: ไม่มีมาตรวัด`);
      assert.doesNotMatch(JSON.stringify(nowBand(view)), /วัดแล้ว|ลงคิวเข้าพื้นที่|ผู้วางคิว/, `${name} · ${who}`);
    }
  }
});

test('แถบตอนนี้ · ใบลงหน้างาน: รอรับเรื่อง / รอลงคิว ยังเป็นชุดของวันนี้ทุกตัวอักษร', () => {
  const onsite = (over = {}) => ask({ surveyZones: zones(), ...over });
  assert.deepEqual(nowBand(job(onsite({ status: 'pending', acknowledgedAt: null, acknowledgedByName: null }))), {
    headline: 'รอ TS รับเรื่อง',
    sub: 'ส่งเมื่อ พฤ. 8 ต.ค. 14:50',
    next: 'TS รับเรื่อง แล้วลงคิววัน เวลา และเจ้าหน้าที่ที่จะไป',
    turn: { side: 'TS', who: 'ผู้วางคิว TS' },
  });
  assert.deepEqual(nowBand(job(onsite())), {
    headline: 'รอลงคิวเข้าพื้นที่',
    sub: 'รับเรื่องแล้วโดย Arnon Aunsapwilai · ผู้ขออยากให้เข้า อ. 13 ต.ค. 10:00',
    next: 'TS เลือกวัน เวลา และเจ้าหน้าที่ แล้วกด “ลงคิวเข้าพื้นที่”',
    turn: { side: 'TS', who: 'Arnon Aunsapwilai' },
  });
  // ใบผสมที่ยังไม่รับเรื่อง — ยังต้องมีนัด ⇒ ชุดของใบลงหน้างาน
  const mixedPending = job(ask({ status: 'pending', acknowledgedAt: null, surveyZones: mixedZones() }));
  assert.equal(mixedPending.now.next, 'TS รับเรื่อง แล้วลงคิววัน เวลา และเจ้าหน้าที่ที่จะไป');
});

/* ── 2) ใบผสม: ทุกขั้นของงานหน้างานอยู่ครบ ตัวนับต่อท้ายจำนวนพื้นที่จากแบบ ──────────────── */
test('⭐ ใบผสม · ขั้นของงานหน้างานเหมือนเดิม — ตัวนับเป็น "วัดแล้ว a / b พื้นที่ · จากแบบ k" (หัวหน้าเห็นว่าตัวเองเป็นคนกรอก)', () => {
  const measuring = ask({
    ...PROMISED,
    committedDueDate: '2026-10-09',
    surveyVisit: visit({ status: 'in_progress', scheduledDate: TODAY, actualDate: TODAY, actualStartTime: '10:12:00' }),
    surveyZones: mixedZones().map((z, i) => (i === 0 ? { ...z, spots: [{ id: 'a' }] } : z)),
    surveyFilesByZone: { z1: [{ docType: 'survey_wide' }, spotFile('a')] },
  });
  const sales = job(measuring, SALES);
  assert.equal(sales.stage, 'measuring');
  assert.equal(sales.now.headline, 'กำลังวัดหน้างาน — วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1');
  assert.deepEqual(sales.now.progress, { done: 1, total: 2, complete: false }, 'มาตรวัดนับเฉพาะพื้นที่ลงหน้างาน');
  assert.equal(sales.zones.progressText, 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1 · รวมตอนนี้ 78 ตร.ม. · 228 ลบ.ม.');
  assert.equal(sales.steps[3].lines[0].text, 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1 · ยังไม่ส่งงาน');
  assert.deepEqual(sales.steps.map((s) => s.label), ['ส่งคำร้อง', 'รับเรื่อง', 'ลงคิว / นัด', 'เข้าพื้นที่', 'ส่งผล', 'ปิดเรื่อง']);

  const head = job(measuring, HEAD);
  assert.equal(head.now.headline, 'กำลังวัดหน้างาน — วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1 (หัวหน้ากรอกเอง)');
  assert.equal(head.zones.crewGate.hidden, false);

  // ทั้งใบจากแบบ — ไม่มีอะไรให้ "วัด": ตัวนับของตารางบอกจำนวนพื้นที่จากแบบ
  assert.equal(job(ask(PROMISED)).zones.progressText, 'จากแบบ 3 พื้นที่ · รวมตอนนี้ 78 ตร.ม. · 228 ลบ.ม.');
  assert.deepEqual(job(ask(PROMISED)).zones.measured, { done: 0, total: 0 });
});

/* ── 3) ราง ────────────────────────────────────────────────────────────────────── */
const DESK_LABELS = ['ส่งคำร้อง', 'รับเรื่อง', 'รับปากวันส่งผล', 'ประเมินจากแบบ', 'ส่งผล', 'ปิดเรื่อง'];
const STEP_IDS = ['draft', 'pending', 'commitDue', 'acknowledged', 'answered', 'closed'];
const DESK_SHAPES = {
  'ร่าง': { status: 'draft', submittedAt: null, acknowledgedAt: null },
  'รอรับเรื่อง': { status: 'pending', acknowledgedAt: null },
  'รอแจ้งวันส่งผล': {},
  'กำลังประเมิน': PROMISED,
  'กำลังประเมิน · นัดเดิมถูกยกเลิก': { ...PROMISED, surveyVisit: visit({ status: 'cancelled' }) },
  'กำลังประเมิน · นัดเดิมเข้าไม่ได้': { ...PROMISED, surveyVisit: visit({ status: 'unable', unableReason: 'ไซต์ยังก่อสร้าง' }) },
  'กำลังประเมิน · ช่างเคยเข้าแล้ว': { ...PROMISED, surveyVisit: visit({ status: 'done', actualDate: '2026-10-08', actualStartTime: '10:12:00', actualEndTime: '11:40:00' }) },
  'ส่งผลแล้ว': SENT,
  'ส่งผลแล้ว · นัดเดิมถูกยกเลิก': { ...SENT, surveyVisit: visit({ status: 'cancelled' }) },
  'ปิดครบ': { ...SENT, status: 'closed', closedAt: '2026-10-15T03:00:00Z' },
  'ปิดโดยไม่ได้ประเมิน': { status: 'closed', closedAt: '2026-10-15T03:00:00Z' },
  'ยกเลิก': { status: 'cancelled', cancelledAt: '2026-10-09T03:00:00Z' },
};

test('⭐ ราง · งานโต๊ะ: ชื่อขั้นหกขั้นของงานโต๊ะ — รหัสขั้นและลำดับเท่าเดิม · ไม่มีขั้นไหนเขียน "ไม่เคยลงคิว" / "ไม่ได้เข้าพื้นที่"', () => {
  for (const [name, over] of Object.entries(DESK_SHAPES)) {
    for (const [who, viewer] of VIEWERS) {
      const view = job(ask(over), viewer);
      const at = `${name} · ${who}`;
      assert.deepEqual(view.steps.map((s) => s.label), DESK_LABELS, at);
      assert.deepEqual(view.steps.map((s) => s.id), STEP_IDS, at);
      assert.deepEqual(view.steps.map((s) => s.number), [1, 2, 3, 4, 5, 6], at);
      for (const step of view.steps) {
        assert.notEqual(step.when, 'ไม่เคยลงคิว', `${at} · ${step.id}`);
        assert.notEqual(step.when, 'ไม่ได้เข้าพื้นที่', `${at} · ${step.id}`);
        // ไม่มีบรรทัดไหนของขั้นบอกว่า "ไม่ได้เข้าพื้นที่" — พื้นที่จากแบบอาจมาหลังการเข้าพื้นที่จริงก็ได้ (แผน §3.1)
        for (const line of step.lines) assert.doesNotMatch(line.text, /ไม่ได้เข้าพื้นที่/, `${at} · ${step.id}`);
      }
      if (view.current) assert.equal(view.now.step, `ตอนนี้ · ${view.current.label}`, at);
    }
  }
  assert.equal(job(ask()).now.step, 'ตอนนี้ · รับปากวันส่งผล');
  assert.equal(job(ask(PROMISED)).now.step, 'ตอนนี้ · ประเมินจากแบบ');
  assert.equal(DESK_LABELS[3], SURVEY_METHOD_LABEL.drawing, 'ชื่อขั้นกลางคือคำกลางของฟีเจอร์');
});

test('⭐ ราง · งานโต๊ะ: สองขั้นกลางไม่เล่าเรื่องนัด — ขั้น 3 เหลือเวลาที่รับปาก · ขั้น 4 ว่าง · นัดเดิมยังอยู่ที่คีย์ visit', () => {
  for (const [name, over] of Object.entries(DESK_SHAPES)) {
    const view = job(ask(over));
    const [promise, assess] = [view.steps[2], view.steps[3]];
    const promised = !!over.committedResultDate;
    assert.equal(promise.when, promised ? 'พฤ. 8 ต.ค. 16:00' : '', name);
    assert.deepEqual([promise.people, promise.lines, promise.visitLink, promise.badge], [[], [], null, undefined], name);
    assert.deepEqual([assess.when, assess.people, assess.lines, assess.badge], ['', [], [], undefined], name);
    // ไม่มีคำของงานหน้างานหลุดมาใต้ชื่อขั้นของงานโต๊ะ — "ประเมินจากแบบ — ยกเลิก" คือประโยคที่ไม่มีใครตั้งใจพูด
    assert.doesNotMatch(JSON.stringify([promise, assess]), /ลงคิว|นัด|SV-26100011|Phuwadol|ยกเลิก|เข้าแล้ว|ทำไม่ได้/, name);
  }
  // ใบเก่าที่มีวันส่งผลแต่ไม่มีเวลาประทับ — ว่าง ไม่ใช่ "Invalid Date"
  assert.equal(job(ask({ ...PROMISED, dueCommittedAt: null })).steps[2].when, '');
  // นัดเดิมไม่ได้หายจากผลลัพธ์ — จอยังหยิบไปวาดได้
  const cancelled = job(ask({ ...PROMISED, surveyVisit: visit({ status: 'cancelled' }) }));
  assert.deepEqual([cancelled.visit.code, cancelled.visit.statusLabel], ['SV-26100011', 'ยกเลิก']);
  const stray = job(ask({ ...PROMISED, surveyVisit: visit() }));
  assert.equal(stray.now.visitCode, 'SV-26100011', 'นัดที่ยังเปิดค้างยังกดไปหาได้จากแถบตอนนี้');

  // ขั้นแรก: งานโต๊ะไม่มีวันเข้าพื้นที่ — เหลือวันที่ต้องการผล · ใบลงหน้างานได้บรรทัดเดิม
  assert.deepEqual(job(ask()).steps[0].lines, [{ text: 'ขอผล พฤ. 15 ต.ค.', tone: null }]);
  assert.deepEqual(job(ask({ surveyZones: zones() })).steps[0].lines, [{ text: 'ขอเข้า อ. 13 ต.ค. 10:00 · ขอผล พฤ. 15 ต.ค.', tone: null }]);
});

test('⭐ ราง · งานโต๊ะ: ขั้นที่เกิดจริงไม่ถูกติ๊ก "ข้าม" เพราะไม่มีนัด — รับปากแล้ว = ผ่านขั้น 3 · ส่งผลแล้ว = ผ่านขั้น 4', () => {
  const states = (over, base = ask) => job(base(over)).steps.map((s) => s.state);
  assert.deepEqual(states(DESK_SHAPES['ร่าง']), ['current', 'pending', 'pending', 'pending', 'pending', 'pending']);
  assert.deepEqual(states(DESK_SHAPES['รอรับเรื่อง']), ['done', 'current', 'pending', 'pending', 'pending', 'pending']);
  assert.deepEqual(states({}), ['done', 'done', 'current', 'pending', 'pending', 'pending']);
  assert.deepEqual(states(PROMISED), ['done', 'done', 'done', 'current', 'pending', 'pending']);
  assert.deepEqual(states(SENT), ['done', 'done', 'done', 'done', 'done', 'current']);
  assert.deepEqual(states(DESK_SHAPES['ปิดครบ']), ['done', 'done', 'done', 'done', 'done', 'done']);
  // นัดเดิมจะอยู่สถานะไหนก็ไม่เปลี่ยนคำตอบ — ใบนี้ไม่ได้เดินตามนัดแล้ว
  for (const status of ['draft', 'scheduled', 'in_progress', 'done', 'unable', 'cancelled']) {
    assert.deepEqual(states({ ...PROMISED, surveyVisit: visit({ status }) }), states(PROMISED), status);
    assert.deepEqual(states({ ...SENT, surveyVisit: visit({ status }) }), states(SENT), status);
  }
  // ขั้นที่ไม่เคยเกิดยัง "ข้าม" ตามเดิม: ส่งผลโดยไม่เคยรับปากวัน · ปิดใบโดยไม่ได้ประเมิน (รับปากไว้ก่อนหรือไม่ก็ตาม)
  const neverPromised = { status: 'answered', answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai' };
  assert.deepEqual(states(neverPromised), ['done', 'done', 'skipped', 'done', 'done', 'current']);
  assert.equal(job(ask(neverPromised)).steps[2].when, '');
  assert.deepEqual(states(DESK_SHAPES['ปิดโดยไม่ได้ประเมิน']), ['done', 'done', 'skipped', 'skipped', 'skipped', 'done']);
  assert.deepEqual(states({ ...PROMISED, status: 'closed', closedAt: '2026-10-15T03:00:00Z' }), ['done', 'done', 'done', 'skipped', 'skipped', 'done']);
  assert.deepEqual(states(DESK_SHAPES['ยกเลิก']), ['done', 'done', 'pending', 'pending', 'pending', 'cancelled']);

  // ใบลงหน้างานทรงเดียวกัน (ไม่มีนัด) — "ข้าม" เพราะไม่เคยลงคิว / ไม่เคยเข้าพื้นที่ เหมือนเดิม
  const onsite = (over) => ask({ surveyZones: zones(), ...over });
  assert.deepEqual(states(PROMISED, onsite), ['done', 'done', 'current', 'pending', 'pending', 'pending']);
  assert.deepEqual(states(SENT, onsite), ['done', 'done', 'skipped', 'skipped', 'done', 'current']);
  assert.deepEqual(states({ ...SENT, surveyVisit: visit({ status: 'done' }) }, onsite), ['done', 'done', 'done', 'done', 'done', 'current']);
});

test('ราง · ใบลงหน้างาน: ชื่อขั้นของวันนี้ และขั้นที่ไม่เคยเกิดยังเขียน "ไม่เคยลงคิว" / "ไม่ได้เข้าพื้นที่" ตามเดิม', () => {
  const onsite = (over = {}) => ask({ surveyZones: zones(), ...over });
  const today = ['ส่งคำร้อง', 'รับเรื่อง', 'ลงคิว / นัด', 'เข้าพื้นที่', 'ส่งผล', 'ปิดเรื่อง'];
  for (const [name, over] of Object.entries(DESK_SHAPES)) {
    assert.deepEqual(job(onsite(over)).steps.map((s) => s.label), today, name);
  }
  assert.deepEqual(job(ask({ surveyZones: mixedZones() })).steps.map((s) => s.label), today, 'ใบผสมยังต้องมีนัด');

  const queue = job(onsite());
  assert.equal(queue.steps[2].when, 'รอ TS ลงคิว');
  assert.deepEqual(queue.steps[2].lines, [{ text: 'เลือกวัน เวลา และเจ้าหน้าที่ที่จะไป', tone: null }]);
  assert.equal(queue.steps[3].when, 'หลังลงคิว');

  // ใบที่ปิดโดยไม่เคยลงคิว — สองขั้นกลางเป็น "ข้าม" พร้อมคำบอกเหตุของวันนี้
  const closed = job(onsite({ status: 'closed', closedAt: '2026-10-15T03:00:00Z' }));
  assert.deepEqual(closed.steps.map((s) => [s.state, s.when]).slice(2, 4), [['skipped', 'ไม่เคยลงคิว'], ['skipped', 'ไม่ได้เข้าพื้นที่']]);
  // งานโต๊ะทรงเดียวกัน — ข้ามเหมือนกัน แต่ไม่มีคำบอกเหตุ
  const deskClosed = job(ask({ status: 'closed', closedAt: '2026-10-15T03:00:00Z' }));
  assert.deepEqual(deskClosed.steps.map((s) => [s.state, s.when]).slice(2, 4), [['skipped', ''], ['skipped', '']]);

  // นัดที่ยกเลิกของใบลงหน้างานยังบอกว่าไม่ได้เข้าพื้นที่
  const dead = job(onsite({ surveyVisit: visit({ status: 'cancelled' }) }));
  assert.equal(dead.steps[3].lines[0].text, 'ไม่ได้เข้าพื้นที่');
});

/* ── 4) แถวพื้นที่ ──────────────────────────────────────────────────────────────── */
test('⭐ แถวพื้นที่ · วิธี · ชิป "จากแบบ" เฉพาะแถวจากแบบ · ช่องรูป "แบบ n" · พื้นที่ที่เพิ่ม: "เพิ่มโดย TS" / "เพิ่มหน้างาน"', () => {
  const rows = [
    ...mixedZones(),
    { id: 'z4', zoneName: 'ห้องเก็บของ', status: 'added', ...DRAWING, parts: [], spots: [] },
    { id: 'z5', zoneName: 'ทางเดิน ชั้น 2', status: 'added', parts: [], spots: [] },
    { id: 'z6', zoneName: 'ห้องครัว', status: 'cut', cutReason: 'ลูกค้าไม่เอาแล้ว', ...DRAWING, parts: [], spots: [] },
  ];
  const files = {
    z1: [{ docType: 'survey_wide' }, { docType: 'survey_plan' }],
    z3: [{ docType: 'survey_plan' }, { docType: 'survey_plan' }],
    z6: [{ docType: 'survey_plan' }],
  };
  for (const [who, viewer] of VIEWERS) {
    const view = job(ask({ surveyVisit: visit(), surveyZones: rows, surveyFilesByZone: files }), viewer);
    assert.deepEqual(view.zones.rows.map((r) => [r.id, r.method, r.chip, r.photosText, r.addedLabel]), [
      ['z1', 'onsite', null, null, null],
      ['z2', 'onsite', null, null, null],
      ['z3', 'drawing', 'จากแบบ', 'แบบ 2', null],
      ['z4', 'drawing', 'จากแบบ', 'แบบ 0', 'เพิ่มโดย TS'],
      ['z5', 'onsite', null, null, 'เพิ่มหน้างาน'],
      // แถวที่ถูกตัดไม่มีช่องรูปของตัวเอง — จอเขียนขีดตามเดิม
      ['z6', 'drawing', 'จากแบบ', null, null],
    ], who);
    assert.equal(view.zones.rows[2].chip, SURVEY_METHOD_CHIP.drawing, who);
    // คีย์เดิมของแถวยังอยู่ครบ
    assert.deepEqual(view.zones.rows.map((r) => r.added), [false, false, false, true, true, false], who);
    assert.equal(view.zones.rows[2].photosPlan, 2, who);
    // พื้นที่จากแบบไม่ใช่งานของช่าง — ไม่มีป้าย "ครบฝั่งช่าง" / "ยังไม่วัด" และไม่มีบรรทัด "ขาด: …" ของช่าง
    assert.deepEqual(view.zones.rows.map((r) => r.state?.label ?? null), ['ยังไม่ครบ', 'ยังไม่ครบ', null, null, 'ยังไม่วัด', 'ตัดออก'], who);
    assert.equal(view.zones.rows[2].missingText, null, who);
  }
});

test('แถวพื้นที่ · อ่านรูปไม่สำเร็จ = ไม่เดาว่า "แบบ 0" · ใบลงหน้างานได้ค่าว่างของคีย์ใหม่ทุกแถว', () => {
  const unknown = job(ask({ surveyUnknown: { files: true } }));
  assert.deepEqual(unknown.zones.rows.map((r) => [r.chip, r.photosText, r.photosPlan]), [
    ['จากแบบ', null, null], ['จากแบบ', null, null], ['จากแบบ', null, null],
  ]);
  for (const way of [{}, { method: 'onsite' }, { method: null }]) {
    const view = job(ask({ surveyZones: zones(way), surveyVisit: visit() }));
    assert.deepEqual(view.zones.rows.map((r) => [r.method, r.chip, r.photosText, r.addedLabel]), [
      ['onsite', null, null, null], ['onsite', null, null, null], ['onsite', null, null, null],
    ]);
  }
});

/* ── 5) แถบแจ้งเหนือตารางผล ──────────────────────────────────────────────────────── */
const NEEDED_TEXT = 'มี 3 พื้นที่ที่ประเมินจากแบบ — ใช้ตัวเลขเสนอราคาได้เลย · เมื่อพื้นที่พร้อม กด “ขอยืนยันหน้างาน” เพื่อให้ TS เข้าวัดจริง';
const NOT_NEEDED_TEXT = 'มี 3 พื้นที่ที่ประเมินจากแบบ — TS แจ้งว่าไม่ต้องยืนยันหน้างาน ใช้ผลนี้เป็นผลสุดท้าย';

test('⭐ แถบแจ้ง · ใบที่ส่งผลแล้วและมีพื้นที่จากแบบ: ต้องยืนยัน = ประโยค + ปุ่ม (ยังกดไม่ได้จนถึงงวด S5) · ไม่ต้องยืนยัน = ประโยคล้วน', () => {
  for (const [who, viewer] of VIEWERS) {
    assert.deepEqual(job(ask({ ...SENT, surveyConfirm: 'needed' }), viewer).zones.drawingBanner, {
      text: NEEDED_TEXT,
      action: { label: 'ขอยืนยันหน้างาน', ready: false },
    }, who);
    assert.deepEqual(job(ask({ ...SENT, surveyConfirm: 'not_needed' }), viewer).zones.drawingBanner, {
      text: NOT_NEEDED_TEXT,
      action: null,
    }, who);
    // ข้อมูลเก่า / ยังไม่เลือก / ค่าที่ไม่รู้จัก = ไม่มีแถบ (ไม่เดาว่าต้องยืนยัน)
    for (const surveyConfirm of [null, undefined, '', 'NEEDED', 'yes']) {
      assert.equal(job(ask({ ...SENT, surveyConfirm }), viewer).zones.drawingBanner, null, `${who} · ${String(surveyConfirm)}`);
    }
    // ยังไม่ส่งผล = ไม่มีแถบ แม้หัวหน้าเลือกไว้แล้ว
    assert.equal(job(ask({ ...PROMISED, surveyConfirm: 'needed' }), viewer).zones.drawingBanner, null, who);
    assert.equal(job(ask({ surveyConfirm: 'not_needed' }), viewer).zones.drawingBanner, null, who);
    // ปิดครบแล้วยังเห็น (ผลยังเป็นผลจากแบบ) · ยกเลิกแล้วไม่มี
    assert.equal(job(ask({ ...SENT, status: 'closed', closedAt: '2026-10-15T03:00:00Z', surveyConfirm: 'not_needed' }), viewer).zones.drawingBanner.text, NOT_NEEDED_TEXT, who);
    assert.equal(job(ask({ ...SENT, status: 'cancelled', cancelledAt: '2026-10-15T03:00:00Z', surveyConfirm: 'needed' }), viewer).zones.drawingBanner, null, who);
  }
});

test('แถบแจ้ง · ใบผสมนับเฉพาะพื้นที่จากแบบที่ยังใช้อยู่ · ใบลงหน้างานไม่มีแถบ · ไม่มีประโยคไหนพูดว่า "ไม่ได้เข้าพื้นที่"', () => {
  const mixedSent = (over = {}) => ask({
    ...SENT, surveyConfirm: 'needed', surveyVisit: visit({ status: 'done', actualEndTime: '11:40:00' }), surveyZones: mixedZones(), ...over,
  });
  assert.match(job(mixedSent()).zones.drawingBanner.text, /^มี 1 พื้นที่ที่ประเมินจากแบบ — /);
  // พื้นที่จากแบบที่ถูกตัดไม่นับ — ตัดจนไม่เหลือ = ไม่มีแถบ
  const drawingCut = mixedZones().map((z, i) => (i === 2 ? { ...z, status: 'cut', cutReason: 'ลูกค้าไม่เอาแล้ว' } : z));
  assert.equal(job(mixedSent({ surveyZones: drawingCut })).zones.drawingBanner, null);
  const twoOfThree = zones(DRAWING).map((z, i) => (i === 0 ? { ...z, status: 'cut', cutReason: 'ลูกค้าไม่เอาแล้ว' } : z));
  assert.match(job(ask({ ...SENT, surveyConfirm: 'not_needed', surveyZones: twoOfThree })).zones.drawingBanner.text, /^มี 2 พื้นที่/);

  for (const surveyConfirm of ['needed', 'not_needed', null]) {
    assert.equal(job(ask({ ...SENT, surveyConfirm, surveyZones: zones() })).zones.drawingBanner, null, String(surveyConfirm));
  }
  assert.doesNotMatch(NEEDED_TEXT + NOT_NEEDED_TEXT, /ไม่ได้เข้าพื้นที่/);
  assert.doesNotMatch(everyText(job(ask({ ...SENT, surveyConfirm: 'needed' }))), /ไม่ได้เข้าพื้นที่/);
  // ชื่อฝ่ายมาจากใบ
  assert.match(job(ask({ ...SENT, dept: 'SV', surveyConfirm: 'needed' })).zones.drawingBanner.text, /เพื่อให้ SV เข้าวัดจริง$/);
});

/* ── 6) การ์ดด่านสองฝั่ง ────────────────────────────────────────────────────────── */
test('⭐ การ์ดด่าน · ใบจากแบบทั้งใบ: การ์ดของช่างซ่อนได้ (ไม่มีพื้นที่ของช่าง) · การ์ดของหัวหน้าไม่รอ "ช่างส่งงาน"', () => {
  for (const [who, viewer] of VIEWERS) {
    const desk = job(ask(PROMISED), viewer);
    assert.equal(desk.zones.crewGate.hidden, true, who);
    assert.equal(desk.zones.crewGate.hasActive, false, who);
    assert.deepEqual(desk.zones.crewGate.badge, { label: 'ไม่มีพื้นที่', tone: 'neutral' }, who);
    assert.equal(desk.zones.crewGate.text, '', who);
    assert.deepEqual(desk.zones.headGate.badge, { label: 'รอเคาะ', tone: 'info' }, who);
    assert.equal(desk.zones.headGate.text, 'ขนาด 2/3 · ภาพแบบ 0/3 · แพ็คเกจ 0/3', who);
    assert.doesNotMatch(desk.zones.headGate.text, /ช่างส่งงาน/, who);
    // ตัวเลขของแถบตอนนี้กับการ์ดของหัวหน้ามาจากด่านเดียวกัน
    assert.match(desk.now.sub, /กรอกขนาดจากแบบแล้ว 2 \/ 3 พื้นที่$/, who);
  }
});

test('การ์ดด่าน · ใบลงหน้างานและใบผสม: การ์ดของช่างไม่ซ่อน · การ์ดของหัวหน้ายังรอช่างส่งงานตามเดิม', () => {
  const onsite = job(ask({ surveyZones: zones(), surveyVisit: visit() }));
  assert.equal(onsite.zones.crewGate.hidden, false);
  assert.deepEqual(onsite.zones.headGate.badge, { label: 'ยังไม่เริ่ม', tone: 'neutral' });
  assert.equal(onsite.zones.headGate.text, 'เริ่มได้เมื่อช่างส่งงาน');

  const mixed = job(ask({ surveyZones: mixedZones(), surveyVisit: visit() }));
  assert.equal(mixed.zones.crewGate.hidden, false);
  assert.equal(mixed.zones.crewGate.hasActive, true);
  assert.equal(mixed.zones.headGate.text, 'เริ่มได้เมื่อช่างส่งงาน');

  // ตัดออกหมดทั้งใบ (ทุกแถวจากแบบ) ไม่ใช่ "ใบจากแบบทั้งใบ" — การ์ดของช่างยังอยู่และเขียน "ไม่มีพื้นที่" เหมือนใบที่ตัดหมดของวันนี้
  const allCut = job(ask({ surveyZones: zones({ ...DRAWING, status: 'cut', cutReason: 'ลูกค้าไม่เอาแล้ว' }) }));
  assert.equal(allCut.stage, 'no-zones');
  assert.equal(allCut.zones.crewGate.hidden, false);
});

/* ── 7) โมดัล "รับปากวันส่งผล" ─────────────────────────────────────────────────────── */
const survey = {
  id: 'DR-1', docNo: 'RQ-AS-26100312', kind: 'site_survey', dept: 'TS', siteId: 'SVS-1',
  status: 'acknowledged', acknowledgedAt: '2026-10-08T02:00:00.000Z', requestedByName: 'Lalida Chaiwanna',
  requestedDueDate: '2026-10-13', requestedDueTime: '10:00', requestedResultDate: '2026-10-15',
  committedDueDate: null, committedDueTime: null, committedResultDate: null, assigneeId: null,
};
const desk = { ...survey, surveyNeedsVisit: false };
const technicians = [{ id: 'U1', name: 'สมชาย ใจดี' }];
const PLANNER_NOTE = 'ใบนี้ประเมินจากแบบ — หัวหน้าฝ่ายบริการเป็นผู้รับและส่งผล ไม่ต้องลงคิว';

test('⭐ โหมดของโมดัล · ใบประเมินที่ธง surveyNeedsVisit เป็น false ตรงตัว = desk · นอกนั้นค่าของวันนี้', () => {
  assert.equal(commitDueMode(desk), 'desk');
  for (const flag of [true, undefined, null, 0, '', 'false']) {
    assert.equal(commitDueMode({ ...survey, surveyNeedsVisit: flag }), 'site', String(flag));
  }
  assert.equal(commitDueMode(survey), 'site');
  // ธงนี้ติดมาเฉพาะใบประเมิน — หัวข้ออื่นถือมาก็ไม่กลายเป็นงานโต๊ะ
  assert.equal(commitDueMode({ kind: 'formula_dev', dept: 'RD', surveyNeedsVisit: false }), 'date');
  assert.equal(commitDueMode(null), 'date');
});

test('⭐ ป้ายของโมดัล · งานโต๊ะ: "รับปากวันส่งผล" ทั้งปุ่ม หัว และ toast — ไม่มีคำไหนพูดเรื่องลงคิวหรือนัด', () => {
  assert.deepEqual(commitDueLabels(desk), {
    action: 'รับปากวันส่งผล',
    hint: undefined,
    title: 'รับปากวันส่งผลประเมิน (จากแบบ)',
    submit: 'รับปากวันส่งผล',
    okMsg: 'รับปากวันส่งผลแล้ว — ฝ่ายขายเห็นวันส่งผลนี้',
    dateLabel: 'วันที่จะส่งผลประเมิน',
    dateHint: '',
    resultLabel: 'วันที่จะส่งผลประเมิน',
    resultHint: '',
    noteLabel: 'หมายเหตุถึงฝ่ายขาย',
    notePlaceholder: '',
    wish: 'ผู้ขอต้องการผล พฤ. 15 ต.ค.',
    plannerNote: PLANNER_NOTE,
  });
  assert.equal(commitDueLabels(desk).dateLabel, SURVEY_METHOD_RESULT_DATE_LABEL);
  assert.equal(commitDueLabels({ ...desk, requestedResultDate: null }).wish, null, 'ผู้ขอไม่ระบุ = ไม่มีชิป');
  // ใบงานโต๊ะไม่มี "ลงคิวใหม่" — ธง requeue ที่ผู้เรียกพกมาไม่เปลี่ยนป้าย
  assert.deepEqual(commitDueLabels(desk, { requeue: true }), commitDueLabels(desk));
  for (const [key, text] of Object.entries(commitDueLabels(desk))) {
    if (typeof text === 'string' && key !== 'plannerNote') assert.doesNotMatch(text, /ลงคิว|นัด|เจ้าหน้าที่/, key);
  }
});

test('ป้ายของโมดัล · โหมดอื่นได้คีย์ใหม่สองตัวเป็นค่าว่าง และไม่มี noteLabel — ที่เหลือเท่าเดิม', () => {
  const rd = { id: 'DR-2', docNo: 'RQ-26090002', kind: 'formula_dev', dept: 'RD', status: 'acknowledged', requestedDueDate: '2026-10-01', committedDueDate: null, items: [] };
  for (const request of [survey, { ...survey, surveyNeedsVisit: true }, rd]) {
    const labels = commitDueLabels(request);
    assert.equal(labels.wish, null);
    assert.equal(labels.plannerNote, null);
    assert.equal('noteLabel' in labels, false);
  }
  assert.equal(commitDueLabels(survey).action, 'ลงคิวเข้าพื้นที่');
  assert.equal(commitDueLabels(survey).okMsg, 'ลงคิวแล้ว — นัดขึ้นตารางเจ้าหน้าที่เรียบร้อย');
});

test('⭐ ค่าตั้งต้น · ก้อนที่ส่ง · ด่านของงานโต๊ะ — วันเดียวคือวันส่งผล ไม่มีช่าง ไม่มีเวลา', () => {
  assert.deepEqual(commitDueDefaults(desk, { today: TODAY }), {
    date: '2026-10-15', time: '', resultDate: '2026-10-15', assigneeId: '', reason: '',
  });
  // ของเดิมบนใบมาก่อนวันที่ผู้ขอต้องการ · ไม่มีทั้งคู่ = ว่าง (ไม่ตั้งต้นเป็นวันนี้ — วันส่งผลต้องเป็นคำสัญญาที่คนเลือกเอง)
  assert.deepEqual(commitDueDefaults({ ...desk, committedResultDate: '2026-10-20', assigneeId: 'U9' }, { today: TODAY }), {
    date: '2026-10-20', time: '', resultDate: '2026-10-20', assigneeId: '', reason: '',
  });
  assert.deepEqual(commitDueDefaults({ ...desk, requestedResultDate: null }, { today: TODAY, requeue: true }), {
    date: '', time: '', resultDate: '', assigneeId: '', reason: '',
  });

  const form = { date: '2026-10-16', time: '09:00', resultDate: '2026-10-20', assigneeId: 'U1', reason: 'รอแบบชั้น 3' };
  assert.deepEqual(commitDuePayload(desk, form, { technicians }), {
    action: 'commit-due', committedResultDate: '2026-10-16', reason: 'รอแบบชั้น 3',
  });

  // ข้อความเดียวกับที่ route ตอบ (`surveyDeskResultDate`) — โมดัลกับ server เพี้ยนจากกันไม่ได้
  assert.deepEqual(commitDueGaps(desk, { date: '' }), [surveyDeskResultDate({ committedResultDate: '' }).error]);
  assert.deepEqual(commitDueGaps(desk, { date: '' }), ['ต้องระบุวันที่จะส่งผลประเมิน']);
  assert.deepEqual(commitDueGaps(desk, { date: '16/10/2026' }), ['วันที่จะส่งผลประเมินไม่ถูกต้อง']);
  assert.deepEqual(commitDueGaps(desk, { date: '2026-10-16' }), []);
  // ไม่ถามช่าง · เวลา · สถานที่ · ลำดับวันนัด — ใบนี้ไม่มีนัด (วันส่งผลก่อนวันที่ขอเข้าก็ได้)
  assert.deepEqual(commitDueGaps({ ...desk, siteId: null }, { date: '2026-10-10', time: '25:99', assigneeId: '' }), []);
  assert.deepEqual(commitDueGaps(desk, { date: '', reason: 'ก'.repeat(501) }), ['ต้องระบุวันที่จะส่งผลประเมิน', 'เหตุผลยาวเกิน 500 ตัวอักษร']);
  assert.equal(commitDueBlocker(desk, { date: '' }), 'ต้องระบุวันที่จะส่งผลประเมิน');
  assert.equal(commitDueBlocker(desk, { date: '2026-10-16' }), '');
});

test('⭐ บรรทัดผลลัพธ์ของงานโต๊ะ — ประโยคเดียว บอกว่าไม่ลงคิว ใครรับผิดชอบ ใครเห็น · ไม่มีแผงงาน ไม่มีชิปวันนัด', () => {
  assert.deepEqual(commitDueOutcome(desk, { date: '2026-10-16' }, { viewerName: 'Arnon Aunsapwilai', technicians }), {
    tone: 'info', lands: null,
    text: 'ใบนี้ไม่ลงคิว ไม่มีนัดบนตารางเจ้าหน้าที่ · ผู้รับผิดชอบ = Arnon Aunsapwilai · ฝ่ายขายจะเห็นวันส่งผลนี้',
  });
  assert.equal(commitDueOutcome(desk, { date: '2026-10-16' }).text,
    'ใบนี้ไม่ลงคิว ไม่มีนัดบนตารางเจ้าหน้าที่ · ผู้รับผิดชอบ = คุณ · ฝ่ายขายจะเห็นวันส่งผลนี้');
  // ยังขาดช่อง — บอกช่องที่ขาดด้วยคำเดียวกับปุ่ม ไม่มี "ยังลงคิวไม่ได้"
  assert.deepEqual(commitDueOutcome(desk, { date: '' }, { viewerName: 'Arnon Aunsapwilai' }), {
    tone: 'warn', lands: null, text: 'ต้องระบุวันที่จะส่งผลประเมิน',
  });

  assert.deepEqual(commitDueWishes(desk, { date: '2026-10-16' }), { visit: null, result: null });
  assert.deepEqual(commitDueJobRows(desk, { todayIso: TODAY }), []);
  assert.deepEqual(commitDueHeader(desk, { site: { code: 'ST-1', name: 'สำนักงานใหญ่' } }), {
    title: 'รับปากวันส่งผลประเมิน (จากแบบ)',
    kind: null,
    status: null,
    origin: 'RQ-AS-26100312 · ผู้ขอ Lalida Chaiwanna',
    context: null,
  });
});

test('🔴 ใบที่ไม่มีธง (หรือธงเป็น true) = ผลของวันนี้ทุกฟังก์ชัน — เทียบทั้งก้อน', () => {
  const form = { date: '2026-10-13', time: '10:00', resultDate: '2026-10-15', assigneeId: 'U1', reason: 'นัดผู้จัดการไซต์' };
  const site = { id: 'SVS-1', code: 'ST-1', name: 'สำนักงานใหญ่', customerName: 'บริษัท ก' };
  const all = (request) => ({
    mode: commitDueMode(request),
    labels: commitDueLabels(request),
    again: commitDueLabels(request, { requeue: true }),
    defaults: commitDueDefaults(request, { today: TODAY }),
    payload: commitDuePayload(request, form, { technicians }),
    gaps: commitDueGaps(request, {}),
    gapsOk: commitDueGaps(request, form),
    header: commitDueHeader(request, { site }),
    rows: commitDueJobRows(request, { site, todayIso: TODAY }),
    wishes: commitDueWishes(request, form),
    outcome: commitDueOutcome(request, form, { site, technicians, viewerName: 'Arnon Aunsapwilai' }),
  });
  const base = all(survey);
  assert.equal(base.mode, 'site');
  assert.deepEqual(all({ ...survey, surveyNeedsVisit: true }), base);
  assert.deepEqual(all({ ...survey, surveyNeedsVisit: undefined }), base);
  // ค่าที่ตรึงไว้ของวันนี้ (ชุดเต็มอยู่ที่ commitDue.test.mjs) — ตัวเลือก viewerName ไม่รั่วเข้าบรรทัดผลลัพธ์ของการลงคิว
  assert.deepEqual(base.payload, {
    action: 'commit-due', committedDueDate: '2026-10-13', reason: 'นัดผู้จัดการไซต์',
    committedDueTime: '10:00', committedResultDate: '2026-10-15', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี',
  });
  assert.equal(base.outcome.text, 'จะขึ้นตารางของ สมชาย ใจดี · อ. 13 ต.ค. 10:00 · ส่งผลภายใน พฤ. 15 ต.ค.');
  assert.deepEqual(base.gaps, ['ต้องระบุวันนัดเข้าพื้นที่', 'ต้องเลือกเจ้าหน้าที่ผู้รับผิดชอบ', 'ต้องระบุวันที่จะส่งผลประเมิน']);
});

/* ── 8) "เลื่อนวันส่งผล" ─────────────────────────────────────────────────────────── */
test('⭐ เลื่อนวันส่งผล · หัว ช่อง ก้อนที่ส่ง และด่าน — เหตุผลบังคับ · วันเดิมไม่นับเป็นการเลื่อน', () => {
  const held = { ...desk, committedDueDate: '2026-10-15', committedResultDate: '2026-10-15' };
  assert.deepEqual(deskRescheduleView(held, { date: '2026-10-20', reason: 'ฝ่ายขายส่งแบบชั้น 3 ช้า' }), {
    title: 'เลื่อนวันส่งผล',
    dateLabel: 'วันที่จะส่งผลประเมิน',
    reasonRequired: true,
    gaps: [],
    payload: { action: 'reschedule', committedResultDate: '2026-10-20', reason: 'ฝ่ายขายส่งแบบชั้น 3 ช้า' },
  });
  const gaps = (form, request = held) => deskRescheduleView(request, form).gaps;
  assert.deepEqual(gaps({ date: '', reason: '' }), ['ต้องระบุวันที่จะส่งผลประเมิน', SURVEY_DESK_RESCHEDULE_REASON_ERROR]);
  assert.deepEqual(gaps({ date: '20/10/2026', reason: 'เหตุผล' }), ['วันที่จะส่งผลประเมินไม่ถูกต้อง']);
  assert.deepEqual(gaps({ date: '2026-10-15', reason: 'เหตุผล' }), ['วันเดิมกับที่แจ้งไว้แล้ว']);
  assert.deepEqual(gaps({ date: '2026-10-20', reason: '   ' }), ['ต้องบอกเหตุผลที่เลื่อนวันส่งผล']);
  assert.deepEqual(gaps({ date: '2026-10-20', reason: 'ก'.repeat(501) }), ['เหตุผลยาวเกิน 500 ตัวอักษร']);
  assert.deepEqual(gaps(undefined), ['ต้องระบุวันที่จะส่งผลประเมิน', 'ต้องบอกเหตุผลที่เลื่อนวันส่งผล']);
  // เลื่อนให้เร็วขึ้นได้ — ไม่มีวันนัดให้เทียบ
  assert.deepEqual(gaps({ date: '2026-10-10', reason: 'แบบครบแล้ว' }), []);
});

test('เลื่อนวันส่งผล · "วันเดิม" เทียบกับวันส่งผลที่รับปากไว้ ไม่ใช่วันนัดเก่า — ฐานเดียวกับด่านของ route', () => {
  /* ใบที่พลิกเป็นงานโต๊ะด้วยการตัดพื้นที่: `committedDueDate` ยังเป็นวันนัดเดิม ส่วนคำสัญญาคือ `committedResultDate` */
  const flipped = { ...desk, committedDueDate: '2026-10-13', committedResultDate: '2026-10-15' };
  const gaps = (date, request) => deskRescheduleView(request, { date, reason: 'เหตุผล' }).gaps;
  assert.deepEqual(gaps('2026-10-13', flipped), []);
  assert.deepEqual(gaps('2026-10-15', flipped), ['วันเดิมกับที่แจ้งไว้แล้ว']);
  // ใบเก่าที่ถือแต่วันนัด ไม่มีวันส่งผล — route เทียบกับวันนัดเดิม (ไม่มีอย่างอื่นให้เทียบ)
  const oldOnly = { ...desk, committedDueDate: '2026-10-13', committedResultDate: null };
  assert.deepEqual(gaps('2026-10-13', oldOnly), ['วันเดิมกับที่แจ้งไว้แล้ว']);
  assert.deepEqual(gaps('2026-10-15', oldOnly), []);

  // คำเดียวกับด่านกลาง (`rescheduleRequestError`) เมื่อถูกถามด้วยฐานที่ route ใช้
  for (const request of [flipped, oldOnly]) {
    const basis = request.committedResultDate ? { ...request, committedDueDate: request.committedResultDate } : request;
    for (const date of ['2026-10-13', '2026-10-15', '2026-10-20']) {
      const server = rescheduleRequestError(basis, { committedDueDate: date });
      assert.deepEqual(gaps(date, request), server ? [server] : [], `${date} · ${request.committedResultDate}`);
    }
  }
});

/* ── 9) หัวใบ ────────────────────────────────────────────────────────────────────── */
test('⭐ หัวใบ · งานโต๊ะ: ไม่มีสองช่องวันเข้าพื้นที่ เหลือคู่วันส่งผล ป้ายเดิม · ไม่มีธง / ธงเป็น true = รายการของวันนี้', () => {
  const NOW = new Date(2026, 9, 9, 9, 0, 0);
  const request = {
    kind: 'site_survey', dept: 'TS', requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-08T07:50:00Z',
    status: 'acknowledged', acknowledgedAt: '2026-10-08T08:12:00Z',
    requestedDueDate: '2026-10-13', committedDueDate: '2026-10-15',
    requestedResultDate: '2026-10-15', committedResultDate: '2026-10-15',
  };
  const today = requestHeaderFacts(request, { now: NOW });
  assert.deepEqual(today.map((f) => f.key), ['submitted', 'requestedDue', 'committedDue', 'requestedResultDue', 'committedResultDue']);
  assert.deepEqual(requestHeaderFacts({ ...request, surveyNeedsVisit: true }, { now: NOW }), today);
  assert.deepEqual(requestHeaderFacts({ ...request, surveyNeedsVisit: undefined }, { now: NOW }), today);

  const deskFacts = requestHeaderFacts({ ...request, surveyNeedsVisit: false }, { now: NOW });
  assert.deepEqual(deskFacts.map((f) => f.key), ['submitted', 'requestedResultDue', 'committedResultDue']);
  assert.equal(deskFacts.length, today.length - 2);
  // ช่องที่เหลือเป็นตัวเดิมทุกคีย์ (ป้าย · ค่า · บรรทัดรอง · โทน)
  assert.deepEqual(deskFacts, today.filter((f) => !['requestedDue', 'committedDue'].includes(f.key)));
  assert.deepEqual(deskFacts.slice(1).map((f) => [f.label, f.value]), [
    ['ผู้ขอ: วันที่ต้องการรับผลประเมิน', '15/10/2026'],
    ['TS: วันที่จะส่งผลประเมิน', '15/10/2026'],
  ]);

  // ยังไม่รับปาก — ช่องวันส่งผลบอกว่ายังไม่แจ้ง · ด่วนและช่องอื่นไม่หาย
  const waiting = requestHeaderFacts({ ...request, surveyNeedsVisit: false, committedDueDate: null, committedResultDate: null, urgent: true, urgentReason: 'ลูกค้าเร่ง' }, { now: NOW });
  assert.deepEqual(waiting.map((f) => f.key), ['submitted', 'urgent', 'requestedResultDue', 'committedResultDue']);
  assert.equal(waiting.at(-1).value, 'ยังไม่ระบุ');

  // ธงนี้เป็นของใบประเมิน — หัวข้อที่มีวันเดียวถือมาก็ยังเห็นสองช่องวันของตัวเอง
  const rd = { kind: 'formula_dev', dept: 'RD', submittedAt: '2026-10-08T07:50:00Z', requestedDueDate: '2026-10-13' };
  assert.deepEqual(
    requestHeaderFacts({ ...rd, surveyNeedsVisit: false }, { now: NOW }),
    requestHeaderFacts(rd, { now: NOW }),
  );
});

test('การ์ดวันบนหน้าคำร้อง (`facts`) · งานโต๊ะเหลือ 4 ช่อง กติกาเดียวกับหัวใบ — ไม่มี "วันนัดเข้าพื้นที่" ของใบที่ไม่มีนัด', () => {
  const keys = (view) => view.facts.map((f) => f.key);
  const onsite = job(ask({ ...PROMISED, surveyZones: zones() }));
  assert.deepEqual(keys(onsite), ['submitted', 'requestedDue', 'requestedResultDue', 'assignee', 'committedDue', 'committedResultDue']);
  assert.deepEqual(keys(job(ask({ ...PROMISED, surveyZones: mixedZones() }))), keys(onsite), 'ใบผสมยังมีวันเข้าพื้นที่');

  const desk = job(ask(PROMISED));
  assert.deepEqual(keys(desk), ['submitted', 'requestedResultDue', 'assignee', 'committedResultDue']);
  // สี่ช่องที่เหลือเป็นตัวเดิมทุกคีย์ — ตัดออก ไม่ได้เขียนใหม่
  assert.deepEqual(desk.facts, onsite.facts.filter((f) => !['requestedDue', 'committedDue'].includes(f.key)));
  assert.deepEqual(desk.facts.at(-1), { key: 'committedResultDue', label: 'TS: วันที่จะส่งผลประเมิน', value: 'พฤ. 15 ต.ค. 2026', sub: 'ตรงกับที่ขอ', tone: 'ok' });
  assert.doesNotMatch(JSON.stringify(job(ask()).facts), /ลงคิว|นัดเข้าพื้นที่|ต้องการให้เข้าพื้นที่/);
  assert.equal(job(ask()).facts.at(-1).sub, 'TS ยังไม่ได้แจ้งวันส่งผล');
});

/* ── รอบแก้หลังรีวิว S2a — ใบงานโต๊ะที่ถูกดึงผลกลับมาแก้ ─────────────────────────────── */
test('🔴 งานโต๊ะที่ส่งผลแล้วถูกดึงกลับมาแก้: ขั้น "ดึงผลกลับมาแก้" — ไม่ขึ้น "เลยวันส่งผล" ทั้งที่ผลเคยส่งไปแล้ว · ไม่มีการดึงกลับ = ขั้นของงานโต๊ะตามเดิม', () => {
  // รับปากส่งผล 15 ต.ค. · ส่งไปแล้ว · หัวหน้าดึงกลับมาแก้วันที่ 16 (เลยวันที่รับปาก 1 วัน)
  const recall = { at: '2026-10-16T02:00:00Z', byName: 'Arnon Aunsapwilai', reason: 'เลือกคำตอบยืนยันหน้างานผิด', totals: null };
  const LATER = '2026-10-16';
  for (const [who, viewer] of VIEWERS) {
    const pulled = job(ask({ ...PROMISED, surveyRecall: recall }), viewer, LATER);
    assert.equal(pulled.stage, 'recalled', who);
    assert.deepEqual(pulled.status, { label: 'ดึงผลกลับมาแก้', tone: 'warning' }, who);
    assert.equal(pulled.now.headline, 'ดึงผลกลับมาแก้', who);
    assert.doesNotMatch(JSON.stringify(pulled.now), /เลยวันที่จะส่งผล|เลยวันส่งผล|ลงคิว|เข้าพื้นที่|ช่าง/, who);
    // ยังเป็นงานโต๊ะ: รางใช้ชื่อขั้นของงานโต๊ะตามเดิม
    assert.deepEqual(pulled.steps.map((s) => s.label).slice(2, 4), ['รับปากวันส่งผล', SURVEY_METHOD_LABEL.drawing], who);

    // ใบเดียวกันที่ไม่เคยถูกดึงกลับ = เลยวันส่งผลจริง
    const late = job(ask({ ...PROMISED }), viewer, LATER);
    assert.equal(late.stage, 'desk-overdue', who);
  }
});
