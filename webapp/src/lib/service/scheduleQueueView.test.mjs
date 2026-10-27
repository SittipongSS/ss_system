// ── แผง "รายการงาน" ของหน้าจัดคิว — การประกอบกลุ่ม/แถว (มติผู้ใช้ 2026-09-22) ─────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด:
//   · รอจัด แยก พร้อมปล่อย → TS แก้ได้เอง → รอฝ่ายอื่น · ร่างไกลที่ยังติดด่านพับ (เม็ดลงถึง 0 ได้)
//   · ร่างที่วันเสนอผ่านไปแล้วขึ้นบนสุดของกลุ่ม (ต้องเลือกวันใหม่ก่อนปล่อย)
//   · ค้าง: กลุ่ม "ยังไม่มอบหมาย" ขึ้นก่อน แล้วค่อยรายคน
//   · จัดแล้ว: กลุ่มรายวัน ยอดหัววันเป็นยอดทั้งวัน
//   · เลือกทีมแล้วงานที่ยังไม่มีเจ้าหน้าที่ยังอยู่ (ทุกทีมหยิบได้)
//   · ร่างที่ตั้งชื่อไว้ต้องไม่อ่านเป็นงานของคนนั้น (ไม่มีลิงก์งานวันนี้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESK_REQUEST_ACK_TEXT, DESK_REQUEST_ORIGIN_TEXT,
  GATE_FIX, INTAKE_UPSTREAM_LABEL, REQUEST_ORIGIN_TEXT, buildScheduleQueue, dayText, draftsInRange, gateItemView,
  originText, ownerTone, relDayText, siteLoadText, surveyRequestRow, weekChipText,
} from './scheduleQueueView.js';
import {
  SURVEY_METHOD_BACK_ORIGIN, SURVEY_METHOD_CHIP, SURVEY_METHOD_LABEL, SURVEY_QUEUE_DESK_CHIP,
} from './surveyMethodSwitch.js';
import { surveyQueueMethodBack } from './surveyQueueRepo.js';
import * as queueWords from './queueWords.js';
import { evaluateVisitGate, gateBlockedItems } from './visitGate.js';
import { ALL_TEAMS } from './crewTeams.js';
import { acknowledgeRequestError } from '../requests/stages.js';

const TODAY = '2026-09-22'; // อังคาร

/* บริบทด่าน: ไซต์ S-BAD มีโซนที่ผูกใบสั่งขายแล้ว แต่ใบยังไม่ผูกสัญญา ⇒ ติดด่านสัญญาของ SA
   (รอฝ่ายอื่น) · งานถอนเครื่อง/ประเมินพื้นที่ข้ามด่าน ①② (GATE_EXEMPT_KINDS) จึงเหลือแค่ด่านของ TS
   ⚠️ เดิมใช้บริบทว่าง (= ไซต์ไม่มีโซน) แทน "ติด SA" — ไซต์ที่ไม่มีโซนเป็นงานทะเบียนของ TS (มติ 23/09 · ยังเป็น
      ของ TS หลัง mig 0392) ⇒ ต้องใช้เหตุที่เป็นของ SA จริง ๆ */
const sites = [
  { id: 'S1', code: 'ST-1001', name: 'เซ็นทรัลเวิลด์', routeZone: 'BKK-C', customerName: 'บจก. เซ็นทรัล' },
  { id: 'S-BAD', code: 'ST-1002', name: 'ไซต์ไม่มีสัญญา', routeZone: 'BKK-E', customerName: 'บจก. ทดสอบ' },
];
const sitesById = new Map(sites.map((s) => [s.id, s]));
const gateContext = {
  zonesBySite: { 'S-BAD': [{ id: 'Z-BAD', siteId: 'S-BAD', name: 'ล็อบบี้' }] },
  termsBySite: { 'S-BAD': [{ id: 'T-BAD', zoneId: 'Z-BAD', salesOrderId: 'SO-BAD' }] },
  ordersById: { 'SO-BAD': { id: 'SO-BAD', status: 'approved', serviceContractId: null } },
  installmentsByOrderId: {},
  contractsById: {},
};
const workload = { S1: { assets: 6, packs: 2 }, 'S-BAD': { assets: 3, packs: 1 } };
const crewByUser = new Map([['U1', 'NORTH'], ['U2', 'SOUTH']]);
const teamNames = new Map([['NORTH', 'ทีมเหนือ'], ['SOUTH', 'ทีมใต้']]);
const crewPeople = [{ id: 'U1', name: 'สมชาย ใจดี' }, { id: 'U2', name: 'สมศักดิ์ รุ่งเรือง' }];

const v = (o) => ({ siteId: 'S1', kind: 'refill', startTime: null, endTime: null, assistantIds: [], ...o });

const visits = [
  // รอจัด — ถอนเครื่องที่ยังไม่มีคน (ติดแค่ด่าน TS ⇒ TS แก้เอง)
  v({ id: 'D-ts', code: 'SV-01', status: 'draft', kind: 'remove', scheduledDate: '2026-09-23' }),
  // รอจัด — ไซต์ไม่มีสัญญา (รอฝ่ายอื่น)
  v({ id: 'D-sa', code: 'SV-02', status: 'draft', scheduledDate: '2026-09-24', siteId: 'S-BAD', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' }),
  // รอจัด — ไกลเกิน 14 วัน + ติดด่าน ⇒ พับ
  v({ id: 'D-far', code: 'SV-03', status: 'draft', scheduledDate: '2026-11-05' }),
  // รอจัด — ถอนเครื่อง (ข้ามด่านสัญญา/เงิน) วันเสนอผ่านไปแล้ว มีคน ⇒ พร้อมปล่อย + ขึ้นบนสุด
  v({ id: 'D-stale', code: 'SV-04', status: 'draft', kind: 'remove', scheduledDate: '2026-09-19', assigneeId: 'U2', assigneeName: 'สมศักดิ์ รุ่งเรือง' }),
  // ค้าง — มีคน / ไม่มีคน
  v({ id: 'O-som', code: 'SV-05', status: 'scheduled', scheduledDate: '2026-09-14', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' }),
  v({ id: 'O-none', code: 'SV-06', status: 'scheduled', scheduledDate: '2026-09-18' }),
  // จัดแล้ว — วันนี้สองนัด พรุ่งนี้หนึ่ง · ไม่มีคนหนึ่งใบ
  v({ id: 'S-a', code: 'SV-07', status: 'scheduled', scheduledDate: TODAY, startTime: '13:00', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' }),
  v({ id: 'S-b', code: 'SV-08', status: 'in_progress', scheduledDate: TODAY, startTime: '09:00', actualStartTime: '09:05', assigneeId: 'U2', assigneeName: 'สมศักดิ์ รุ่งเรือง' }),
  v({ id: 'S-c', code: 'SV-09', status: 'scheduled', scheduledDate: '2026-09-23', assigneeId: 'U2', assigneeName: 'สมศักดิ์ รุ่งเรือง' }),
  v({ id: 'S-none', code: 'SV-10', status: 'scheduled', scheduledDate: '2026-09-25', kind: 'repair' }),
  // ปิดแล้ว — ทำไม่ได้ / เข้าแล้ว / เก่ากว่า 14 วัน (ไม่อยู่)
  v({ id: 'C-unable', code: 'SV-11', status: 'unable', scheduledDate: '2026-09-18', actualDate: '2026-09-18', unableReason: 'ลูกค้าปิดร้านไม่แจ้งล่วงหน้า', assigneeId: 'U2', assigneeName: 'สมศักดิ์ รุ่งเรือง' }),
  v({ id: 'C-done', code: 'SV-12', status: 'done', scheduledDate: '2026-09-15', actualDate: '2026-09-16', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' }),
  v({ id: 'C-old', code: 'SV-13', status: 'done', scheduledDate: '2026-08-01', actualDate: '2026-08-01' }),
  // ยกเลิก — ไม่อยู่ในรายการงาน
  v({ id: 'X', code: 'SV-14', status: 'cancelled', scheduledDate: '2026-09-23' }),
];

const build = (extra = {}) => buildScheduleQueue({
  visits, sitesById, gateContext, workload, todayIso: TODAY, teamFilter: ALL_TEAMS,
  crewByUser, crewPeople, teamNames, ...extra,
});

test('เม็ดถังนับหลังกรองทีม · ร่างไกลที่ติดด่านไม่นับ · ยกเลิก/เก่าไม่อยู่', () => {
  const { counts, farCount } = build();
  assert.deepEqual(counts, { waiting: 3, overdue: 2, scheduled: 4, closed: 2 });
  assert.equal(farCount, 1);
});

test('รอจัด: พร้อมปล่อย → TS → รอฝ่ายอื่น · ร่างไกลซ่อนจนกว่าจะกดแสดง', () => {
  const view = build({ bucket: 'waiting' });
  assert.deepEqual(view.groups.map((g) => g.key), ['ready', 'ts', 'others']);
  assert.equal(view.listedCount, 3);
  const ready = view.groups[0].rows[0];
  assert.equal(ready.id, 'D-stale');
  assert.equal(ready.stale, true, 'วันเสนอผ่านแล้วต้องติดธง stale');
  assert.match(ready.rel.text, /วันเสนอผ่านไปแล้ว 3 วัน/);
  const ts = view.groups[1];
  assert.equal(ts.rows[0].gateItems[0].fix, 'assignee');
  /* ข้อที่มีลิงก์แก้ต่อท้าย ตัดคำสั่งซ้ำทิ้ง — "ยังไม่มอบหมาย — เลือก…" + ลิงก์ "เลือกเจ้าหน้าที่" = พูดสองครั้ง */
  assert.equal(ts.rows[0].gateItems[0].reason, 'ยังไม่มอบหมาย');
  assert.equal(ts.rows[0].gateItems[0].ownerTone, 'info');
  assert.match(ts.sub, /ขาดเจ้าหน้าที่ 1/);
  const others = view.groups[2];
  assert.equal(others.collapsible, true);
  assert.match(others.sub, /SA 1/);

  const withFar = build({ bucket: 'waiting', farOn: true });
  assert.deepEqual(withFar.groups.map((g) => g.key), ['ready', 'ts', 'others', 'far']);
});

test('ร่างที่ตั้งชื่อไว้ไม่ลิงก์ไปงานวันนี้ และบอกว่ายังไม่ถึงมือ', () => {
  const row = build({ bucket: 'waiting' }).rows.find((r) => r.id === 'D-sa');
  assert.equal(row.who.linkId, null);
  assert.match(row.who.text, /^ตั้งไว้ สมชาย/);
  assert.equal(row.who.sub, 'ยังไม่ถึงมือเจ้าหน้าที่');
  /* ภาระ "ถ้าปล่อย" = งานเดิมของวันนั้น (ไม่มี) + ไซต์นี้ 3 จุด */
  assert.equal(row.dayLoad.projected, 3);
});

test('ค้าง: "ยังไม่มอบหมาย" ขึ้นก่อน แล้วค่อยรายคน พร้อมทางไปงานวันนี้ของคนนั้น', () => {
  const { groups } = build({ bucket: 'overdue' });
  assert.equal(groups[0].label, 'ยังไม่มอบหมาย');
  assert.equal(groups[1].personId, 'U1');
  assert.match(groups[1].label, /สมชาย ใจดี · ทีมเหนือ/);
  assert.equal(groups[1].rows[0].rel.text, 'ค้าง 8 วัน');
});

test('จัดแล้ว: กลุ่มรายวัน ยอดหัววันรวมทั้งวัน · นัดที่เริ่มแล้วบอกเวลาเริ่ม', () => {
  const { groups } = build({ bucket: 'scheduled' });
  assert.deepEqual(groups.map((g) => g.label), ['วันนี้ · อ. 22 ก.ย.', 'พรุ่งนี้ · พ. 23 ก.ย.', 'ศ. 25 ก.ย.']);
  assert.equal(groups[0].total, '2 นัด · 12 จุด · 4 แพ็ค');
  assert.equal(groups[0].rows[0].id, 'S-b', 'เรียงตามเวลาในวัน');
  assert.equal(groups[0].rows[0].status.text, 'เริ่มงาน 09:05 น.');
  const unassigned = groups[2].rows[0];
  assert.equal(unassigned.actions.assign, true);
  assert.match(unassigned.dayLoad.text, /วันนั้นว่าง 2 จาก 2 คน/);
});

test('จัดแล้ว: ช่วง 7 วัน / ยังไม่มีเจ้าหน้าที่', () => {
  const { rangeCounts } = build({ bucket: 'scheduled' });
  assert.deepEqual(rangeCounts, { all: 4, '7d': 4, unassigned: 1 });
  assert.equal(build({ bucket: 'scheduled', range: 'unassigned' }).listedCount, 1);
});

test('ปิดแล้ว: ทำไม่ครบ/ทำไม่ได้ขึ้นก่อน · เหตุผลอยู่ในบรรทัดสถานะ', () => {
  const { groups } = build({ bucket: 'closed' });
  assert.deepEqual(groups.map((g) => g.key), ['cl-follow', 'cl-done']);
  assert.equal(groups[0].rows[0].status.tone, 'danger');
  assert.equal(groups[0].rows[0].status.text, 'ลูกค้าปิดร้านไม่แจ้งล่วงหน้า');
  assert.equal(groups[1].rows[0].rel.text, 'เข้าช้ากว่านัด 1 วัน');
  assert.equal(groups[1].rows[0].actions.report, true);
});

test('เลือกทีมแล้วงานที่ยังไม่มีเจ้าหน้าที่ยังอยู่ (ทุกทีมหยิบได้) · งานของทีมอื่นหายไป', () => {
  const view = build({ bucket: 'overdue', teamFilter: 'SOUTH' });
  assert.deepEqual(view.rows.filter((r) => r.bucket === 'overdue').map((r) => r.id), ['O-none']);
  assert.equal(view.rows.find((r) => r.id === 'O-none').who.sub, 'ทุกทีมหยิบได้');
});

test('ค้นหาได้ทุกอย่างที่ตาเห็นบนการ์ด (เจ้าของด่าน · เหตุ · ลูกค้า)', () => {
  assert.equal(build({ bucket: 'waiting', search: 'SA' }).listedCount >= 1, true);
  assert.equal(build({ bucket: 'waiting', search: 'บจก. ทดสอบ' }).listedCount, 1);
  assert.equal(build({ bucket: 'waiting', search: 'ไม่มีคำนี้แน่ ๆ' }).listedCount, 0);
  /* ป้ายหัวการ์ด · ภาระของไซต์ · บรรทัดผ่านด่าน ก็ต้องค้นเจอ (รีวิวก่อน merge) */
  assert.equal(build({ bucket: 'waiting', search: 'วันเสนอผ่านแล้ว' }).listedCount, 1);
  assert.equal(build({ bucket: 'waiting', search: '3 จุด · 1 แพ็ค' }).listedCount, 1);
  assert.equal(build({ bucket: 'waiting', search: 'ไม่ต้องตรวจสัญญา' }).listedCount, 1);
  /* ค้นหาแล้วร่างไกลต้องค้นเจอด้วย — ของที่ถูกพับไว้ต้องไม่ค้นไม่เจอ */
  assert.equal(build({ bucket: 'waiting', search: 'SV-03' }).listedCount, 1);
});

test('ชิปสัปดาห์กรองเฉพาะร่างที่เสนอวันในสัปดาห์นั้น', () => {
  const view = build({ bucket: 'waiting', within: { from: '2026-09-20', to: '2026-09-26' } });
  assert.deepEqual(view.rows.filter((r) => r.bucket === 'waiting').length, 4, 'rows ยังเก็บทั้งหมด');
  assert.equal(view.listedCount, 2, 'แสดงแค่ SV-01 กับ SV-02');
  assert.equal(draftsInRange(visits, { from: '2026-09-20', to: '2026-09-26' }, ALL_TEAMS, crewByUser), 2);
});

/* ⭐ มติ 24/09 แบบ A — โมดัลจัดคิวอ่านคำชุดเดียวกับการ์ด ⇒ ยกตัวช่วยออกมาเป็น export โดย **ผลเท่าของเดิมเป๊ะ** */
test('⭐ gateItemView = แถวด่านที่การ์ดวาดมาตลอด · GATE_FIX = ป้ายลิงก์แก้ + ช่องที่พาโฟกัสไป', () => {
  const items = gateBlockedItems(evaluateVisitGate({ kind: 'remove', scheduledDate: '2026-09-23', startTime: '07:00' }, {
    site: { id: 'S1', accessFrom: '09:00', accessTo: '17:00' },
  }));
  assert.deepEqual(items.map(gateItemView), [
    { key: 'assignee', owner: 'TS', ownerTone: 'info', reason: 'ยังไม่มอบหมาย', fix: 'assignee' },
    { key: 'access', owner: 'TS', ownerTone: 'info', reason: 'เข้าก่อนเวลาที่ไซต์อนุญาต (09:00–17:00)', fix: 'schedule' },
  ]);
  // ข้อที่ไม่มีลิงก์แก้ คงเหตุเต็มประโยค (ไม่ตัดท่อนหลังทิ้ง)
  assert.deepEqual(gateItemView({ key: 'contract', owner: 'SA', reason: 'ก — ข', fix: null }),
    { key: 'contract', owner: 'SA', ownerTone: 'accent', reason: 'ก — ข', fix: null });
  assert.deepEqual(GATE_FIX.assignee, { label: 'เลือกเจ้าหน้าที่', field: 'assignee' });
  assert.deepEqual(GATE_FIX.schedule, { label: 'แก้วัน/เวลา', field: 'scheduledDate' });
  assert.ok(Object.isFrozen(GATE_FIX));
  // การ์ดบนหน้าจัดคิวใช้ตัวเดียวกัน (ไม่มีแมปปิ้งชุดที่สอง)
  const ts = build({ bucket: 'waiting' }).groups.find((g) => g.key === 'ts');
  assert.deepEqual(ts.rows[0].gateItems[0], gateItemView(gateBlockedItems(ts.rows[0].gate)[0]));
});

test('⭐ siteLoadText = ช่องภาระบนการ์ด (ศูนย์ = ว่าง ให้การ์ดเขียนขีด) · showZero สำหรับโมดัล', () => {
  assert.equal(siteLoadText({ assets: 3, packs: 2 }), '3 จุด · 2 แพ็ค');
  assert.equal(siteLoadText({ assets: 0, packs: 1 }), '0 จุด · 1 แพ็ค');
  assert.equal(siteLoadText({ assets: 0, packs: 0 }), '');
  assert.equal(siteLoadText(null), '');
  assert.equal(siteLoadText({ assets: 0, packs: 0 }, { showZero: true }), '0 จุด · 0 แพ็ค');
  const row = build({ bucket: 'scheduled' }).rows.find((r) => r.id === 'S-a');
  assert.equal(row.siteLoadText, siteLoadText(workload.S1));
  assert.equal(row.siteLoadText, '6 จุด · 2 แพ็ค');
});

test('คำกลางย้ายไป queueWords แล้วส่งต่อจากที่นี่ — ตัวเดียวกัน ไม่ใช่สำเนา', () => {
  assert.equal(dayText, queueWords.dayText);
  assert.equal(relDayText, queueWords.relDayText);
  assert.equal(siteLoadText, queueWords.siteLoadText);
  assert.deepEqual(relDayText('2026-10-01', '2026-09-24', 'เลยวันที่ต้องการ'), { text: 'อีก 7 วัน', tone: '' });
  assert.deepEqual(relDayText('2026-09-25', '2026-09-24', 'x'), { text: 'พรุ่งนี้', tone: '' });
  assert.deepEqual(relDayText('2026-09-24', '2026-09-24', 'x'), { text: 'วันนี้', tone: '' });
  assert.deepEqual(relDayText('2026-09-21', '2026-09-24', 'เลยวันที่ต้องการ'), { text: 'เลยวันที่ต้องการ 3 วัน', tone: 'warn' });
  assert.deepEqual(relDayText('', '2026-09-24', 'x'), { text: '', tone: '' });
});

test('queueWords: "ที่ไหน" ของไซต์ · อายุคำร้อง', () => {
  assert.equal(queueWords.siteWhereText({ routeZone: 'BKK', accessNote: 'เข้าทางลานจอด B1 แลกบัตรที่ รปภ.' }),
    'เขต BKK · เข้าทางลานจอด B1 แลกบัตรที่ รปภ.');
  assert.equal(queueWords.siteWhereText({ routeZone: 'BKK' }), 'เขต BKK');
  assert.equal(queueWords.siteWhereText({ address: '12 ถ.สุขุมวิท' }), '12 ถ.สุขุมวิท');
  assert.equal(queueWords.siteWhereText(null), '');
  // ส่ง 10:00 น. เวลาไทยของวันที่ 23 · วันนี้ 24 ⇒ ค้างมา 1 วัน
  assert.equal(queueWords.requestAgeText({ submittedAt: '2026-09-23T03:00:00.000Z' }, '2026-09-24'), 'ส่งเมื่อ พ. 23 ก.ย. · ค้างมา 1 วัน');
  // ⚠️ ส่งตี 1 เวลาไทย (ยังเป็นวันก่อนตามนาฬิกา UTC) = วันไทย ไม่ใช่วัน UTC
  assert.equal(queueWords.requestAgeText({ submittedAt: '2026-09-23T18:30:00.000Z' }, '2026-09-24'), 'ส่งเมื่อ พฤ. 24 ก.ย.');
  assert.equal(queueWords.requestAgeText({}, '2026-09-24'), '');
});

test('ข้อความช่วย: วัน · ต้นเรื่อง · โทนเจ้าของด่าน · ชิปสัปดาห์', () => {
  assert.equal(dayText('2026-09-22'), 'อ. 22 ก.ย.');
  assert.equal(dayText('2026-10-05'), 'จ. 5 ต.ค.');
  assert.equal(originText({ planId: 'P1' }), 'จากรอบบริการ');
  assert.equal(originText({ requestId: 'R1', planId: 'P1' }), 'จากคำร้องประเมินพื้นที่');
  assert.equal(originText({ kind: 'remove' }), 'ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา');
  assert.equal(originText({ kind: 'repair' }), 'งานนอกรอบ');
  assert.equal(ownerTone('SA → FN'), 'warning');
  assert.equal(ownerTone('TS'), 'info');
  // ตารางเปิดทีละสัปดาห์ อา–ส (มติ 2026-09-26) ⇒ ต้นช่วงเป็นวันอาทิตย์เสมอ
  assert.equal(weekChipText('2026-09-20'), 'วันเสนอ 20–26 ก.ย.');
  assert.equal(weekChipText('2026-09-27'), 'วันเสนอ 27 ก.ย.–3 ต.ค.', 'สัปดาห์คร่อมเดือนบอกเดือนทั้งสองฝั่ง');
  assert.equal(weekChipText('2026-12-27'), 'วันเสนอ 27 ธ.ค.–2 ม.ค.');
});

/* ═══ คำร้องรอลงคิว (มติเจ้าของ 23/09) ═══════════════════════════════════════════
   ⭐ การ์ดของคำร้องประเมินพื้นที่ที่ยังไม่มีนัด — กลุ่มแรกของถังรอจัด · ลงคิวได้จากหน้านี้ */
const survey = (o) => ({
  kind: 'site_survey', dept: 'TS', siteId: 'S1', closedAt: null, surveyVisit: null,
  requestedDueDate: null, requestedDueTime: null, requestedResultDate: null, ...o,
});
const surveyRequests = [
  survey({
    id: 'R-ack', docNo: 'AS-26090011', status: 'pending', title: 'ประเมินล็อบบี้ชั้น 1',
    requestedByName: 'วิภา ขายเก่ง', submittedAt: '2026-09-19T03:00:00.000Z',
    requestedDueDate: '2026-09-25', requestedDueTime: '10:00', requestedResultDate: '2026-09-29',
  }),
  survey({
    id: 'R-queue', docNo: 'AS-26090012', status: 'acknowledged', siteId: 'S-BAD',
    acknowledgedAt: '2026-09-22T01:00:00.000Z', acknowledgedByName: 'หัวหน้า TS',
    requestedByName: 'ธนา ขายดี', requestedDueDate: '2026-09-21',
    // 03:00 น. เวลาไทยของวันที่ 22 — ตัดสตริง UTC จะได้วันที่ 21 (บั๊กตี 3)
    submittedAt: '2026-09-21T20:00:00.000Z',
  }),
  survey({
    id: 'R-requeue', docNo: 'AS-26090013', status: 'acknowledged', siteId: 'S-NEW', customerName: 'ร้านใหม่',
    acknowledgedAt: '2026-09-20T01:00:00.000Z', committedDueDate: '2026-09-23', committedDueTime: '13:30:00',
    committedResultDate: '2026-09-26', dueCommittedAt: '2026-09-20T02:00:00.000Z', assigneeName: 'สมชาย ใจดี',
    requestedByName: 'วิภา ขายเก่ง', submittedAt: '2026-09-18T03:00:00.000Z',
    surveyVisit: { id: 'V-old', code: 'SV-99', status: 'cancelled' },
  }),
  // ช่างไปถึงไซต์แล้ว — ไม่ใช่การ์ด (รอผลประเมิน)
  survey({
    id: 'R-done', docNo: 'AS-26090014', status: 'acknowledged', committedDueDate: '2026-09-20',
    surveyVisit: { id: 'V-done', code: 'SV-98', status: 'done' },
  }),
];

test('⭐ คำร้องรอลงคิวเป็นกลุ่มแรกของถังรอจัด · เรียง นัดหลุด → รอรับเรื่อง → รอลงคิว', () => {
  const view = build({ bucket: 'waiting', surveyRequests });
  assert.deepEqual(view.groups.map((g) => g.key), ['requests', 'ready', 'ts', 'others']);
  const group = view.groups[0];
  assert.equal(group.label, 'คำร้องรอลงคิว');
  assert.deepEqual(group.rows.map((r) => r.id), ['R-requeue', 'R-ack', 'R-queue']);
  assert.equal(group.sub, 'รอรับเรื่อง 1 · รอลงคิว 1 · ไม่มีนัดบนตาราง 1');
  assert.equal(group.total, '3 ใบ');
  assert.equal(group.collapsible, false, 'ไม่พับ — งานที่ TS ต้องลงมือเอง');
  assert.equal(group.tone, 'warn');
  // นับเข้าถังรอจัด · ไม่ขึ้นถังอื่น
  assert.equal(view.counts.waiting, 3 + 3);
  for (const other of ['overdue', 'scheduled', 'closed']) {
    const v = build({ bucket: other, surveyRequests });
    assert.equal(v.groups.some((g) => g.key === 'requests'), false, other);
    assert.equal(v.groups.flatMap((g) => g.rows).some((r) => r.type === 'request'), false, other);
  }
});

test('⭐ requestCount = จำนวนการ์ดคำร้อง (อาร์เรย์เดียวกัน) · นับก่อนค้นหา · ไม่มีคำร้อง = 0', () => {
  const view = build({ bucket: 'waiting', surveyRequests });
  assert.equal(view.requestCount, 3);
  assert.equal(view.requestCount, view.groups.find((g) => g.key === 'requests').rows.length);
  const searched = build({ bucket: 'waiting', surveyRequests, search: 'AS-26090011' });
  /* ตัวเลขบนแถบต้นทางงานไม่ขยับตามคำค้น — ปุ่มของมัน (`showRequestCards`) ล้างคำค้นก่อนพาไป ⇒ เลข = การ์ดที่เห็นหลังกด
     ⚠️ ไม่ใช่ "กติกาเดียวกับเม็ดถัง" อีกแล้ว — เม็ดถังนับตามคำค้น เพราะกดเม็ดแล้วคำค้นยังอยู่ (M24c · 20/10) */
  assert.equal(searched.requestCount, 3, 'ตัวเลขบนแถบไม่ขยับตามคำค้น (ปุ่มล้างคำค้นก่อนพาไป)');
  assert.equal(searched.groups.find((g) => g.key === 'requests').rows.length, 1);
  assert.equal(build({ bucket: 'waiting' }).requestCount, 0);
  assert.equal(build({ bucket: 'waiting', surveyRequests: null }).requestCount, 0, 'null = ไม่มีสิทธิ์/โหลดไม่ได้');
});

test('🔴 ใบที่มีนัดที่ยังมีชีวิตในชุดนัดของจอแล้ว ไม่ขึ้นการ์ดคำร้องซ้ำ', () => {
  const queued = survey({ id: 'R-queued', docNo: 'AS-26090015', status: 'acknowledged', committedDueDate: '2026-09-24' });
  const liveVisit = v({ id: 'V-q', code: 'SV-50', status: 'scheduled', kind: 'survey', requestId: 'R-queued', scheduledDate: '2026-09-24', assigneeId: 'U1' });
  const view = build({ bucket: 'waiting', visits: [...visits, liveVisit], surveyRequests: [...surveyRequests, queued] });
  assert.equal(view.requestCount, 3);
  assert.equal(view.rows.some((r) => r.id === 'R-queued'), false);
});

test('⭐ ตัวกรองทีมไม่ซ่อนการ์ดคำร้อง (ยังไม่มีเจ้าหน้าที่) · ชิปสัปดาห์ซ่อน (ชิปนับร่างเท่านั้น)', () => {
  const south = build({ bucket: 'waiting', teamFilter: 'SOUTH', surveyRequests });
  assert.equal(south.requestCount, 3);
  assert.equal(south.groups[0].rows.length, 3);
  // คนว่างนับเฉพาะคนในทีมที่เลือก
  assert.equal(south.rows.find((r) => r.id === 'R-ack').dayLoad.text, 'วันนั้นว่าง 1 จาก 1 คน');

  const week = build({ bucket: 'waiting', surveyRequests, within: { from: '2026-09-20', to: '2026-09-26' } });
  assert.equal(week.groups.some((g) => g.key === 'requests'), false);
  assert.equal(week.listedCount, 2, 'เท่าตัวเลขบนชิปสัปดาห์ (ร่างสองใบ)');
  assert.equal(week.requestCount, 3, 'ตัวเลขบนแถบต้นทางงานไม่ขึ้นกับชิป');
});

test('การ์ดรอรับเรื่อง: วันที่ต้องการ · ผู้ขอ · ค้างมากี่วัน · คนว่างวันนั้น · ปุ่มรับเรื่อง', () => {
  const row = build({ bucket: 'waiting', surveyRequests }).rows.find((r) => r.id === 'R-ack');
  assert.equal(row.type, 'request');
  assert.equal(row.visit, null);
  assert.equal(row.code, 'AS-26090011');
  assert.equal(row.href, '/requests/R-ack');
  assert.equal(row.kindLabel, 'ประเมินพื้นที่');
  assert.deepEqual(row.tag, { tone: 'warning', label: 'รอรับเรื่อง' });
  assert.equal(row.siteCode, 'ST-1001 · BKK-C');
  assert.equal(row.siteName, 'เซ็นทรัลเวิลด์');
  assert.equal(row.customer, 'บจก. เซ็นทรัล');
  assert.equal(row.dateLine, 'ต้องการเข้า ศ. 25 ก.ย.');
  assert.equal(row.timeLine, 'ช่วง 10:00');
  assert.deepEqual(row.rel, { text: 'อีก 3 วัน', tone: '' });
  assert.equal(row.who.text, 'ผู้ขอ วิภา ขายเก่ง');
  assert.equal(row.who.sub, 'ส่งเมื่อ ส. 19 ก.ย. · ค้างมา 3 วัน');
  assert.equal(row.who.linkId, null);
  assert.equal(row.siteLoadText, 'ต้องการผล อ. 29 ก.ย.');
  assert.equal(row.dayLoad.text, 'วันนั้นว่าง 2 จาก 2 คน');
  assert.deepEqual(row.status, { label: 'ขั้น 1/2', tone: 'warning', text: 'ยังไม่มีใครรับเรื่อง — รับเรื่องก่อน แล้วจึงลงคิวเข้าพื้นที่' });
  assert.equal(row.title, 'ประเมินล็อบบี้ชั้น 1');
  assert.equal(row.origin, REQUEST_ORIGIN_TEXT);
  assert.deepEqual(row.gateItems, []);
  assert.equal(row.actionLabel, 'รับเรื่อง');
  assert.equal(row.actions.acknowledge, true);
  assert.equal(row.actions.commitDue, false, 'ไม่มีคลิกเดียวที่ข้ามสองก้าว');
  assert.equal(row.actions.calendar, false, 'ยังไม่มีนัดให้ดูบนปฏิทิน');
  // ด่านปุ่มรับเรื่อง = ตัวเดียวกับที่ server ใช้ตีกลับ
  assert.equal(row.ackBlocker, acknowledgeRequestError(row.request) || '');
  const dup = surveyRequestRow(survey({
    id: 'R-dup', status: 'pending',
    items: [{ lineKind: 'product_dev', categoryCode: '01', scentId: 'SC-1' }, { lineKind: 'product_dev', categoryCode: '01', scentId: 'SC-1' }],
  }), { todayIso: TODAY });
  assert.match(dup.ackBlocker, /ซ้ำหมวด × กลิ่น/);
});

test('การ์ดรอลงคิว: เลยวันที่ต้องการ = เตือน · วันส่งนับตามวันไทย · ปุ่มลงคิวเข้าพื้นที่', () => {
  const row = build({ bucket: 'waiting', surveyRequests }).rows.find((r) => r.id === 'R-queue');
  /* 🐞 รีวิว 24/09: ป้ายมุมเคยเป็นคำของสถานะใบ ("รอกำหนดส่ง") ขณะที่บรรทัดย่อยของกลุ่มเรียกสถานะเดียวกันว่า
     "รอลงคิว" ⇒ จอเดียวสองคำ · ป้ายการ์ดใช้คำของขั้น (`SURVEY_QUEUE_STEP_LABELS`) ชุดเดียวกับบรรทัดย่อย */
  assert.deepEqual(row.tag, { tone: 'warning', label: 'รอลงคิว' });
  assert.deepEqual(row.rel, { text: 'เลยวันที่ต้องการ 1 วัน', tone: 'warn' });
  assert.equal(row.who.sub, 'ส่งเมื่อ อ. 22 ก.ย.', 'ส่งตี 3 วันที่ 22 เวลาไทย ≠ วันที่ 21 · วันนี้ = ไม่ค้าง');
  assert.equal(row.dayLoad, null, 'วันที่ผ่านไปแล้วไม่บอกคนว่าง');
  assert.equal(row.status.label, 'ขั้น 2/2');
  assert.equal(row.status.text, 'รับเรื่องแล้ว โดย หัวหน้า TS — เลือกวัน เวลา เจ้าหน้าที่ และวันส่งผล');
  assert.equal(row.actionLabel, 'ลงคิวเข้าพื้นที่');
  assert.equal(row.actions.commitDue, true);
  assert.equal(row.actions.acknowledge, false);
  assert.equal(row.ackBlocker, '');
  assert.equal(row.customer, 'บจก. ทดสอบ');
});

test('การ์ดนัดหลุด: วันเดิมที่รับปาก · นัดเดิมจบแบบไหน · ไซต์ที่ไม่อยู่ในทะเบียนใช้ชื่อลูกค้าจากใบ', () => {
  const row = build({ bucket: 'waiting', surveyRequests }).rows.find((r) => r.id === 'R-requeue');
  assert.deepEqual(row.tag, { tone: 'warning', label: 'ไม่มีนัดบนตาราง' });
  assert.equal(row.dateLine, 'นัดเดิม พ. 23 ก.ย.');
  assert.equal(row.timeLine, 'เวลา 13:30');
  assert.deepEqual(row.rel, { text: 'พรุ่งนี้', tone: '' });
  assert.equal(row.who.sub, 'ส่งเมื่อ ศ. 18 ก.ย. · ค้างมา 4 วัน · มอบหมายไว้ สมชาย ใจดี');
  assert.equal(row.siteLoadText, 'รับปากส่งผล ส. 26 ก.ย.');
  assert.equal(row.dayLoad.text, 'วันนั้นว่าง 1 จาก 2 คน');
  assert.deepEqual(row.status, { label: 'ลงคิวใหม่', tone: 'warning', text: 'นัดเดิม SV-99 ยกเลิก — ลงคิวใหม่' });
  assert.equal(row.actionLabel, 'ลงคิวใหม่');
  assert.equal(row.actionHint, 'ใบมีวันแล้วแต่นัดยังไม่ขึ้นตารางเจ้าหน้าที่');
  assert.equal(row.siteCode, '');
  assert.equal(row.siteName, 'S-NEW');
  assert.equal(row.customer, 'ร้านใหม่');
  // ไม่มีนัดเดิมเลย (สร้างไม่สำเร็จ/ถูกลบ)
  const lost = surveyRequestRow({ ...row.request, surveyVisit: null }, { todayIso: TODAY });
  assert.equal(lost.status.text, 'นัดเดิมไม่อยู่บนตาราง (สร้างไม่สำเร็จหรือถูกลบ) — ลงคิวใหม่');
  // ใบที่ไม่ใช่การ์ดแล้ว = null
  assert.equal(surveyRequestRow(surveyRequests[3], { todayIso: TODAY }), null);
});

test('⭐ ค้นหาเจอทุกอย่างที่ตาเห็นบนการ์ดคำร้อง', () => {
  const find = (search) => build({ bucket: 'waiting', surveyRequests, search }).groups
    .flatMap((g) => g.rows).filter((r) => r.type === 'request').map((r) => r.id);
  assert.deepEqual(find('AS-26090011'), ['R-ack']);
  assert.deepEqual(find('วิภา'), ['R-requeue', 'R-ack']);
  assert.deepEqual(find('ประเมินล็อบบี้'), ['R-ack']);
  assert.deepEqual(find('รอรับเรื่อง'), ['R-ack']);
  // 🐞 คำบนป้าย/บรรทัดย่อยต้องค้นเจอ · คำสถานะของใบ (ที่หน้าใบใช้) ยังค้นเจอเป็นคำพ้อง
  assert.deepEqual(find('รอลงคิว'), ['R-queue']);
  assert.deepEqual(find('รอกำหนดส่ง'), ['R-queue']);
  assert.deepEqual(find('ไม่มีนัดบนตาราง'), ['R-requeue']);
  assert.deepEqual(find('SV-99'), ['R-requeue']);
  assert.deepEqual(find('ร้านใหม่'), ['R-requeue']);
  assert.deepEqual(find('ต้องการผล'), ['R-ack']);
  assert.deepEqual(find('เลยวันที่ต้องการ'), ['R-queue']);
  assert.deepEqual(find('ลงคิวเข้าพื้นที่'), ['R-ack', 'R-queue'], 'คำสั่งบนการ์ด + ปุ่ม');
  assert.deepEqual(find('คำร้องประเมินพื้นที่'), ['R-requeue', 'R-ack', 'R-queue']);
});

/* ═══ ประเมินจากแบบ (งวด S2b · กลุ่ม E-1) ═══════════════════════════════════════════════
   ⭐ งานโต๊ะ (ทุกพื้นที่ประเมินจากแบบ) ไม่ลงคิว ⇒ การ์ดมีได้ขั้นเดียวคือ "รอรับเรื่อง" พร้อมป้าย "จากแบบ · ไม่ต้องลงคิว"
      และต้องไม่พูดเรื่องวันเข้าพื้นที่ / คนว่าง / ลงคิว · ใบที่หัวหน้าสลับกลับเป็นลงหน้างานบอกเหตุผลที่บรรทัดต้นเรื่อง
   ⚠️ ธงสองตัว (`surveyNeedsVisit` · `surveyMethodBack`) มาจากตัวโหลด `loadSurveyQueueRequests` — ไม่ติดมา = การ์ดเดิมทุกช่อง */
const deskRequest = survey({
  id: 'R-desk', docNo: 'AS-26090015', status: 'pending', title: 'ประเมินจากแบบ 3 ห้องประชุม',
  requestedByName: 'วิภา ขายเก่ง', submittedAt: '2026-09-21T03:00:00.000Z',
  // วันเข้าพื้นที่ที่ค้างมาจากตอนยื่น — การ์ดงานโต๊ะต้องไม่หยิบมาพูด
  requestedDueDate: '2026-09-25', requestedDueTime: '10:00', requestedResultDate: '2026-09-29',
  surveyNeedsVisit: false, surveyMethodBack: null,
});
const backRequest = survey({
  id: 'R-back', docNo: 'AS-26090016', status: 'acknowledged',
  acknowledgedAt: '2026-09-22T01:00:00.000Z', acknowledgedByName: 'หัวหน้า TS',
  requestedByName: 'ธนา ขายดี', requestedDueDate: '2026-09-30', submittedAt: '2026-09-20T03:00:00.000Z',
  surveyNeedsVisit: true, surveyMethodBack: { reason: 'แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง' },
});
const rowOf = (request, extra = {}) => surveyRequestRow(request, { todayIso: TODAY, sitesById, live: [], peopleInView: crewPeople, ...extra });

test('⭐ S2b การ์ดงานโต๊ะรอรับเรื่อง: ป้าย "จากแบบ · ไม่ต้องลงคิว" · บรรทัดวัน = วันที่ต้องการผล · ไม่นับคนว่าง · คำสั่งไม่พูดถึงการลงคิว', () => {
  const row = rowOf(deskRequest);
  assert.equal(row.step, 'acknowledge', 'งานโต๊ะที่ยังไม่รับเรื่องยังเป็นการ์ด "รับเรื่อง" เหมือนทุกใบ');
  assert.equal(row.methodChip, SURVEY_QUEUE_DESK_CHIP);
  assert.equal(row.methodChip, 'จากแบบ · ไม่ต้องลงคิว');
  assert.deepEqual(row.tag, { tone: 'warning', label: 'รอรับเรื่อง' }, 'ป้ายขั้นไม่เปลี่ยน — ป้ายวิธีเป็นป้ายที่สองข้าง ๆ');
  // บรรทัดวัน: วันที่ผู้ขอต้องการผล (ไม่ใช่วันเข้าพื้นที่) · ไม่มีช่วงเวลา · ระยะห่างนับจากวันนั้น
  assert.equal(row.dateLine, 'ต้องการผล อ. 29 ก.ย.');
  assert.equal(row.timeLine, '');
  assert.deepEqual(row.rel, { text: 'อีก 7 วัน', tone: '' });
  // ช่องภาระ: วันส่งผลขึ้นไปอยู่บรรทัดวันแล้ว · ไม่มีใครต้องไปหน้างาน ⇒ ไม่นับคนว่าง แม้มีคนในมุมมองและวันเข้าที่ยังมาไม่ถึง
  assert.equal(row.siteLoadText, '');
  assert.equal(row.dayLoad, null);
  /* 🔴 S2b แก้หลังตรวจจอ planner-q4: ไม่มีป้ายขั้น — "ขั้น 1/2" บอกว่ามีขั้นสอง ซึ่งงานโต๊ะไม่มี (รับเรื่องแล้วการ์ดหาย)
        ป้ายมุม "รอรับเรื่อง" กับป้าย "จากแบบ · ไม่ต้องลงคิว" บอกครบแล้ว ⇒ เหลือแค่คำสั่ง · คำค้นไม่มี "ขั้น" (ตาไม่เห็น) */
  assert.deepEqual(row.status, { label: '', tone: '', text: DESK_REQUEST_ACK_TEXT });
  assert.doesNotMatch(row.haystack, /ขั้น \d\/\d/);
  assert.equal(DESK_REQUEST_ACK_TEXT, 'ยังไม่มีใครรับเรื่อง — รับเรื่องแล้วหัวหน้าฝ่ายบริการรับปากวันส่งผล ไม่ต้องลงคิว');
  assert.equal(row.origin, DESK_REQUEST_ORIGIN_TEXT);
  assert.equal(DESK_REQUEST_ORIGIN_TEXT, `คำร้องประเมินพื้นที่ · ${SURVEY_METHOD_LABEL.drawing}`);
  assert.equal(row.origin, 'คำร้องประเมินพื้นที่ · ประเมินจากแบบ');
  // ปุ่มเดียว: รับเรื่อง (ด่านตัวเดียวกับ server) — ไม่มีปุ่มลงคิว ไม่มีคำใบ้ ไม่มีปฏิทิน
  assert.equal(row.actionLabel, 'รับเรื่อง');
  assert.equal(row.actionHint, '');
  assert.deepEqual(row.actions, {
    acknowledge: true, commitDue: false, release: false, open: false, assign: false, report: false, calendar: false, delete: false,
  });
  assert.equal(row.ackBlocker, acknowledgeRequestError(row.request) || '');
  // ช่องที่ไม่เกี่ยวกับวิธีประเมินยังเป็นของการ์ดคำร้องตามเดิม
  assert.equal(row.code, 'AS-26090015');
  assert.equal(row.href, '/requests/R-desk');
  assert.equal(row.who.text, 'ผู้ขอ วิภา ขายเก่ง');
  assert.equal(row.who.sub, 'ส่งเมื่อ จ. 21 ก.ย. · ค้างมา 1 วัน');
  assert.equal(row.title, 'ประเมินจากแบบ 3 ห้องประชุม');
  // ทั้งการ์ดไม่มีคำของงานหน้างาน
  assert.doesNotMatch(row.haystack, /ลงคิวเข้าพื้นที่|ต้องการเข้า|วันนั้นว่าง|ช่วง 10:00/);

  // ผู้ขอไม่ได้ให้วันส่งผล = คำเดิมของการ์ด · ไม่เดาระยะห่าง
  const noDate = rowOf({ ...deskRequest, requestedResultDate: null });
  assert.equal(noDate.dateLine, 'ผู้ขอไม่ระบุวันที่ต้องการ');
  assert.deepEqual(noDate.rel, { text: '', tone: '' });
  assert.equal(noDate.dayLoad, null);
  // เลยวันที่ต้องการผลแล้ว = เตือน ด้วยหางเดิม "เลยวันที่ต้องการ"
  assert.deepEqual(rowOf({ ...deskRequest, requestedResultDate: '2026-09-20' }).rel, { text: 'เลยวันที่ต้องการ 2 วัน', tone: 'warn' });
});

test('⭐ S2b ค้นหาเจอทุกอย่างที่ตาเห็นบนการ์ดงานโต๊ะ (ป้ายวิธี · คำสั้น · คำเต็ม) · รับเรื่องแล้วใบออกจากกลุ่มและตัวเลขบนแถบ', () => {
  const requests = [...surveyRequests, deskRequest];
  const find = (search) => build({ bucket: 'waiting', surveyRequests: requests, search }).groups
    .flatMap((g) => g.rows).filter((r) => r.type === 'request').map((r) => r.id);
  assert.deepEqual(find('จากแบบ'), ['R-desk']);
  assert.deepEqual(find('ไม่ต้องลงคิว'), ['R-desk']);
  assert.deepEqual(find('จากแบบ · ไม่ต้องลงคิว'), ['R-desk'], 'ป้ายทั้งคำ');
  assert.deepEqual(find('ประเมินจากแบบ'), ['R-desk']);
  assert.deepEqual(find(SURVEY_METHOD_CHIP.drawing), ['R-desk']);
  assert.deepEqual(find('รับปากวันส่งผล'), ['R-desk'], 'คำสั่งบนการ์ด');
  assert.deepEqual(find('ต้องการผล อ. 29 ก.ย.'), ['R-ack', 'R-desk'], 'วันเดียวกันของสองใบ — ใบหน้างานอยู่ช่องภาระ ใบงานโต๊ะอยู่บรรทัดวัน');
  assert.deepEqual(find('ลงคิวเข้าพื้นที่'), ['R-ack', 'R-queue'], 'การ์ดงานโต๊ะไม่ถูกเรียกว่างานลงคิว');
  // เรียงในกลุ่ม: นัดหลุด → รอรับเรื่อง (สองใบ ตามวันที่ต้องการแล้ววันส่ง) → รอลงคิว · บรรทัดย่อยนับรวมใบงานโต๊ะ
  const group = build({ bucket: 'waiting', surveyRequests: requests }).groups.find((g) => g.key === 'requests');
  assert.deepEqual(group.rows.map((r) => r.id), ['R-requeue', 'R-ack', 'R-desk', 'R-queue']);
  assert.equal(group.sub, 'รอรับเรื่อง 2 · รอลงคิว 1 · ไม่มีนัดบนตาราง 1');
  assert.equal(build({ bucket: 'waiting', surveyRequests: requests }).requestCount, 4);
  // รับเรื่องแล้ว = ไม่ใช่การ์ดอีก (ไม่มีนัดให้ลง) ⇒ ตัวเลขบนแถบต้นทางงานลดลงเอง — หน้าไม่ต้องนับเอง
  const acked = { ...deskRequest, status: 'acknowledged', acknowledgedAt: '2026-09-22T02:00:00.000Z' };
  assert.equal(rowOf(acked), null);
  const after = build({ bucket: 'waiting', surveyRequests: [...surveyRequests, acked] });
  assert.equal(after.requestCount, 3);
  assert.equal(after.rows.some((r) => r.id === 'R-desk'), false);
});

/* 🔴 S2b แก้หลังตรวจจอ planner-q4: การ์ดงานโต๊ะไม่มีป้าย "ขั้น 1/2" (ไม่มีขั้นสองบนหน้านี้) · การ์ดลงหน้างานทุกขั้นได้ป้ายเดิม */
test('🔴 S2b planner-q4 การ์ดงานโต๊ะไม่มีป้ายขั้น · การ์ดลงหน้างานยังมีครบสามขั้น · การ์ดไม่วาดป้ายเปล่า', () => {
  const desk = rowOf(deskRequest);
  assert.equal(desk.status.label, '');
  assert.equal(desk.status.text, DESK_REQUEST_ACK_TEXT, 'คำสั่งยังอยู่ — หายแค่ป้าย');
  // การ์ดลงหน้างาน (ไม่มีธง / ธง "ต้องมีนัด") ได้ป้ายขั้นเดิมทุกขั้น
  for (const flag of [undefined, true]) {
    assert.deepEqual(surveyRequests.slice(0, 3).map((r) => rowOf({ ...r, surveyNeedsVisit: flag }).status.label),
      ['ขั้น 1/2', 'ขั้น 2/2', 'ลงคิวใหม่'], String(flag));
  }
  // ค้น "ขั้น 1/2" เจอแค่การ์ดลงหน้างานที่วาดป้ายนั้นจริง
  const found = build({ bucket: 'waiting', surveyRequests: [...surveyRequests, deskRequest], search: 'ขั้น 1/2' }).groups
    .flatMap((g) => g.rows).filter((r) => r.type === 'request').map((r) => r.id);
  assert.deepEqual(found, ['R-ack']);
  // การ์ดวาดป้ายขั้นเฉพาะเมื่อมีคำ — `StatusBadge` ของ `row.status` ไม่ถูกวาดเปล่า ๆ บนการ์ดงานโต๊ะ
  const card = readFileSync(new URL('../../components/service/ScheduleQueueCard.js', import.meta.url), 'utf8');
  assert.match(card, /\{row\.status\.label \? <StatusBadge size="sm" tone=\{row\.status\.tone\} label=\{row\.status\.label\} \/> : null\}/);
  assert.equal((card.match(/label=\{row\.status\.label\}/g) || []).length, 1, 'ป้ายขั้นวาดที่เดียว');
});

/* 🔴 S2b แก้หลังตรวจจอ planner-q6: งานโต๊ะ **ทุกใบ** เรียงด้วยวันที่ต้องการผล (วันที่การ์ดพิมพ์) — รวมใบที่ยื่นลงหน้างานแล้วหัวหน้า
   สลับทุกพื้นที่ (รูป RQ-AS-26100312 · ไม่มี `variant`) ซึ่งเดิมเรียงด้วยวันอยากให้เข้าที่การ์ดไม่ได้พิมพ์
   ⇒ ใบที่เลยวันต้องการผลมา 3 วันเคยอยู่ใต้ใบที่ครบกำหนดวันนี้ (S15/desk-variants) */
test('🔴 S2b planner-q6 งานโต๊ะที่ยื่นลงหน้างานเรียงด้วยวันที่ต้องการผล — ใบเลยกำหนดขึ้นเหนือใบที่ครบวันนี้ · ไม่มีวันผลไปท้าย', () => {
  const desk = (o) => survey({ status: 'pending', requestedByName: 'วิภา ขายเก่ง', surveyNeedsVisit: false, surveyMethodBack: null, ...o });
  // เลยวันต้องการผลมา 3 วัน แต่วันอยากให้เข้า (ค้างจากตอนยื่นลงหน้างาน) อีกเกือบสามสัปดาห์
  const late = desk({ id: 'R-late', docNo: 'AS-26090021', submittedAt: '2026-09-15T03:00:00.000Z',
    requestedDueDate: '2026-10-10', requestedDueTime: '11:00', requestedResultDate: '2026-09-19' });
  // ใบลงหน้างานที่ขอเข้าวันนี้
  const today = survey({ id: 'R-today', docNo: 'AS-26090022', status: 'pending', requestedByName: 'ธนา ขายดี',
    submittedAt: '2026-09-16T03:00:00.000Z', requestedDueDate: '2026-09-22', requestedResultDate: '2026-09-24' });
  // วันอยากให้เข้าผ่านไปแล้ว แต่ต้องการผลอีกแปดวัน
  const early = desk({ id: 'R-early', docNo: 'AS-26090023', submittedAt: '2026-09-17T03:00:00.000Z',
    requestedDueDate: '2026-09-20', requestedResultDate: '2026-09-30' });
  // ไม่มีวันต้องการผล (การ์ดพิมพ์ "ผู้ขอไม่ระบุวันที่ต้องการ") แม้มีวันอยากให้เข้าค้างอยู่
  const none = desk({ id: 'R-none', docNo: 'AS-26090024', submittedAt: '2026-09-18T03:00:00.000Z',
    requestedDueDate: '2026-09-21', requestedResultDate: null });
  const rows = build({ bucket: 'waiting', surveyRequests: [none, early, today, late] }).groups
    .find((g) => g.key === 'requests').rows;
  assert.deepEqual(rows.map((r) => r.id), ['R-late', 'R-today', 'R-early', 'R-none']);
  // ลำดับเดินตามวันที่การ์ดพิมพ์
  assert.deepEqual(rows.map((r) => r.dateLine), [
    'ต้องการผล ส. 19 ก.ย.', 'ต้องการเข้า อ. 22 ก.ย.', 'ต้องการผล พ. 30 ก.ย.', 'ผู้ขอไม่ระบุวันที่ต้องการ',
  ]);
  assert.deepEqual(rows[0].rel, { text: 'เลยวันที่ต้องการ 3 วัน', tone: 'warn' });
  // ใบลงหน้างานไม่ขยับ: ยังเรียงด้วยวันอยากให้เข้า (ไม่ใช่วันต้องการผล) — 22 ก.ย. ไม่ใช่ 24 ก.ย.
  const onsite = build({ bucket: 'waiting', surveyRequests: [
    survey({ ...today, id: 'R-a', docNo: 'AS-26090025', requestedDueDate: '2026-09-23', requestedResultDate: '2026-09-23' }),
    today,
  ] }).groups.find((g) => g.key === 'requests').rows.map((r) => r.id);
  assert.deepEqual(onsite, ['R-today', 'R-a']);
});

test('⭐ S2b ใบที่หัวหน้าสลับกลับเป็นลงหน้างาน: บรรทัดต้นเรื่องบอกเหตุผล · ยังเป็นการ์ด "ขั้น 2/2" ธรรมดา · ค้นเหตุผลเจอ', () => {
  const row = rowOf(backRequest);
  assert.equal(row.step, 'queue');
  assert.equal(row.origin, SURVEY_METHOD_BACK_ORIGIN('แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง'));
  assert.equal(row.origin, 'หัวหน้าเปลี่ยนเป็นลงหน้างาน: แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง');
  assert.equal(row.methodChip, null, 'ใบกลับมาเป็นงานหน้างานแล้ว — ไม่มีป้ายจากแบบ');
  assert.deepEqual(row.tag, { tone: 'warning', label: 'รอลงคิว' });
  assert.equal(row.status.label, 'ขั้น 2/2');
  assert.equal(row.status.text, 'รับเรื่องแล้ว โดย หัวหน้า TS — เลือกวัน เวลา เจ้าหน้าที่ และวันส่งผล');
  assert.equal(row.dateLine, 'ต้องการเข้า พ. 30 ก.ย.');
  assert.equal(row.actionLabel, 'ลงคิวเข้าพื้นที่');
  assert.equal(row.actions.commitDue, true);
  assert.equal(row.actions.acknowledge, false);
  // ทุกช่องนอกจากต้นเรื่อง (และคำค้นที่ตามต้นเรื่อง) เท่ากับการ์ดของใบเดียวกันที่ไม่เคยสลับ
  const { origin, haystack, request, ...rest } = row;
  const { origin: plainOrigin, haystack: plainHaystack, request: plainRequest, ...plainRest } = rowOf({ ...backRequest, surveyMethodBack: null });
  assert.deepEqual(rest, plainRest);
  assert.equal(plainOrigin, REQUEST_ORIGIN_TEXT);
  assert.ok(origin && haystack && request && plainHaystack && plainRequest);

  const find = (search) => build({ bucket: 'waiting', surveyRequests: [...surveyRequests, backRequest], search }).groups
    .flatMap((g) => g.rows).filter((r) => r.type === 'request').map((r) => r.id);
  assert.deepEqual(find('วัดเพดานจริง'), ['R-back']);
  assert.deepEqual(find('หัวหน้าเปลี่ยนเป็นลงหน้างาน'), ['R-back']);
  assert.deepEqual(find('จากแบบ'), [], 'ใบที่กลับมาลงหน้างานไม่ถูกค้นเจอด้วยคำของงานโต๊ะ');

  // เหตุผลว่าง / มีแต่ช่องว่าง = ต้นเรื่องเดิม (ไม่พิมพ์ "หัวหน้าเปลี่ยนเป็นลงหน้างาน: " ลอย ๆ)
  assert.equal(rowOf({ ...backRequest, surveyMethodBack: { reason: '   ' } }).origin, REQUEST_ORIGIN_TEXT);
  assert.equal(rowOf({ ...backRequest, surveyMethodBack: {} }).origin, REQUEST_ORIGIN_TEXT);
  // เฉพาะขั้นรอลงคิว — ใบที่นัดหลุดบอกเรื่องของนัดเดิมที่บรรทัดคำสั่งอยู่แล้ว ต้นเรื่องคงเดิม
  const requeued = rowOf({ ...surveyRequests[2], surveyNeedsVisit: true, surveyMethodBack: { reason: 'แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง' } });
  assert.equal(requeued.step, 'requeue');
  assert.equal(requeued.origin, REQUEST_ORIGIN_TEXT);

  /* ตะเข็บกับตัวโหลด: รูปของ `surveyMethodBack` ที่การ์ดอ่าน = รูปที่ `surveyQueueMethodBack` คืนจริง (`{ reason }` | null) */
  const loaded = surveyQueueMethodBack([
    { id: 'Z1', status: 'ok', methodReason: 'แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง', methodChangedAt: '2026-09-22T02:00:00.000Z' },
    { id: 'Z2', status: 'ok' },
  ]);
  assert.deepEqual(loaded, { reason: 'แบบไม่ตรงหน้างาน ต้องวัดเพดานจริง' });
  assert.equal(rowOf({ ...backRequest, surveyMethodBack: loaded }).origin, row.origin);
  assert.equal(surveyQueueMethodBack([{ id: 'Z1', status: 'ok' }]), null, 'ใบลงหน้างานที่ไม่เคยสลับ = null ⇒ ต้นเรื่องเดิม');
});

/* 🔴 สวิตช์ปิด / ใบลงหน้างานล้วน = การ์ดของวันนี้ทุกช่อง — เทียบกับผลของโค้ดก่อนงวด S2b ที่จดไว้ทั้งแถว
   (ค่าที่เพิ่มมีคีย์เดียวคือ `methodChip: null` · คำค้นไม่ขยับสักตัวอักษร) */
test('🔴 S2b การ์ดของใบลงหน้างานเท่ากับของวันนี้ทุกช่อง — ไม่ติดธงมา / ติดธง "ต้องมีนัด" มา ได้แถวเดียวกัน', () => {
  const today = {
    type: 'request', id: 'R-ack', visit: null, bucket: 'waiting', group: 'requests', step: 'acknowledge',
    gate: null, ready: false, stale: false, tag: { tone: 'warning', label: 'รอรับเรื่อง' }, readyText: '',
    code: 'AS-26090011', href: '/requests/R-ack', kind: 'survey', kindLabel: 'ประเมินพื้นที่',
    siteCode: 'ST-1001 · BKK-C', siteName: 'เซ็นทรัลเวิลด์', customer: 'บจก. เซ็นทรัล',
    dateLine: 'ต้องการเข้า ศ. 25 ก.ย.', timeLine: 'ช่วง 10:00', rel: { text: 'อีก 3 วัน', tone: '' },
    who: { text: 'ผู้ขอ วิภา ขายเก่ง', tone: '', sub: 'ส่งเมื่อ ส. 19 ก.ย. · ค้างมา 3 วัน', linkId: null },
    siteLoadText: 'ต้องการผล อ. 29 ก.ย.',
    dayLoad: { text: 'วันนั้นว่าง 2 จาก 2 คน', tone: 'ok', free: crewPeople },
    gateItems: [],
    status: { label: 'ขั้น 1/2', tone: 'warning', text: 'ยังไม่มีใครรับเรื่อง — รับเรื่องก่อน แล้วจึงลงคิวเข้าพื้นที่' },
    title: 'ประเมินล็อบบี้ชั้น 1', warns: [], origin: 'คำร้องประเมินพื้นที่ · ยังไม่มีนัด',
    actionLabel: 'รับเรื่อง', actionHint: '', ackBlocker: '', deleteBlocker: '',
    actions: {
      acknowledge: true, commitDue: false, release: false, open: false, assign: false, report: false, calendar: false, delete: false,
    },
    haystack: 'as-26090011 ประเมินพื้นที่ รอรับเรื่อง รอรับเรื่อง st-1001 · bkk-c เซ็นทรัลเวิลด์ บจก. เซ็นทรัล ต้องการเข้า ศ. 25 ก.ย. ช่วง 10:00 อีก 3 วัน ผู้ขอ วิภา ขายเก่ง ส่งเมื่อ ส. 19 ก.ย. · ค้างมา 3 วัน ต้องการผล อ. 29 ก.ย. วันนั้นว่าง 2 จาก 2 คน ขั้น 1/2 ยังไม่มีใครรับเรื่อง — รับเรื่องก่อน แล้วจึงลงคิวเข้าพื้นที่ ประเมินล็อบบี้ชั้น 1 คำร้องประเมินพื้นที่ · ยังไม่มีนัด รับเรื่อง',
  };
  const { request, site, ...row } = rowOf(surveyRequests[0]);
  assert.deepEqual(row, { ...today, methodChip: null });
  assert.equal(request, surveyRequests[0]);
  assert.equal(site, sitesById.get('S1'));

  // สามขั้นของใบลงหน้างาน: ธงจากตัวโหลด (`surveyNeedsVisit: true` · `surveyMethodBack: null`) ไม่เปลี่ยนอะไรบนการ์ด
  for (const base of surveyRequests.slice(0, 3)) {
    const { request: plainRequest, ...plain } = rowOf(base);
    const { request: flaggedRequest, ...flagged } = rowOf({ ...base, surveyNeedsVisit: true, surveyMethodBack: null });
    assert.deepEqual(flagged, plain, base.id);
    assert.equal(plain.methodChip, null, base.id);
    assert.equal(plain.origin, REQUEST_ORIGIN_TEXT, base.id);
    assert.doesNotMatch(plain.haystack, /จากแบบ|ไม่ต้องลงคิว/, base.id);
    assert.ok(plainRequest && flaggedRequest);
  }
  // ธงที่ไม่ใช่ `false` ตรงตัวไม่ทำให้ใบเป็นงานโต๊ะ (กติกาเดียวกับ surveyQueueStep / commitDueMode)
  for (const flag of [null, undefined, 0, '', 'false']) {
    assert.equal(rowOf({ ...surveyRequests[0], surveyNeedsVisit: flag }).methodChip, null, String(flag));
  }
});

/* ⭐ mig 0392 (D15): โซนที่ไม่มีรอบขายเป็นงานของ SA (ฝ่ายขายเลือกโซนในใบ · TS ผูกไม่ได้แล้ว) ⇒ ร่างไปอยู่ "รอฝ่ายอื่น"
   · ข้อสัญญาที่ยังเป็นของ TS เหลือ "ไซต์ยังไม่มีโซน" (งานทะเบียน) — บรรทัดย่อยของกลุ่ม TS บอกจำนวนนั้น */
test('⭐ ร่างที่โซนไม่มีรอบขายอยู่กลุ่มรอฝ่ายอื่น (SA) · ไซต์ที่ยังไม่มีโซนอยู่กลุ่ม TS · บรรทัดย่อยบอก "ไซต์ยังไม่มีโซน n"', () => {
  const unalloc = v({ id: 'D-zone', code: 'SV-20', status: 'draft', siteId: 'S-ZONE', scheduledDate: '2026-09-24', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' });
  const noZone = v({ id: 'D-nozone', code: 'SV-21', status: 'draft', siteId: 'S-EMPTY', scheduledDate: '2026-09-24', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' });
  const ctx = {
    ...gateContext,
    zonesBySite: { ...gateContext.zonesBySite, 'S-ZONE': [{ id: 'Z-NEW', siteId: 'S-ZONE', name: 'โซนใหม่' }] },
  };
  const view = build({ bucket: 'waiting', visits: [...visits, unalloc, noZone], gateContext: ctx });
  const ts = view.groups.find((g) => g.key === 'ts');
  const others = view.groups.find((g) => g.key === 'others');
  assert.deepEqual(ts.rows.map((r) => r.id).sort(), ['D-nozone', 'D-ts']);
  assert.equal(ts.sub, 'ขาดเจ้าหน้าที่ 1 · นอกช่วงเข้าไซต์ 0 · ไซต์ยังไม่มีโซน 1');
  const noZoneItem = ts.rows.find((r) => r.id === 'D-nozone').gateItems[0];
  assert.equal(noZoneItem.owner, 'TS');
  assert.equal(noZoneItem.reason, 'ไซต์นี้ยังไม่มีโซนในทะเบียน — TS เพิ่มโซนที่หน้าไซต์ แล้วให้ฝ่ายขายเลือกโซนในใบสั่งขาย');
  assert.ok(others.rows.some((r) => r.id === 'D-zone'), 'โซนไม่มีรอบขาย ⇒ รอฝ่ายขาย');
  const item = others.rows.find((r) => r.id === 'D-zone').gateItems[0];
  assert.equal(item.owner, 'SA');
  assert.equal(item.fix, null, 'ไม่มีช่องในโมดัลนัดให้แก้ ⇒ เหตุเต็มประโยค');
  assert.equal(item.reason, 'ยังไม่มีใบสั่งขายที่ตั้งงานบริการแล้วสำหรับโซนนี้ — ฝ่ายขายตั้งค่าที่หน้าใบสั่งขายแล้วยื่นให้ผู้จัดการตรวจ');
  assert.doesNotMatch(item.reason, /งานเข้าใหม่/, 'TS ผูกโซนไม่ได้แล้ว — ห้ามชี้ไปหาทางที่ปิด');
  // ไม่มีร่างแบบนี้ = บรรทัดย่อยเดิม (ไม่มีท่อนต่อท้าย)
  assert.equal(build({ bucket: 'waiting' }).groups.find((g) => g.key === 'ts').sub, 'ขาดเจ้าหน้าที่ 1 · นอกช่วงเข้าไซต์ 0');
});

test('แถวนัดติดชนิด "visit" · ป้ายตัวเลขงานเข้าใหม่ = แท็บรอตั้งรอบแท็บเดียว (ตัวเลขบนเมนูนับแท็บนี้)', () => {
  assert.ok(build({ bucket: 'waiting' }).rows.every((r) => r.type === 'visit'));
  assert.equal(INTAKE_UPSTREAM_LABEL, 'รอตั้งรอบ');
});

/* 🐞 UAT 24/09: การ์ดคำร้องบอก "วันนั้นว่าง 5 จาก 5 คน" (นับแค่คนหน้างาน `crewPeople` — Operation/Senior)
   แต่โมดัลลงคิวที่เปิดจากการ์ดใบเดียวกันให้เลือก 8 คน (ทั้งฝ่าย TS: Planner · หัวหน้า · Audit + หน้างาน)
   ⇒ คนจัดคิวไม่รู้ว่าตัวเลขไหนจริง · งานประเมินพื้นที่มักไปที่หัวหน้า (นัดจริง 24/09 อยู่ที่หัวหน้า)
   ⭐ การ์ดคำร้องนับจาก **คนที่มอบหมายได้** (`assignablePeople` — ชุดเดียวกับตัวเลือกในโมดัล) กรองทีมเหมือนเดิม
   ⚠️ แถวร่างของนัดยังนับคนหน้างานตามเดิม (นอกขอบเขตรอบนี้) · ไม่ส่งชุดนี้มา = ถอยไปคนหน้างาน */
test('🐞 การ์ดคำร้องนับคนว่างจากชุดเดียวกับตัวเลือกในโมดัลลงคิว (คนที่มอบหมายได้ทั้งฝ่าย)', () => {
  const assignablePeople = [...crewPeople, { id: 'U-HEAD', name: 'อริยา หัวหน้า' }];
  const view = build({ bucket: 'waiting', surveyRequests, assignablePeople });
  assert.equal(view.rows.find((r) => r.id === 'R-ack').dayLoad.text, 'วันนั้นว่าง 3 จาก 3 คน');
  // หัวหน้าที่มีนัดวันนั้นแล้วไม่ว่าง
  const busyHead = v({ id: 'S-head', code: 'SV-60', status: 'scheduled', scheduledDate: '2026-09-25', assigneeId: 'U-HEAD' });
  const busy = build({ bucket: 'waiting', visits: [...visits, busyHead], surveyRequests, assignablePeople });
  assert.equal(busy.rows.find((r) => r.id === 'R-ack').dayLoad.text, 'วันนั้นว่าง 2 จาก 3 คน');
  // กรองทีม: หัวหน้าไม่อยู่ทีมใต้ ⇒ ไม่นับ (กติกาเดิมของมุมมองทีม)
  const south = build({ bucket: 'waiting', teamFilter: 'SOUTH', surveyRequests, assignablePeople });
  assert.equal(south.rows.find((r) => r.id === 'R-ack').dayLoad.text, 'วันนั้นว่าง 1 จาก 1 คน');
  // แถวร่างของนัดไม่เปลี่ยน — ยังนับคนหน้างาน
  const draftNoCrew = view.rows.find((r) => r.id === 'D-ts');
  assert.equal(draftNoCrew.dayLoad.text, build({ bucket: 'waiting', surveyRequests }).rows.find((r) => r.id === 'D-ts').dayLoad.text);
  // ไม่ส่งชุดนี้ = ถอยไปคนหน้างาน (ของเดิม)
  assert.equal(build({ bucket: 'waiting', surveyRequests }).rows.find((r) => r.id === 'R-ack').dayLoad.text, 'วันนั้นว่าง 2 จาก 2 คน');
});

/* ⭐ ปุ่ม "ลบนัด" บนการ์ด (มติเจ้าของ 24/09) — แถวบอกว่าโชว์ไหม (`actions.delete`) และเหตุตอนกด
   (`deleteBlocker`) จากด่านตัวเดียวกับ API (visitDelete.js) · การ์ดไม่คิดเงื่อนไขเอง */
test('⭐ การ์ดงานนอกรอบที่ยังไม่ปิดมีปุ่มลบ · นัดของรอบ/ใบคำร้อง/ปิดแล้วไม่มี · นัดถอน/กำลังทำบอกเหตุ', () => {
  const extra = [
    v({ id: 'R-round', code: 'SV-20', status: 'draft', planId: 'P1', scheduledDate: '2026-09-24' }),
    v({ id: 'R-survey', code: 'SV-21', status: 'scheduled', kind: 'survey', requestId: 'RQ1', scheduledDate: '2026-09-24', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' }),
  ];
  const { rows } = build({ visits: [...visits, ...extra] });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // งานนอกรอบ (ร่าง · ค้าง · จัดแล้ว) ⇒ ลบได้
  for (const id of ['D-sa', 'O-none', 'S-none']) {
    assert.equal(byId.get(id).actions.delete, true, id);
    assert.equal(byId.get(id).deleteBlocker, '', id);
  }
  // นัดถอนจากเรื่องไม่ต่อสัญญา ⇒ ปุ่มโชว์ แต่บอกเหตุ
  assert.equal(byId.get('D-ts').actions.delete, true);
  assert.match(byId.get('D-ts').deleteBlocker, /นัดถอนเครื่องลบไม่ได้/);
  assert.equal(byId.get('D-ts').origin, 'ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา');
  // กำลังทำ ⇒ ปุ่มโชว์ แต่บอกว่าเป็นประวัติการเข้าไซต์
  assert.equal(byId.get('S-b').actions.delete, true);
  assert.match(byId.get('S-b').deleteBlocker, /ประวัติการเข้าไซต์/);
  // ปิดแล้ว · นัดของรอบ · นัดของใบคำร้อง ⇒ ไม่มีปุ่ม
  for (const id of ['C-done', 'C-unable', 'R-round', 'R-survey']) {
    assert.equal(byId.get(id).actions.delete, false, id);
  }
  // การ์ดคำร้องรอลงคิวไม่มีนัดให้ลบ
  const request = build({ bucket: 'waiting', surveyRequests }).rows.find((r) => r.id === 'R-ack');
  assert.equal(request.type, 'request');
  assert.equal(request.actions.delete, false);
  assert.equal(request.deleteBlocker, '');
});

/* 🐞 รีวิว 24/09 (ภาพ d1440-04): ชื่อติดคำไทยไม่มีวรรค ⇒ "ถ้าปล่อย วันนั้นVeerachaiรวม 2/12 จุด" */
test('ภาระวันนั้น: วรรคหน้า-หลังชื่อเจ้าหน้าที่เสมอ (ชื่ออังกฤษไม่ติดคำไทย) · ไม่มีชื่อ = "เจ้าหน้าที่"', () => {
  const people = [{ id: 'U9', name: 'Veerachai K.' }];
  const rows = [
    v({ id: 'L-draft', code: 'SV-90', status: 'draft', kind: 'remove', scheduledDate: '2026-09-23', assigneeId: 'U9', assigneeName: 'Veerachai K.' }),
    v({ id: 'L-live', code: 'SV-91', status: 'scheduled', scheduledDate: '2026-09-23', assigneeId: 'U9', assigneeName: 'Veerachai K.' }),
    v({ id: 'L-noname', code: 'SV-92', status: 'scheduled', scheduledDate: '2026-09-24', assigneeId: 'U8', assigneeName: '' }),
  ];
  const view = (bucket) => buildScheduleQueue({
    visits: rows, sitesById, gateContext, workload, todayIso: TODAY, teamFilter: ALL_TEAMS,
    crewByUser, crewPeople: [...crewPeople, ...people], teamNames, bucket,
  });
  // ร่าง: งานเดิมวันนั้นของคนนี้ (L-live 6 จุด) + ไซต์นี้ 6 จุด
  assert.equal(view('waiting').rows.find((r) => r.id === 'L-draft').dayLoad.text, 'ถ้าปล่อย วันนั้น Veerachai รวม 12/12 จุด');
  const scheduled = view('scheduled').rows;
  assert.equal(scheduled.find((r) => r.id === 'L-live').dayLoad.text, 'วันนั้นของ Veerachai 6/12 จุด');
  assert.equal(scheduled.find((r) => r.id === 'L-noname').dayLoad.text, 'วันนั้นของ เจ้าหน้าที่ 6/12 จุด');
});

/* ══ D15 · ชิปใบสั่งขายบนร่างที่ติดด่าน (PR-C · C9 · C-D19) ══════════════════════════════════════════
   ⭐ แถวรายการงานพกชิปของข้อสัญญามาจากด่าน (`gateBlockedItems`) — **เฉพาะตอนมี** (critique L3: deepEqual เดิมยังเขียว)
   ⭐ ตาเห็นบนแถว = ต้องค้นเจอ: ข้อความชิป ("ใบสั่งขาย SO-… · ฉบับร่าง · AE") อยู่ใน haystack ของแถว */
const d15Chip = { orderId: 'SOR-D', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: 'สมหญิง รักงาน' };

test('D15 gateItemView พกชิปเฉพาะตอนมี — ว่าง/ไม่มี = รูปเดิมทุกไบต์', () => {
  const base = { key: 'contract', owner: 'SA', reason: 'ก — ข', fix: null };
  const plain = { key: 'contract', owner: 'SA', ownerTone: 'accent', reason: 'ก — ข', fix: null };
  assert.deepEqual(gateItemView({ ...base, orders: [d15Chip] }), { ...plain, orders: [d15Chip] });
  assert.deepEqual(gateItemView({ ...base, orders: [] }), plain);
  assert.deepEqual(gateItemView({ ...base, orders: null }), plain);
  assert.deepEqual(gateItemView(base), plain);
});

test('D15 ร่างของไซต์ที่โซนยังไม่มีรอบขาย: แถวพกชิป · ค้นเจอด้วยเลขที่ใบ/สถานะ/AE · กลุ่มเดิม', () => {
  const ctx = {
    ...gateContext,
    zonesBySite: { ...gateContext.zonesBySite, 'S-NEW': [{ id: 'Z-NEW', siteId: 'S-NEW', name: 'ชั้น 1' }] },
    setupOrdersByZone: { 'Z-NEW': [d15Chip] },
  };
  const siteNew = { id: 'S-NEW', code: 'ST-1003', name: 'ไซต์ใหม่', routeZone: 'BKK-N', customerName: 'บจก. ใหม่' };
  const extra = v({ id: 'D-new', code: 'SV-15', status: 'draft', scheduledDate: '2026-09-24', siteId: 'S-NEW', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' });
  const run = (over = {}) => buildScheduleQueue({
    visits: [...visits, extra], sitesById: new Map([...sitesById, ['S-NEW', siteNew]]), gateContext: ctx, workload,
    todayIso: TODAY, teamFilter: ALL_TEAMS, crewByUser, crewPeople, teamNames, bucket: 'waiting', ...over,
  });
  const row = run().rows.find((r) => r.id === 'D-new');
  assert.equal(row.group, 'others', 'ชิปไม่ย้ายกลุ่ม — ยังรอฝ่ายขาย');
  const contract = row.gateItems.find((g) => g.key === 'contract');
  assert.deepEqual(contract.orders, [d15Chip]);
  assert.equal(contract.owner, 'SA');
  assert.ok(row.haystack.includes('ใบสั่งขาย so-26100011-0 · ฉบับร่าง · สมหญิง รักงาน'), row.haystack);
  for (const search of ['SO-26100011-0', 'ฉบับร่าง', 'สมหญิง']) {
    const view = run({ search });
    assert.ok(view.rows.filter((r) => r.bucket === 'waiting').some((r) => r.id === 'D-new'), search);
    assert.ok(view.listedCount >= 1, search);
  }
  // ร่างของไซต์เดิม (โซนมีรอบขาย ใบยังไม่ผูกสัญญา) ไม่พกชิป
  const bad = run().rows.find((r) => r.id === 'D-sa');
  assert.equal(bad.gateItems.some((g) => 'orders' in g), false);
});

test('🔴 ยอดรายการของแท็บรอจัด = เลขบนแท็บ แม้กลุ่ม "รอฝ่ายอื่น" ถูกพับ (ตรวจตัวกรอง 08/10 · H13)', () => {
  // ร่างติดด่าน SA เพิ่ม 5 ใบ ⇒ กลุ่ม "รอฝ่ายอื่น" ใหญ่ (กลุ่มที่พับได้)
  const more = Array.from({ length: 5 }, (_, i) => v({
    id: `D-sa${i}`, code: `SV-2${i}`, status: 'draft', scheduledDate: '2026-09-25', siteId: 'S-BAD', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี',
  }));
  const view = buildScheduleQueue({
    visits: [...visits, ...more], sitesById, gateContext, workload, todayIso: TODAY, teamFilter: ALL_TEAMS,
    crewByUser, crewPeople, teamNames, bucket: 'waiting',
  });
  const others = view.groups.find((g) => g.key === 'others');
  assert.equal(others.collapsible, true);
  assert.equal(others.rows.length, 6);
  assert.equal(view.listedCount, view.counts.waiting, 'ยอดที่ตัวแบ่งหน้า/ป้ายแผงโชว์ = เลขบนแท็บ');
  // ช่องของการแบ่งหน้า (ทรงเดียวกับ flatRows ของหน้า) — พับ = หนึ่งช่อง ⇒ ใช้เป็น "ยอด" ไม่ได้
  const slots = view.groups.flatMap((g) => (g.collapsible ? [{ head: true }] : g.rows));
  assert.equal(slots.length, view.counts.waiting - others.rows.length + 1);
  assert.notEqual(slots.length, view.counts.waiting);
});

/* ── เลขบนเม็ดถัง/ชิปช่วง = แถวที่เห็นหลังกด (ตรวจตัวเลข 20/10 · M24c · M24d) ─────────────────────────────
   🐞 เดิมนับ "หลังกรองทีม ก่อนค้นหา" และไม่นับร่างไกลเลย:
      · ค้น "SV-09" ⇒ แท็บ "จัดแล้ว 4" · ชิป "7 วัน 4" แต่รายการขึ้น 1 ใบ
      · เปิด "แสดง" ร่างไกล ⇒ แท็บ "รอจัด 3" แต่แผง/ตัวแบ่งหน้าบอก 4 ใบ
   ⭐ สถานะ "หลังกด" ของหน้า: กดเม็ดถัง = ล้างชิปสัปดาห์ + ช่วง (คำค้น/farOn อยู่ต่อ) · กดชิปช่วง = เปลี่ยนแค่ช่วง */
const STATES = [
  {},
  { search: 'SV-09' },
  { search: 'SV-03' },
  { search: 'สมชาย' },
  { search: 'ไม่มีคำนี้แน่ ๆ' },
  { farOn: true },
  { farOn: true, search: 'SV-0' },
  { within: { from: '2026-09-20', to: '2026-09-26' } },
  { within: { from: '2026-09-20', to: '2026-09-26' }, search: 'SV-02' },
  { range: '7d' },
  { range: 'unassigned', search: 'SV-1' },
  { teamFilter: 'SOUTH', search: 'SV' },
  { surveyRequests, search: 'AS-26090011' },
];
const BUCKETS = ['waiting', 'overdue', 'scheduled', 'closed'];

test('🔴 M24c/M24d: เลขบนเม็ดถังทุกใบ = listedCount หลังกดเม็ดนั้น (คำค้น · farOn อยู่ต่อ · ชิปสัปดาห์/ช่วงถูกล้าง)', () => {
  for (const state of STATES) {
    for (const current of BUCKETS) {
      const view = build({ ...state, bucket: current });
      for (const b of BUCKETS) {
        const after = build({ ...state, bucket: b, range: 'all', within: null });
        assert.equal(view.counts[b], after.listedCount, `${JSON.stringify(state)} อยู่ที่ ${current} → เม็ด ${b}`);
      }
    }
  }
});

test('🔴 M24c: เลขบนชิปช่วงทุกตัว = listedCount หลังกดชิปนั้น (ตามคำค้น)', () => {
  for (const state of STATES) {
    const view = build({ ...state, bucket: 'scheduled' });
    for (const r of ['all', '7d', 'unassigned']) {
      assert.equal(view.rangeCounts[r], build({ ...state, bucket: 'scheduled', range: r }).listedCount, `${JSON.stringify(state)} → ช่วง ${r}`);
    }
  }
});

test('🔴 M24c: ของจริงที่ตรวจเจอ — ค้น SV-09 แท็บ/ชิปลงเหลือ 1 · ค่าตั้งต้นไม่เปลี่ยน', () => {
  const searched = build({ bucket: 'scheduled', range: '7d', search: 'SV-09' });
  assert.equal(searched.listedCount, 1);
  assert.equal(searched.counts.scheduled, 1, 'เดิม 4');
  assert.equal(searched.rangeCounts['7d'], 1, 'เดิม 4');
  assert.equal(searched.counts.waiting, 0);
  // ค่าตั้งต้น (ไม่ค้น · ไม่เปิดร่างไกล) = เลขชุดเดิมทุกตัว
  assert.deepEqual(build().counts, { waiting: 3, overdue: 2, scheduled: 4, closed: 2 });
  assert.deepEqual(build({ bucket: 'scheduled' }).rangeCounts, { all: 4, '7d': 4, unassigned: 1 });
});

test('🔴 M24d: เปิดแสดงร่างไกล ⇒ แท็บ "รอจัด" นับร่างไกลด้วย (= ยอดของแผง) · farCount ไม่ขึ้นกับสถานะ', () => {
  const withFar = build({ bucket: 'waiting', farOn: true });
  assert.equal(withFar.listedCount, 4);
  assert.equal(withFar.counts.waiting, withFar.listedCount, 'เดิม 3 ขณะที่แผงบอก 4 ใบ');
  assert.equal(withFar.farCount, 1);
  assert.equal(build({ bucket: 'waiting' }).counts.waiting, 3, 'ไม่เปิด = ร่างไกลยังไม่นับ (เลขลงถึง 0 ได้)');
  assert.equal(build({ bucket: 'waiting', search: 'SV-03' }).counts.waiting, 1, 'ค้นเจอร่างไกล = นับ (คำค้นบังคับโชว์ร่างไกล)');
});

test('M24c: ชิปสัปดาห์ (within) ไม่เข้าเลขบนเม็ด — กดเม็ดแล้วชิปถูกล้าง แต่ยอดของแผงยังตามชิป', () => {
  const week = build({ bucket: 'waiting', surveyRequests, within: { from: '2026-09-20', to: '2026-09-26' } });
  assert.equal(week.listedCount, 2);
  assert.equal(week.counts.waiting, build({ bucket: 'waiting', surveyRequests }).listedCount);
});
