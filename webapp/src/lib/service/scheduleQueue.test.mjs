// ── รายการงานของหน้าจัดตาราง — ถัง/กลุ่ม/ช่วง/ภาระ (มติผู้ใช้ 2026-09-22) ─────────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด:
//   · นัดหนึ่งใบอยู่ได้ **ถังเดียวหรือไม่อยู่เลย** — ยกเลิก/เลื่อนแล้วไม่อยู่ในรายการงาน
//   · ร่างไม่มีทางเป็น "ค้าง" หรือ "จัดแล้ว" และไม่นับภาระของใคร (มติ 2026-08-28)
//   · ตัวเลขของรายการงานต้องเท่ากับตัวเลขหน้าภาพรวม (`serviceCounts`) บนข้อมูลชุดเดียวกัน
//     — คนกดจาก KPI เข้ามาต้องเห็นเลขเดิม
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEUE_BUCKETS,
  QUEUE_BUCKET_LABELS,
  QUEUE_BUCKET_UNITS,
  QUEUE_CLOSED_DAYS,
  QUEUE_RANGES,
  QUEUE_RANGE_LABELS,
  QUEUE_SOON_DAYS,
  WAITING_GROUPS,
  WAITING_GROUP_LABELS,
  addDaysIso,
  crewLoadPeople,
  freeCrewOn,
  inQueueRange,
  isStaleDraft,
  overdueDaysOf,
  queueBucketOf,
  queueHaystack,
  queueWindow,
  staffLoadOn,
  teamViewVisit,
  waitingGroupOf,
} from './scheduleQueue.js';
import { VISIT_STATUSES, isShortfallVisit } from './visitStatus.js';
import { GATE_OWNERS, evaluateVisitGate } from './visitGate.js';
import { ALL_TEAMS, NO_TEAM, teamByUser } from './crewTeams.js';
import { serviceCounts } from './overview.js';

const TODAY = '2026-09-22';
const win = queueWindow(TODAY);
const PAST = '2026-09-19';
const FUTURE = '2026-09-25';

test('ค่าคงที่ของรายการงานครบตามสัญญา — ถังมีป้ายและหน่วยครบทุกตัว', () => {
  assert.deepEqual([...QUEUE_BUCKETS], ['waiting', 'overdue', 'scheduled', 'closed']);
  for (const key of QUEUE_BUCKETS) {
    assert.ok(QUEUE_BUCKET_LABELS[key], key);
    assert.ok(QUEUE_BUCKET_UNITS[key], key);
  }
  assert.equal(QUEUE_BUCKET_UNITS.waiting, 'ใบ', 'ร่างยังไม่ใช่นัด');
  assert.deepEqual([...QUEUE_RANGES], ['all', '7d', 'unassigned']);
  for (const key of QUEUE_RANGES) assert.ok(QUEUE_RANGE_LABELS[key], key);
  // ⭐ คำร้องรอลงคิวขึ้นก่อนทุกกลุ่ม (มติเจ้าของ 23/09) — งานที่ TS ต้องลงมือเองเท่านั้น
  assert.deepEqual([...WAITING_GROUPS], ['requests', 'ready', 'ts', 'others', 'far']);
  for (const key of WAITING_GROUPS) assert.ok(WAITING_GROUP_LABELS[key], key);
  assert.equal(WAITING_GROUP_LABELS.requests, 'คำร้องรอลงคิว');
  assert.equal(WAITING_GROUP_LABELS.far, 'ร่างล่วงหน้าเกิน 14 วัน');
  assert.equal(QUEUE_SOON_DAYS, 14);
  assert.equal(QUEUE_CLOSED_DAYS, 14);
});

test('addDaysIso — ข้ามเดือน ข้ามปี ปีอธิกสุรทิน และค่าเสียได้ null', () => {
  assert.equal(addDaysIso('2026-09-30', 1), '2026-10-01');
  assert.equal(addDaysIso('2026-10-01', -1), '2026-09-30');
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysIso('2027-01-01', -1), '2026-12-31');
  assert.equal(addDaysIso('2026-12-25', 13), '2027-01-07');
  assert.equal(addDaysIso('2028-02-28', 1), '2028-02-29');
  assert.equal(addDaysIso('2027-02-28', 1), '2027-03-01');
  assert.equal(addDaysIso('2026-09-22', 0), '2026-09-22');
  assert.equal(addDaysIso('2026-09-22'), '2026-09-22');
  for (const bad of [null, undefined, '', '22/09/2026', '2026-09-22T10:00:00Z']) {
    assert.equal(addDaysIso(bad, 1), null, String(bad));
  }
  assert.equal(addDaysIso('2026-09-22', 'abc'), null);
});

test('queueWindow — ขอบ 7 วัน · 14 วัน · ย้อน 14 วัน · วันเสีย = โยน ไม่ใช่ถังว่างเงียบ ๆ', () => {
  assert.deepEqual(win, {
    todayIso: TODAY, weekUntil: '2026-09-28', soonUntil: '2026-10-05', closedSince: '2026-09-08',
  });
  assert.throws(() => queueWindow(undefined), TypeError);
  assert.throws(() => queueWindow('2026/09/22'), TypeError);
});

/* ═══ ถัง: 8 สถานะ × (อดีต / วันนี้ / อนาคต) ═══════════════════════════════════ */
const EXPECTED = {
  draft: ['waiting', 'waiting', 'waiting'],
  scheduled: ['overdue', 'scheduled', 'scheduled'],
  in_progress: ['overdue', 'scheduled', 'scheduled'],
  done: ['closed', 'closed', 'closed'],
  partial: ['closed', 'closed', 'closed'],
  unable: ['closed', 'closed', 'closed'],
  rescheduled: [null, null, null],
  cancelled: [null, null, null],
};

test('⭐ ทุกสถานะ × ทุกช่วงวัน ตกถังเดียวที่ถูก หรือไม่อยู่เลย', () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), [...VISIT_STATUSES].sort(), 'ตารางนี้ต้องครบทุกสถานะ');
  for (const status of VISIT_STATUSES) {
    [PAST, TODAY, FUTURE].forEach((date, i) => {
      const bucket = queueBucketOf({ id: `${status}-${i}`, status, scheduledDate: date }, win);
      assert.equal(bucket, EXPECTED[status][i], `${status} @ ${date}`);
      assert.ok(bucket === null || QUEUE_BUCKETS.includes(bucket));
    });
  }
});

test('🔴 ร่างไม่มีทางเป็น "ค้าง" หรือ "จัดแล้ว" — ไม่ว่าวันไหน มีคนหรือไม่มี', () => {
  for (const date of ['2025-01-01', PAST, TODAY, FUTURE, '2027-06-01']) {
    for (const assigneeId of [null, 'U1']) {
      assert.equal(queueBucketOf({ status: 'draft', scheduledDate: date, assigneeId }, win), 'waiting');
    }
  }
});

test('ถัง "ปิดแล้ว" นับจากวันเข้าจริง · ขอบ 14 วันนับรวม · เก่ากว่านั้นไม่อยู่ในรายการ', () => {
  assert.equal(queueBucketOf({ status: 'done', scheduledDate: '2026-08-01', actualDate: win.closedSince }, win), 'closed');
  assert.equal(queueBucketOf({ status: 'done', scheduledDate: '2026-08-01', actualDate: '2026-09-07' }, win), null);
  // นัดเก่าที่เพิ่งไปปิดเมื่อวาน = ของที่เพิ่งเกิด
  assert.equal(queueBucketOf({ status: 'partial', scheduledDate: '2026-07-01', actualDate: '2026-09-21' }, win), 'closed');
  // ไม่มีวันเข้าจริง = ใช้วันนัดแทน
  assert.equal(queueBucketOf({ status: 'unable', scheduledDate: '2026-09-10' }, win), 'closed');
  assert.equal(queueBucketOf({ status: 'unable', scheduledDate: '2026-09-01' }, win), null);
});

test('หน้าต่างบางส่วน { todayIso, closedSince } จาก API ใช้ได้ · ขอบที่ส่งมาชนะ', () => {
  const partial = { todayIso: TODAY, closedSince: '2026-09-15' };
  assert.equal(queueBucketOf({ status: 'done', scheduledDate: '2026-09-10', actualDate: '2026-09-10' }, partial), null);
  assert.equal(queueBucketOf({ status: 'scheduled', scheduledDate: PAST }, partial), 'overdue');
  assert.equal(queueBucketOf({ status: 'scheduled', scheduledDate: PAST }, TODAY), 'overdue', 'สตริงวันนี้ก็ได้');
});

test('isShortfallVisit — ปิดแล้วแต่ไม่จบ (ทำไม่ครบ/ทำไม่ได้) เท่านั้น', () => {
  const shortfall = VISIT_STATUSES.filter((status) => isShortfallVisit({ status }));
  assert.deepEqual(shortfall, ['partial', 'unable']);
  assert.equal(isShortfallVisit(null), false);
  assert.equal(isShortfallVisit({}), false);
});

/* ═══ ร่างที่วันเสนอผ่านไปแล้ว ═══════════════════════════════════════════════════ */
test('ร่างที่วันผ่านไปแล้ว = stale (ยังอยู่ถังรอจัด) · นัดที่ไม่ใช่ร่างไม่ใช่ stale', () => {
  assert.equal(isStaleDraft({ status: 'draft', scheduledDate: PAST }, win), true);
  assert.equal(isStaleDraft({ status: 'draft', scheduledDate: TODAY }, win), false);
  assert.equal(isStaleDraft({ status: 'draft', scheduledDate: FUTURE }, win), false);
  assert.equal(isStaleDraft({ status: 'scheduled', scheduledDate: PAST }, win), false, 'นัดจริงที่เลยวัน = ค้าง ไม่ใช่ stale');
  assert.equal(queueBucketOf({ status: 'draft', scheduledDate: PAST }, win), 'waiting');
});

test('overdueDaysOf — ค้างกี่วันจากวันนี้ของหน้าต่าง · ยังไม่เลยวัน = null', () => {
  assert.equal(overdueDaysOf({ scheduledDate: PAST }, win), 3);
  assert.equal(overdueDaysOf({ scheduledDate: '2026-08-31' }, win), 22);
  assert.equal(overdueDaysOf({ scheduledDate: TODAY }, win), null);
  assert.equal(overdueDaysOf({ scheduledDate: FUTURE }, win), null);
});

/* ═══ กลุ่มย่อยของ "รอจัด" ═══════════════════════════════════════════════════════ */
const okItem = (key, owner) => ({ key, state: 'ok', owner });
const blockedItem = (key, owner) => ({ key, state: 'blocked', owner });
const passedGate = [okItem('contract', GATE_OWNERS.SA), okItem('payment', GATE_OWNERS.FN), okItem('assignee', GATE_OWNERS.TS), okItem('access', GATE_OWNERS.TS)];
const tsGate = [okItem('contract', GATE_OWNERS.SA), okItem('payment', GATE_OWNERS.FN), blockedItem('assignee', GATE_OWNERS.TS), okItem('access', GATE_OWNERS.TS)];
const fnGate = [okItem('contract', GATE_OWNERS.SA), blockedItem('payment', GATE_OWNERS.FN), blockedItem('assignee', GATE_OWNERS.TS), okItem('access', GATE_OWNERS.TS)];
const FAR = '2026-10-20';

test('⭐ ร่างที่ผ่านด่านอยู่ "พร้อมปล่อย" ทุกวัน — ไม่พับเป็นร่างล่วงหน้า', () => {
  for (const date of [PAST, TODAY, win.soonUntil, FAR, '2026-12-20']) {
    assert.equal(waitingGroupOf(passedGate, { status: 'draft', scheduledDate: date }, win), 'ready', date);
  }
});

test('⭐ ร่างติดด่านที่ไกลกว่า 14 วันพับเป็น far · ขอบวันที่ 13 ยังไม่พับ', () => {
  assert.equal(waitingGroupOf(tsGate, { status: 'draft', scheduledDate: win.soonUntil }, win), 'ts');
  assert.equal(waitingGroupOf(tsGate, { status: 'draft', scheduledDate: addDaysIso(win.soonUntil, 1) }, win), 'far');
  assert.equal(waitingGroupOf(fnGate, { status: 'draft', scheduledDate: FAR }, win), 'far');
  // ร่างที่วันผ่านไปแล้วไม่ใช่ "ล่วงหน้า"
  assert.equal(waitingGroupOf(fnGate, { status: 'draft', scheduledDate: PAST }, win), 'others');
});

test('ติดเฉพาะข้อของ TS = ts · มีข้อของฝ่ายอื่นปน = others', () => {
  assert.equal(waitingGroupOf(tsGate, { status: 'draft', scheduledDate: FUTURE }, win), 'ts');
  assert.equal(waitingGroupOf(fnGate, { status: 'draft', scheduledDate: FUTURE }, win), 'others');
});

test('🔴 ไม่มีผลด่าน = ไม่พร้อม (ห้ามอ่านอาร์เรย์ว่างเป็น "ผ่านครบ") · นัดที่ไม่ใช่ร่างไม่มีกลุ่ม', () => {
  for (const gate of [undefined, null, []]) {
    assert.equal(waitingGroupOf(gate, { status: 'draft', scheduledDate: FUTURE }, win), 'others');
    assert.equal(waitingGroupOf(gate, { status: 'draft', scheduledDate: FAR }, win), 'far');
  }
  assert.equal(waitingGroupOf(passedGate, { status: 'scheduled', scheduledDate: FUTURE }, win), null);
});

/* ⭐ ไซต์ที่ยังไม่มีโซน / โซนที่ยังไม่จัดสรรจากใบสั่งขาย = งานของ TS ที่หน้า "งานเข้าใหม่"
   (มติเจ้าของ 23/09) — เดิมไปจมกลุ่ม "รอฝ่ายอื่น" ที่พับไว้ ทั้งที่คนแก้คือคนที่จัดคิวอยู่ */
test('กลุ่มย่อยต่อกับด่านจริง — ไซต์ยังไม่มีโซน = TS แก้เอง · ใบยังไม่ผูกสัญญา = รอฝ่ายอื่น · งานสำรวจที่ขาดคน = TS แก้เอง', () => {
  const noContext = evaluateVisitGate({ status: 'draft', kind: 'refill', scheduledDate: FUTURE, assigneeId: 'U1' }, { todayIso: TODAY });
  assert.equal(waitingGroupOf(noContext, { status: 'draft', scheduledDate: FUTURE }, win), 'ts');
  const unlinked = evaluateVisitGate({ status: 'draft', kind: 'refill', scheduledDate: FUTURE, assigneeId: 'U1' }, {
    todayIso: TODAY,
    zones: [{ id: 'Z1' }],
    terms: [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1' }],
    ordersById: { SO1: { id: 'SO1', status: 'approved' } },
  });
  assert.equal(waitingGroupOf(unlinked, { status: 'draft', scheduledDate: FUTURE }, win), 'others');
  const survey = { status: 'draft', kind: 'survey', scheduledDate: FUTURE, assigneeId: '' };
  assert.equal(waitingGroupOf(evaluateVisitGate(survey, { todayIso: TODAY }), survey, win), 'ts');
  const surveyReady = { ...survey, assigneeId: 'U1' };
  assert.equal(waitingGroupOf(evaluateVisitGate(surveyReady, { todayIso: TODAY }), surveyReady, win), 'ready');
});

/* ═══ ช่วงของ "จัดแล้ว" ต้องเท่าตัวเลขหน้าภาพรวม ═══════════════════════════════════ */
const fixture = [
  { id: 'v1', status: 'scheduled', scheduledDate: '2026-09-10', assigneeId: 'U1' },   // ค้าง
  { id: 'v2', status: 'in_progress', scheduledDate: '2026-09-21', assigneeId: null }, // ค้าง ไม่มีคน
  { id: 'v3', status: 'scheduled', scheduledDate: TODAY, assigneeId: 'U1' },
  { id: 'v4', status: 'in_progress', scheduledDate: TODAY, assigneeId: 'U2' },
  { id: 'v5', status: 'scheduled', scheduledDate: '2026-09-28', assigneeId: null },   // ขอบ 7 วัน
  { id: 'v6', status: 'scheduled', scheduledDate: '2026-09-29', assigneeId: null },   // เลย 7 วัน
  { id: 'v7', status: 'scheduled', scheduledDate: '2026-10-30', assigneeId: 'U3' },
  { id: 'v8', status: 'draft', scheduledDate: TODAY, assigneeId: null },
  { id: 'v9', status: 'draft', scheduledDate: PAST, assigneeId: null },
  { id: 'v10', status: 'done', scheduledDate: '2026-09-20', actualDate: '2026-09-20', assigneeId: 'U1' },
  { id: 'v11', status: 'cancelled', scheduledDate: TODAY, assigneeId: null },
  { id: 'v12', status: 'rescheduled', scheduledDate: PAST, assigneeId: 'U2' },
];

test('⭐ ถังค้าง + ช่วง 7 วัน + ยังไม่มีเจ้าหน้าที่ เท่ากับ serviceCounts ของหน้าภาพรวม', () => {
  const counts = serviceCounts(fixture, TODAY);
  const bucketOf = (visit) => queueBucketOf(visit, win);
  const scheduled = fixture.filter((v) => bucketOf(v) === 'scheduled');
  assert.equal(fixture.filter((v) => bucketOf(v) === 'overdue').length, counts.overdue);
  assert.equal(scheduled.filter((v) => inQueueRange(v, '7d', win)).length, counts.week);
  assert.equal(scheduled.filter((v) => inQueueRange(v, 'unassigned', win)).length, counts.unassigned);
  // ตัวเลขจริงของชุดนี้ — กันเทสต์ผ่านเพราะนับศูนย์ทั้งคู่
  assert.deepEqual(counts, { overdue: 2, today: 2, week: 3, unassigned: 1 });
  assert.equal(scheduled.filter((v) => inQueueRange(v, 'all', win)).length, 5);
});

test('ช่วงที่ไม่รู้จัก (URL พิมพ์ผิด) = ทั้งหมด ไม่ใช่รายการว่าง', () => {
  assert.equal(inQueueRange({ scheduledDate: '2027-01-01' }, 'bogus', win), true);
  assert.equal(inQueueRange({ scheduledDate: '2027-01-01' }, undefined, win), true);
  assert.equal(inQueueRange({ scheduledDate: '2027-01-01' }, '7d', win), false);
});

/* ═══ ตัวกรองทีม ═════════════════════════════════════════════════════════════════ */
test('⭐ งานที่ยังไม่มีเจ้าหน้าที่ขึ้นทุกทีม · งานที่มีคนขึ้นเฉพาะทีมของคนนั้น', () => {
  const byUser = teamByUser([{ userId: 'U1', teamCode: 'TS-A' }, { userId: 'U2', teamCode: 'TS-B' }]);
  const unassigned = { assigneeId: null };
  for (const team of [ALL_TEAMS, 'TS-A', 'TS-B', NO_TEAM, undefined]) {
    assert.equal(teamViewVisit(unassigned, team, byUser), true, String(team));
  }
  assert.equal(teamViewVisit({ assigneeId: 'U1' }, 'TS-A', byUser), true);
  assert.equal(teamViewVisit({ assigneeId: 'U1' }, 'TS-B', byUser), false);
  assert.equal(teamViewVisit({ assigneeId: 'U1' }, ALL_TEAMS, byUser), true);
  // คนที่ยังไม่อยู่ทีมไหน ตกถัง NO_TEAM
  assert.equal(teamViewVisit({ assigneeId: 'U9' }, NO_TEAM, byUser), true);
  assert.equal(teamViewVisit({ assigneeId: 'U9' }, 'TS-A', byUser), false);
  // ผู้ช่วยจากทีมอื่นไม่ดึงนัดข้ามทีม
  assert.equal(teamViewVisit({ assigneeId: 'U1', assistantIds: ['U2'] }, 'TS-B', byUser), false);
});

/* ═══ ภาระรายคน ═══════════════════════════════════════════════════════════════════ */
const workload = { S1: { assets: 6, packs: 2 }, S2: { assets: 4, packs: 1 } };

test('⭐ ภาระรายวันนับเฉพาะนัดที่อยู่บนตาราง — ร่าง/ยกเลิก/เลื่อนไม่นับ · ผู้ช่วยนับแยก', () => {
  const visits = [
    { id: 'a', status: 'scheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U1', assistantIds: ['U2'] },
    { id: 'b', status: 'done', scheduledDate: TODAY, siteId: 'S2', assigneeId: 'U1', assistantIds: [] },
    { id: 'c', status: 'draft', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U3' },
    { id: 'd', status: 'cancelled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U2' },
    { id: 'e', status: 'rescheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U2' },
    { id: 'f', status: 'scheduled', scheduledDate: FUTURE, siteId: 'S1', assigneeId: 'U1' },
    { id: 'g', status: 'in_progress', scheduledDate: TODAY, siteId: 'S9', assigneeId: null, assistantIds: ['U4'] },
  ];
  const load = staffLoadOn(visits, TODAY, workload);
  assert.deepEqual(load.get('U1'), { visits: 2, assets: 10, packs: 3, assisting: 0 });
  assert.deepEqual(load.get('U2'), { visits: 0, assets: 0, packs: 0, assisting: 1 });
  assert.equal(load.has('U3'), false, 'ร่างไม่นับภาระ');
  assert.deepEqual(load.get('U4'), { visits: 0, assets: 0, packs: 0, assisting: 1 }, 'ไปช่วยนัดที่ยังไม่มีเจ้าของก็นับ');
  assert.equal([...load.keys()].length, 3, 'นัดที่ไม่มีเจ้าของหลักไม่มีแถวของตัวเอง');
});

test('ภาระไม่นับซ้ำ — นัด id เดียวกันสองครั้ง · เจ้าของที่ถูกใส่ในผู้ช่วยด้วย · ไซต์ไม่มีข้อมูล = 0', () => {
  const a = { id: 'a', status: 'scheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U1', assistantIds: ['U1', 'U2', 'U2'] };
  const load = staffLoadOn([a, { ...a }], TODAY, workload);
  assert.deepEqual(load.get('U1'), { visits: 1, assets: 6, packs: 2, assisting: 0 });
  assert.deepEqual(load.get('U2'), { visits: 0, assets: 0, packs: 0, assisting: 1 });
  const unknownSite = staffLoadOn([{ id: 'x', status: 'scheduled', scheduledDate: TODAY, siteId: 'S404', assigneeId: 'U5' }], TODAY);
  assert.deepEqual(unknownSite.get('U5'), { visits: 1, assets: 0, packs: 0, assisting: 0 });
  // workload เป็น Map ก็ได้
  const viaMap = staffLoadOn([a], TODAY, new Map(Object.entries(workload)));
  assert.equal(viaMap.get('U1').assets, 6);
});

test('สองใบที่ไซต์เดียวกันวันเดียวกัน (สอง SO) = สองนัด ไม่ถูกยุบ', () => {
  const visits = [
    { id: 'so1', status: 'scheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U1' },
    { id: 'so2', status: 'scheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U1' },
  ];
  assert.deepEqual(staffLoadOn(visits, TODAY, workload).get('U1'), { visits: 2, assets: 12, packs: 4, assisting: 0 });
  assert.equal(visits.filter((v) => queueBucketOf(v, win) === 'scheduled').length, 2);
});

/* ⭐ สูตรเดียวของตัวเลือกเจ้าหน้าที่ (มติเจ้าของ 23/09) — ยกมาจาก `staffLoadFor` ของหน้าจัดคิว
   ให้โมดัลลงคิวคำร้องใช้ร่วม · ค่าที่คาดไว้ = ผลของสูตรเดิมบนข้อมูลชุดนี้ */
test('⭐ crewLoadPeople — ภาระรายคน + ทีม + หมายเหตุ "ไปช่วย"/"เกินภาระ" ตามลำดับรายชื่อเดิม', () => {
  const visits = [
    { id: 'a', status: 'scheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U1', assistantIds: ['U2'] },
    { id: 'b', status: 'done', scheduledDate: TODAY, siteId: 'BIG', assigneeId: 'U1' },
    { id: 'c', status: 'draft', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U3' },
  ];
  const technicians = [{ id: 'U3', name: 'อนุชา' }, { id: 'U1', name: 'สมชาย' }, { id: 'U2', name: 'วิชัย' }, { id: 'U9', name: 'ไร้ทีม' }];
  const people = crewLoadPeople({
    visits, dateIso: TODAY,
    workload: { ...workload, BIG: { assets: 40, packs: 9 } },
    technicians,
    crewByUser: new Map([['U1', 'TS-A'], ['U2', 'TS-B'], ['U3', NO_TEAM]]),
    teamNames: new Map([['TS-A', 'ทีมเหนือ'], ['TS-B', 'ทีมใต้']]),
  });
  assert.deepEqual(people, [
    { id: 'U3', name: 'อนุชา', team: '', visits: 0, assets: 0, packs: 0, assisting: 0, note: '' },
    { id: 'U1', name: 'สมชาย', team: 'ทีมเหนือ', visits: 2, assets: 46, packs: 11, assisting: 0, note: 'เกินภาระ 12 จุด' },
    { id: 'U2', name: 'วิชัย', team: 'ทีมใต้', visits: 0, assets: 0, packs: 0, assisting: 1, note: 'ไปช่วย 1 นัด' },
    { id: 'U9', name: 'ไร้ทีม', team: '', visits: 0, assets: 0, packs: 0, assisting: 0, note: '' },
  ]);
  // object แทน Map ก็ได้ · ไม่มีรายชื่อ = []
  const viaObject = crewLoadPeople({ visits, dateIso: TODAY, workload, technicians: [{ id: 'U1', name: 'สมชาย' }], crewByUser: { U1: 'TS-A' }, teamNames: { 'TS-A': 'ทีมเหนือ' } });
  assert.equal(viaObject[0].team, 'ทีมเหนือ');
  assert.deepEqual(crewLoadPeople({ visits, dateIso: TODAY }), []);
});

test('⭐ คนว่างวันนั้น — ไปช่วยก็คือไม่ว่าง · ร่างไม่ทำให้ใครไม่ว่าง', () => {
  const people = [
    { id: 'U1', name: 'สมชาย' }, { id: 'U2', name: 'วิชัย' }, { id: 'U3', name: 'อนุชา' },
    { id: 'U4', name: 'ธนพล' }, { id: 'U1', name: 'สมชาย (ซ้ำ)' },
  ];
  const visits = [
    { id: 'a', status: 'scheduled', scheduledDate: TODAY, assigneeId: 'U1', assistantIds: ['U2'] },
    { id: 'b', status: 'draft', scheduledDate: TODAY, assigneeId: 'U3' },
    { id: 'c', status: 'cancelled', scheduledDate: TODAY, assigneeId: 'U4' },
    { id: 'd', status: 'scheduled', scheduledDate: FUTURE, assigneeId: 'U4' },
  ];
  const { free, total } = freeCrewOn(visits, TODAY, people);
  assert.equal(total, 4, 'รายชื่อซ้ำนับครั้งเดียว');
  assert.deepEqual(free.map((p) => p.id), ['U3', 'U4']);
  assert.deepEqual(freeCrewOn([], TODAY, []), { free: [], total: 0 });
  assert.deepEqual(freeCrewOn(visits, TODAY, undefined), { free: [], total: 0 });
});

/* ═══ สตริงค้นหา ═════════════════════════════════════════════════════════════════ */
test('สตริงค้นหามีทุกช่องที่ตาเห็น · ข้ามค่าว่าง · ตัวพิมพ์เล็ก · อาร์เรย์ซ้อนได้', () => {
  const hay = queueHaystack([
    'SV-26090020', 'เติมน้ำหอม', 'ST-1030 · BKK-N', 'ร้านกาแฟ อารีย์', null, undefined, '',
    ['TS ยังไม่มอบหมาย', ['SA → FN ยังไม่มีงวดไหนที่บัญชีรับรอง']], 0,
  ]);
  for (const needle of ['sv-26090020', 'st-1030', 'bkk-n', 'อารีย์', 'ยังไม่มอบหมาย', 'sa → fn', 'บัญชีรับรอง']) {
    assert.ok(hay.includes(needle), needle);
  }
  assert.ok(!hay.includes('null') && !hay.includes('undefined'));
  assert.equal(queueHaystack([]), '');
  assert.equal(queueHaystack(null), '');
});
