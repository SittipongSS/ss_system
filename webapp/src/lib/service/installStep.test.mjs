// ── ขั้นเข้าติดตั้ง PR-1 (mig 0425) — ด่านมัดจำ · ด่านนัดติดตั้ง · ขั้นของคำขอ ───────────────────
//
// ⭐ มติเจ้าของ 09/11/2026 ที่เทสต์ชุดนี้ยึด:
//   · ก่อนติดตั้งมีด่านเดียว = งวด "ก่อนติดตั้ง" ที่บัญชีรับรอง · ใบที่ไม่มีงวดนี้ = ผ่าน (บอกเหตุ)
//   · สัญญาไม่ใช่ด่านก่อนติดตั้ง (ทำหลังทุกไซต์ติดตั้งเสร็จ · ราย SO)
//   · SA ขอ › TS ยืนยันวัน › SA คอนเฟิร์มลูกค้าทุกครั้ง › นัดขึ้นงานช่าง · ลูกค้าขอเปลี่ยนวัน = กลับไปรอ TS
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INSTALL_DEPOSIT_TEXT, installDepositGate } from './installDeposit.js';
import {
  GATE_OWNERS, INSTALL_GATE_TEXT, evaluateVisitGate, gatePassed, initialVisitStatus, isInstallStepVisit,
} from './visitGate.js';
import {
  INSTALL_STAGES, INSTALL_STAGE_LABELS, INSTALL_STAGE_OWNERS, INSTALL_STAGE_SERVICE,
  installContractReadiness, installSiteSummary, installZoneStage,
} from './installQueue.js';

const ORDER = { id: 'SO-1', totalAmount: 108000 };
const DEPOSIT = { id: 'I1', seq: 1, label: 'มัดจำ 30%', amount: 32400, status: 'confirmed', beforeInstall: true };
const REST = { id: 'I2', seq: 2, label: 'งวด 2', amount: 75600, status: 'pending', beforeInstall: false };
const REQUEST = { id: 'IR-1', salesOrderId: 'SO-1', siteId: 'ST-1', mode: 'install', requestedDate: '2027-01-06', requestedAt: '2026-11-20T03:42:00Z' };
const ZONES = [{ id: 'Z1', name: 'ทางเข้าหลัก' }, { id: 'Z2', name: 'โซนผักผลไม้' }, { id: 'Z3', name: 'แคชเชียร์' }];
const SITE = { id: 'ST-1' };

const installVisit = (over = {}) => ({
  id: 'V1', kind: 'install', status: 'draft', installRequestId: 'IR-1', scheduledDate: '2027-01-05',
  startTime: '09:00', endTime: '12:00', assigneeId: 'U-nate', assigneeName: 'นที ใจดี',
  tsConfirmedAt: '2027-01-02T03:00:00Z', customerConfirmedAt: '2027-01-03T03:20:00Z', customerConfirmedByName: 'กมลรัตน์ ทองดี',
  ...over,
});
const ctx = (over = {}) => ({
  site: SITE, zones: ZONES,
  ordersById: { 'SO-1': ORDER },
  installmentsByOrderId: { 'SO-1': [DEPOSIT, REST] },
  installRequestsById: { 'IR-1': REQUEST },
  visitZonesByVisitId: { V1: ['Z1', 'Z2'] },
  ...over,
});
const item = (items, key) => items.find((i) => i.key === key);

// ── ด่านมัดจำ ──────────────────────────────────────────────────────────────
test('ด่านมัดจำ: งวดติดธงรับรองครบ = ผ่าน · งวดไม่ติดธงไม่ถูกถาม', () => {
  const g = installDepositGate(ORDER, [DEPOSIT, REST]);
  assert.equal(g.state, 'ok');
  assert.equal(g.flagged, 1);
  assert.equal(g.reason, null);
});

test('ด่านมัดจำ: "แจ้งแล้ว" ไม่ปลดด่าน — เหตุบอกว่ารอบัญชี', () => {
  const g = installDepositGate(ORDER, [{ ...DEPOSIT, status: 'reported' }, REST]);
  assert.equal(g.state, 'blocked');
  assert.match(g.reason, /มัดจำ 30%/);
  assert.match(g.reason, /รอบัญชีรับรอง/);
});

test('ด่านมัดจำ: เหตุเดินตามสถานะจริงของงวด (ยังไม่แจ้ง · ตีกลับ) และบอกจำนวนงวดที่เหลือ', () => {
  const pending = installDepositGate(ORDER, [{ ...DEPOSIT, status: 'pending' }]);
  assert.match(pending.reason, /ฝ่ายขายยังไม่แจ้งชำระ/);
  const rejected = installDepositGate(ORDER, [{ ...DEPOSIT, status: 'rejected' }]);
  assert.match(rejected.reason, /ตีกลับ/);
  const two = installDepositGate(ORDER, [
    { ...DEPOSIT, status: 'pending' }, { ...REST, beforeInstall: true, status: 'reported' },
  ]);
  assert.match(two.reason, /\+ อีก 1 งวด/);
  assert.match(two.reason, /^งวดก่อนติดตั้ง มัดจำ 30%/, 'ขึ้นงวดเลขน้อยก่อน');
});

test('ด่านมัดจำ: ใบที่ไม่มีงวดติดธง = ผ่าน แต่บอกเหตุ (ด่านที่ผ่านเพราะไม่มีอะไรให้ตรวจต้องบอก)', () => {
  const g = installDepositGate(ORDER, [REST]);
  assert.equal(g.state, 'ok');
  assert.equal(g.detail, INSTALL_DEPOSIT_TEXT.none);
});

test('ด่านมัดจำ: ใบยอด 0 = ผ่าน · ไม่รู้ยอด ≠ ยอด 0 · ไม่มีใบ = ติด', () => {
  assert.equal(installDepositGate({ id: 'SO-0', totalAmount: 0 }, [{ ...DEPOSIT, status: 'pending' }]).detail, INSTALL_DEPOSIT_TEXT.zeroValue);
  assert.equal(installDepositGate({ id: 'SO-x' }, [{ ...DEPOSIT, status: 'pending' }]).state, 'blocked');
  assert.equal(installDepositGate(null, []).state, 'blocked');
});

// ── ด่านนัดติดตั้ง ────────────────────────────────────────────────────────────
test('ด่านนัดติดตั้ง: เลือกเฉพาะนัด install ที่มีคำขอ — นัด install เดิมเดินด่านเดิม', () => {
  assert.equal(isInstallStepVisit(installVisit()), true);
  assert.equal(isInstallStepVisit(installVisit({ installRequestId: null })), false);
  assert.equal(isInstallStepVisit(installVisit({ kind: 'refill' })), false);
  // นัด install เดิมไม่มีรอบขาย ⇒ ด่านเดิมติดข้อสัญญาเหมือนก่อน 0425 ทุกอย่าง (ไม่ได้รับกติกาใหม่)
  const legacy = evaluateVisitGate(installVisit({ installRequestId: null }), ctx());
  assert.equal(item(legacy, 'contract').state, 'blocked');
  assert.equal(item(legacy, 'appointment'), undefined);
});

test('ด่านนัดติดตั้ง: ครบทุกข้อ = ผ่าน · สัญญาไม่ตรวจแต่บอกเหตุ · ร่างขึ้นตารางได้', () => {
  const items = evaluateVisitGate(installVisit(), ctx());
  assert.deepEqual(items.map((i) => i.key), ['contract', 'payment', 'assignee', 'access', 'appointment']);
  assert.equal(gatePassed(items), true);
  assert.equal(item(items, 'contract').state, 'ok');
  assert.equal(item(items, 'contract').detail, INSTALL_GATE_TEXT.contractDetail);
  assert.match(item(items, 'appointment').detail, /กมลรัตน์ ทองดี/);
  assert.equal(initialVisitStatus(installVisit(), ctx()), 'scheduled');
});

test('ด่านนัดติดตั้ง: ไม่มีสัญญา ไม่มีรอบขาย ก็ยังผ่าน (ติดตั้งก่อนสัญญา · ก่อนช่วงบริการ)', () => {
  const items = evaluateVisitGate(installVisit(), ctx({ terms: [], contractsById: {} }));
  assert.equal(gatePassed(items), true);
});

test('ด่านนัดติดตั้ง: มัดจำยังไม่รับรอง = ติดข้อเงิน เจ้าของ SA → FN · ทุกโซนของนัดติดเหตุเดียวกัน', () => {
  const items = evaluateVisitGate(installVisit(), ctx({ installmentsByOrderId: { 'SO-1': [{ ...DEPOSIT, status: 'reported' }] } }));
  const pay = item(items, 'payment');
  assert.equal(pay.state, 'blocked');
  assert.equal(pay.owner, GATE_OWNERS.FN);
  assert.equal(items.zoneGates.length, 2, 'เฉพาะโซนของนัดนี้ (Z3 แยกนัด)');
  assert.ok(items.zoneGates.every((z) => z.state === 'blocked' && z.gate === 'payment'));
});

test('ด่านนัดติดตั้ง: ยังไม่คอนเฟิร์มลูกค้า = ติด เจ้าของ SA · ขึ้นตารางไม่ได้', () => {
  const v = installVisit({ customerConfirmedAt: null, customerConfirmedByName: null });
  const items = evaluateVisitGate(v, ctx());
  const appt = item(items, 'appointment');
  assert.equal(appt.state, 'blocked');
  assert.equal(appt.owner, GATE_OWNERS.SA);
  assert.equal(appt.detail, INSTALL_GATE_TEXT.waitCustomer);
  assert.equal(initialVisitStatus(v, ctx()), 'draft');
});

test('ด่านนัดติดตั้ง: ลูกค้าขอเปลี่ยนวันหลัง TS ยืนยัน = ติด เจ้าของ TS แม้เคยคอนเฟิร์มแล้ว', () => {
  const reasked = { ...REQUEST, requestedAt: '2027-01-03T05:00:00Z' };
  const items = evaluateVisitGate(installVisit(), ctx({ installRequestsById: { 'IR-1': reasked } }));
  const appt = item(items, 'appointment');
  assert.equal(appt.state, 'blocked');
  assert.equal(appt.owner, GATE_OWNERS.TS);
  assert.equal(appt.detail, INSTALL_GATE_TEXT.reasked);
});

test('ด่านนัดติดตั้ง: นัดไม่มีโซน = ติด (ไม่ใช่ผ่าน) · ไม่พบคำขอ = ติดข้อเงินแบบ fail-closed', () => {
  const noZone = evaluateVisitGate(installVisit(), ctx({ visitZonesByVisitId: {} }));
  assert.equal(item(noZone, 'zones').state, 'blocked');
  assert.equal(gatePassed(noZone), false);
  const noReq = evaluateVisitGate(installVisit(), ctx({ installRequestsById: {} }));
  assert.equal(item(noReq, 'payment').state, 'blocked');
  assert.equal(item(noReq, 'payment').detail, INSTALL_GATE_TEXT.noRequest);
});

test('ด่านนัดติดตั้ง: ช่างกับช่วงเวลาเข้าไซต์ใช้ข้อเดียวกับนัดตามรอบ', () => {
  const items = evaluateVisitGate(installVisit({ assigneeId: null }), ctx());
  assert.equal(item(items, 'assignee').state, 'blocked');
  assert.equal(item(items, 'assignee').fix, 'assignee');
});

// ── ขั้นของคำขอ ─────────────────────────────────────────────────────────────
const ok = installDepositGate(ORDER, [DEPOSIT]);
const blocked = installDepositGate(ORDER, [{ ...DEPOSIT, status: 'reported' }]);
const stage = (over = {}) => installZoneStage({
  request: REQUEST, zoneId: 'Z1', visits: [], visitZonesByVisitId: { V1: ['Z1', 'Z2'] }, doneZonesByVisitId: {}, deposit: ok, ...over,
});

test('ขั้น: ยังไม่เลือก · Service · ยังไม่ขอคิว', () => {
  assert.equal(stage({ request: null }), 'undecided');
  assert.equal(stage({ request: { ...REQUEST, mode: 'none', requestedAt: null } }), INSTALL_STAGE_SERVICE);
  assert.equal(stage({ request: { ...REQUEST, requestedAt: null, requestedDate: null } }), 'not_requested');
});

test('ขั้น: ขอคิวแล้ว — มัดจำไม่ผ่าน = รอมัดจำ · ผ่าน = รอ TS ยืนยันวัน', () => {
  assert.equal(stage({ deposit: blocked }), 'awaiting_deposit');
  assert.equal(stage({ deposit: null }), 'awaiting_deposit', 'ไม่รู้ผลมัดจำ = ไม่เดาว่าผ่าน');
  assert.equal(stage(), 'awaiting_ts');
});

test('ขั้น: TS ยืนยันวันแล้ว (ร่าง) = รอ SA คอนเฟิร์ม · ขอเปลี่ยนวัน = กลับไปรอ TS', () => {
  const draft = installVisit({ customerConfirmedAt: null });
  assert.equal(stage({ visits: [draft] }), 'awaiting_customer');
  assert.equal(stage({ visits: [draft], request: { ...REQUEST, requestedAt: '2027-01-03T05:00:00Z' } }), 'awaiting_ts');
});

test('ขั้น: คอนเฟิร์มแล้วแต่ยังร่าง — มัดจำถูกถอนคำรับรอง = รอมัดจำ · อื่น ๆ = งานของ TS', () => {
  assert.equal(stage({ visits: [installVisit()], deposit: blocked }), 'awaiting_deposit');
  assert.equal(stage({ visits: [installVisit()] }), 'awaiting_ts');
});

test('ขั้น: นัดไว้/กำลังทำ = นัดยืนยันแล้ว · โซนที่ไม่อยู่ในนัดไม่ถูกนัดนั้นพาไปด้วย', () => {
  const live = installVisit({ status: 'scheduled' });
  assert.equal(stage({ visits: [live] }), 'confirmed');
  assert.equal(stage({ visits: [installVisit({ status: 'in_progress' })] }), 'confirmed');
  assert.equal(stage({ visits: [live], zoneId: 'Z3' }), 'awaiting_ts', 'แคชเชียร์ไม่อยู่ใน V1');
});

test('ขั้น: ปิดงานแล้วมีเครื่องผลติดตั้งแล้ว = ติดตั้งแล้ว · ติดไม่ได้ทั้งโซน = กลับไปรอ TS', () => {
  const closed = installVisit({ status: 'partial' });
  assert.equal(stage({ visits: [closed], doneZonesByVisitId: { V1: ['Z1'] } }), 'installed');
  assert.equal(stage({ visits: [closed], doneZonesByVisitId: { V1: ['Z1'] }, zoneId: 'Z2' }), 'awaiting_ts');
  // นัดยกเลิก/เลื่อนไม่นับเป็นนัดที่ยังมีชีวิต
  assert.equal(stage({ visits: [installVisit({ status: 'cancelled' })] }), 'awaiting_ts');
  // นัดของคำขออื่นไม่นับ
  assert.equal(stage({ visits: [installVisit({ status: 'scheduled', installRequestId: 'IR-9' })] }), 'awaiting_ts');
});

test('สรุปไซต์: ขั้นที่ช้าที่สุดของโซนที่ยังไม่ติดตั้ง · นับติดตั้งแล้ว n/N', () => {
  const s = installSiteSummary(['installed', 'installed', 'awaiting_customer']);
  assert.deepEqual(s, { stage: 'awaiting_customer', owner: GATE_OWNERS.SA, installed: 2, total: 3 });
  assert.equal(installSiteSummary(['confirmed', 'awaiting_deposit']).stage, 'awaiting_deposit');
  assert.equal(installSiteSummary(['installed']).stage, 'installed');
  assert.equal(installSiteSummary([]).stage, 'not_requested', 'คำขอเปล่าไม่ใช่ติดตั้งครบ');
  assert.equal(installSiteSummary([INSTALL_STAGE_SERVICE]).stage, INSTALL_STAGE_SERVICE);
});

test('พร้อมทำสัญญา: ทุกไซต์ที่เลือกติดตั้งต้องครบ · Service ไม่นับ · ยังไม่เลือก = ยังไม่ครบ', () => {
  const sites = [
    { siteId: 'A', stage: 'installed' }, { siteId: 'B', stage: 'confirmed' },
    { siteId: 'C', stage: INSTALL_STAGE_SERVICE }, { siteId: 'D', stage: 'undecided' },
  ];
  assert.deepEqual(installContractReadiness(sites), { ready: false, done: 1, total: 3, undecided: 1 });
  assert.equal(installContractReadiness([{ stage: 'installed' }, { stage: INSTALL_STAGE_SERVICE }]).ready, true);
  assert.equal(installContractReadiness([{ stage: INSTALL_STAGE_SERVICE }]).ready, true, 'ไม่มีไซต์ติดตั้ง = ทำสัญญาได้เลย');
});

test('ทะเบียนขั้น: ทุกขั้นมีป้ายและเจ้าของ (ค่าเดียวกับ GATE_OWNERS)', () => {
  for (const s of [...INSTALL_STAGES, INSTALL_STAGE_SERVICE]) {
    assert.ok(INSTALL_STAGE_LABELS[s], s);
    assert.ok(s in INSTALL_STAGE_OWNERS, s);
    const owner = INSTALL_STAGE_OWNERS[s];
    assert.ok(owner === null || Object.values(GATE_OWNERS).includes(owner), s);
  }
});

// ── mig 0425 ─────────────────────────────────────────────────────────────────────────
const mig = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/* 🔴 แกนเขียนแผนงวดบน production = 0377 + แพตช์แทนข้อความของ 0412 (pg_get_functiondef) ⇒ ยกเนื้อจาก 0377 มา
   CREATE OR REPLACE = ถอยแพตช์ 0412 เงียบ ๆ (เกือบเกิดจริงในร่างแรกของ 0425 · ยาม installmentReplanMigration จับได้) */
test('mig 0425: ไม่นิยามฟังก์ชันงวดใหม่ทับของที่ 0412 ปะไว้', () => {
  const code = stripComments(mig('0425_service_install_step.sql'));
  for (const fn of ['_so_installments_write_plan', 'replan_sales_order_installments', '_so_installment_replan_locked', 'carry_sales_order_installments']) {
    assert.doesNotMatch(code, new RegExp(`FUNCTION\\s+public\\.${fn}\\s*\\(`), fn);
  }
  // ยามธง: แก้ได้จนบัญชีรับรอง · ทำงานเฉพาะคำสั่งที่เอ่ยคอลัมน์ธง (ย้ายใบ/ปรับแผน/รับรองไม่ปลุก)
  assert.match(code, /BEFORE UPDATE OF "beforeInstall" ON public\.sales_order_installments/);
  assert.match(code, /OLD\.status = 'confirmed'[\s\S]*RAISE EXCEPTION 'installment_before_install_locked'/);
});

test('mig 0425: ตารางใหม่ปิด anon/authenticated และไม่มีคอลัมน์สถานะของคำขอ', () => {
  const sql = mig('0425_service_install_step.sql');
  for (const t of ['service_install_requests', 'service_install_request_zones', 'service_visit_zones', 'service_visit_planned_assets']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM anon, authenticated;`), t);
  }
  const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.service_install_requests'));
  assert.doesNotMatch(table.slice(0, table.indexOf(');')), /\bstatus\b|\bstage\b/, 'ขั้นคำนวณสด ห้ามเก็บ');
});
