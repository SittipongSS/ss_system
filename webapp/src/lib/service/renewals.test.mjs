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
const term = (id, zoneId, endDate, salesOrderId = 'SO1') => ({ id, zoneId, salesOrderId, endDate });
const live = new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: null }]]);

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
    terms: [term('T1', 'ZN1', '2026-10-30'), term('T2', 'ZN2', '2026-09-15')],
    ordersById: live, todayIso: TODAY,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endDate, '2026-09-15');   // เร็วที่สุด ไม่ใช่ช้าที่สุด
  assert.equal(rows[0].terms.length, 2);
  assert.equal(rows[0].daysLeft, 15);
});

test('term ที่ใบแม่ตายแล้วไม่นับ — ไม่งั้นทะเบียนเต็มไปด้วยของที่ถูกแทนแล้ว', () => {
  const ordersById = new Map([
    ['SO1', { id: 'SO1', status: 'approved', supersededById: 'SO2' }],   // ถูก Rev. ทับ
    ['SO3', { id: 'SO3', status: 'cancelled', supersededById: null }],
  ]);
  const rows = renewalRows({
    sites: [site('ST1', 'ไซต์ A')],
    zones: [zone('ZN1', 'ST1')],
    terms: [term('T1', 'ZN1', '2026-09-15'), term('T2', 'ZN1', '2026-09-20', 'SO3')],
    ordersById, todayIso: TODAY,
  });
  assert.deepEqual(rows, []);
});

test('เรียงหมดแล้วก่อน แล้วค่อยใกล้หมด', () => {
  const rows = renewalRows({
    sites: [site('ST1', 'A'), site('ST2', 'B')],
    zones: [zone('ZN1', 'ST1'), zone('ZN2', 'ST2')],
    terms: [term('T1', 'ZN1', '2026-10-01'), term('T2', 'ZN2', '2026-08-01')],
    ordersById: live, todayIso: TODAY,
  });
  assert.deepEqual(rows.map((r) => [r.siteId, r.state]), [['ST2', 'expired'], ['ST1', 'due_soon']]);
});

test('เรื่องที่ปิดไปแล้วของวันหมดเดียวกันไม่โผล่ซ้ำ — แต่รอบถัดไปต้องโผล่ใหม่', () => {
  const base = {
    sites: [site('ST1', 'A')], zones: [zone('ZN1', 'ST1')],
    ordersById: live, todayIso: TODAY,
    closedEndDates: new Map([['ST1', ['2026-09-15']]]),
  };
  assert.deepEqual(renewalRows({ ...base, terms: [term('T1', 'ZN1', '2026-09-15')] }), []);
  // ⚠️ ปีหน้าหมดอีกครั้ง = เรื่องใหม่ ไม่ใช่เรื่องเดิมที่ปิดไปแล้ว
  const next = renewalRows({ ...base, terms: [term('T2', 'ZN1', '2026-09-15'), term('T3', 'ZN1', '2026-11-01')] });
  assert.equal(next.length, 1);
  assert.equal(next[0].endDate, '2026-11-01');
});

test('แถวที่มีคนรับเรื่องแล้วพก followup มาด้วย', () => {
  const rows = renewalRows({
    sites: [site('ST1', 'A')], zones: [zone('ZN1', 'ST1')],
    terms: [term('T1', 'ZN1', '2026-09-15')],
    ordersById: live, todayIso: TODAY,
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
    terms: [term('T1', 'Z1', '2026-08-01'), term('T2', 'Z2', '2026-09-10'), term('T3', 'Z3', '2026-11-20')],
    ordersById: live, todayIso: TODAY,
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
