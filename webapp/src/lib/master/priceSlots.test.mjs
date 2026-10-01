// ม-148 · ช่องราคา F · B · FB (มติผู้ใช้ 2026-09-22)
//   *"ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB … ยกเว้น กลิ่น(หัวน้ำหอม)ที่ใส่ได้แค่ F"*
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICE_SLOTS, currentPriceToUse, mainPriceEntry, normalizeSlotPrices, primaryPriceSlot, priceSlotsFor,
} from './priceSlots.js';

const formulaSlots = priceSlotsFor({ scentId: 'SCT-1', formulaId: 'FML-1' });
const scentSlots = priceSlotsFor({ scentId: 'SCT-1' });

test('สูตร = F (ลงกลิ่นของสูตร) + B + FB (ลงสูตร) · กลิ่น = F · สูตรไม่มีกลิ่น = ไม่มี F', () => {
  assert.deepEqual(formulaSlots.map((s) => [s.key, s.kind, s.stampColumn, s.id]), [
    ['F', 'RM_F', 'scentId', 'SCT-1'],
    ['B', 'RM_B', 'formulaId', 'FML-1'],
    ['FB', 'RM_FB', 'formulaId', 'FML-1'],
  ]);
  assert.deepEqual(scentSlots.map((s) => s.key), ['F']);
  assert.deepEqual(priceSlotsFor({ formulaId: 'FML-2' }).map((s) => s.key), ['B', 'FB']);
  assert.deepEqual(priceSlotsFor({}), []);
});

test('ช่องหลัก: สูตร = FB · กลิ่น = F (ทางเข้าเก่าที่ส่ง `price` ตัวเดียว)', () => {
  assert.equal(primaryPriceSlot(formulaSlots).key, 'FB');
  assert.equal(primaryPriceSlot(scentSlots).key, 'F');
  const legacy = normalizeSlotPrices(formulaSlots, { price: 900 });
  assert.equal(legacy.error, null);
  assert.deepEqual(legacy.entries.map((e) => [e.slot.key, e.price]), [['FB', 900]]);
});

test('ใส่หลายช่องพร้อมกัน — เรียง F · B · FB · ช่องว่างข้าม · ช่องหลักของชุด = FB > B > F', () => {
  const { entries, error } = normalizeSlotPrices(formulaSlots, { prices: { FB: '950', F: 2800, B: '' } });
  assert.equal(error, null);
  assert.deepEqual(entries.map((e) => [e.slot.key, e.price]), [['F', 2800], ['FB', 950]]);
  assert.equal(mainPriceEntry(entries).slot.key, 'FB');
  const onlyF = normalizeSlotPrices(formulaSlots, { prices: { F: 2800 } });
  assert.equal(mainPriceEntry(onlyF.entries).slot.key, 'F'); // SDS ใส่แค่ F ได้
  const fAndB = normalizeSlotPrices(formulaSlots, { prices: { F: 1, B: 2 } });
  assert.equal(mainPriceEntry(fAndB.entries).slot.key, 'B');
});

test('⚠️ กลิ่นใส่ B/FB ไม่ได้ — ตีกลับ ไม่ทิ้งเงียบ', () => {
  const { error } = normalizeSlotPrices(scentSlots, { prices: { F: 100, FB: 200 } });
  assert.match(error, /ราคาเบสที่ใส่กลิ่น \(FB\) ใส่ให้รายการนี้ไม่ได้/);
  // ส่งช่องที่ไม่มีมาแบบว่างเปล่า = ไม่ใช่ความผิด (ฟอร์มส่งเฉพาะที่กรอกอยู่แล้ว)
  assert.equal(normalizeSlotPrices(scentSlots, { prices: { F: 100, FB: '' } }).error, null);
});

test('ต้องใส่อย่างน้อยหนึ่งช่อง · ราคาติดลบ/ไม่ใช่ตัวเลขบอกว่าช่องไหนผิด', () => {
  assert.match(normalizeSlotPrices(formulaSlots, { prices: {} }).error, /อย่างน้อย 1 ช่อง/);
  assert.match(normalizeSlotPrices(scentSlots, {}).error, /ต้องระบุราคา/);
  assert.match(normalizeSlotPrices(formulaSlots, { prices: { B: -1 } }).error, /^ราคาเบส \(B\): /);
  assert.match(normalizeSlotPrices([], { price: 1 }).error, /ยังไม่ผูก/);
});

test('ป้ายตามนิยามผู้ใช้: F หัวน้ำหอม · B เบส · FB เบสที่ใส่กลิ่น', () => {
  assert.match(PRICE_SLOTS.F.text, /หัวน้ำหอม/);
  assert.match(PRICE_SLOTS.B.text, /เบส \(B\)/);
  assert.match(PRICE_SLOTS.FB.text, /เบสที่ใส่กลิ่น/);
});

test('⭐ สูตรหมวดหัวน้ำหอม 02-020 (พัฒนาสูตร) = F ช่องเดียว ลงกลิ่น · ไม่มีกลิ่น = ช่องสูตรตามปกติ', () => {
  assert.deepEqual(
    priceSlotsFor({ scentId: 'S1', formulaId: 'F1', categoryCode: '02-020' }).map((s) => `${s.key}:${s.id}`),
    ['F:S1'],
  );
  assert.deepEqual(
    priceSlotsFor({ formulaId: 'F1', categoryCode: '02-020' }).map((s) => s.key),
    ['B', 'FB'],
  );
  assert.deepEqual(
    priceSlotsFor({ scentId: 'S1', formulaId: 'F1', categoryCode: '01-002' }).map((s) => s.key),
    ['F', 'B', 'FB'],
  );
});

// ── ม-153 · "ใช้ราคานี้" บนหน้ารอใส่ราคา (มติผู้ใช้ 2026-10-01) ─────────────────────────────────────────
const priced = (key, state = 'ready', unitPrice = 400) => ({
  key, price: { state, unitPrice, revisionId: `REV-${key}`, revisionNo: 1 },
});

test('ม-153 ใช้ราคานี้: ช่องหลักที่มีราคา (FB > B > F) · ไม่มีราคาสักช่อง = ไม่มีอะไรให้ใช้', () => {
  assert.deepEqual(currentPriceToUse([]), { entry: null, blocker: '' });
  // ช่องที่ผูกวัสดุแต่ยังไม่มีราคา ไม่นับเป็นราคา
  assert.equal(currentPriceToUse([{ key: 'FB', price: { state: 'no_price', unitPrice: null } }]).entry, null);
  assert.equal(currentPriceToUse([{ key: 'F', price: null }]).entry, null);
  assert.equal(currentPriceToUse([priced('F'), priced('FB')]).entry.key, 'FB');
  assert.equal(currentPriceToUse([priced('F'), priced('B')]).entry.key, 'B');
  // SDS (สูตร 02-001 ที่มีแค่ราคา F ของกลิ่น) — ใช้ F ได้
  assert.equal(currentPriceToUse([priced('F'), { key: 'B', price: null }, { key: 'FB', price: null }]).entry.key, 'F');
});

test('🔴 ม-153 ช่องหลักหมดอายุ = บอกเหตุ ไม่ข้ามไปผูกช่องรองที่ยังดี', () => {
  /* FB หมดอายุแต่ F ยังดี — ผูก F แทน = แถวสินค้าปิดด้วยราคาหัวน้ำหอมล้วน และไม่มีใครถูกเตือนให้ต่ออายุ FB */
  const { entry, blocker } = currentPriceToUse([priced('F'), priced('FB', 'expired')]);
  assert.equal(entry.key, 'FB');
  assert.match(blocker, /หมดอายุ/);
  assert.match(currentPriceToUse([priced('FB', 'expired')]).blocker, /ใส่ราคา/);
  /* วัสดุเก็บเข้ากรุ/ร่าง: "ใส่ราคา" จะต่อ rev บนวัสดุตัวเดิม (สถานะไม่เปลี่ยน) ⇒ ห้ามพาไปทางนั้น */
  for (const state of ['archived', 'draft']) {
    const { blocker } = currentPriceToUse([priced('FB', state)]);
    assert.match(blocker, /เปิดใช้วัสดุ/);
    assert.doesNotMatch(blocker, /กด "ใส่ราคา"/);
  }
  assert.equal(currentPriceToUse([priced('FB')]).blocker, '');
});
