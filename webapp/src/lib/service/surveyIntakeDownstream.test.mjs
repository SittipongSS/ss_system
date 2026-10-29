// ── ประเมินจากแบบ งวด 4 กลุ่ม D — ฝั่ง TS ของใบที่ฝ่ายขาย "ยื่นเป็นประเมินจากแบบ" (สเปก S4 §3 กลุ่ม D) ──────────────
//
// ⭐ ใบที่ยื่นเป็นจากแบบเก็บ `requestedDueDate` = **กระจกของวันรับผล** (คอลัมน์ต้องมีค่า) ⇒ ทุกตัวประกอบจอของ TS
//    ที่เคยอ่านคอลัมน์นั้นเป็น "วันที่ผู้ขออยากให้เข้า" ต้องถาม `surveyWishedVisit` แทน — ไม่งั้นวันรับผลกลายเป็นวันนัด
//    ที่ไม่มีใครขอ (การ์ดหน้าจัดคิว · ค่าตั้งต้น/แถว/ชิปของโมดัลลงคิว · ภาพนิ่งของกระดาษ)
// ⭐ บรรทัด `ฝ่ายขายขอ: ประเมินจากแบบ` ขึ้นที่การ์ดหน้าจัดคิว และ "เกี่ยวกับคำร้อง" ของใบประเมิน (หัวงาน + รายละเอียดคำร้อง)
//    ⚠️ ไม่มีบรรทัดคู่ของลงหน้างาน — ใบ `standard` และแถวที่ไม่มี `variant` (ทุกแถวของวันนี้) ได้ผลเดิมทุกตัวอักษร (golden)
// 🔴 `variant` ไม่ใช่ตัวตัดสินขั้นคิว/ด่าน — งานโต๊ะยังตัดสินจากธง `surveyNeedsVisit` ของแถวพื้นที่ (D-4 ข้อ "verify")
//
// ค่า golden ของใบลงหน้างานลอกจากผลของโค้ด origin/main 954861d8 (ก่อนแก้กลุ่ม D) — เปลี่ยนเมื่อไร = ใบของวันนี้เปลี่ยนหน้าตา
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScheduleQueue, surveyRequestRow } from './scheduleQueueView.js';
import { SURVEY_QUEUE_REQUEST_COLUMNS } from './surveyQueueRepo.js';
import { SURVEY_METHOD_BACK_ORIGIN } from './surveyMethodSwitch.js';
import { SURVEY_NO_VISIT_WISH_LINE, SURVEY_NO_VISIT_WISH_TEXT, SURVEY_SALES_ASKED } from './surveyIntake.js';
import { surveyFieldSubmitError } from './survey.js';
import { surveyAboutView, surveyJobHeaderView } from './surveyFieldView.js';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';
import {
  commitDueDefaults, commitDueJobRows, commitDueLabels, commitDueMode, commitDueWishes, deskDueAction,
} from '../requests/commitDue.js';
import { ALL_TEAMS } from './crewTeams.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
/* ตัดคอมเมนต์ก่อนค้นโค้ด — คำในคอมเมนต์ไม่ใช่การอ่านคอลัมน์ */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const TODAY = '2026-10-15'; // พฤ.
const SITE = { id: 'S1', code: 'ST-1001', name: 'เซ็นทรัลเวิลด์', routeZone: 'BKK-C', customerName: 'บจก. เซ็นทรัล' };
const sitesById = new Map([[SITE.id, SITE]]);
const crew = [{ id: 'U1', name: 'สมชาย ใจดี' }, { id: 'U2', name: 'สมศักดิ์ รุ่งเรือง' }];
const opts = { todayIso: TODAY, sitesById, live: [], peopleInView: crew };
const ASKED_LINE = 'ฝ่ายขายขอ: ประเมินจากแบบ';
const NO_WISH_LINE = 'ผู้ขออยากให้เข้า: ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด';
const NO_WISH_TEXT = 'ยังไม่ได้ระบุ (ยื่นเป็นประเมินจากแบบ) — ดูเธรด';

/* ── ตาราง: ใบลงหน้างานรอลงคิว · จากแบบรอรับเรื่อง · จากแบบรับเรื่องแล้ว · จากแบบที่หัวหน้าสลับเป็นลงหน้างาน · นัดหลุด ── */
const std = {
  id: 'R-std', docNo: 'RQ-AS-26100101', kind: 'site_survey', dept: 'TS', siteId: 'S1', closedAt: null, surveyVisit: null,
  status: 'acknowledged', title: 'ประเมินล็อบบี้', requestedByName: 'วิภา ขายเก่ง', submittedAt: '2026-10-13T03:00:00.000Z',
  acknowledgedAt: '2026-10-14T02:00:00.000Z', acknowledgedByName: 'หัวหน้า TS',
  requestedDueDate: '2026-10-20', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-22',
  committedDueDate: null, committedDueTime: null, committedResultDate: null, assigneeId: null,
};
/* ยื่นเป็นจากแบบ: วันเข้าในคอลัมน์ = กระจกของวันรับผล · ไม่มีเวลา (ฟอร์มวันเดียว) · พื้นที่เกิดเป็นจากแบบ ⇒ ตัวโหลดติดธง false */
const drawing = (over = {}) => ({
  ...std, id: 'R-draw', docNo: 'RQ-AS-26100102', variant: 'drawing', title: 'ประเมินจากแบบ 3 ห้องประชุม',
  requestedDueDate: '2026-10-22', requestedDueTime: null, requestedResultDate: '2026-10-22',
  surveyNeedsVisit: false, surveyMethodBack: null, ...over,
});
const drawingPending = drawing({ status: 'pending', acknowledgedAt: null, acknowledgedByName: null });
const drawingAcked = drawing();
const SWITCH_REASON = 'แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง';
const drawingSwitched = drawing({ surveyNeedsVisit: true, surveyMethodBack: { reason: SWITCH_REASON } });
const requeue = {
  ...std, id: 'R-requeue', docNo: 'RQ-AS-26100103', committedDueDate: '2026-10-14', committedDueTime: '13:30:00',
  committedResultDate: '2026-10-16', dueCommittedAt: '2026-10-13T02:00:00.000Z', assigneeName: 'สมชาย ใจดี',
  surveyVisit: { id: 'V-old', code: 'SV-99', status: 'cancelled' },
};

const withoutRequest = (row) => {
  if (!row) return row;
  const { request, ...rest } = row;
  return rest;
};

/* golden — การ์ดของใบลงหน้างานรอลงคิว จากโค้ดก่อนแก้ (ไม่รวม `request` / `site` ซึ่งเป็นวัตถุที่ส่งเข้าไปเอง) */
const STD_ROW_GOLDEN = {
  type: 'request', id: 'R-std', visit: null, bucket: 'waiting', group: 'requests', step: 'queue', gate: null,
  ready: false, stale: false, tag: { tone: 'warning', label: 'รอลงคิว' }, readyText: '', code: 'RQ-AS-26100101',
  href: '/requests/R-std', kind: 'survey', kindLabel: 'ประเมินพื้นที่', siteCode: 'ST-1001 · BKK-C',
  siteName: 'เซ็นทรัลเวิลด์', customer: 'บจก. เซ็นทรัล', dateLine: 'ต้องการเข้า อ. 20 ต.ค.', timeLine: 'ช่วง 10:00',
  rel: { text: 'อีก 5 วัน', tone: '' },
  who: { text: 'ผู้ขอ วิภา ขายเก่ง', tone: '', sub: 'ส่งเมื่อ อ. 13 ต.ค. · ค้างมา 2 วัน', linkId: null },
  siteLoadText: 'ต้องการผล พฤ. 22 ต.ค.',
  dayLoad: { text: 'วันนั้นว่าง 2 จาก 2 คน', tone: 'ok', free: crew },
  gateItems: [],
  status: { label: 'ขั้น 2/2', tone: 'info', text: 'รับเรื่องแล้ว โดย หัวหน้า TS — เลือกวัน เวลา เจ้าหน้าที่ และวันส่งผล' },
  title: 'ประเมินล็อบบี้', warns: [], origin: 'คำร้องประเมินพื้นที่ · ยังไม่มีนัด', methodChip: null,
  actionLabel: 'ลงคิวเข้าพื้นที่', actionHint: '', ackBlocker: '', deleteBlocker: '',
  actions: { acknowledge: false, commitDue: true, release: false, open: false, assign: false, report: false, calendar: false, delete: false },
  haystack: 'rq-as-26100101 ประเมินพื้นที่ รอลงคิว รอกำหนดส่ง st-1001 · bkk-c เซ็นทรัลเวิลด์ บจก. เซ็นทรัล ต้องการเข้า อ. 20 ต.ค. ช่วง 10:00 อีก 5 วัน ผู้ขอ วิภา ขายเก่ง ส่งเมื่อ อ. 13 ต.ค. · ค้างมา 2 วัน ต้องการผล พฤ. 22 ต.ค. วันนั้นว่าง 2 จาก 2 คน ขั้น 2/2 รับเรื่องแล้ว โดย หัวหน้า ts — เลือกวัน เวลา เจ้าหน้าที่ และวันส่งผล ประเมินล็อบบี้ คำร้องประเมินพื้นที่ · ยังไม่มีนัด ลงคิวเข้าพื้นที่',
};

test('ค่าคงที่ของคำ: บรรทัดฝ่ายขายขอ / ไม่ได้ระบุวันเข้า — ตัวอักษรตรงสเปก §2.5', () => {
  assert.equal(SURVEY_SALES_ASKED.line, ASKED_LINE);
  assert.equal(SURVEY_NO_VISIT_WISH_LINE, NO_WISH_LINE);
  assert.equal(SURVEY_NO_VISIT_WISH_TEXT, NO_WISH_TEXT);
});

/* ═══ D-1 ตัวโหลดคิว ═══════════════════════════════════════════════════════════════════════ */

test('D-1 ตัวโหลดคิวอ่าน `variant` ของใบ (ไม่ใช่ select *) · คอลัมน์เดิมอยู่ครบ', () => {
  const cols = SURVEY_QUEUE_REQUEST_COLUMNS.split(', ');
  assert.ok(cols.includes('variant'));
  for (const col of ['requestedDueDate', 'requestedDueTime', 'requestedResultDate', 'kind', 'status']) assert.ok(cols.includes(col), col);
  assert.equal(new Set(cols).size, cols.length, 'ไม่มีคอลัมน์ซ้ำ');
});

/* ═══ D-2 การ์ดหน้าจัดคิว ═══════════════════════════════════════════════════════════════════ */

test('D-2 golden: ใบลงหน้างานไม่มี `variant` = การ์ดเดิมทุกคีย์ · `variant: standard` ได้การ์ดเดียวกัน', () => {
  const today = withoutRequest(surveyRequestRow(std, opts));
  const { site, ...rest } = today;
  assert.deepEqual(site, SITE);
  assert.equal('asked' in today, false, 'ไม่มีบรรทัดฝ่ายขายขอบนใบลงหน้างาน — และไม่มีคีย์ (แถวเดิมทุกคีย์)');
  assert.deepEqual(rest, STD_ROW_GOLDEN);
  assert.deepEqual(withoutRequest(surveyRequestRow({ ...std, variant: 'standard' }, opts)), today);
  assert.doesNotMatch(today.haystack, /ฝ่ายขายขอ/);
});

/* ⭐ UAT S4 รอบ 4 ข้อ 16: การ์ดงานโต๊ะพูดวิธีในต้นเรื่องแล้ว ("คำร้องประเมินพื้นที่ · ประเมินจากแบบ") ⇒ บรรทัด "ฝ่ายขายขอ:
   ประเมินจากแบบ" ถัดมาเป็นคำซ้ำ — ขึ้นเฉพาะเมื่อสิ่งที่ขอต่างจากวิธีปัจจุบัน (การ์ดที่หัวหน้าสลับกลับเป็นลงหน้างาน · นัดหลุด) */
test('D-2 จากแบบรอรับเรื่อง (งานโต๊ะ): การ์ดของ S2b ตามเดิม · ไม่มีบรรทัด "ฝ่ายขายขอ" ซ้ำกับต้นเรื่อง', () => {
  const row = surveyRequestRow(drawingPending, opts);
  assert.equal(row.step, 'acknowledge');
  assert.equal(row.methodChip, 'จากแบบ · ไม่ต้องลงคิว');
  assert.equal(row.dateLine, 'ต้องการผล พฤ. 22 ต.ค.', 'บรรทัดวันของงานโต๊ะ = วันต้องการผล (S2b) ไม่ใช่วันเข้า');
  assert.equal(row.timeLine, '');
  assert.equal(row.dayLoad, null);
  assert.equal(row.origin, 'คำร้องประเมินพื้นที่ · ประเมินจากแบบ', 'ต้นเรื่องบอกวิธีอยู่แล้ว');
  assert.equal('asked' in row, false, 'สิ่งที่ขอ = วิธีปัจจุบัน ⇒ ไม่มีบรรทัด (และไม่มีคีย์)');
  // ตาเห็นบนการ์ด = ค้นเจอ — คำของวิธียังอยู่ในคำค้นผ่านต้นเรื่อง/ป้าย · คำว่า "ฝ่ายขายขอ" ไม่อยู่บนการ์ดแล้วจึงไม่อยู่ในคำค้น
  assert.match(row.haystack, /ประเมินจากแบบ/);
  assert.doesNotMatch(row.haystack, /ฝ่ายขายขอ/);
  // ไม่ขึ้นกับ variant: ใบเดียวกันที่ไม่มี variant ได้การ์ดเดียวกันทุกช่อง (รวมคำค้น)
  const plain = { ...drawingPending };
  delete plain.variant;
  assert.deepEqual(withoutRequest(row), withoutRequest(surveyRequestRow(plain, opts)), 'ขั้น · ป้าย · คำสั่ง ของงานโต๊ะไม่ได้อ่าน variant');
});

test('D-2 จากแบบรับเรื่องแล้ว (งานโต๊ะ) = ไม่มีการ์ดบนหน้าจัดคิว', () => {
  assert.equal(surveyRequestRow(drawingAcked, opts), null);
});

test('D-2 ยื่นเป็นจากแบบ แล้วหัวหน้าสลับเป็นลงหน้างาน: "ผู้ขออยากให้เข้า: ยังไม่ได้ระบุ…" · ไม่มีเวลา/ระยะห่าง/คนว่าง', () => {
  const row = surveyRequestRow(drawingSwitched, opts);
  assert.equal(row.step, 'queue');
  assert.equal(row.dateLine, NO_WISH_LINE, 'กระจกของวันรับผลต้องไม่ถูกพูดเป็นวันที่ต้องการเข้า');
  assert.equal(row.timeLine, '');
  assert.deepEqual(row.rel, { text: '', tone: '' });
  assert.equal(row.dayLoad, null);
  assert.equal(row.siteLoadText, 'ต้องการผล พฤ. 22 ต.ค.', 'วันส่งผลที่ผู้ขอต้องการยังเป็นของจริง');
  assert.equal(row.origin, SURVEY_METHOD_BACK_ORIGIN(SWITCH_REASON));
  assert.equal(row.asked, ASKED_LINE);
  assert.match(row.haystack, /ฝ่ายขายขอ/);
  assert.doesNotMatch(row.haystack, /ต้องการเข้า/);
  // เวลาที่ค้างในคอลัมน์ (ไม่ควรมี แต่ถ้ามี) ก็ไม่ถูกพูด
  assert.equal(surveyRequestRow({ ...drawingSwitched, requestedDueTime: '10:00' }, opts).timeLine, '');
});

test('D-2 นัดหลุด: บรรทัดวันเป็นนัดเดิมเหมือนเดิม (ไม่ถามวันที่ผู้ขอต้องการ) · ใบที่ยื่นเป็นจากแบบได้บรรทัดฝ่ายขายขอเพิ่มอย่างเดียว', () => {
  const row = surveyRequestRow(requeue, opts);
  assert.equal(row.step, 'requeue');
  assert.equal(row.dateLine, 'นัดเดิม พ. 14 ต.ค.');
  assert.equal(row.timeLine, 'เวลา 13:30');
  assert.equal('asked' in row, false);
  const drew = surveyRequestRow({ ...requeue, variant: 'drawing', requestedDueDate: '2026-10-22', surveyNeedsVisit: true }, opts);
  assert.equal(drew.dateLine, 'นัดเดิม พ. 14 ต.ค.');
  assert.equal(drew.timeLine, 'เวลา 13:30');
  assert.equal(drew.asked, ASKED_LINE);
});

/* ⭐ มติ 20/10 (UAT S4 รอบ 4 ข้อ 20 · แทน D-2 "ไม่รู้วันเข้า = ท้ายกลุ่ม"): การ์ดที่ไม่มีวันอยากให้เข้า เรียงด้วยวันที่ต้องการผล
   — ใบที่ยื่นเป็นจากแบบแล้วหัวหน้าสลับกลับ ต้องการผลอีกไม่กี่วันก็มี ไปท้ายกลุ่ม = ถูกลืม · ท้ายกลุ่มเฉพาะใบที่ไม่มีวันไหนเลย
   ⚠️ ยังไม่เรียงตามกระจกของวันรับผลในคอลัมน์วันเข้า (ค่าเดียวกันก็จริง แต่ที่อ่านคือ `requestedResultDate` ผ่านตัวอ่านวันอยากให้เข้า) */
test('D-2 ลำดับในกลุ่มคำร้อง: ใบที่ไม่รู้วันเข้า (ยื่นเป็นจากแบบ) เรียงด้วยวันที่ต้องการผล · ไม่มีวันไหนเลยไปท้าย', () => {
  const later = { ...std, id: 'R-later', docNo: 'RQ-AS-26100104', requestedDueDate: '2026-10-25' };
  const queue = (surveyRequests) => buildScheduleQueue({
    visits: [], sitesById, gateContext: {}, workload: {}, todayIso: TODAY, teamFilter: ALL_TEAMS,
    crewByUser: new Map(), crewPeople: crew, teamNames: new Map(), bucket: 'waiting',
    surveyRequests,
  }).groups.find((g) => g.key === 'requests').rows.map((r) => r.id);
  // R-draw ต้องการผล 22 ต.ค. — อยู่ระหว่างใบที่ขอเข้า 20 กับ 25 ต.ค. (เดิมไปท้ายกลุ่มเพราะไม่มีวันเข้า)
  assert.equal(drawingSwitched.requestedResultDate, '2026-10-22');
  assert.deepEqual(queue([drawingSwitched, later, std]), ['R-std', 'R-draw', 'R-later']);
  // ต้องการผลก่อนทุกใบ = ขึ้นหัวกลุ่ม · การ์ดยังบอก "ยังไม่ได้ระบุ" ไม่ใช่วันเข้า (ลำดับไม่เปลี่ยนคำบนการ์ด)
  const urgent = { ...drawingSwitched, requestedResultDate: '2026-10-17', requestedDueDate: '2026-10-17' };
  assert.deepEqual(queue([later, std, urgent]), ['R-draw', 'R-std', 'R-later']);
  assert.equal(surveyRequestRow(urgent, opts).dateLine, NO_WISH_LINE);
  // ไม่มีวันไหนเลย (ไม่มีวันอยากให้เข้า และไม่มีวันต้องการผล) = ท้ายกลุ่มเหมือนเดิม
  const none = { ...drawingSwitched, requestedResultDate: null };
  assert.deepEqual(queue([none, later, std]), ['R-std', 'R-later', 'R-draw']);
});

test('🔴 D-2 ลำดับ: งานโต๊ะที่ยื่นเป็นจากแบบเรียงด้วยวันที่ต้องการผล (วันที่การ์ดโชว์) ไม่ใช่ไปท้ายกลุ่ม', () => {
  const soon = drawing({ status: 'pending', acknowledgedAt: null, acknowledgedByName: null, requestedDueDate: '2026-10-16', requestedResultDate: '2026-10-16' });
  const far = { ...std, id: 'R-far', docNo: 'RQ-AS-26100105', status: 'pending', acknowledgedAt: null, acknowledgedByName: null, requestedDueDate: '2026-11-05' };
  const view = buildScheduleQueue({
    visits: [], sitesById, gateContext: {}, workload: {}, todayIso: TODAY, teamFilter: ALL_TEAMS,
    crewByUser: new Map(), crewPeople: crew, teamNames: new Map(), bucket: 'waiting',
    surveyRequests: [far, soon],
  });
  const rows = view.groups.find((g) => g.key === 'requests').rows;
  assert.equal(rows.find((r) => r.id === 'R-draw').dateLine, 'ต้องการผล ศ. 16 ต.ค.');
  assert.deepEqual(rows.map((r) => r.id), ['R-draw', 'R-far']);
  /* งานโต๊ะรูป RQ-AS-26100312 (ยื่นลงหน้างาน หัวหน้าสลับทุกพื้นที่) — 🔄 S2b แก้หลังตรวจจอ planner-q6: เรียงด้วยวันที่ต้องการผล
     เหมือนงานโต๊ะทุกใบ (วันที่การ์ดพิมพ์) · เดิม (รั้วสวิตช์ปิดของ S4) เรียงด้วยวันเข้าในคอลัมน์ 10 พ.ย. ซึ่งการ์ดไม่ได้พิมพ์
     ⇒ ใบที่ต้องการผลวันนี้ไปอยู่ใต้ใบที่ขอเข้า 5 พ.ย. */
  const switched312 = { ...std, id: 'R-312', docNo: 'RQ-AS-26100312', status: 'pending', acknowledgedAt: null, acknowledgedByName: null, requestedDueDate: '2026-11-10', requestedResultDate: '2026-10-15', surveyNeedsVisit: false };
  const legacyView = buildScheduleQueue({
    visits: [], sitesById, gateContext: {}, workload: {}, todayIso: TODAY, teamFilter: ALL_TEAMS,
    crewByUser: new Map(), crewPeople: crew, teamNames: new Map(), bucket: 'waiting',
    surveyRequests: [switched312, far],
  });
  const legacyRows = legacyView.groups.find((g) => g.key === 'requests').rows;
  assert.equal(legacyRows.find((r) => r.id === 'R-312').dateLine, 'ต้องการผล พฤ. 15 ต.ค.');
  assert.deepEqual(legacyRows.map((r) => r.id), ['R-312', 'R-far']);
});

test('D-2 ใบ standard ไม่มีบรรทัดฝ่ายขายขอบนการ์ดใดเลย', () => {
  for (const request of [std, { ...std, variant: 'standard' }, requeue, { ...drawingPending, variant: 'standard' }]) {
    const row = surveyRequestRow(request, opts);
    assert.equal('asked' in row, false, request.id);
    assert.doesNotMatch(row.haystack, /ฝ่ายขายขอ/, request.id);
  }
});

/* ═══ D-3 การ์ด ═══════════════════════════════════════════════════════════════════════════ */

test('D-3 การ์ดวาดบรรทัดฝ่ายขายขอใต้ต้นเรื่อง คลาสเดียวกัน · ไม่มี CSS ใหม่', () => {
  const card = read('components/service/ScheduleQueueCard.js');
  const origin = card.indexOf('<p className={styles.origin}>{row.origin}</p>');
  const asked = card.indexOf('{row.asked && <p className={styles.origin}>{row.asked}</p>}');
  const end = card.indexOf('</div>', origin);
  assert.ok(origin > 0, 'หาบรรทัดต้นเรื่องไม่เจอ — เทสต์นี้ตาบอดแล้ว');
  assert.ok(asked > origin && asked < end, 'บรรทัดฝ่ายขายขออยู่ใต้ต้นเรื่อง ในก้อนเดียวกัน');
  assert.equal((card.match(/row\.asked/g) || []).length, 2, 'วาดที่เดียว');
});

/* ═══ D-4 โมดัลลงคิว ════════════════════════════════════════════════════════════════════════ */

test('D-4 golden: ใบลงหน้างาน (ไม่มี variant / standard) — ค่าตั้งต้น · แถวงานนี้ · ชิปผู้ขอ เท่าเดิมทุกตัว', () => {
  const form = { date: '2026-10-20', time: '10:00', resultDate: '' };
  for (const request of [std, { ...std, variant: 'standard' }]) {
    assert.deepEqual(commitDueDefaults(request, { today: TODAY }),
      { date: '2026-10-20', time: '10:00:00', resultDate: '2026-10-22', assigneeId: '', reason: '' });
    assert.deepEqual(commitDueJobRows(request, { site: SITE, todayIso: TODAY }), [
      { key: 'kind', label: 'งาน', value: 'ประเมินพื้นที่', kind: 'survey', extra: '' },
      { key: 'title', label: 'เรื่อง', value: 'ประเมินล็อบบี้' },
      { key: 'where', label: 'ที่ไหน', value: 'เขต BKK-C' },
      { key: 'requester', label: 'ผู้ขอ', value: 'วิภา ขายเก่ง', sub: 'ส่งเมื่อ อ. 13 ต.ค. · ค้างมา 2 วัน' },
      { key: 'wants', label: 'ต้องการ', value: 'เข้า อ. 20 ต.ค. · ช่วง 10:00', sub: 'ผล พฤ. 22 ต.ค.' },
      { key: 'origin', label: 'ที่มา', value: 'คำร้องประเมินพื้นที่', badge: { label: 'ขั้น 2/2', tone: 'info' }, sub: 'รับเรื่องแล้ว โดย หัวหน้า TS' },
    ]);
    assert.deepEqual(commitDueWishes(request, form), {
      visit: { key: 'visit', lead: 'ผู้ขอต้องการ', value: 'อ. 20 ต.ค. · 10:00', same: true, patch: { date: '2026-10-20', time: '10:00' } },
      result: { key: 'result', lead: 'ผู้ขอต้องการผล', value: 'พฤ. 22 ต.ค.', same: false, patch: { resultDate: '2026-10-22' } },
    });
  }
  // ผู้ขอไม่ระบุวันเข้า (ใบลงหน้างาน) = คำเดิม
  const noDate = { ...std, requestedDueDate: null, requestedDueTime: null };
  assert.equal(commitDueJobRows(noDate, { site: SITE, todayIso: TODAY }).find((r) => r.key === 'wants').value, 'ผู้ขอไม่ระบุวันที่ต้องการ');
  assert.equal(commitDueDefaults(noDate, { today: TODAY }).date, TODAY);
  assert.equal(commitDueWishes(noDate, form).visit, null);
});

test('D-4 ยื่นเป็นจากแบบ ที่หัวหน้าสลับเป็นลงหน้างาน: ไม่ตั้งต้นวันนัดเป็นวันรับผล · แถว "ต้องการ" บอกว่าไม่ได้ระบุ · ไม่มีชิปวันเข้า', () => {
  assert.equal(commitDueMode(drawingSwitched), 'site');
  assert.deepEqual(commitDueDefaults(drawingSwitched, { today: TODAY }),
    { date: TODAY, time: '', resultDate: '2026-10-22', assigneeId: '', reason: '' });
  const wants = commitDueJobRows(drawingSwitched, { site: SITE, todayIso: TODAY }).find((r) => r.key === 'wants');
  assert.deepEqual(wants, { key: 'wants', label: 'ต้องการ', value: NO_WISH_TEXT, sub: 'ผล พฤ. 22 ต.ค.' });
  const wishes = commitDueWishes(drawingSwitched, { date: '2026-10-22', time: '', resultDate: '2026-10-22' });
  assert.equal(wishes.visit, null, 'ไม่มีชิป "ใช้ตามผู้ขอ" ของวันที่ฝ่ายขายไม่เคยให้');
  assert.deepEqual(wishes.result, { key: 'result', lead: 'ผู้ขอต้องการผล', value: 'พฤ. 22 ต.ค.', same: true, patch: { resultDate: '2026-10-22' } });
  // เวลาที่ค้างในคอลัมน์ก็ไม่ถูกตั้งต้น
  assert.equal(commitDueDefaults({ ...drawingSwitched, requestedDueTime: '10:00' }, { today: TODAY }).time, '');
});

test('D-4 นัดหลุด: ค่าตั้งต้นเป็นของเดิมบนใบ ไม่ว่ายื่นมาแบบไหน', () => {
  for (const request of [requeue, { ...requeue, variant: 'drawing', surveyNeedsVisit: true }]) {
    const d = commitDueDefaults(request, { requeue: true, today: TODAY });
    assert.equal(d.date, '2026-10-14');
    assert.equal(d.time, '13:30');
    assert.equal(d.resultDate, '2026-10-16');
  }
});

test('D-4 งานโต๊ะ (ยื่นเป็นจากแบบ) — รอรับเรื่อง → รับเรื่อง → รับปากวันส่งผล ไม่ต้องแก้โค้ด (ตัดสินจากธงพื้นที่ ไม่ใช่ variant)', () => {
  // ① รอรับเรื่อง: การ์ด "รับเรื่อง" ของงานโต๊ะบนหน้าจัดคิว
  const card = surveyRequestRow(drawingPending, opts);
  assert.equal(card.actionLabel, 'รับเรื่อง');
  assert.equal(card.status.text, 'ยังไม่มีใครรับเรื่อง — รับเรื่องแล้วหัวหน้าฝ่ายบริการรับปากวันส่งผล ไม่ต้องลงคิว');
  // ② รับเรื่องแล้ว: ออกจากหน้าจัดคิว · หัวหน้าได้ "รับปากวันส่งผล" · ผู้วางคิวได้ประโยคแทนปุ่ม
  assert.equal(surveyRequestRow(drawingAcked, opts), null);
  assert.equal(commitDueMode(drawingAcked), 'desk');
  const labels = commitDueLabels(drawingAcked);
  assert.equal(labels.action, 'รับปากวันส่งผล');
  assert.equal(labels.title, 'รับปากวันส่งผลประเมิน (จากแบบ)');
  assert.equal(labels.wish, 'ผู้ขอต้องการผล พฤ. 22 ต.ค.');
  assert.equal(labels.plannerNote, 'ใบนี้ประเมินจากแบบ — หัวหน้าฝ่ายบริการเป็นผู้รับและส่งผล ไม่ต้องลงคิว');
  assert.deepEqual(deskDueAction(drawingAcked, { canCommit: true }), { kind: 'commit', label: 'รับปากวันส่งผล' });
  assert.equal(deskDueAction(drawingAcked, { canCommit: false }), null);
  assert.deepEqual(commitDueDefaults(drawingAcked, { today: TODAY }),
    { date: '2026-10-22', time: '', resultDate: '2026-10-22', assigneeId: '', reason: '' });
  assert.deepEqual(commitDueJobRows(drawingAcked, { site: SITE, todayIso: TODAY }), []);
  assert.deepEqual(commitDueWishes(drawingAcked, {}), { visit: null, result: null });
  // ③ รับปากแล้ว: ปุ่มกลายเป็นเลื่อนวันส่งผล
  const committed = drawing({
    committedDueDate: '2026-10-21', committedResultDate: '2026-10-21', dueCommittedAt: '2026-10-15T03:00:00.000Z',
    assigneeId: 'U-head', assigneeName: 'หัวหน้า TS',
  });
  assert.deepEqual(deskDueAction(committed, { canCommit: true }), { kind: 'reschedule', label: 'เลื่อนวันส่งผล' });
  // ทุกก้าวเหมือนกันทุกตัวอักษรเมื่อไม่มี variant — ตัดสินจากแถวพื้นที่
  const plain = (request) => { const r = { ...request }; delete r.variant; return r; };
  assert.deepEqual(commitDueLabels(plain(drawingAcked)), labels);
  assert.deepEqual(deskDueAction(plain(committed), { canCommit: true }), deskDueAction(committed, { canCommit: true }));
  assert.equal(surveyRequestRow(plain(drawingAcked), opts), null);
});

/* ═══ D-5 "เกี่ยวกับคำร้อง" ของใบประเมิน ═══════════════════════════════════════════════════════ */

const VISIT = { id: 'v1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-20', startTime: '10:00:00', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' };
const MIXED = { mix: { onsite: 2, drawing: 1, mode: 'mixed' }, needsVisit: true };
const ASKED_FACT = { key: 'asked', label: 'ฝ่ายขายขอ', value: 'ประเมินจากแบบ' };
const headerOf = (request, over = {}) => surveyJobHeaderView({
  request, customer: { arCode: 'AR-1', name: 'ลูกค้า' }, site: SITE, visit: VISIT, crew: [], unknown: {}, ...over,
});

test('D-5 หัวงาน: ใบที่ยื่นเป็นจากแบบได้ข้อ "ฝ่ายขายขอ · ประเมินจากแบบ" ต่อจากข้อวิธีประเมิน · `request.asked` = บรรทัด', () => {
  const plain = headerOf(std);
  const filed = headerOf(drawing());
  assert.deepEqual(filed.facts[0], ASKED_FACT, 'ไม่มีข้อวิธีประเมิน (ใบไม่มีพื้นที่จากแบบ) = ข้อแรก');
  assert.deepEqual(filed.facts.slice(1), plain.facts);
  assert.equal(filed.request.asked, ASKED_LINE);
  const mixed = headerOf(drawing(), { method: MIXED });
  assert.equal(mixed.facts[0].key, 'method');
  assert.deepEqual(mixed.facts[1], ASKED_FACT, 'ต่อจากข้อวิธีประเมินทันที');
  assert.deepEqual(mixed.facts.slice(2), headerOf(std, { method: MIXED }).facts.slice(1));
});

test('D-5 golden หัวงาน: ใบ standard / ไม่มี variant = หัวงานเดิมทุกคีย์ (ไม่มีข้อ ไม่มีคีย์ asked)', () => {
  const today = headerOf(std);
  assert.deepEqual(today.facts.map((f) => f.key), ['visit', 'crew', 'access', 'note']);
  assert.deepEqual(today.request, { docNo: 'RQ-AS-26100101', title: 'ประเมินล็อบบี้', customerText: 'AR-1 · ลูกค้า' });
  assert.deepEqual(headerOf({ ...std, variant: 'standard' }), today);
  assert.deepEqual(headerOf({ ...std, variant: 'standard' }, { method: MIXED }), headerOf(std, { method: MIXED }));
  // หัวข้ออื่นที่บังเอิญถือค่า drawing (formula_dev ใช้ variant ของตัวเอง) ไม่ได้บรรทัดนี้
  assert.deepEqual(headerOf({ ...std, kind: 'formula_dev', variant: 'drawing' }).facts, today.facts);
});

test('D-5 รายละเอียดคำร้อง: `surveyAboutView` อ่าน `asked` จากหัวงาน — ข้อต่อจากเลขคำร้อง · ใบ standard ได้สามข้อเดิม', () => {
  const filed = surveyAboutView({ header: headerOf(drawing()).request, requestId: 'R-draw' });
  assert.deepEqual(filed.detail.facts.map((f) => f.key), ['customer', 'title', 'docNo', 'asked']);
  assert.deepEqual(filed.detail.facts[3], ASKED_FACT);
  const plain = surveyAboutView({ header: headerOf(std).request, requestId: 'R-std' });
  assert.deepEqual(plain.detail.facts, [
    { key: 'customer', label: 'ลูกค้า', value: 'AR-1 · ลูกค้า' },
    { key: 'title', label: 'เรื่อง', value: 'ประเมินล็อบบี้' },
    { key: 'docNo', label: 'เลขคำร้อง', value: 'RQ-AS-26100101' },
  ]);
  assert.deepEqual(surveyAboutView({ header: null }).detail.facts.map((f) => f.key), ['customer', 'title', 'docNo']);
});

test('D-5 หน้าใบประเมินส่ง `headerView.request` ให้ `surveyAboutView` (ไม่ต้องแก้หน้า) · คอมโพเนนต์วาดทุกข้อที่ได้รับ', () => {
  assert.match(read('app/service/surveys/[id]/page.js'), /header: headerView\.request/);
  assert.match(read('components/service/SurveyAboutRequest.js'), /detail\.facts\.map\(/);
  assert.match(read('components/service/SurveyJobHeader.js'), /facts\.map\(\(fact\) =>/);
});

/* ═══ D-6 ข้อความ 409 "ยังไม่มีพื้นที่" ของ route ปิดนัด ═══════════════════════════════════════════ */

const ZERO_ONSITE = 'ใบนี้ยังไม่มีพื้นที่ให้วัด — กด “เพิ่มพื้นที่ที่เจอหน้างาน” ก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”';
/* เบี่ยงจาก N5 (ผลรีวิวรอบแก้ S4): ใบเปล่าเป็นใบที่ยังต้องมีนัด ⇒ ปุ่มบนจอช่างคือ "เพิ่มพื้นที่ที่เจอหน้างาน" ·
   ทางออก "ไปแล้วเข้าไม่ได้" ต้องยังถูกเอ่ย — ประโยคต้องอ้างปุ่มที่มีอยู่จริงบนจอของคนที่ได้ 409 นี้ */
const ZERO_DRAWING = 'ใบนี้ยังไม่มีพื้นที่ให้ประเมิน — กด “เพิ่มพื้นที่ที่เจอหน้างาน” ก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”';

test('D-6 surveyFieldSubmitError: ไม่มีพื้นที่ + ยื่นเป็นจากแบบ = ประโยคของจากแบบ · นอกนั้นประโยคเดิมทุกตัวอักษร', () => {
  assert.equal(surveyFieldSubmitError([], {}, { variant: 'drawing' }), ZERO_DRAWING);
  assert.equal(surveyFieldSubmitError(), ZERO_ONSITE);
  assert.equal(surveyFieldSubmitError([]), ZERO_ONSITE);
  assert.equal(surveyFieldSubmitError([], {}), ZERO_ONSITE);
  assert.equal(surveyFieldSubmitError([], {}, {}), ZERO_ONSITE);
  assert.equal(surveyFieldSubmitError([], {}, undefined), ZERO_ONSITE);
  for (const variant of ['standard', null, undefined, '', 'Drawing']) {
    assert.equal(surveyFieldSubmitError([], {}, { variant }), ZERO_ONSITE, String(variant));
  }
  // มีพื้นที่แล้ว: อาร์กิวเมนต์ที่สามไม่เปลี่ยนอะไร
  const rows = [{ id: 'z1', name: 'ล็อบบี้', status: 'ok', parts: [] }];
  assert.equal(surveyFieldSubmitError(rows, {}, { variant: 'drawing' }), surveyFieldSubmitError(rows, {}));
});

test('D-6 route ปิดนัดส่ง variant ของใบเข้าไปที่จุดเดียว · ตัวโหลดอ่านคอลัมน์ variant', () => {
  const route = read('app/api/service/visits/[id]/route.js');
  assert.match(route, /surveyFieldSubmitError\(surveyField\.zones, surveyField\.filesByZone, \{ variant: surveyField\.request\?\.variant \}\)/);
  assert.equal((route.match(/surveyFieldSubmitError\(/g) || []).length, 1);
  assert.match(read('lib/service/surveyRepo.js'), /select\('id, "docNo", title, status, variant,/);
});

/* ═══ D-7 ภาพนิ่งของกระดาษ: วันนัดที่ผู้ขอขอ ═══════════════════════════════════════════════════ */

/* golden — ส่วนคำร้องของภาพนิ่ง จากแฝดสังเคราะห์ (ทุกพื้นที่ลงหน้างาน) ด้วยโค้ดก่อนแก้ */
const REQUEST_PART_GOLDEN = {
  id: 'DR-synthetic-0001', docNo: 'RQ-AS-26090186',
  title: 'ประเมินพื้นที่สนามเทนนิสสำหรับติดตั้งเครื่องกระจายกลิ่น',
  body: 'ลูกค้าจะเปิดใช้งานสถานที่วันเสาร์ที่ 26 กันยายน นำส่งให้ภายในวันศุกร์ที่ 25/9/2026\nทีมยืนยันเวลาว่าจะเข้าไป ก่อนเที่ยงวันศุกร์ 26/09',
  requestedById: null, requestedByName: 'Sale Requester', team: 'SV', submittedAt: '2026-09-23T07:36:11.899+00:00',
  assignedByName: null, requestedDueDate: '2026-09-25', requestedDueTime: '15:00', committedDueDate: '2026-09-25',
  committedDueTime: '12:00', requestedResultDate: '2026-09-25', committedResultDate: '2026-09-25',
  answeredAt: '2026-09-26T03:01:26.314+00:00', answeredById: 'U-head', answeredByName: 'Head Approver',
  closedAt: null, closedByName: null,
  // + งวด S3 (#1916): คีย์เพิ่มแบบไม่ทำลาย — ใบที่ไม่ได้ตอบเรื่องยืนยันหน้างาน = null (ค่าของ main ก่อน S4)
  surveyConfirm: null,
};
const snapshotOf = (variant) => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  if (variant !== undefined) inputs.request.variant = variant;
  return buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
};

test('D-7 golden: ใบลงหน้างาน (ไม่มี variant / standard) — ภาพนิ่งเท่าเดิมทุกตัว', () => {
  const today = snapshotOf(undefined);
  assert.equal(today.errors, undefined);
  assert.deepEqual(today.snapshot.request, REQUEST_PART_GOLDEN);
  assert.deepEqual(snapshotOf('standard'), today);
});

test('D-7 ยื่นเป็นจากแบบ แต่ทุกพื้นที่ลงหน้างาน (ออกเอกสารได้): ไม่ตรึงวันนัดที่ขอ — วันรับผลยังอยู่ · ค่าอื่นไม่ขยับ', () => {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture());
  assert.ok(inputs.zones.every((z) => z.method === undefined), 'แฝดสังเคราะห์ = ลงหน้างานล้วน');
  const filed = snapshotOf('drawing');
  assert.equal(filed.errors, undefined, 'ไม่มีพื้นที่จากแบบ = ไม่ติดการกันของ S1');
  assert.equal(filed.snapshot.request.requestedDueDate, null);
  assert.equal(filed.snapshot.request.requestedDueTime, null);
  assert.equal(filed.snapshot.request.requestedResultDate, '2026-09-25');
  const today = snapshotOf(undefined);
  assert.deepEqual(filed, {
    ...today,
    snapshot: { ...today.snapshot, request: { ...today.snapshot.request, requestedDueDate: null, requestedDueTime: null } },
  });
});

test('D-7 ตัวสร้างภาพนิ่งถาม `surveyWishedVisit` — ไม่อ่าน `.variant` เอง', () => {
  const code = stripComments(read('lib/service/surveyReportSnapshot.js'));
  assert.doesNotMatch(code, /\.variant\b/);
  assert.match(code, /surveyWishedVisit\(/);
  assert.doesNotMatch(code, /dayOnly\(r\.requestedDueDate\)/);
});
