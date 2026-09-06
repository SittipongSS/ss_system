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
