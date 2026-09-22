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
import { buildScheduleQueue, dayText, draftsInRange, originText, ownerTone, weekChipText } from './scheduleQueueView.js';
import { ALL_TEAMS } from './crewTeams.js';

const TODAY = '2026-09-22'; // อังคาร

/* บริบทด่านว่าง ⇒ งานปกติติดด่านสัญญา (SA) ทุกใบ · งานถอนเครื่อง/ประเมินพื้นที่ข้ามด่าน ①②
   (GATE_EXEMPT_KINDS) จึงเหลือแค่ด่านของ TS — ใช้สองแบบนี้แยกกลุ่ม TS กับ "รอฝ่ายอื่น" */
const sites = [
  { id: 'S1', code: 'ST-1001', name: 'เซ็นทรัลเวิลด์', routeZone: 'BKK-C', customerName: 'บจก. เซ็นทรัล' },
  { id: 'S-BAD', code: 'ST-1002', name: 'ไซต์ไม่มีสัญญา', routeZone: 'BKK-E', customerName: 'บจก. ทดสอบ' },
];
const sitesById = new Map(sites.map((s) => [s.id, s]));
const gateContext = {};
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
  const view = build({ bucket: 'waiting', within: { from: '2026-09-21', to: '2026-09-27' } });
  assert.deepEqual(view.rows.filter((r) => r.bucket === 'waiting').length, 4, 'rows ยังเก็บทั้งหมด');
  assert.equal(view.listedCount, 2, 'แสดงแค่ SV-01 กับ SV-02');
  assert.equal(draftsInRange(visits, { from: '2026-09-21', to: '2026-09-27' }, ALL_TEAMS, crewByUser), 2);
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
  assert.equal(weekChipText('2026-09-21'), 'วันเสนอ 21–27 ก.ย.');
});
