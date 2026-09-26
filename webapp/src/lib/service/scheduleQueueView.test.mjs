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
import {
  GATE_FIX, INTAKE_UPSTREAM_LABEL, REQUEST_ORIGIN_TEXT, buildScheduleQueue, dayText, draftsInRange, gateItemView,
  originText, ownerTone, relDayText, siteLoadText, surveyRequestRow, weekChipText,
} from './scheduleQueueView.js';
import * as queueWords from './queueWords.js';
import { evaluateVisitGate, gateBlockedItems } from './visitGate.js';
import { ALL_TEAMS } from './crewTeams.js';
import { acknowledgeRequestError } from '../requests/stages.js';

const TODAY = '2026-09-22'; // อังคาร

/* บริบทด่าน: ไซต์ S-BAD มีโซนที่ผูกใบสั่งขายแล้ว แต่ใบยังไม่ผูกสัญญา ⇒ ติดด่านสัญญาของ SA
   (รอฝ่ายอื่น) · งานถอนเครื่อง/ประเมินพื้นที่ข้ามด่าน ①② (GATE_EXEMPT_KINDS) จึงเหลือแค่ด่านของ TS
   ⚠️ เดิมใช้บริบทว่าง (= ไซต์ไม่มีโซน) แทน "ติด SA" — ตั้งแต่มติ 23/09 ไซต์ที่ไม่มีโซน/โซนที่ยังไม่จัดสรร
      เป็นงานของ TS ที่หน้า "งานเข้าใหม่" ⇒ ต้องใช้เหตุที่เป็นของ SA จริง ๆ */
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
  assert.equal(searched.requestCount, 3, 'ตัวเลขบนแถบไม่ขยับตามคำค้น (กติกาเดียวกับเม็ดถัง)');
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

/* ⭐ โซนที่ยังไม่จัดสรร = งานของ TS (มติเจ้าของ 23/09) — ร่างย้ายจาก "รอฝ่ายอื่น" มาอยู่ "TS แก้ได้เอง"
   และบรรทัดย่อยของกลุ่มบอกว่ากี่ใบติดเพราะเหตุนี้ */
test('⭐ ร่างที่โซนยังไม่จัดสรรอยู่กลุ่ม TS แก้ได้เอง · บรรทัดย่อยบอก "ยังไม่จัดสรรโซน n"', () => {
  const unalloc = v({ id: 'D-zone', code: 'SV-20', status: 'draft', siteId: 'S-ZONE', scheduledDate: '2026-09-24', assigneeId: 'U1', assigneeName: 'สมชาย ใจดี' });
  const ctx = {
    ...gateContext,
    zonesBySite: { ...gateContext.zonesBySite, 'S-ZONE': [{ id: 'Z-NEW', siteId: 'S-ZONE', name: 'โซนใหม่' }] },
  };
  const view = build({ bucket: 'waiting', visits: [...visits, unalloc], gateContext: ctx });
  const ts = view.groups.find((g) => g.key === 'ts');
  assert.deepEqual(ts.rows.map((r) => r.id).sort(), ['D-ts', 'D-zone']);
  assert.equal(ts.sub, 'ขาดเจ้าหน้าที่ 1 · นอกช่วงเข้าไซต์ 0 · ยังไม่จัดสรรโซน 1');
  const item = ts.rows.find((r) => r.id === 'D-zone').gateItems[0];
  assert.equal(item.owner, 'TS');
  assert.equal(item.ownerTone, 'info');
  assert.equal(item.fix, null, 'ไม่มีช่องในโมดัลนัดให้แก้ ⇒ เหตุเต็มประโยค');
  assert.match(item.reason, /TS ผูกใบสั่งขายเข้าโซนที่หน้า "งานเข้าใหม่"/);
  // ไม่มีร่างแบบนี้ = บรรทัดย่อยเดิม (ไม่มีท่อนต่อท้าย)
  assert.equal(build({ bucket: 'waiting' }).groups.find((g) => g.key === 'ts').sub, 'ขาดเจ้าหน้าที่ 1 · นอกช่วงเข้าไซต์ 0');
});

test('แถวนัดติดชนิด "visit" · ป้ายตัวเลขงานเข้าใหม่บอกทั้งสองแท็บที่นับรวม', () => {
  assert.ok(build({ bucket: 'waiting' }).rows.every((r) => r.type === 'visit'));
  assert.equal(INTAKE_UPSTREAM_LABEL, 'รอตั้งไซต์/โซน + รอตั้งรอบ');
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
