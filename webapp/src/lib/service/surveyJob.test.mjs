// หน้าคำร้องประเมินพื้นที่แบบ A "ไทม์ไลน์งาน" (มติเจ้าของ 25/09) — ล็อกสิ่งที่จอแรกต้องตอบ:
// งานอยู่ขั้นไหน · ต่อไปอะไร · ตาใคร · ผลมาเมื่อไร (ฟิกซ์เจอร์จาก RQ-AS-26090188 ตามบรีฟ ม็อก)
import test from 'node:test';
import assert from 'node:assert/strict';
import { surveyJobView } from './surveyJob.js';
import { requestRailSteps } from '../requests/requestRail.js';

const zones = () => ([
  { id: 'z1', zoneName: 'Reception ชั้น 1', zoneCode: 'ZN-1160-10254', zoneFloor: '01', status: 'ok',
    parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
  { id: 'z2', zoneName: 'ห้อง MD ชั้น 5', zoneCode: 'ZN-1160-10255', zoneFloor: '05', status: 'ok',
    parts: [{ id: 'p', widthM: 6, lengthM: 5, heightM: 2.8 }], spots: [{ id: 'a' }, { id: 'b' }] },
  { id: 'z3', zoneName: 'ห้อง Treatment ชั้น 5', zoneCode: 'ZN-1160-10256', zoneFloor: '05', status: 'ok',
    parts: [], spots: [] },
]);

const visit = (over = {}) => ({
  id: 'v1', code: 'SV-26090014', status: 'in_progress', scheduledDate: '2026-09-28', startTime: '10:00:00',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: ['u-np'],
  actualDate: '2026-09-28', actualStartTime: '10:12:00', createdByName: 'Apisith Pattangthani',
  createdAt: '2026-09-23T08:15:00Z', ...over,
});

const request = (over = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26090188', team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-09-23T07:50:00Z',
  acknowledgedAt: '2026-09-23T08:12:00Z', acknowledgedByName: 'Apisith Pattangthani',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad',
  requestedDueDate: '2026-09-28', requestedDueTime: '10:00:00', requestedResultDate: '2026-09-30',
  committedDueDate: '2026-09-28', committedResultDate: '2026-09-30', dueCommittedAt: '2026-09-23T08:15:00Z',
  surveySite: {
    id: 's1', code: 'ST-1036-01-BKK-1160', name: 'สำนักงานใหญ่', routeZone: 'BKK',
    accessFrom: '14:30:00', accessTo: '16:30:00', accessDays: [1], accessNote: 'นำเครื่อง 05 กับกลิ่นสุขไปด้วย',
    contactName: 'คุณแหวน', contactPhone: '0981623632', address: 'พันนา เอกมัย',
  },
  surveyVisit: visit(),
  surveyZones: zones(),
  surveyFilesByZone: {
    z1: [{ docType: 'survey_wide' }, { docType: 'survey_wide' }],
    z2: [{ docType: 'survey_wide' }],
    z3: [],
  },
  ...over,
});
const PEOPLE = [{ id: 'u-np', name: 'Nattawut Pornprasit' }];

test('S1 ช่างวัดอยู่ 2/3 — ขั้นเข้าพื้นที่เป็นขั้นปัจจุบัน · ตาเจ้าหน้าที่ · ส่งผลภายในอีก 2 วัน', () => {
  const v = surveyJobView({ request: request(), today: '2026-09-28', viewer: { canDecide: true }, people: PEOPLE });
  assert.equal(v.stage, 'measuring');
  assert.deepEqual(v.status, { label: 'กำลังวัดหน้างาน', tone: 'info' });
  assert.deepEqual(v.steps.map((s) => s.label), ['ส่งคำร้อง', 'รับเรื่อง', 'ลงคิว / นัด', 'เข้าพื้นที่', 'ส่งผล', 'ปิดเรื่อง']);
  assert.deepEqual(v.steps.map((s) => s.state), ['done', 'done', 'done', 'current', 'pending', 'pending']);
  const onSite = v.steps[3];
  assert.equal(onSite.when, 'เริ่มงาน จ. 28 ก.ย. 10:12');
  assert.deepEqual(onSite.people.map((p) => [p.name, p.note]), [
    ['Phuwadol Aoonnankad', null], ['Nattawut Pornprasit', 'ช่วย'],
  ]);
  assert.equal(onSite.lines[0].text, 'วัดแล้ว 2 / 3 พื้นที่ · ยังไม่ส่งงาน');
  // เวลาเป็นเวลาไทยเสมอ (07:50Z = 14:50)
  assert.equal(v.steps[0].when, 'พ. 23 ก.ย. 14:50');
  assert.equal(v.now.headline, 'กำลังวัดหน้างาน — วัดแล้ว 2 / 3 พื้นที่');
  assert.match(v.now.sub, /เหลือ ห้อง Treatment ชั้น 5 · ขาด: ขนาด · ภาพกว้าง · จุดติดตั้ง/);
  assert.deepEqual(v.now.progress, { done: 2, total: 3, complete: false });
  assert.deepEqual(v.now.turn, {
    side: 'TS', who: 'เจ้าหน้าที่ Phuwadol Aoonnankad', note: 'ช่วย Nattawut Pornprasit · เริ่มงาน 10:12',
  });
  assert.equal(v.now.due.value, 'พ. 30 ก.ย. 2026');
  assert.deepEqual(v.now.due.badge, { text: 'อีก 2 วัน', tone: 'info' });
  // ตารางพื้นที่: ครบฝั่งช่าง 2 แถว · แถวที่สามยังไม่วัด พร้อมบอกว่าขาดอะไร
  assert.deepEqual(v.zones.rows.map((r) => r.state.label), ['ครบฝั่งช่าง', 'ครบฝั่งช่าง', 'ยังไม่วัด']);
  assert.equal(v.zones.rows[2].missingText, 'ขาด: ขนาด · ภาพกว้าง · จุดติดตั้ง');
  assert.equal(v.zones.rows[0].floor, '01', 'ชั้นมาจากทะเบียนโซนเมื่อแถวผลวัดไม่มี');
  assert.equal(v.zones.rows[0].size, '8 × 6 × 3 ม.');
  assert.equal(v.zones.crewGate.badge.label, 'กำลังทำ');
  assert.equal(v.zones.headGate.badge.label, 'ยังไม่เริ่ม');
  // ช่วงที่ไซต์ให้เข้าอยู่บนหน้าแล้ว (บรีฟ B1 ข้อ 14)
  assert.equal(v.site.access, 'จ. · 14:30–16:30');
});

test('S2 ส่งผลแล้ว — ตาฝ่ายขายปิดเรื่อง · ส่งก่อนกำหนด 1 วัน · ตารางเป็นผล ไม่ใช่สถานะหน้างาน', () => {
  const done = request({
    status: 'answered',
    answeredAt: '2026-09-29T07:20:00Z', answeredByName: 'Arnon Aunsapwilai',
    surveyVisit: visit({ status: 'done', actualEndTime: '11:48:00' }),
    surveyZones: zones().map((z, i) => ({
      ...z,
      parts: i === 2 ? [{ id: 'a', label: 'ส่วน A', widthM: 7.5, lengthM: 4, heightM: 3 }, { id: 'b', label: 'ส่วน B', widthM: 3, lengthM: 2, heightM: 3 }] : z.parts,
      spots: i === 2 ? [{ id: 'a', selected: true }, { id: 'b' }] : z.spots.map((s, j) => ({ ...s, selected: i === 0 ? j < 2 : j === 0 })),
      packageQty: i === 0 ? 2 : 1,
      packageNote: i === 0 ? 'หัวหน้าเพิ่ม · เป็นทางเข้า' : null,
    })),
    surveyFilesByZone: {
      z1: [{ docType: 'survey_wide' }, { docType: 'survey_wide' }, { docType: 'survey_plan' }],
      z2: [{ docType: 'survey_wide' }, { docType: 'survey_plan' }],
      z3: [{ docType: 'survey_wide' }, { docType: 'survey_wide' }, { docType: 'survey_plan' }],
    },
  });
  const v = surveyJobView({
    request: done, today: '2026-09-29', viewer: { isOpener: true, isRequesterSide: true }, people: PEOPLE,
  });
  assert.equal(v.stage, 'sent');
  assert.equal(v.status.label, 'ส่งผลให้ฝ่ายขายแล้ว');
  assert.deepEqual(v.steps.map((s) => s.state), ['done', 'done', 'done', 'done', 'done', 'current']);
  assert.equal(v.steps[3].when, 'จ. 28 ก.ย. 10:12–11:48');
  assert.equal(v.steps[4].people[0].name, 'Arnon Aunsapwilai');
  assert.equal(v.steps[4].lines[0].text, '3 พื้นที่ · 114 ตร.ม. · 4 แพ็คเกจ');
  assert.equal(v.steps[5].badge.label, 'ปิดแล้ว 1/2');
  assert.equal(v.now.headline, 'ได้รับผลแล้ว — 3 พื้นที่ · 114 ตร.ม. · 4 แพ็คเกจ');
  assert.equal(v.now.turn.side, 'SA');
  assert.equal(v.now.turn.who, 'คุณ', 'คนเปิดใบเองอ่านว่า "คุณ"');
  assert.deepEqual(v.now.due.badge, { text: 'ส่งแล้ว ก่อนกำหนด 1 วัน', tone: 'success' });
  assert.equal(v.zones.sent, true);
  assert.ok(v.zones.rows.every((r) => r.state === null), 'ส่งแล้วไม่มีคอลัมน์สถานะหน้างาน');
  assert.equal(v.zones.rows[2].size, 'ส่วน A 7.5 × 4 × 3 ม. + ส่วน B 3 × 2 × 3 ม.');
  assert.equal(v.zones.totals.spotsSelected, 4);
  assert.equal(v.zones.unchanged, true);
});

test('🐞 นัดเลยวันแล้วยังไม่เริ่ม — ต้องขึ้น "เลยวันนัด" ไม่ใช่เขียว "ตรงกับที่ขอ" (RQ-AS-26090190)', () => {
  const late = request({
    requestedDueDate: '2026-09-24', committedDueDate: '2026-09-24',
    surveyVisit: visit({ status: 'scheduled', scheduledDate: '2026-09-24', startTime: '11:30:00', actualDate: null, actualStartTime: null }),
  });
  const v = surveyJobView({ request: late, today: '2026-09-25', viewer: {} });
  assert.equal(v.stage, 'overdue');
  assert.deepEqual(v.status, { label: 'เลยวันนัด', tone: 'danger' });
  assert.equal(v.now.headline, 'เลยวันนัดมา 1 วัน — ยังไม่เริ่มงาน');
  assert.equal(v.steps[3].badge.label, 'เลยวันนัด');
  const fact = v.facts.find((f) => f.key === 'committedDue');
  assert.equal(fact.sub, 'เลยวันนัดมา 1 วัน — ยังไม่เริ่มงาน');
  assert.equal(fact.tone, 'late');
  assert.ok(!v.steps[2].lines.some((l) => l.text === 'ตรงกับที่ขอ'), 'ขั้นลงคิวไม่ชมว่าตรงกับที่ขอ');
});

test('รับเรื่องแล้วยังไม่ลงคิว — ขั้นลงคิว/นัดเป็นขั้นปัจจุบัน · ตา TS', () => {
  const v = surveyJobView({
    request: request({ committedDueDate: null, committedResultDate: null, dueCommittedAt: null, surveyVisit: null, surveyFilesByZone: {} }),
    today: '2026-09-25',
  });
  assert.equal(v.stage, 'queue');
  assert.equal(v.status.label, 'รอลงคิว');
  assert.equal(v.current.label, 'ลงคิว / นัด');
  assert.equal(v.now.turn.side, 'TS');
  assert.equal(v.now.due.label, 'ผู้ขอต้องการผล', 'ยังไม่มีวันของ TS = บอกว่าเป็นวันของผู้ขอ');
  assert.equal(v.facts.find((f) => f.key === 'committedDue').sub, 'TS ยังไม่ได้ลงคิว');
});

test('นัดเข้าไม่ได้ — กลับไปขั้นลงคิว พร้อมเหตุผล · ป้าย "ต้องลงคิวใหม่"', () => {
  const v = surveyJobView({
    request: request({ surveyVisit: visit({ status: 'unable', unableReason: 'ไซต์ปิดปรับปรุง', actualStartTime: null }) }),
    today: '2026-09-28',
  });
  assert.equal(v.stage, 'requeue');
  assert.equal(v.current.id, 'commitDue');
  assert.equal(v.current.badge.label, 'ต้องลงคิวใหม่');
  assert.equal(v.current.visitLink.code, 'SV-26090014');
  assert.equal(v.current.lines[1].text, 'ทำไม่ได้ · เพราะ ไซต์ปิดปรับปรุง');
  // นัดที่ตายแล้วเป็นประวัติ — ไม่สั่งให้กดเริ่มงาน ไม่มี "ตรงกับที่ขอ"
  const onSite = v.steps.find((s) => s.id === 'acknowledged');
  assert.equal(onSite.badge.label, 'ทำไม่ได้');
  assert.ok(!onSite.lines.some((l) => /เริ่มงาน/.test(l.text)));
  assert.ok(!v.current.lines.some((l) => l.text === 'ตรงกับที่ขอ'));
});

test('ผู้ช่วยที่ไม่อยู่ในทะเบียนคน — บอกตรง ๆ ไม่ใช่ id ดิบ · ยังโหลดอยู่ = "กำลังโหลดชื่อ…"', () => {
  const r = request();
  assert.deepEqual(surveyJobView({ request: r, today: '2026-09-28', people: [] }).visit.helpers, ['เจ้าหน้าที่ที่ไม่อยู่ในรายชื่อแล้ว']);
  assert.deepEqual(surveyJobView({ request: r, today: '2026-09-28', people: [], peopleLoading: true }).visit.helpers, ['กำลังโหลดชื่อ…']);
});

test('🔴 อ่านรูปรายพื้นที่ไม่สำเร็จ = บอกว่าไม่ทราบ ไม่ใช่เงียบ', () => {
  const v = surveyJobView({ request: request({ surveyUnknown: { files: true }, surveyFilesByZone: {} }), today: '2026-09-28' });
  assert.equal(v.zones.unknownFiles, true);
});

test('ปิดใบโดยไม่ได้ประเมิน — ขั้นส่งผล "ข้าม" ไม่ใช่ "ผ่าน"', () => {
  const v = surveyJobView({
    request: request({ status: 'closed', closedAt: '2026-09-26T03:00:00Z', closedByName: 'Apisith Pattangthani' }),
    today: '2026-09-26',
  });
  assert.equal(v.stage, 'closed-unassessed');
  assert.equal(v.steps.find((s) => s.id === 'answered').state, 'skipped');
  assert.equal(v.steps.find((s) => s.id === 'closed').state, 'done');
  assert.equal(v.now.turn, null);
});

test('รางหน้างานของราง — หัวข้ออื่นยังใช้รางกลางเหมือนเดิม (ไม่มีชื่อขั้นหน้างานหลุดไป)', () => {
  const inquiry = { id: 'q1', kind: 'inquiry', dept: 'RD', status: 'acknowledged', items: [] };
  const labels = requestRailSteps(inquiry).steps.map((s) => s.label);
  assert.equal(labels[0], 'จัดทำคำร้อง');
  assert.equal(labels[1], 'รอรับเรื่อง');
  assert.ok(!labels.includes('เข้าพื้นที่'));
  // ใบประเมิน: ขั้นกลางเดินตามนัด ไม่ใช่ "รอ TS ตอบ"
  const survey = requestRailSteps(request());
  assert.equal(survey.index, 3);
  assert.equal(survey.steps[3].label, 'เข้าพื้นที่');
  assert.equal(requestRailSteps(request({ surveyVisit: null, committedDueDate: null })).index, 2);
  assert.equal(requestRailSteps(request({ surveyVisit: visit({ status: 'done' }) })).index, 4);
});

test('🐞 ใบที่ถูกดึงกลับแล้วช่างกำลังวัดใหม่ — ตาเจ้าหน้าที่ ไม่ใช่ "หัวหน้าแก้ผลแล้วส่งอีกครั้ง" (RQ-AS-26090188)', () => {
  const recall = { at: '2026-09-24T17:08:00Z', byName: 'Admin S&S', reason: 'ตอบด้วยปุ่มกลาง' };
  const measuring = surveyJobView({ request: request({ surveyRecall: recall }), today: '2026-09-28' });
  assert.equal(measuring.stage, 'measuring');
  assert.equal(measuring.now.turn.who, 'เจ้าหน้าที่ Phuwadol Aoonnankad');
  // ป้ายดึงกลับยังอยู่บนขั้นส่งผล — เป็นประวัติที่ฝ่ายขายต้องรู้ (ตัวเลขชุดเก่าอยู่ในมือเขา)
  assert.equal(measuring.steps.find((s) => s.id === 'answered').badge.label, 'ดึงกลับมาแก้');
  // ช่างส่งงานแล้ว = ขั้นของหัวหน้า ⇒ ตอนนี้ "ดึงผลกลับมาแก้" ถึงเป็นงานของใบ
  const done = surveyJobView({ request: request({ surveyRecall: recall, surveyVisit: visit({ status: 'done', actualEndTime: '11:48:00' }) }), today: '2026-09-28' });
  assert.equal(done.stage, 'recalled');
  assert.equal(done.now.turn.who, 'หัวหน้า TS');
});

/* ── รีวิว 25/09: สถานะขอบที่เคยเล่าผิด ─────────────────────────────────────────── */
const closedUnassessed = (over = {}) => request({
  status: 'closed', closedAt: '2026-10-02T03:00:00Z', closedByName: 'Apisith Pattangthani', ...over,
});

test('🐞 ปิดใบหลังนัดเข้าไม่ได้ — ขั้นเข้าพื้นที่ "ข้าม" พร้อมเหตุ · ไม่สั่งกดเริ่มงาน · ไม่นับเลยนัด', () => {
  const v = surveyJobView({
    request: closedUnassessed({ surveyVisit: visit({ status: 'unable', unableReason: 'ไซต์ปิด', actualStartTime: null }) }),
    today: '2026-10-05',
  });
  assert.equal(v.stage, 'closed-unassessed');
  const onSite = v.steps.find((s) => s.id === 'acknowledged');
  assert.equal(onSite.state, 'skipped');
  assert.equal(onSite.badge.label, 'ทำไม่ได้');
  assert.equal(onSite.lines[0].text, 'ไม่ได้เข้าพื้นที่ — ไซต์ปิด');
  assert.ok(!/เลยนัด/.test(onSite.when));
});

test('🐞 ปิดใบทั้งที่นัดยังค้าง — บอกให้ไปเก็บนัด ไม่ใช่ "กดเริ่มงาน" · ช่องวันที่ไม่แดง "เลยวันนัด"', () => {
  const v = surveyJobView({
    request: closedUnassessed({ surveyVisit: visit({ status: 'scheduled', actualDate: null, actualStartTime: null }) }),
    today: '2026-10-05',
  });
  const onSite = v.steps.find((s) => s.id === 'acknowledged');
  assert.equal(onSite.lines[0].text, 'ใบปิดแล้ว — นัดยังค้างบนตาราง ยกเลิกได้ที่หน้าจัดคิว');
  assert.ok(!/เลยนัด|อีก/.test(onSite.when));
  const fact = v.facts.find((f) => f.key === 'committedDue');
  assert.ok(!/เลยวันนัด/.test(fact.sub || ''), 'ใบที่ปิดแล้วไม่มีวันให้ทวง (ม-145)');
});

test('🐞 ปิดใบก่อนลงคิว — ขั้นลงคิว/เข้าพื้นที่ "ข้าม" ไม่ใช่ติ๊กผ่าน', () => {
  const v = surveyJobView({
    request: closedUnassessed({ surveyVisit: null, surveyVisits: [], committedDueDate: null, dueCommittedAt: null }),
    today: '2026-10-05',
  });
  const byId = Object.fromEntries(v.steps.map((s) => [s.id, s]));
  assert.equal(byId.commitDue.state, 'skipped');
  assert.equal(byId.commitDue.when, 'ไม่เคยลงคิว');
  assert.equal(byId.acknowledged.state, 'skipped');
  assert.equal(byId.answered.state, 'skipped');
  assert.equal(byId.closed.state, 'done');
});

test('🐞 ช่างส่งงานแล้ว (นัดปิด) แต่ยังขาดของ — ตาหัวหน้าส่งกลับ · ส่งกลับแล้ว = ตาช่างแจ้งว่าแก้แล้ว', () => {
  const closed = request({ surveyVisit: visit({ status: 'done', actualEndTime: '11:48:00' }) });
  const v = surveyJobView({ request: closed, today: '2026-09-28' });
  assert.equal(v.stage, 'crew-gaps');
  assert.equal(v.now.turn.who, 'หัวหน้า TS');
  assert.ok(!/กด “ส่งงาน”/.test(v.now.next), 'ปุ่มส่งงานไม่มีแล้ว — ห้ามสั่งให้กด');
  const back = surveyJobView({
    request: { ...closed, surveySendBack: { pending: true, sentBack: { at: '2026-09-28T08:00:00Z', byName: 'Arnon Aunsapwilai' }, done: null } },
    today: '2026-09-28',
  });
  assert.equal(back.stage, 'sent-back');
  assert.equal(back.now.turn.who, 'เจ้าหน้าที่ Phuwadol Aoonnankad');
  assert.match(back.now.next, /แจ้งหัวหน้าว่าแก้แล้ว/);
});

/* 🐞 **ฝั่งช่างครบแล้ว หัวหน้าส่งกลับ (A-5/AW-2 · แผน §10.5 S4) — แถบ "ตอนนี้" ยังบอกว่าตาหัวหน้า**
   ขั้นตัดสินจากของขาดก่อนดูการส่งกลับ ⇒ ของช่างครบ = "รอหัวหน้าเคาะ" (หรือ "พร้อมส่งผล") ทั้งที่หัวหน้า
   เพิ่งส่งกลับไปขอรูปเพิ่ม และคนที่ต้องขยับคือช่าง ⇒ การส่งกลับที่ค้างมาก่อนของขาด (ถัดจาก "ดึงกลับ") */
test('🐞 ช่างครบแล้วแต่หัวหน้าส่งกลับ — ขั้น "ส่งกลับให้ช่างแก้" ตาช่าง ไม่ใช่ "รอหัวหน้าเคาะ"', () => {
  const measured = zones().map((z, i) => (i === 2
    ? { ...z, parts: [{ id: 'a', widthM: 7.5, lengthM: 4, heightM: 3 }], spots: [{ id: 'a' }, { id: 'b' }] }
    : z));
  const crewDone = request({
    surveyVisit: visit({ status: 'done', actualEndTime: '11:46:00' }),
    surveyZones: measured,
    surveyFilesByZone: {
      z1: [{ docType: 'survey_wide' }, { docType: 'survey_wide' }],
      z2: [{ docType: 'survey_wide' }],
      z3: [{ docType: 'survey_wide' }, { docType: 'survey_wide' }],
    },
  });
  assert.equal(surveyJobView({ request: crewDone, today: '2026-09-29' }).stage, 'awaiting-decision',
    'ยังไม่ส่งกลับ = ตาหัวหน้าเหมือนเดิม');

  const sendBack = {
    pending: true,
    sentBack: {
      at: '2026-09-29T02:10:00Z', byName: 'Arnon Aunsapwilai',
      items: ['ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป', 'จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป'],
    },
    done: null,
  };
  const back = surveyJobView({ request: { ...crewDone, surveySendBack: sendBack }, today: '2026-09-29' });
  assert.equal(back.stage, 'sent-back');
  assert.deepEqual(back.status, { label: 'ส่งกลับให้ช่างแก้', tone: 'warning' });
  assert.equal(back.now.turn.who, 'เจ้าหน้าที่ Phuwadol Aoonnankad');
  assert.match(back.now.next, /แจ้งหัวหน้าว่าแก้แล้ว/);
  assert.doesNotMatch(back.now.next, /ตามที่ขาด/, 'ของช่างไม่ได้ขาด — ช่างแก้ตามที่หัวหน้าขอ');
  // ไม่มีของขาดให้เล่า ⇒ บรรทัดรองบอกว่าหัวหน้าขออะไร (ไม่งั้นเหลือแค่ "ใคร · เมื่อไร")
  assert.match(back.now.sub, /ส่งกลับ อ\. 29 ก\.ย\. 09:10/);
  assert.match(back.now.sub, /ขอ 2 ข้อ: \(1\) ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป \(2\) จุดมุมเตียงที่ 1/);

  // หัวหน้าเคาะครบหกข้อแล้วก็เช่นกัน — ค้างส่งกลับอยู่ = ยังไม่ "พร้อมส่งผล"
  const decided = {
    ...crewDone,
    surveyZones: measured.map((z) => ({ ...z, packageQty: 1, spots: z.spots.map((s, j) => ({ ...s, selected: j === 0 })) })),
    surveyFilesByZone: Object.fromEntries(Object.entries(crewDone.surveyFilesByZone)
      .map(([id, files]) => [id, [...files, { docType: 'survey_plan' }]])),
  };
  assert.equal(surveyJobView({ request: decided, today: '2026-09-29' }).stage, 'ready');
  assert.equal(surveyJobView({ request: { ...decided, surveySendBack: sendBack }, today: '2026-09-29' }).stage, 'sent-back');
  // แจ้งว่าแก้แล้ว = ไม่ค้าง ⇒ กลับเป็นขั้นตามของขาด
  assert.equal(surveyJobView({
    request: { ...decided, surveySendBack: { ...sendBack, pending: false } }, today: '2026-09-29',
  }).stage, 'ready');
});

test('ใบยกเลิก — ขั้นส่งผลไม่นับถอยหลัง ไม่สั่งหัวหน้า', () => {
  const v = surveyJobView({
    request: request({
      status: 'cancelled', cancelledAt: '2026-09-23T09:00:00Z', acknowledgedAt: null, acknowledgedByName: null,
      surveyVisit: null, committedDueDate: null, committedResultDate: null,
    }),
    today: '2026-10-05',
  });
  const send = v.steps.find((s) => s.id === 'answered');
  assert.equal(send.when, '');
  assert.deepEqual(send.people, []);
  assert.equal(send.lines[0].text, 'ยกเลิกก่อนมีผล');
});

test('ตัดออกหมดทุกพื้นที่ — การ์ดด่านไม่ขึ้นเขียว "ครบ"', () => {
  const v = surveyJobView({
    request: request({ surveyZones: zones().map((z) => ({ ...z, status: 'cut', cutReason: 'ลูกค้ายกเลิกชั้นนี้' })) }),
    today: '2026-09-28',
  });
  assert.deepEqual(v.zones.crewGate.badge, { label: 'ไม่มีพื้นที่', tone: 'neutral' });
  assert.deepEqual(v.zones.headGate.badge, { label: 'ไม่มีพื้นที่', tone: 'neutral' });
});

test('ขั้นส่งผลบอกว่าวันเป็นของใคร — ยังไม่มีวันของ TS = "ผู้ขอต้องการ"', () => {
  const v = surveyJobView({
    request: request({ committedResultDate: null, committedDueDate: null, surveyVisit: null }),
    today: '2026-09-25',
  });
  assert.match(v.steps.find((s) => s.id === 'answered').when, /^ผู้ขอต้องการ พ\. 30 ก\.ย\./);
});

test('หมายเหตุรายพื้นที่ยังอ่านได้บนหน้าคำร้อง (ฝ่ายขายเปิดใบประเมินไม่ได้)', () => {
  const v = surveyJobView({
    request: request({ surveyZones: zones().map((z, i) => (i === 0 ? { ...z, note: 'เพดานสูงช่วงประตู' } : z)) }),
    today: '2026-09-28',
  });
  assert.equal(v.zones.rows[0].note, 'เพดานสูงช่วงประตู');
});

test('🔴 อ่านรูปไม่สำเร็จ — ขั้นมาจากนัด · ไม่มีแถบวัด · ไม่บอกว่า "วัดแล้ว 0" หรือ "รอช่างเก็บงาน"', () => {
  const v = surveyJobView({
    request: request({
      surveyVisit: visit({ status: 'done', actualEndTime: '11:48:00' }),
      surveyFilesByZone: {}, surveyUnknown: { files: true },
    }),
    today: '2026-09-28',
    viewer: { canDecide: true },
  });
  assert.equal(v.stage, 'awaiting-decision', 'ช่างส่งงานแล้ว = ตาหัวหน้า ไม่ใช่ "กำลังวัด"');
  assert.equal(v.now.progress, null);
  assert.ok(v.zones.rows.every((r) => r.photosWide === null && r.state === null));
  assert.equal(v.zones.crewGate.badge.label, 'ไม่ทราบ');
  assert.ok(!/วัดแล้ว 0/.test(`${v.now.headline} ${v.now.sub}`));
});
