// ── ตัวเลือกรอบวางบิลของงวด (BillingRoundPicker) — logic ล้วน ไม่เรนเดอร์ ──
//
// สิ่งที่ชุดนี้ล็อกไว้: ค่าเริ่มจากแถวไม่ทำวันที่มีอยู่หาย · แตะรอบได้ทั้งสองวันในครั้งเดียว ·
// รอเหตุการณ์ไม่เดาวัน · แก้ทับกำหนดชำระแล้วคืนค่าได้ · ค่าที่ส่ง API ไม่มีวันวางบิลคู่เหตุการณ์ (CHECK 0389)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PICKER_VALUE,
  applyPick,
  pickerDueBeforeBilling,
  pickerMissing,
  pickerPayload,
  pickerValueFromRow,
} from './billingPicker.js';
import { normalizeInstallmentBilling } from './billingRule.js';

/* AR-267 เจอร์นัล แล็บ: วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25 เดือนเดียวกัน (ม็อก จอ B/C) */
const AR267 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
const CREDIT30 = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
const TODAY = '2026-09-25';

/* ── pickerValueFromRow ─────────────────────────────────────────────── */

test('ไม่มีแถว (หน้าสร้าง SO) = ยังไม่เลือก — ไม่มีค่าตั้งต้นให้การตัดสินใจ', () => {
  assert.deepEqual(pickerValueFromRow(null, AR267, TODAY), EMPTY_PICKER_VALUE);
  assert.deepEqual(pickerValueFromRow({}, AR267, TODAY), EMPTY_PICKER_VALUE);
});

test('วันวางบิลตรงหนึ่งใน 3 รอบถัดไป = round · กำหนดชำระตามรอบ = ไม่แก้ทับ', () => {
  const value = pickerValueFromRow({ billingDate: '2026-10-05', dueDate: '2026-10-25' }, AR267, TODAY);
  assert.deepEqual(value, { mode: 'round', billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-10-25', dueOverridden: false });
});

test('วันวางบิลนอกรอบ (รวมรอบที่ผ่านไปแล้ว) = other', () => {
  assert.equal(pickerValueFromRow({ billingDate: '2026-10-13', dueDate: '2026-10-25' }, AR267, TODAY).mode, 'other');
  /* 5 ก.ย. เป็นรอบของลูกค้าก็จริง แต่ผ่านไปแล้ว — ชิปไม่มีให้แตะ จึงต้องขึ้นเป็นวันอื่น */
  assert.equal(pickerValueFromRow({ billingDate: '2026-09-05' }, AR267, TODAY).mode, 'other');
});

test('กำหนดชำระไม่ตรงที่คิดจากรอบ = แก้ทับ · ไม่มีกำหนดชำระ = ไม่ใช่แก้ทับ', () => {
  const over = pickerValueFromRow({ billingDate: '2026-10-05', dueDate: '2026-10-26' }, AR267, TODAY);
  assert.equal(over.dueOverridden, true);
  assert.equal(over.dueDate, '2026-10-26');
  assert.equal(pickerValueFromRow({ billingDate: '2026-10-05', dueDate: null }, AR267, TODAY).dueOverridden, false);
});

test('รอเหตุการณ์ = event · ชื่อถูกตัดช่องว่าง', () => {
  const value = pickerValueFromRow({ billingEvent: '  ก่อนส่งสินค้า ', dueDate: null }, AR267, TODAY);
  assert.deepEqual(value, { mode: 'event', billingDate: '', billingEvent: 'ก่อนส่งสินค้า', dueDate: '', dueOverridden: false });
});

test('แถวเก่าที่มีแต่กำหนดชำระกรอกเอง = ยังไม่เลือก แต่ **คงกำหนดชำระไว้** (เปิดแล้วบันทึกเลยต้องไม่ลบวัน)', () => {
  const value = pickerValueFromRow({ dueDate: '2026-09-05' }, AR267, TODAY);
  assert.equal(value.mode, null);
  assert.equal(value.dueDate, '2026-09-05');
  assert.deepEqual(pickerPayload(value), { billingDate: null, billingEvent: null, dueDate: '2026-09-05' });
});

test('ลูกค้าวางบิลได้ทุกวัน — ไม่มีรอบ วันวางบิลทุกวันเป็น other แล้วคิดกำหนดชำระเครดิต', () => {
  const value = pickerValueFromRow({ billingDate: '2026-10-01', dueDate: '2026-10-31' }, CREDIT30, TODAY);
  assert.equal(value.mode, 'other');
  assert.equal(value.dueOverridden, false);
});

/* ── applyPick ──────────────────────────────────────────────────────── */

test('แตะรอบ = ได้วันวางบิล + กำหนดชำระในครั้งเดียว (ม็อก: จ. 5 ต.ค. → อา. 25 ต.ค.)', () => {
  const value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  assert.deepEqual(value, { mode: 'round', billingDate: '2026-10-05', billingEvent: '', dueDate: '2026-10-25', dueOverridden: false });
});

test('แตะรอบแทนกำหนดชำระเดิมที่กรอกเองก่อนมีรอบ (ม็อก C: 5 ก.ย. ที่ขึ้นเลยกำหนด)', () => {
  const legacy = pickerValueFromRow({ dueDate: '2026-09-05' }, AR267, TODAY);
  assert.equal(applyPick(legacy, { mode: 'round', billingDate: '2026-10-05' }, AR267).dueDate, '2026-10-25');
});

test('แตะชิปรอบใหม่ = ตัดสินใจใหม่ ทิ้งค่าที่แก้ทับ (ม็อก B + C)', () => {
  let value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  value = applyPick(value, { mode: 'overrideDue', dueDate: '2026-10-26' }, AR267);
  assert.equal(value.dueOverridden, true);
  value = applyPick(value, { mode: 'round', billingDate: '2026-11-05' }, AR267);
  assert.equal(value.dueDate, '2026-11-25');
  assert.equal(value.dueOverridden, false);
});

test('วันอื่น… — แตะชิปแล้วช่องว่าง · กรอกวันแล้วคิดกำหนดชำระ · แก้วันต่อคงค่าที่แก้ทับ', () => {
  const from = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  let value = applyPick(from, { mode: 'other', billingDate: '' }, AR267);
  assert.deepEqual(value, { mode: 'other', billingDate: '', billingEvent: '', dueDate: '', dueOverridden: false });
  assert.match(pickerMissing(value), /กรอกวันวางบิล/);
  value = applyPick(value, { mode: 'other', billingDate: '2026-10-13' }, AR267);
  assert.equal(value.dueDate, '2026-10-25');
  assert.equal(pickerMissing(value), '');
  value = applyPick(value, { mode: 'overrideDue', dueDate: '2026-10-30' }, AR267);
  value = applyPick(value, { mode: 'other', billingDate: '2026-10-14' }, AR267);
  assert.equal(value.billingDate, '2026-10-14');
  assert.equal(value.dueDate, '2026-10-30');
  assert.equal(value.dueOverridden, true);
});

test('วันอื่น… ที่ผ่านวันเงินเข้าไปแล้วเลื่อนไปเดือนถัดไป (ตัวคิดของ billingRule)', () => {
  const value = applyPick(EMPTY_PICKER_VALUE, { mode: 'other', billingDate: '2026-10-28' }, AR267);
  assert.equal(value.dueDate, '2026-11-25');
});

test('รอเหตุการณ์ = ล้างทั้งสองวัน ไม่เดา · ชื่อที่พิมพ์ไว้ไม่หายตอนสลับไปรอบแล้วกลับมา', () => {
  let value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  value = applyPick(value, { mode: 'event' }, AR267);
  assert.deepEqual(value, { mode: 'event', billingDate: '', billingEvent: '', dueDate: '', dueOverridden: false });
  assert.match(pickerMissing(value), /เหตุการณ์ที่รอ/);
  value = applyPick(value, { mode: 'event', billingEvent: 'ก่อนส่งสินค้า' }, AR267);
  assert.equal(pickerMissing(value), '');
  value = applyPick(value, { mode: 'round', billingDate: '2026-11-05' }, AR267);
  assert.deepEqual(pickerPayload(value), { billingDate: '2026-11-05', billingEvent: null, dueDate: '2026-11-25' });
  value = applyPick(value, { mode: 'event' }, AR267);
  assert.equal(value.billingEvent, 'ก่อนส่งสินค้า');
});

test('ชื่อเหตุการณ์ยาวเกินถูกตัดที่เพดาน', () => {
  const value = applyPick(EMPTY_PICKER_VALUE, { mode: 'event', billingEvent: 'ก'.repeat(200) }, AR267);
  assert.equal(value.billingEvent.length, 120);
});

test('แก้ทับเป็นวันเดียวกับที่คิดจากรอบ = ไม่นับว่าแก้ทับ · คืนค่าตามรอบได้', () => {
  let value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  assert.equal(applyPick(value, { mode: 'overrideDue', dueDate: '2026-10-25' }, AR267).dueOverridden, false);
  value = applyPick(value, { mode: 'overrideDue', dueDate: '2026-10-26' }, AR267);
  assert.deepEqual([value.dueDate, value.dueOverridden], ['2026-10-26', true]);
  value = applyPick(value, { mode: 'resetDue' }, AR267);
  assert.deepEqual([value.dueDate, value.dueOverridden], ['2026-10-25', false]);
});

test('แก้ทับไม่ได้เมื่อยังไม่มีวันวางบิล (ยังไม่เลือก · รอเหตุการณ์ · วันอื่นที่ยังไม่กรอก)', () => {
  assert.deepEqual(applyPick(EMPTY_PICKER_VALUE, { mode: 'overrideDue', dueDate: '2026-10-26' }, AR267), EMPTY_PICKER_VALUE);
  const event = applyPick(EMPTY_PICKER_VALUE, { mode: 'event', billingEvent: 'หลังติดตั้ง' }, AR267);
  assert.deepEqual(applyPick(event, { mode: 'overrideDue', dueDate: '2026-10-26' }, AR267), event);
});

test('ล้างช่องกำหนดชำระที่แก้ทับ = ว่างแบบแก้ทับ (ไม่เด้งกลับเป็นค่าที่คิดเอง)', () => {
  let value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  value = applyPick(value, { mode: 'overrideDue', dueDate: '' }, AR267);
  assert.deepEqual([value.dueDate, value.dueOverridden], ['', true]);
  assert.equal(pickerPayload(value).dueDate, null);
});

test('ล้างที่เลือก = กลับเป็นยังไม่เลือก (ไม่มีวันในฐาน = ว่างเปล่า)', () => {
  const value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  assert.deepEqual(applyPick(value, { mode: 'clear' }, AR267), EMPTY_PICKER_VALUE);
  assert.deepEqual(applyPick(value, { mode: 'clear', dueDate: '' }, AR267), EMPTY_PICKER_VALUE);
});

test('ล้างที่เลือก **ไม่ลบ** กำหนดชำระที่บันทึกอยู่ — กลับไปรูปเดียวกับตอนเปิดแถว (review S0: ช่องนี้คุมเลยกำหนด + visitGate)', () => {
  const row = { dueDate: '2026-09-05' };
  const opened = pickerValueFromRow(row, AR267, TODAY);
  let value = applyPick(opened, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  assert.equal(value.dueDate, '2026-10-25');
  value = applyPick(value, { mode: 'clear', dueDate: row.dueDate }, AR267);
  assert.deepEqual(value, opened);
  assert.deepEqual(pickerPayload(value), { billingDate: null, billingEvent: null, dueDate: '2026-09-05' });
  /* ค่าเพี้ยนที่ส่งมาเป็นวันเดิม = ถือว่าไม่มี */
  assert.equal(applyPick(value, { mode: 'clear', dueDate: 'x' }, AR267).dueDate, '');
});

test('แถวรอเหตุการณ์ที่มีกำหนดชำระค้าง — พิมพ์/แตะชื่อเหตุการณ์ไม่ลบวัน · สลับเข้ามาจากโหมดอื่นจึงล้าง', () => {
  const opened = pickerValueFromRow({ billingEvent: 'ก่อนผลิต', dueDate: '2026-09-05' }, AR267, TODAY);
  assert.equal(opened.dueDate, '2026-09-05');
  let value = applyPick(opened, { mode: 'event', billingEvent: 'ก่อนผลิตล็อต 2' }, AR267);
  assert.equal(value.dueDate, '2026-09-05');
  value = applyPick(value, { mode: 'event', billingEvent: 'หลังติดตั้ง' }, AR267);
  assert.deepEqual(pickerPayload(value), { billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: '2026-09-05' });
  /* แถวเก่าที่มีแต่กำหนดชำระ → แตะ "รอเหตุการณ์" = ตัดสินใจใหม่ ล้างวัน (จอเตือน "จะถูกล้าง" ผ่าน savedDueDate) */
  const legacy = pickerValueFromRow({ dueDate: '2026-09-05' }, AR267, TODAY);
  assert.equal(applyPick(legacy, { mode: 'event' }, AR267).dueDate, '');
});

test('pick ที่ไม่รู้จัก/ค่าเพี้ยน = คืนค่าเดิมในรูปมาตรฐาน ไม่ throw', () => {
  assert.deepEqual(applyPick(null, null, AR267), EMPTY_PICKER_VALUE);
  assert.deepEqual(applyPick({ mode: 'weird', billingDate: 'x' }, { mode: 'nope' }, AR267), EMPTY_PICKER_VALUE);
  assert.deepEqual(applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: 'x' }, AR267), EMPTY_PICKER_VALUE);
});

test('ลูกค้าเครดิต 30 วัน — วันวางบิลที่กรอกได้กำหนดชำระ +30', () => {
  const value = applyPick(EMPTY_PICKER_VALUE, { mode: 'other', billingDate: '2026-10-01' }, CREDIT30);
  assert.equal(value.dueDate, '2026-10-31');
});

/* ── pickerPayload ──────────────────────────────────────────────────── */

test('ค่าที่ส่ง API ผ่าน normalizeInstallmentBilling ทุกโหมด และไม่มีวันวางบิลคู่เหตุการณ์', () => {
  const values = [
    EMPTY_PICKER_VALUE,
    applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267),
    applyPick(EMPTY_PICKER_VALUE, { mode: 'other', billingDate: '2026-10-13' }, AR267),
    applyPick(EMPTY_PICKER_VALUE, { mode: 'other', billingDate: '' }, AR267),
    applyPick(EMPTY_PICKER_VALUE, { mode: 'event', billingEvent: '  หลังติดตั้ง  ' }, AR267),
    applyPick(EMPTY_PICKER_VALUE, { mode: 'event', billingEvent: '   ' }, AR267),
  ];
  for (const value of values) {
    const payload = pickerPayload(value);
    assert.deepEqual(Object.keys(payload).sort(), ['billingDate', 'billingEvent', 'dueDate']);
    assert.ok(!(payload.billingDate && payload.billingEvent));
    assert.equal(normalizeInstallmentBilling(payload).error, null);
  }
  assert.deepEqual(pickerPayload(values[1]), { billingDate: '2026-10-05', billingEvent: null, dueDate: '2026-10-25' });
  assert.deepEqual(pickerPayload(values[4]), { billingDate: null, billingEvent: 'หลังติดตั้ง', dueDate: null });
  assert.deepEqual(pickerPayload(values[5]), { billingDate: null, billingEvent: null, dueDate: null });
});

test('กำหนดชำระแก้ทับไปก่อนวันวางบิล = เตือน', () => {
  let value = applyPick(EMPTY_PICKER_VALUE, { mode: 'round', billingDate: '2026-10-05' }, AR267);
  assert.equal(pickerDueBeforeBilling(value), false);
  value = applyPick(value, { mode: 'overrideDue', dueDate: '2026-10-01' }, AR267);
  assert.equal(pickerDueBeforeBilling(value), true);
  assert.equal(pickerDueBeforeBilling(EMPTY_PICKER_VALUE), false);
});
