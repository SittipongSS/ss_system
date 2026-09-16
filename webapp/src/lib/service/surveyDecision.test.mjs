// ── การเคาะแบบกดบันทึกเอง — ตัวตัดสินล้วน (PR5) ──────────────────────────
//
// ⭐ ครอบสิ่งที่พังได้จริงตอนเลิกบันทึกทุกคลิก: ร่างที่กลับมาเท่าเดิม · เคาะต่างจากสูตร
//   โดยไม่ใส่เหตุผล · จุดที่หายไประหว่างเปิดจอค้าง · พื้นที่ที่ถูกตัด · payload ที่
//   ส่งเกินจนทับของคนอื่น
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  surveyDecisionBase, surveyDecisionDirty, surveyDecisionDraft, surveyDecisionError,
  surveyDecisionPayload, surveyPendingDecisions, surveySuggestedFor,
} from './surveyDecision.js';

const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
/** 4×5×3 = 60 ลบ.ม. ⇒ สูตรบอก 1 แพ็คเกจ */
const zone = (extra = {}) => ({
  id: 'z1', zoneName: 'Studio 01', status: 'measured',
  parts: [part(4, 5, 3)],
  spots: [{ id: 's1', label: 'มุมซ้าย', selected: false }, { id: 's2', label: 'มุมขวา', selected: true }],
  packageQty: null, packageNote: null,
  ...extra,
});

test('สูตรของพื้นที่ตั้งต้นคือ 1 แพ็คเกจ — ทุกเคสข้างล่างอิงตัวเลขนี้', () => {
  assert.equal(surveySuggestedFor(zone()), 1);
});

test('ค่าตั้งต้นของร่างคือสิ่งที่อยู่ในฐาน — จุดที่เลือกมาเรียงแล้ว', () => {
  assert.deepEqual(surveyDecisionBase(zone()), { packageQty: null, packageNote: '', spotIds: ['s2'] });
  assert.deepEqual(surveyDecisionBase(zone({ packageQty: 2, packageNote: ' ห้องสูง ' })).packageNote, 'ห้องสูง');
});

test('ยังไม่เคาะ = packageQty เป็น null ไม่ใช่ 0 และไม่ใช่สูตร', () => {
  assert.equal(surveyDecisionBase(zone({ packageQty: 0 })).packageQty, null);
  assert.equal(surveyDecisionDraft(zone(), { packageQty: '' }).packageQty, null);
});

test('ร่างที่ไม่ได้แตะ = ไม่ dirty', () => {
  assert.equal(surveyDecisionDirty(zone(), null), false);
  assert.equal(surveyDecisionDirty(zone({ packageQty: 1 }), { packageQty: 1 }), false);
});

test('⭐ ติ๊กออกแล้วติ๊กกลับ = ไม่ dirty — ลำดับที่คนติ๊กไม่ใช่ข้อมูล', () => {
  const z = zone({ spots: [{ id: 's1', selected: true }, { id: 's2', selected: true }] });
  assert.equal(surveyDecisionDirty(z, { spotIds: ['s2', 's1'] }), false);
  assert.equal(surveyDecisionDirty(z, { spotIds: ['s1'] }), true);
});

test('พิมพ์เหตุผลแล้วลบกลับเป็นค่าว่าง = ไม่ dirty (ช่องว่างล้วนไม่นับ)', () => {
  assert.equal(surveyDecisionDirty(zone(), { packageNote: '   ' }), false);
  assert.equal(surveyDecisionDirty(zone(), { packageNote: 'สูงกว่าปกติ' }), true);
});

test('พื้นที่ที่ถูกตัดออกไม่มีวัน dirty — แก้อะไรไม่ได้อยู่แล้ว', () => {
  assert.equal(surveyDecisionDirty(zone({ status: 'cut' }), { packageQty: 9 }), false);
});

// ── ด่านก่อนบันทึก — ต้องตรงกับ route PUT เป๊ะ ────────────────────────────
test('🔴 เคาะต่างจากสูตรโดยไม่บอกเหตุผล = บันทึกไม่ได้', () => {
  assert.equal(surveyDecisionError(zone(), { packageQty: 3 }),
    'แพ็คเกจต่างจากที่สูตรบอก — ต้องบอกเหตุผลด้วย');
  assert.equal(surveyDecisionError(zone(), { packageQty: 3, packageNote: 'เพดานสูง 6 ม.' }), null);
});

test('เคาะตรงกับสูตรไม่ต้องมีเหตุผล', () => {
  assert.equal(surveyDecisionError(zone(), { packageQty: 1 }), null);
});

test('🔑 ด่านอ่านจากค่าหลังรวมร่างกับแถว — ลบเหตุผลทิ้งบนแถวที่เคาะต่างจากสูตรไว้แล้ว = ติด', () => {
  const z = zone({ packageQty: 3, packageNote: 'เพดานสูง' });
  assert.equal(surveyDecisionError(z, { packageNote: '' }),
    'แพ็คเกจต่างจากที่สูตรบอก — ต้องบอกเหตุผลด้วย');
});

test('ตัวเลขนอกช่วงที่ server รับ ถูกจับที่จอก่อน', () => {
  assert.match(surveyDecisionError(zone(), { packageQty: 120, packageNote: 'x' }), /พิมพ์ผิดหลัก/);
  assert.match(surveyDecisionError(zone(), { packageQty: 1, packageNote: 'x'.repeat(501) }), /ยาวเกิน 500/);
});

test('🔴 จุดที่เลือกหายไปจากรายการของช่างระหว่างเปิดจอค้าง = บันทึกไม่ได้ ไม่ใช่ 400 ที่ server', () => {
  assert.match(surveyDecisionError(zone(), { spotIds: ['s9'] }), /ไม่อยู่ในรายการที่ช่างแจ้งมา/);
});

// ── payload ────────────────────────────────────────────────────────────
test('ไม่มีอะไรเปลี่ยน = ไม่มี payload', () => {
  assert.equal(surveyDecisionPayload(zone(), null), null);
});

test('⭐ ส่งเฉพาะช่องที่เปลี่ยน — ไม่ทับช่องที่เราไม่ได้แตะ', () => {
  assert.deepEqual(surveyDecisionPayload(zone({ packageQty: 1 }), { spotIds: ['s1', 's2'] }),
    { selectedSpotIds: ['s1', 's2'] });
});

test('เปลี่ยนจำนวนแพ็คเกจ = เหตุผลไปด้วยเสมอ (ด่านของ server อ่านสองช่องคู่กัน)', () => {
  assert.deepEqual(surveyDecisionPayload(zone(), { packageQty: 3, packageNote: 'เพดานสูง' }),
    { packageQty: 3, packageNote: 'เพดานสูง' });
  assert.deepEqual(surveyDecisionPayload(zone({ packageNote: 'เดิม' }), { packageQty: 1 }),
    { packageQty: 1, packageNote: 'เดิม' });
});

test('ล้างจำนวนแพ็คเกจส่ง null ไปให้ server ไม่ใช่ข้ามช่องนั้น', () => {
  assert.deepEqual(surveyDecisionPayload(zone({ packageQty: 2, packageNote: 'x' }), { packageQty: null }),
    { packageQty: null, packageNote: 'x' });
});

// ── สรุปทั้งใบ ──────────────────────────────────────────────────────────
test('สรุปการเคาะที่ค้าง — นับเฉพาะแถวที่ต่างจากฐาน', () => {
  const zones = [zone({ id: 'a' }), zone({ id: 'b' }), zone({ id: 'c', status: 'cut' })];
  const out = surveyPendingDecisions(zones, { a: { packageQty: 1 }, c: { packageQty: 9 } });
  assert.deepEqual(out.ids, ['a']);
  assert.equal(out.count, 1);
  assert.equal(out.canSave, true);
});

test('🔴 มีแถวไหนติดด่าน = กดบันทึกไม่ได้ทั้งชุด — บันทึกครึ่งใบอธิบายยากกว่าเดิม', () => {
  const zones = [zone({ id: 'a' }), zone({ id: 'b' })];
  const out = surveyPendingDecisions(zones, { a: { packageQty: 1 }, b: { packageQty: 5 } });
  assert.deepEqual(out.ids, ['a', 'b']);
  assert.equal(out.canSave, false);
  assert.equal(out.blocked.length, 1);
  assert.equal(out.blocked[0].id, 'b');
  assert.match(out.blocked[0].error, /ต้องบอกเหตุผล/);
});

test('ไม่มีของค้าง = กดบันทึกไม่ได้ (ปุ่มไม่มีอะไรให้ทำ)', () => {
  assert.equal(surveyPendingDecisions([zone()], {}).canSave, false);
});
