// ── ด่านเข้าไซต์ (mig 0302) ───────────────────────────────────────────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด (มติผู้ใช้ 2026-08-28):
//   "TS จะไม่สามารถสร้างการเข้าบริการได้เอง จนกว่าจะผ่านด่าน"
// และข้อจำกัดที่สำคัญพอ ๆ กัน: **ด่านต้องไม่กลายเป็นแรงเสียดทานรายวัน** —
// นัดที่ครบเงื่อนไขตั้งแต่แรกต้องขึ้นตารางเอง ไม่ต้องรอคนมากดปล่อยทีละใบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_EXEMPT_KINDS,
  GATE_OWNERS,
  evaluateVisitGate,
  gateBlockedItems,
  gateBlocker,
  gateNeedsOthers,
  gatePassed,
  gateReasons,
  gateSummary,
  initialVisitStatus,
} from './visitGate.js';
import { ORIGIN_HISTORICAL, ORIGIN_PIPELINE } from '../sales/historicalOrders.js';
import { installmentActionError, installmentReportOutcome } from '../sales/salesOrderPayments.js';

// ไซต์เข้าได้ จ–ศ 09:00–17:00
const site = {
  id: 'S1', name: 'Jim Thompson Outlet 93',
  accessDays: [1, 2, 3, 4, 5], accessFrom: '09:00', accessTo: '17:00',
};
// 2026-08-27 = วันพฤหัส · 2026-08-29 = วันเสาร์
const ok = { assigneeId: 'U1', assigneeName: 'ต้า', scheduledDate: '2026-08-27', startTime: '10:00', endTime: '12:00', kind: 'refill' };

/* ── บริบทของด่าน ①② ตั้งแต่ PR-C (2026-08-31) ─────────────────────────────
   ⚠️ **ไม่ส่งบริบทมา = ติด ไม่ใช่ผ่าน** — ไซต์ที่ไม่มีโซน/ไม่มีรอบขาย แปลว่า
   ไม่มีอะไรที่ได้รับอนุญาตให้ไปทำ · การเดาว่าผ่านคือที่มาของ "ส่งเจ้าหน้าที่ไปที่ที่
   หมดสัญญา 25 จุด" ที่ด่านนี้เกิดมาเพื่อแก้ */
const zones = [{ id: 'Z1', name: 'โซน A' }];
const terms = [{ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', startDate: '2026-01-01', endDate: '2027-12-31' }];
const ordersById = { SO1: { id: 'SO1', status: 'approved', serviceContractId: 'CT1' } };
const contractsById = { CT1: { id: 'CT1', status: 'signed' } };
const installmentsByOrderId = {
  SO1: [{ status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-09-30', dueDate: '2026-08-01' }],
};
const full = { site, zones, terms, ordersById, contractsById, installmentsByOrderId };

test('ครบทุกข้อ = ขึ้นตารางเลย ไม่ต้องให้คนมากดปล่อย', () => {
  const items = evaluateVisitGate(ok, full);
  assert.equal(gatePassed(items), true);
  assert.equal(initialVisitStatus(ok, full), 'scheduled');
  assert.equal(gateBlocker(items), '');
});

test('ไม่มีเจ้าหน้าที่ = จอดเป็นร่าง และบอกว่าเป็นงานของ TS', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '' }, full);
  assert.equal(initialVisitStatus({ ...ok, assigneeId: '' }, full), 'draft');
  const assignee = items.find((i) => i.key === 'assignee');
  assert.equal(assignee.state, 'blocked');
  assert.equal(assignee.owner, 'TS');
  assert.equal(assignee.fix, 'assignee');
});

test('นัดวันเสาร์ทั้งที่ไซต์ให้เข้า จ–ศ = ไม่ผ่านข้อช่วงเวลา', () => {
  const weekend = { ...ok, scheduledDate: '2026-08-29' };
  const items = evaluateVisitGate(weekend, full);
  const access = items.find((i) => i.key === 'access');
  assert.equal(access.state, 'blocked');
  assert.ok(access.detail);
  assert.equal(initialVisitStatus(weekend, full), 'draft');
});

test('⭐ ปุ่มที่กดไม่ได้ต้องบอก **ทุกข้อที่ขาดในครั้งเดียว** ไม่ใช่ทีละข้อ', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '', scheduledDate: '2026-08-29' }, full);
  const msg = gateBlocker(items);
  assert.match(msg, /ยังไม่มอบหมาย/);
  assert.match(msg, /เสาร์|ไซต์|เข้า/);
  assert.equal(msg.split(' · ').length >= 2, true);
});

/* ═══════════════════════════════════════════════════════════════════════
   ด่าน ①② ตรวจจริงแล้ว (PR-C · 2026-08-31) — เลิก parked
   ═══════════════════════════════════════════════════════════════════════ */

/* 🔴 ไม่มีโซน/ไม่มีรอบขาย = **ติด** ไม่ใช่ผ่าน — ไม่มีอะไรที่ได้รับอนุญาตให้ไปทำ */
test('⭐ ไม่มีบริบทสัญญาเลย = ติด ไม่ใช่ผ่านเงียบ ๆ', () => {
  const items = evaluateVisitGate(ok, { site });
  assert.equal(gatePassed(items), false);
  assert.equal(items.find((i) => i.key === 'contract').state, 'blocked');
  assert.equal(items.filter((i) => i.state === 'parked').length, 0, 'ไม่มี parked เหลืออีกแล้ว');
});

test('ใบสั่งขายที่ยังไม่ผูกสัญญา = ติดข้อสัญญา และเป็นงานของ SA', () => {
  const items = evaluateVisitGate(ok, { ...full, ordersById: { SO1: { id: 'SO1', status: 'approved' } } });
  const c = items.find((i) => i.key === 'contract');
  assert.equal(c.state, 'blocked');
  assert.equal(c.owner, 'SA');
  assert.match(c.detail, /ยังไม่ผูกสัญญา/);
});

test('สัญญาที่ยังไม่ผ่านการรับรอง ไม่นับว่ามีผล', () => {
  for (const st of ['draft', 'awaiting_signature', 'awaiting_approval', 'cancelled']) {
    const items = evaluateVisitGate(ok, { ...full, contractsById: { CT1: { id: 'CT1', status: st } } });
    assert.equal(items.find((i) => i.key === 'contract').state, 'blocked', st);
  }
});

/* 🔴 **แต่ละข้อบล็อกด้วยเหตุของตัวเอง** — นัดที่ติดเพราะเงิน ต้องไม่ขึ้นว่าติดสัญญา
   เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย (SA เปิดไปดูสัญญาแล้วไม่เจออะไรผิด) */
test('⭐ เกินช่วงจ่ายถึง = ติดข้อเงินข้อเดียว ไม่ลามไปข้อสัญญา', () => {
  const items = evaluateVisitGate({ ...ok, scheduledDate: '2026-11-10' }, full);
  assert.equal(items.find((i) => i.key === 'payment').state, 'blocked');
  assert.equal(items.find((i) => i.key === 'contract').state, 'ok');
  assert.equal(items.find((i) => i.key === 'payment').owner, 'SA → FN');
});

/* ⚠️ "แจ้งแล้ว" ไม่ปลดด่าน — ปลดเมื่อบัญชี "รับรองแล้ว" เท่านั้น */
test('งวดที่ยังไม่ถูกบัญชีรับรอง ไม่ปลดด่านเงิน', () => {
  for (const st of ['pending', 'reported', 'rejected']) {
    const rows = [{ status: st, coversFrom: '2026-08-01', coversTo: '2026-09-30', dueDate: '2026-08-01' }];
    const items = evaluateVisitGate(ok, { ...full, installmentsByOrderId: { SO1: rows } });
    assert.equal(items.find((i) => i.key === 'payment').state, 'blocked', st);
  }
});

/* ⭐ ไซต์เดียวโดนหลาย SO ครอบ — จ่ายใบเดียว ⇒ **นัดยังไปได้** แต่ตัดโซนที่ไม่ครอบ
   (มติผู้ใช้ 2026-08-27: "จ่ายมา บาง SO ก็ไปเฉพาะที่ครอบคลุม SO นั้น") */
test('⭐ ติดบางโซน = ใบยังผ่าน แต่แนบผลรายโซนให้ใบส่งงานตัดโซนที่งด', () => {
  const items = evaluateVisitGate(ok, { ...full, zones: [...zones, { id: 'Z2', name: 'โซน B' }] });
  assert.equal(gatePassed(items), true, 'โซนที่จ่ายแล้วยังไปได้');
  assert.deepEqual(items.zoneGates.map((z) => [z.zoneId, z.state]), [['Z1', 'ok'], ['Z2', 'blocked']]);
  assert.match(items.find((i) => i.key === 'contract').detail, /งดบริการ 1 โซน/);
});

/* ⭐ สำรวจพื้นที่เกิด **ก่อนขาย** · ถอนเครื่องเกิด **ตอนสัญญาหมด** ⇒ สองชนิดนี้
   ไม่มีทางผ่านด่าน ①② ได้เลย · ไม่ข้าม = เครื่องของบริษัทค้างที่ลูกค้าตลอดกาล */
/* ⚠️ ใช้ชนิด `remove` ที่มีอยู่ ไม่เพิ่มชนิดใหม่ — "ถอด" กับ "ถอน" ต่างกันตัวเดียว */
test('⭐ สำรวจพื้นที่กับถอนเครื่องข้ามด่านสัญญา/เงิน แต่ยังต้องผ่าน ③④', () => {
  assert.deepEqual([...GATE_EXEMPT_KINDS], ['survey', 'remove']);
  for (const kind of GATE_EXEMPT_KINDS) {
    const bare = evaluateVisitGate({ ...ok, kind }, { site });
    assert.equal(gatePassed(bare), true, `${kind}: ข้ามด่านสัญญา/เงินได้`);
    // ยังต้องมีคนรับผิดชอบ
    const noOne = evaluateVisitGate({ ...ok, kind, assigneeId: '' }, { site });
    assert.equal(gatePassed(noOne), false, `${kind}: ยังต้องมอบหมายคน`);
  }
});

test('ไม่รู้จักไซต์ = ตรวจข้อช่วงเวลาไม่ได้ ต้องไม่ระเบิดและไม่แกล้งบล็อก', () => {
  const items = evaluateVisitGate(ok, { ...full, site: null });
  assert.equal(items.find((i) => i.key === 'access').state, 'ok');
  assert.equal(gatePassed(items), true);
});

test('นับผลรวมได้ครบ 4 ข้อเสมอ — จอไหนก็เห็นเท่ากัน', () => {
  const s = gateSummary(evaluateVisitGate({}, { site }));
  assert.equal(s.total, 4);
  assert.equal(s.parked, 0, 'ไม่มีข้อไหน parked แล้วตั้งแต่ PR-C');
  assert.equal(s.blocked >= 1, true);
});

test('รายการเหตุแยกจากประโยคเต็ม — จอที่บอกบริบทอยู่แล้วไม่ต้องอ่านขีดซ้อนสามชั้น', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '' }, full);
  // บริบทสัญญา/เงินครบแล้ว ⇒ เหลือเหตุเดียวคือเรื่องคน
  assert.deepEqual(gateReasons(items), ['ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยขึ้นตาราง']);
  assert.equal(gateBlocker(items), 'ยังขึ้นตารางไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยขึ้นตาราง');
  // นัดที่ผ่านครบ = ไม่มีเหตุเลย (บริบทครบต้องส่งมาด้วย ไม่งั้นติดที่ข้อสัญญา)
  assert.deepEqual(gateReasons(evaluateVisitGate(ok, full)), []);
});

/* ── ข้อ① ต้องแปลว่า "มีผล **ณ วันนัด**" จริง ๆ ────────────────────────────
   🔴 ป้ายของข้อนี้เขียนว่า "ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด" มาตลอด แต่ตรรกะเดิม
   เป็น `contractInForce` ซึ่งดูแค่ `status === 'signed'` **ไม่เทียบวันเลย**
   ⇒ นัดที่อยู่ก่อนวันเริ่ม หรือหลังวันหมดอายุ ผ่านด่านไปได้ทั้งคู่ — ตรงกับตัวเลข
   ที่ทำให้ด่านนี้เกิด (ส่งเจ้าหน้าที่ไปที่ที่หมดสัญญา 25 จุด) · วันนัดคือ 2026-08-27 */
const withContract = (extra) => ({ ...full, contractsById: { CT1: { id: 'CT1', status: 'signed', ...extra } } });
const contractItem = (visit, ctx) => evaluateVisitGate(visit, ctx).find((i) => i.key === 'contract');

test('🔴 สัญญาหมดอายุก่อนวันนัด = ติด และเหตุต้องพูดเรื่องต่อสัญญา', () => {
  const c = contractItem(ok, withContract({ effectiveDate: '2026-01-01', expiryDate: '2026-08-01' }));
  assert.equal(c.state, 'blocked');
  assert.equal(c.owner, 'SA');
  assert.match(c.detail, /หมดอายุก่อนวันนัด/);
});

test('🔴 สัญญายังไม่ถึงวันเริ่มมีผล = ติด และเหตุต้องต่างจาก "หมดอายุ"', () => {
  const c = contractItem(ok, withContract({ effectiveDate: '2026-09-01', expiryDate: '2027-08-31' }));
  assert.equal(c.state, 'blocked');
  assert.match(c.detail, /ยังไม่ถึงวันเริ่มมีผล/);
  // คนละทางแก้กัน — เลื่อนนัด ไม่ใช่ต่อสัญญา
  assert.doesNotMatch(c.detail, /ต่อสัญญา/);
});

test('สัญญาที่ครอบวันนัดอยู่ = ผ่านตามปกติ · ขอบทั้งสองข้างนับรวมทั้งวัน', () => {
  assert.equal(contractItem(ok, withContract({ effectiveDate: '2026-01-01', expiryDate: '2027-12-31' })).state, 'ok');
  // วันแรกที่มีผล และวันสุดท้ายก่อนหมด ยังใช้ได้
  assert.equal(contractItem(ok, withContract({ effectiveDate: '2026-08-27' })).state, 'ok');
  assert.equal(contractItem(ok, withContract({ expiryDate: '2026-08-27' })).state, 'ok');
});

/* ⚠️ **ไม่ระบุช่วงวัน = ไม่บล็อก** — กติกาเดียวกับ `termInWindow` ("ไม่ระบุวัน =
   ยังไม่รู้ ไม่ใช่หมดอายุ") · ของจริงกรอกวันทีหลังเสมอ ⇒ บล็อกไว้ก่อนคือหยุดงานที่ทำได้
   🪤 ถ้าวันหนึ่งเปลี่ยนเป็น fail-closed ต้องเป็นมติ ไม่ใช่ผลข้างเคียงของการรีแฟกเตอร์ */
test('สัญญาที่ยังไม่กรอกช่วงวัน ไม่ถูกบล็อกด้วยข้อนี้', () => {
  assert.equal(contractItem(ok, withContract({})).state, 'ok');
  assert.equal(contractItem(ok, withContract({ effectiveDate: null, expiryDate: null })).state, 'ok');
});

test('งานที่ยกเว้นด่านสัญญา ไม่ติดเพราะวันของสัญญา', () => {
  for (const kind of ['survey', 'remove']) {
    const c = contractItem({ ...ok, kind },
      withContract({ effectiveDate: '2026-01-01', expiryDate: '2026-08-01' }));
    assert.notEqual(c.state, 'blocked', kind);
  }
});

/* เหตุต้องไม่ลามข้ามข้อ — นัดที่ติดเพราะวันของสัญญา ต้องไม่ขึ้นว่าติดเรื่องเงิน */
test('⭐ สัญญาหมดอายุ = ติดข้อสัญญาข้อเดียว ไม่ลามไปข้อเงิน', () => {
  const items = evaluateVisitGate(ok, withContract({ effectiveDate: '2026-01-01', expiryDate: '2026-08-01' }));
  assert.equal(items.find((i) => i.key === 'contract').state, 'blocked');
  assert.notEqual(items.find((i) => i.key === 'payment')?.state, 'blocked');
});

/* ── เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย: เงินติดได้สามแบบ แก้คนละทาง ─────────
   🐞 เจอตอนไล่บั๊ก "ออก Rev. แล้วนัดช่างถูกบล็อกทั้งไซต์" (06/09/2026) — ข้อความเดียว
      ว่า "วันนัดเกินช่วงที่เก็บเงินแล้ว" ส่ง SA ไปไล่ทวงลูกค้า ทั้งที่ของจริงคือ
      **บัญชียังไม่รับรองสักงวด** ซึ่งเป็นงานของ FN */
test('🐞 เงินติดสามแบบ ต้องบอกคนละเหตุ', () => {
  const reasonOf = (rows, date = ok.scheduledDate) => evaluateVisitGate(
    { ...ok, scheduledDate: date },
    { ...full, installmentsByOrderId: { SO1: rows } },
  ).find((i) => i.key === 'payment').detail;

  // ① ยังไม่มีงวดเลย — ฝ่ายขายต้องเริ่มติดตามการชำระ
  assert.match(reasonOf([]), /ยังไม่มีงวดชำระ/);

  /* ② มีงวดแล้วแต่ยังไม่มีใครรับรอง — สภาพของใบที่เพิ่งออก Rev. (mig 0346 ยกงวดมาให้
     แล้ว แต่บัญชียังไม่รับรองรอบใหม่) ⇒ ต้องไม่บอกว่า "จ่ายไม่ถึง" */
  const fresh = [{ status: 'pending', coversFrom: '2026-08-01', coversTo: '2026-12-31', dueDate: '2026-12-01' }];
  assert.match(reasonOf(fresh), /ยังไม่มีงวดไหนที่บัญชีรับรอง/);
  assert.doesNotMatch(reasonOf(fresh), /เกินช่วงที่เก็บเงิน/, 'ห้ามส่ง SA ไปไล่ทวงลูกค้า');

  // ③ รับรองแล้วจริง แต่วันนัดเลยช่วงที่ครอบ — อันนี้ถึงจะเป็นเรื่องเก็บเงินงวดถัดไป
  const paidRows = [{ status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-09-30' }];
  assert.match(reasonOf(paidRows, '2026-11-10'), /เกินช่วงที่เก็บเงิน/);

  // ④ ค้างชำระ — ยังไม่ควรส่งคนไปเพิ่ม
  const overdue = [
    { status: 'confirmed', coversFrom: '2026-08-01', coversTo: '2026-12-31' },
    { status: 'reported', dueDate: '2026-08-01' },
  ];
  assert.match(reasonOf(overdue), /เลยกำหนดที่บัญชียังไม่รับรอง/);
});

/* ── ใบยอด 0 · ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) ─────────────────────────────────────
   ⭐ ใบยอด 0 ไม่มีงวดให้เก็บ ⇒ ผ่านข้อ② เอง ด้วยตัวตัดสินเดียวกับงวดชำระ (`paymentNotRequired`) — ทุกใบ ไม่ใช่เฉพาะใบย้อนหลัง
   🔄 สวิตช์ยกเว้นด่านเงินรายใบของใบย้อนหลัง (มติข้อ 13 · 0360) ถอดแล้ว — เงินที่เก็บก่อนเข้าระบบคีย์เป็น
      "งวดยกมา" ให้บัญชีรับรองครั้งเดียว ⇒ ใบย้อนหลังที่มียอดเดินข้อ② ด้วยงวดจริงเหมือนใบปกติ
   🔴 ข้อ① สัญญาไม่มีทางข้าม — ใบ ฿0 ก็ต้องผูกเอกสารแทนสัญญาที่ครอบวันนัด */
const FROZEN_AT = '2026-09-15T03:00:00.000Z';
const historicalOrder = (extra = {}) => ({
  id: 'SO1', status: 'approved', origin: ORIGIN_HISTORICAL, serviceContractId: 'CT1', totalAmount: 261936, ...extra,
});
const coveringContract = { CT1: { id: 'CT1', status: 'signed', effectiveDate: '2026-01-01', expiryDate: '2026-12-31' } };
const historicalCtx = (order, installments = []) => ({
  ...full, ordersById: { SO1: order }, contractsById: coveringContract, installmentsByOrderId: { SO1: installments },
});
const paymentOf = (items) => items.find((i) => i.key === 'payment');

test('⭐ ใบยอด 0 ผ่านข้อ② เองโดยไม่มีงวดสักงวด — ทั้งใบ pipeline และใบย้อนหลัง · ผ่านแล้วต้องบอกเหตุ', () => {
  for (const origin of [ORIGIN_PIPELINE, ORIGIN_HISTORICAL]) {
    const ctx = historicalCtx(historicalOrder({ origin, totalAmount: 0 }));
    const items = evaluateVisitGate(ok, ctx);
    assert.equal(gatePassed(items), true, origin);
    assert.equal(paymentOf(items).state, 'ok', origin);
    assert.equal(paymentOf(items).detail, 'ไม่มีเงินให้เก็บ 1 โซน — ใบยอด 0 บาท', 'ผ่านเพราะไม่มีเงินต้องบอก — ด่านห้ามติ๊กผ่านเงียบ ๆ');
    assert.equal(items.zoneGates[0].paymentNotRequired, true);
    assert.equal(initialVisitStatus(ok, ctx), 'scheduled');
  }
});

test('🔴 ไม่รู้ยอด ≠ ยอด 0 — ใบที่ไม่ได้ส่งยอดมาและไม่มีงวด ต้องติดข้อเงิน (fail-closed)', () => {
  for (const totalAmount of [undefined, null, '']) {
    const items = evaluateVisitGate(ok, historicalCtx(historicalOrder({ totalAmount })));
    assert.equal(paymentOf(items).state, 'blocked', String(totalAmount));
    assert.equal(items.zoneGates[0].paymentNotRequired, undefined);
  }
});

test('⭐ ใบย้อนหลังที่บัญชีรับรองงวดยกมาแล้ว — ข้อ② เปิดถึงวันท้ายของงวดยกมา · เลยจากนั้นติดข้อเงินจนงวดถัดไปรับรอง', () => {
  const opening = {
    id: 'I1', seq: 1, kind: 'opening', status: 'confirmed', frozenAt: FROZEN_AT, amount: 196452,
    dueDate: null, paidOn: '2026-01-15', coversFrom: '2026-01-01', coversTo: '2026-09-30',
  };
  const next = {
    id: 'I2', seq: 2, kind: 'regular', status: 'pending', frozenAt: FROZEN_AT, amount: 65484,
    dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31',
  };
  const ctx = historicalCtx(historicalOrder(), [opening, next]);
  const items = evaluateVisitGate(ok, ctx);
  assert.equal(paymentOf(items).state, 'ok');
  assert.equal(paymentOf(items).detail, null, 'ผ่านด้วยเงินที่บัญชีรับรองจริง ไม่ใช่เพราะยอด 0');
  assert.equal(items.zoneGates[0].paymentNotRequired, undefined);

  const late = evaluateVisitGate({ ...ok, scheduledDate: '2026-10-15' }, ctx);
  assert.equal(paymentOf(late).state, 'blocked');
  assert.equal(paymentOf(late).owner, GATE_OWNERS.FN);
});

test('ใบย้อนหลังที่ไม่มีงวดยกมา + งวดแรกเลยกำหนดยังไม่รับรอง = ติดข้อเงิน เจ้าของ "SA → FN"', () => {
  const first = {
    id: 'I1', seq: 1, kind: 'regular', status: 'pending', frozenAt: FROZEN_AT, amount: 21828,
    dueDate: '2026-08-01', coversFrom: '2026-01-01', coversTo: '2026-12-31',
  };
  const items = evaluateVisitGate(ok, historicalCtx(historicalOrder(), [first]));
  const payment = paymentOf(items);
  assert.equal(payment.state, 'blocked');
  assert.equal(payment.owner, GATE_OWNERS.FN);
  assert.equal(payment.owner, 'SA → FN');
  assert.match(payment.detail, /เลยกำหนดที่บัญชียังไม่รับรอง/);
  assert.equal(gatePassed(items), false);
});

test('🔴 ร่องรอยยกเว้นด่านเงิน (paymentGateExemptAt ของ 0360) ไม่มีใครอ่านแล้ว — ปลอมมาก็ไม่ปลดด่าน', () => {
  for (const origin of [ORIGIN_HISTORICAL, ORIGIN_PIPELINE]) {
    const spoofed = historicalOrder({ origin, paymentGateExemptAt: FROZEN_AT });
    const items = evaluateVisitGate(ok, historicalCtx(spoofed));
    assert.equal(paymentOf(items).state, 'blocked', origin);
    assert.equal(gatePassed(items), false, origin);
    assert.doesNotMatch(String(paymentOf(items).detail), /ยกเว้น/);
  }
});

test('🔴 ใบยอด 0 ไม่ข้ามข้อสัญญา — ยังไม่ผูกสัญญา = ติดข้อ ① และข้อเงินไม่อ้างว่าผ่านเพราะยอด 0', () => {
  const items = evaluateVisitGate(ok, historicalCtx(historicalOrder({ totalAmount: 0, serviceContractId: null })));
  const contract = items.find((i) => i.key === 'contract');
  assert.equal(contract.state, 'blocked');
  assert.match(contract.detail, /ยังไม่ผูกสัญญาที่มีผล/);
  assert.equal(gatePassed(items), false);
  assert.equal(paymentOf(items).detail, null);
});

test('งวดรอเก็บของใบย้อนหลัง (ตรึงตอน AE Sup อนุมัติ) เดินสายเดิม: แจ้ง → reported · บัญชีรับรองพร้อมช่วงครอบ → ข้อ② เปิด', () => {
  const AE_USER = { id: 'u-ae', role: 'ae' };
  const FN_USER = { id: 'u-fn', role: 'finance', department: 'FN' };
  const frozenPending = {
    id: 'I1', seq: 1, status: 'pending', frozenAt: FROZEN_AT, amount: 30160,
    dueDate: '2026-08-01', coversFrom: '2026-06-01', coversTo: '2027-05-31',
  };
  assert.equal(installmentActionError(frozenPending, 'report', AE_USER, { paidOn: '2026-08-10', serviceRounds: 36 }), null);
  assert.equal(installmentReportOutcome(AE_USER, frozenPending), 'reported', 'งวดที่ตรึงแล้วไม่จอดเป็นร่าง — เข้าคิวบัญชีเลย');
  const reported = { ...frozenPending, status: 'reported' };
  assert.equal(installmentActionError(reported, 'confirm', FN_USER, { serviceRounds: 36 }), null);
  const items = evaluateVisitGate(ok, historicalCtx(historicalOrder(), [{ ...reported, status: 'confirmed' }]));
  assert.equal(paymentOf(items).state, 'ok');
  assert.equal(paymentOf(items).detail, null, 'ผ่านด้วยเงินที่บัญชีรับรองจริง');
});

/* ═══════════════════════════════════════════════════════════════════════
   รายการงานบน /service/schedule (มติผู้ใช้ 2026-09-22)
   ⭐ ร่างที่ติดด่านแยกเป็น "ฝ่าย TS แก้ได้เอง" กับ "รอฝ่ายอื่น" — แถวต้องรู้ว่าใครแก้
      และข้อที่ TS แก้เองต้องมีทางพาไปช่องนั้นตรง ๆ (`fix`)
   ═══════════════════════════════════════════════════════════════════════ */
test('เจ้าของข้อประกาศที่เดียว — ค่าที่จอโชว์ไม่เปลี่ยน', () => {
  assert.deepEqual({ ...GATE_OWNERS }, { SA: 'SA', FN: 'SA → FN', TS: 'TS' });
  assert.ok(Object.isFrozen(GATE_OWNERS));
  const owners = Object.fromEntries(evaluateVisitGate(ok, full).map((i) => [i.key, i.owner]));
  assert.deepEqual(owners, { contract: GATE_OWNERS.SA, payment: GATE_OWNERS.FN, assignee: GATE_OWNERS.TS, access: GATE_OWNERS.TS });
});

test('⭐ gateBlockedItems พา `fix` ไปด้วย — ข้อของ TS บอกช่องที่ต้องแก้ · ข้อของฝ่ายอื่นเป็น null', () => {
  const items = evaluateVisitGate({ ...ok, assigneeId: '', scheduledDate: '2026-11-14' }, full);
  const byKey = Object.fromEntries(gateBlockedItems(items).map((b) => [b.key, b]));
  assert.deepEqual(Object.keys(byKey).sort(), ['access', 'assignee', 'payment']);
  assert.equal(byKey.assignee.fix, 'assignee');
  assert.equal(byKey.assignee.owner, GATE_OWNERS.TS);
  assert.match(byKey.assignee.reason, /ปล่อยขึ้นตาราง/);
  assert.equal(byKey.access.fix, 'schedule');
  assert.equal(byKey.payment.fix, null);
  assert.equal(byKey.payment.owner, GATE_OWNERS.FN);
  assert.deepEqual(gateBlockedItems(evaluateVisitGate(ok, full)), [], 'ผ่านครบ = ไม่มีข้อติด');
});

test('⭐ gateNeedsOthers — ติดเฉพาะข้อของ TS = false · มีข้อของ SA หรือเงินปน = true', () => {
  // TS ล้วน: ขาดคน + วันเสาร์
  const tsOnly = evaluateVisitGate({ ...ok, assigneeId: '', scheduledDate: '2026-08-29' }, full);
  assert.equal(gatePassed(tsOnly), false);
  assert.equal(gateNeedsOthers(tsOnly), false);
  // SA ล้วน: ใบยังไม่ผูกสัญญา
  const saOnly = evaluateVisitGate(ok, { ...full, ordersById: { SO1: { id: 'SO1', status: 'approved' } } });
  assert.deepEqual(gateBlockedItems(saOnly).map((b) => b.owner), [GATE_OWNERS.SA]);
  assert.equal(gateNeedsOthers(saOnly), true);
  // เงินล้วน: วันนัดเลยช่วงที่จ่ายถึง (2026-11-10 = วันอังคาร ข้อช่วงเวลาผ่าน)
  const fnOnly = evaluateVisitGate({ ...ok, scheduledDate: '2026-11-10' }, full);
  assert.deepEqual(gateBlockedItems(fnOnly).map((b) => b.owner), [GATE_OWNERS.FN]);
  assert.equal(gateNeedsOthers(fnOnly), true);
  // ปน: เงิน + ขาดคน ⇒ ยังต้องรอฝ่ายอื่น แม้ TS จะแก้ข้อของตัวเองได้
  const mixed = evaluateVisitGate({ ...ok, assigneeId: '', scheduledDate: '2026-11-10' }, full);
  assert.equal(gateNeedsOthers(mixed), true);
  // ผ่านครบ = false (ผู้เรียกต้องถาม gatePassed ก่อน)
  assert.equal(gateNeedsOthers(evaluateVisitGate(ok, full)), false);
  // ข้อที่ไม่มีเจ้าของ = ไม่ใช่ของ TS
  assert.equal(gateNeedsOthers([{ key: 'x', state: 'blocked', owner: null }]), true);
  assert.equal(gateNeedsOthers(), false);
});

test('งานสำรวจ/ถอนเครื่องที่ขาดคน = TS แก้เองได้ (ข้ามด่านสัญญา/เงินจริง ไม่ไปจมกลุ่มรอฝ่ายอื่น)', () => {
  for (const kind of GATE_EXEMPT_KINDS) {
    const items = evaluateVisitGate({ ...ok, kind, assigneeId: '' }, { site });
    assert.equal(gatePassed(items), false, kind);
    assert.equal(gateNeedsOthers(items), false, kind);
  }
});
