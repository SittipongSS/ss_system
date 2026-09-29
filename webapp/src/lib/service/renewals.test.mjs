// ── ทะเบียนติดตามต่อสัญญา (mig 0327 · PR-E) ─────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECLINE_REASON_MIN, RENEWAL_WINDOW_DAYS,
  followupPatch, followupSaveError, renewalCounts, renewalRows, renewalState,
} from './renewals.js';

const TODAY = '2026-08-31';
const site = (id, name) => ({ id, name });
const zone = (id, siteId) => ({ id, siteId });

/* 🐞 **fixture เดิมป้อน `endDate` ลงบน term ตรง ๆ** ⇒ เทสต์เขียว 100% ทั้งที่ของจริง
   ไม่มีวันมีค่า (คอลัมน์นั้นไม่มีใครเขียนเลยทั้งรีโป) — นั่นคือเหตุที่ CI ไม่เคยฟ้อง
   ⇒ ตอนนี้ป้อนผ่านทางเดียวกับของจริง: term → ใบสั่งขาย → สัญญา (mig 0324)
   ⚠️ ตัวช่วยนี้ **ห้ามใส่ `endDate` ลงบน term** ไม่งั้นกลับไปทดสอบทางที่ตายแล้ว */
const term = (id, zoneId, salesOrderId = 'SO1') => ({ id, zoneId, salesOrderId });

/* ใบ + สัญญาที่จบวันนั้น — คืนคู่ให้ส่งเข้า renewalRows ได้ตรง ๆ */
function withContracts(spec, { superseded = null } = {}) {
  const ordersById = new Map();
  const contractsById = new Map();
  for (const [orderId, expiryDate] of Object.entries(spec)) {
    const contractId = `CT-${orderId}`;
    ordersById.set(orderId, {
      id: orderId, status: 'approved', supersededById: superseded, serviceContractId: contractId,
    });
    contractsById.set(contractId, { id: contractId, contractNo: contractId, status: 'signed', expiryDate });
  }
  return { ordersById, contractsById };
}

test('สถานะคำนวณจากวันล้วน — เกินหน้าต่างหรือไม่มีวันจบ = ไม่เข้าทะเบียน', () => {
  assert.equal(renewalState('2026-08-30', TODAY), 'expired');
  assert.equal(renewalState(TODAY, TODAY), 'due_soon');
  assert.equal(renewalState('2026-11-29', TODAY), 'due_soon');      // วันที่ 90 พอดี
  assert.equal(renewalState('2026-11-30', TODAY), null);            // วันที่ 91
  // รอบปลายเปิดไม่ใช่ของที่ต้องตาม — เดาให้เป็น "ใกล้หมด" คือสร้างงานปลอม
  assert.equal(renewalState(null, TODAY), null);
  assert.equal(RENEWAL_WINDOW_DAYS, 90);
});

test('หนึ่งไซต์หนึ่งแถว และใช้วันหมดที่เร็วที่สุด', () => {
  const rows = renewalRows({
    sites: [site('ST1', 'ไซต์ A')],
    zones: [zone('ZN1', 'ST1'), zone('ZN2', 'ST1')],
    terms: [term('T1', 'ZN1', 'SO1'), term('T2', 'ZN2', 'SO2')],
    ...withContracts({ SO1: '2026-10-30', SO2: '2026-09-15' }), todayIso: TODAY,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endDate, '2026-09-15');   // เร็วที่สุด ไม่ใช่ช้าที่สุด
  assert.equal(rows[0].terms.length, 2);
  assert.equal(rows[0].daysLeft, 15);
});

test('term ที่ใบแม่ตายแล้วไม่นับ — ไม่งั้นทะเบียนเต็มไปด้วยของที่ถูกแทนแล้ว', () => {
  const ordersById = new Map([
    ['SO1', { id: 'SO1', status: 'approved', supersededById: 'SO2', serviceContractId: 'CT1' }],
    ['SO3', { id: 'SO3', status: 'cancelled', supersededById: null, serviceContractId: 'CT3' }],
  ]);
  const contractsById = new Map([
    ['CT1', { id: 'CT1', expiryDate: '2026-09-15' }],
    ['CT3', { id: 'CT3', expiryDate: '2026-09-20' }],
  ]);
  const rows = renewalRows({
    sites: [site('ST1', 'ไซต์ A')],
    zones: [zone('ZN1', 'ST1')],
    terms: [term('T1', 'ZN1', 'SO1'), term('T2', 'ZN1', 'SO3')],
    ordersById, contractsById, todayIso: TODAY,
  });
  assert.deepEqual(rows, []);
});

/* 🐞 **บั๊กที่เทสต์ชุดนี้ถูกรื้อเพราะมัน** — ไฟล์นี้เคยอ่าน `service_zone_terms.endDate`
   ซึ่ง **ไม่มีใครเขียนค่าลงไปเลยทั้งรีโป** ⇒ ทะเบียนตอบ `[]` เสมอ กระดิ่งไม่ยิงสักใบ
   แถบสรุปเป็น 0 ทั้งสี่ช่องถาวร · mig 0324 ย้ายแหล่งความจริงไปที่สัญญาแล้ว
   และปิดป้ายบนคอลัมน์เก่าว่าห้ามเขียน แต่ไฟล์นี้ตกขบวน */
test('🐞 วันหมดมาจากสัญญาของใบ ไม่ใช่คอลัมน์ที่ตายแล้วบน term', () => {
  const base = {
    sites: [site('ST1', 'A')], zones: [zone('ZN1', 'ST1')], todayIso: TODAY,
  };
  // ค่าที่ยัดบน term ต้องไม่มีผลอะไรเลย — ทางนั้นตายแล้ว
  const rows = renewalRows({
    ...base,
    terms: [{ id: 'T1', zoneId: 'ZN1', salesOrderId: 'SO1', endDate: '2026-09-01' }],
    ...withContracts({ SO1: '2026-09-20' }),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endDate, '2026-09-20', 'ต้องใช้วันของสัญญา ไม่ใช่ค่าบน term');

  // ใบที่ยังไม่ผูกสัญญา = ไม่มีวันหมด = ไม่ใช่ของที่ต้องตาม (ไม่ใช่เดาว่าหมดวันนี้)
  const noContract = renewalRows({
    ...base,
    terms: [{ id: 'T1', zoneId: 'ZN1', salesOrderId: 'SO1', endDate: '2026-09-01' }],
    ordersById: new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: null }]]),
    contractsById: new Map(),
  });
  assert.deepEqual(noContract, []);
});

/* 🪤 ยามผูกกับซอร์สจริง — กันไม่ให้ใครเผลอกลับไปอ่านคอลัมน์ที่ตายแล้ว */
test('🪤 renewals.js ต้องไม่อ่าน term.endDate อีก', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./renewals.js', import.meta.url), 'utf8');
  /* ⚠️ ตัดคอมเมนต์ออกก่อนตรวจ — หัวไฟล์เล่าประวัติบั๊กไว้ และต้องเล่าต่อได้
     (ยามที่ห้ามพูดถึงบั๊กเก่า = ยามที่บังคับให้ลบเหตุผลทิ้ง) */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /term\.endDate/,
    'service_zone_terms.endDate เป็นคอลัมน์ตาย (mig 0324 ห้ามเขียน) — อ่านจากสัญญาแทน');
  assert.match(code, /serviceContractId/, 'ต้องเดินผ่านใบไปหาสัญญา');
});

test('เรียงหมดแล้วก่อน แล้วค่อยใกล้หมด', () => {
  const rows = renewalRows({
    sites: [site('ST1', 'A'), site('ST2', 'B')],
    zones: [zone('ZN1', 'ST1'), zone('ZN2', 'ST2')],
    terms: [term('T1', 'ZN1', 'SO1'), term('T2', 'ZN2', 'SO2')],
    ...withContracts({ SO1: '2026-10-01', SO2: '2026-08-01' }), todayIso: TODAY,
  });
  assert.deepEqual(rows.map((r) => [r.siteId, r.state]), [['ST2', 'expired'], ['ST1', 'due_soon']]);
});

test('เรื่องที่ปิดไปแล้วของวันหมดเดียวกันไม่โผล่ซ้ำ — แต่รอบถัดไปต้องโผล่ใหม่', () => {
  const base = {
    sites: [site('ST1', 'A')], zones: [zone('ZN1', 'ST1')],
    ...withContracts({ SO1: '2026-09-15', SO2: '2026-11-01' }), todayIso: TODAY,
    closedEndDates: new Map([['ST1', ['2026-09-15']]]),
  };
  assert.deepEqual(renewalRows({ ...base, terms: [term('T1', 'ZN1', 'SO1')] }), []);
  // ⚠️ ปีหน้าหมดอีกครั้ง = เรื่องใหม่ ไม่ใช่เรื่องเดิมที่ปิดไปแล้ว
  const next = renewalRows({ ...base, terms: [term('T2', 'ZN1', 'SO1'), term('T3', 'ZN1', 'SO2')] });
  assert.equal(next.length, 1);
  assert.equal(next[0].endDate, '2026-11-01');
});

test('แถวที่มีคนรับเรื่องแล้วพก followup มาด้วย', () => {
  const rows = renewalRows({
    sites: [site('ST1', 'A')], zones: [zone('ZN1', 'ST1')],
    terms: [term('T1', 'ZN1', 'SO1')],
    ...withContracts({ SO1: '2026-09-15' }), todayIso: TODAY,
    followups: [
      { id: 'F1', siteId: 'ST1', status: 'following', ownerName: 'AE หนึ่ง' },
      { id: 'F0', siteId: 'ST1', status: 'renewed' },   // ปิดแล้ว ไม่ใช่เรื่องที่เปิดอยู่
    ],
  });
  assert.equal(rows[0].followup.id, 'F1');
});

test('ตัวเลขแถบสรุปแยก "ใกล้หมดใน 30 วัน" ออกจาก "ทั้งหน้าต่าง 90 วัน"', () => {
  const rows = renewalRows({
    sites: [site('ST1', 'A'), site('ST2', 'B'), site('ST3', 'C')],
    zones: [zone('Z1', 'ST1'), zone('Z2', 'ST2'), zone('Z3', 'ST3')],
    terms: [term('T1', 'Z1', 'SO1'), term('T2', 'Z2', 'SO2'), term('T3', 'Z3', 'SO3')],
    ...withContracts({ SO1: '2026-08-01', SO2: '2026-09-10', SO3: '2026-11-20' }), todayIso: TODAY,
    followups: [{ id: 'F1', siteId: 'ST2', status: 'following' }],
  });
  assert.deepEqual(renewalCounts(rows, TODAY), { expired: 1, dueIn30: 1, dueSoon: 2, following: 1 });
});

test('ด่านบันทึกผล: ไม่ต่อต้องมีเหตุผล · ตามต่อต้องมีวันนัด', () => {
  const ok = { canEdit: true };
  assert.match(followupSaveError(null, { status: 'declined', declineReason: 'สั้น' }, ok) || '', /ตัวอักษร/);
  assert.equal(followupSaveError(null, { status: 'declined', declineReason: 'ย้ายไปใช้เจ้าอื่นแล้ว' }, ok), null);
  assert.match(followupSaveError(null, { status: 'following' }, ok) || '', /วันติดต่อครั้งหน้า/);
  assert.equal(followupSaveError(null, { status: 'following', nextContactOn: '2026-09-10' }, ok), null);
  assert.equal(followupSaveError(null, { status: 'renewed' }, ok), null);
  assert.equal(DECLINE_REASON_MIN, 10);
});

test('ด่านบันทึกผล: ไม่มีสิทธิ์ · เรื่องปิดแล้ว · ไม่เลือกผล', () => {
  assert.match(followupSaveError(null, { status: 'renewed' }, { canEdit: false }) || '', /ฝ่ายขาย/);
  assert.match(
    followupSaveError({ status: 'renewed' }, { status: 'following', nextContactOn: '2026-09-10' }, { canEdit: true }) || '',
    /ปิดไปแล้ว/,
  );
  assert.match(followupSaveError(null, { status: 'อะไรก็ไม่รู้' }, { canEdit: true }) || '', /เลือกผล/);
});

test('ค่าที่เขียนลงฐาน: ปิดเรื่องแล้วต้องมี closedAt และไม่เหลือวันนัดค้าง', () => {
  const following = followupPatch({ status: 'following', nextContactOn: '2026-09-10' }, TODAY);
  assert.equal(following.closedAt, null);
  assert.equal(following.nextContactOn, '2026-09-10');
  assert.equal(following.lastContactOn, TODAY);

  const renewed = followupPatch({ status: 'renewed', nextContactOn: '2026-09-10' }, TODAY);
  assert.ok(renewed.closedAt);
  assert.equal(renewed.nextContactOn, null);      // เรื่องปิดแล้วเหลือวันนัดค้าง = อ่านลวงตา
  assert.equal(renewed.declineReason, null);      // เหตุผลไม่ต่อต้องไม่ติดมากับ "ต่อ"

  const declined = followupPatch({ status: 'declined', declineReason: '  ลูกค้าปิดสาขา  ' }, TODAY);
  assert.equal(declined.declineReason, 'ลูกค้าปิดสาขา');
});

/* ⭐ สัญญาที่ถูกยกเลิกหลังลงนาม (มติเจ้าของ 24/09/2026) — **วันยกเลิกคือวันจบจริง** ⇒ ทะเบียนต่อสัญญา
   ถือว่ารอบจบวันนั้น (หรือวันหมดอายุถ้ามาก่อน) · ไซต์ขึ้นให้ตามต่อ/ถอนเครื่องทันที ไม่ต้องรอถึงวันหมดอายุเดิม */
test('รอบที่สัญญาถูกยกเลิกหลังลงนาม: วันจบ = วันยกเลิก (เวลาไทย) หรือวันหมดอายุถ้ามาก่อน', async () => {
  const { termEndDate } = await import('./renewals.js');
  const ordersById = new Map([['SO1', { id: 'SO1', status: 'approved', serviceContractId: 'CT1' }]]);
  const at = (contract) => termEndDate(term('T1', 'Z1'), ordersById, new Map([['CT1', { id: 'CT1', ...contract }]]));
  const cancelled = { status: 'cancelled', approvedAt: '2026-01-02T03:00:00Z', expiryDate: '2026-12-31' };
  assert.equal(at({ ...cancelled, cancelledAt: '2026-08-31T18:00:00Z' }), '2026-09-01');
  assert.equal(at({ ...cancelled, cancelledAt: '2026-08-31T03:00:00Z', expiryDate: '2026-08-15' }), '2026-08-15');
  assert.equal(at({ status: 'signed', expiryDate: '2026-12-31' }), '2026-12-31');

  const { ordersById: orders, contractsById } = withContracts({ SO1: '2026-12-31' });
  contractsById.set('CT-SO1', { ...contractsById.get('CT-SO1'), ...cancelled, cancelledAt: '2026-08-31T03:00:00Z' });
  const rows = renewalRows({
    sites: [site('S1', 'ไซต์')], zones: [zone('Z1', 'S1')], terms: [term('T1', 'Z1')],
    ordersById: orders, contractsById, todayIso: TODAY,
  });
  assert.equal(rows.length, 1, 'สัญญาปีหน้าที่ถูกยกเลิกวันนี้ต้องขึ้นทะเบียนทันที');
  assert.equal(rows[0].endDate, TODAY);
});

/* ── ใบที่ยังไม่ผูกสัญญา: วันหมดถอยไปที่ช่วงบริการของใบ (PR-C · C-D13) ─────────────
   ⭐ ใบที่ **เปิดงานบริการแล้ว** (`serviceTermsOpenedAt` · 0392) แต่ยังไม่ผูกสัญญา = ขายช่วงบริการไว้จริง
     ⇒ ทะเบียนตามต่อด้วย `servicePeriodTo` แทนการเงียบ · สัญญาผูกเมื่อไร สัญญาชนะเสมอ
   🪤 ใบที่ยังไม่มีตรา = ช่วงบริการร่างของการตั้งย้อนหลัง (0392 บันทึกช่วงก่อนตรวจ) ⇒ ห้ามอ่าน
   🪤 ช่วงที่จบก่อนวัน 0392 รัน (29/09/2026) ไม่ถอยมาให้ — ใบย้อนหลังที่ช่วงจบไปนานแล้วจะท่วม "หมดแล้ว" + กระดิ่ง */
const OPENED_AT = '2026-09-29T04:08:11.170722+00:00';
const openedOrder = (id, servicePeriodTo, extra = {}) => ({
  id, status: 'approved', supersededById: null, serviceContractId: null,
  servicePeriodFrom: '2025-10-01', servicePeriodTo, serviceTermsOpenedAt: OPENED_AT, ...extra,
});
const oneSite = { sites: [site('ST1', 'ไซต์ A')], zones: [zone('ZN1', 'ST1'), zone('ZN2', 'ST1')] };

test('ค่าคงที่ของทางถอย: ข้อความใต้วัน + วันเริ่มใช้ = วันที่ 0392 รัน', async () => {
  const { ORDER_PERIOD_END_NOTE, ORDER_PERIOD_FALLBACK_SINCE } = await import('./renewals.js');
  assert.equal(ORDER_PERIOD_END_NOTE, 'ครบช่วงบริการของใบ · ยังไม่ผูกสัญญา');
  assert.equal(ORDER_PERIOD_FALLBACK_SINCE, '2026-09-29');
});

test('ใบเปิดงานบริการแล้ว ไม่มีสัญญา ช่วงจบในอีก 60 วัน → ใกล้หมด · แหล่งวัน = ช่วงบริการของใบ', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-11-28')]]), contractsById: new Map(),
    todayIso: '2026-09-29',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'due_soon');
  assert.equal(rows[0].endDate, '2026-11-28');
  assert.equal(rows[0].daysLeft, 60);
  assert.equal(rows[0].endSource, 'order_period');
  assert.equal(rows[0].terms[0].endSource, 'order_period');
  assert.equal(rows[0].terms[0].endDate, '2026-11-28');
});

test('🪤 ใบที่ยังไม่มีตราเปิดงานบริการ (ช่วงร่างของการตั้งย้อนหลัง) → ไม่ขึ้นทะเบียน', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-11-28', { serviceTermsOpenedAt: null })]]),
    contractsById: new Map(), todayIso: '2026-09-29',
  });
  assert.deepEqual(rows, []);
});

test('🪤 ช่วงที่จบก่อน 29/09/2026 ไม่ถอยมาให้ — ไม่ท่วมแถว "หมดแล้ว"', () => {
  const at = (servicePeriodTo, todayIso = '2026-09-29') => renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', servicePeriodTo)]]), contractsById: new Map(), todayIso,
  });
  assert.deepEqual(at('2026-08-31'), []);
  assert.deepEqual(at('2026-09-28'), [], 'วันก่อนวันเริ่มใช้หนึ่งวัน = ไม่ถอย');
  const edge = at('2026-09-29', '2026-10-01');
  assert.equal(edge.length, 1, 'จบวันเริ่มใช้พอดี = ถอยให้');
  assert.equal(edge[0].state, 'expired');
});

test('ช่วงจบ 15/10/2026 ดูวันที่ 01/11/2026 → หมดแล้ว (แหล่งวัน = ช่วงบริการของใบ)', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-10-15')]]), contractsById: new Map(),
    todayIso: '2026-11-01',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'expired');
  assert.equal(rows[0].daysLeft, -17);
  assert.equal(rows[0].endSource, 'order_period');
});

test('ผูกสัญญาแล้ว → สัญญาชนะเสมอ แม้ช่วงของใบจะจบก่อน', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-10-15', { serviceContractId: 'CT1' })]]),
    contractsById: new Map([['CT1', { id: 'CT1', status: 'signed', expiryDate: '2026-12-01' }]]),
    todayIso: '2026-09-29',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endDate, '2026-12-01');
  assert.equal(rows[0].endSource, 'contract');
});

test('ผูกสัญญาปลายเปิด → ไม่ขึ้นทะเบียน (ไม่ถอยข้ามสัญญาไปหาช่วงของใบ)', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-10-15', { serviceContractId: 'CT1' })]]),
    contractsById: new Map([['CT1', { id: 'CT1', status: 'signed', expiryDate: null }]]),
    todayIso: '2026-09-29',
  });
  assert.deepEqual(rows, []);
});

test('ใบชี้สัญญาที่ไม่อยู่ในก้อน → ไม่ขึ้นทะเบียน (เหมือนเดิม · ไม่ถอยข้ามสัญญา)', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-10-15', { serviceContractId: 'CT-หาย' })]]),
    contractsById: new Map(), todayIso: '2026-09-29',
  });
  assert.deepEqual(rows, []);
});

test('เรื่องที่ปิดไปแล้วของวันจบช่วงเดียวกันไม่โผล่ซ้ำ', () => {
  const rows = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1')],
    ordersById: new Map([['SO1', openedOrder('SO1', '2026-11-28')]]), contractsById: new Map(),
    closedEndDates: new Map([['ST1', ['2026-11-28']]]), todayIso: '2026-09-29',
  });
  assert.deepEqual(rows, []);
});

test('ไซต์เดียวสองแหล่ง: แหล่งของแถว = แหล่งของรอบที่หมดก่อน · วันชนกัน = สัญญา', () => {
  const ordersById = new Map([
    ['SO1', openedOrder('SO1', '2026-10-31')],
    ['SO2', openedOrder('SO2', '2027-09-30', { serviceContractId: 'CT2' })],
  ]);
  const earlierPeriod = renewalRows({
    ...oneSite, terms: [term('T2', 'ZN2', 'SO2'), term('T1', 'ZN1', 'SO1')], ordersById,
    contractsById: new Map([['CT2', { id: 'CT2', status: 'signed', expiryDate: '2026-12-15' }]]),
    todayIso: '2026-09-29',
  });
  assert.equal(earlierPeriod.length, 1);
  assert.equal(earlierPeriod[0].endDate, '2026-10-31');
  assert.equal(earlierPeriod[0].endSource, 'order_period');
  assert.deepEqual(earlierPeriod[0].terms.map((t) => t.endSource), ['contract', 'order_period']);

  const tie = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1'), term('T2', 'ZN2', 'SO2')], ordersById,
    contractsById: new Map([['CT2', { id: 'CT2', status: 'signed', expiryDate: '2026-10-31' }]]),
    todayIso: '2026-09-29',
  });
  assert.equal(tie[0].endDate, '2026-10-31');
  assert.equal(tie[0].endSource, 'contract', 'วันเดียวกัน = สัญญาเป็นแหล่งของแถว');
});

test('termEndInfo บอกทั้งวันและแหล่ง · termEndDate คืนแค่วันเหมือนเดิม', async () => {
  const { termEndInfo, termEndDate } = await import('./renewals.js');
  const ordersById = new Map([
    ['SO1', openedOrder('SO1', '2026-11-28')],
    ['SO2', openedOrder('SO2', '2026-11-28', { serviceContractId: 'CT2' })],
    ['SO3', openedOrder('SO3', '2026-11-28', { serviceTermsOpenedAt: null })],
  ]);
  const contractsById = { CT2: { id: 'CT2', status: 'signed', expiryDate: '2027-01-31' } };
  assert.deepEqual(termEndInfo(term('T1', 'Z1', 'SO1'), ordersById, contractsById), { date: '2026-11-28', source: 'order_period' });
  assert.deepEqual(termEndInfo(term('T2', 'Z1', 'SO2'), ordersById, contractsById), { date: '2027-01-31', source: 'contract' });
  assert.equal(termEndInfo(term('T3', 'Z1', 'SO3'), ordersById, contractsById), null);
  assert.equal(termEndInfo(term('T4', 'Z1', 'SO-ไม่มี'), ordersById, contractsById), null);
  assert.equal(termEndDate(term('T1', 'Z1', 'SO1'), ordersById, contractsById), '2026-11-28');
  assert.equal(termEndDate(term('T3', 'Z1', 'SO3'), ordersById, contractsById), null);
});

test('รอบนำของแถว (ใบที่ลิงก์/ตัดสิทธิ์) = รอบที่วันและแหล่งตรงกับแถว', async () => {
  const { renewalLeadTerm } = await import('./renewals.js');
  const ordersById = new Map([
    ['SO1', openedOrder('SO1', '2026-10-31')],
    ['SO2', openedOrder('SO2', '2027-09-30', { serviceContractId: 'CT2' })],
  ]);
  const [row] = renewalRows({
    ...oneSite, terms: [term('T1', 'ZN1', 'SO1'), term('T2', 'ZN2', 'SO2')], ordersById,
    contractsById: new Map([['CT2', { id: 'CT2', status: 'signed', expiryDate: '2026-10-31' }]]),
    todayIso: '2026-09-29',
  });
  assert.equal(renewalLeadTerm(row).salesOrderId, 'SO2', 'แถวบอกแหล่ง "สัญญา" ⇒ ใบที่ลิงก์ต้องเป็นใบที่มีสัญญา');
  assert.equal(renewalLeadTerm({ endDate: 'x', endSource: 'contract', terms: [{ id: 'T9', endDate: 'y' }] }).id, 'T9');
  assert.equal(renewalLeadTerm({ terms: [] }), null);
});
