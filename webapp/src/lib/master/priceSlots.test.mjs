// ม-148 · ช่องราคา F · B · FB (มติผู้ใช้ 2026-09-22)
//   *"ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB … ยกเว้น กลิ่น(หัวน้ำหอม)ที่ใส่ได้แค่ F"*
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  NO_PRICE_SLOTS_REASON, PRICE_SLOTS, currentPriceToUse, formulaPriceSlots, isFragranceOilFormula, mainPriceEntry,
  normalizeSlotPrices, primaryPriceSlot, priceSlotsBlocker, priceSlotsFor,
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

// ── หัวน้ำหอมที่กลิ่นใช้ไม่ได้ (ผู้ใช้ 2026-10-05 "แก้เลย") ─────────────────────────────────────────────────
//   🐞 เดิม `priceSlotsFor` ล้าง scentId ของกลิ่นที่ใช้ไม่ได้ก่อนดูหมวด ⇒ สูตร 02-020 ตกไปทาง "สูตรไม่มีกลิ่น" ได้ช่อง B/FB
const OIL = { scentId: 'S1', formulaId: 'F1', categoryCode: '02-020' };

test('🔴 สูตรหัวน้ำหอม 02-020 ที่กลิ่นใช้ไม่ได้ = ไม่มีช่องเลย ไม่ใช่ B/FB', () => {
  assert.deepEqual(priceSlotsFor({ ...OIL, scentUsable: false }), []);
  // กลิ่นใช้ได้ยังเป็น F ช่องเดียวตามเดิม · สูตรหมวดอื่นที่กลิ่นใช้ไม่ได้ยังใส่ B/FB ได้ (แค่ไม่มี F)
  assert.deepEqual(priceSlotsFor({ ...OIL, scentUsable: true }).map((s) => `${s.key}:${s.id}`), ['F:S1']);
  assert.deepEqual(priceSlotsFor({ ...OIL, categoryCode: '01-002', scentUsable: false }).map((s) => s.key), ['B', 'FB']);
  // สูตรฐาน 02-020 ที่ไม่มีกลิ่นยังถอยไปช่องสูตรตามมติ ม-148
  assert.deepEqual(priceSlotsFor({ formulaId: 'F1', categoryCode: '02-020', scentUsable: false }).map((s) => s.key), ['B', 'FB']);
});

test('เหตุที่ใส่ไม่ได้: บอกว่าหัวน้ำหอมใส่ได้แค่ F + สถานะกลิ่น + ทางแก้ · มีช่อง = ไม่มีเหตุ', () => {
  const draft = priceSlotsBlocker({ ...OIL, scentUsable: false, scentStatus: 'draft', scentLabel: 'PF859010103' });
  assert.match(draft, /สูตรหัวน้ำหอม \(02-020\) ใส่ได้แค่ราคา F/);
  assert.match(draft, /กลิ่น PF859010103 สถานะ "รอเข้าทะเบียน"/);
  assert.match(draft, /รับกลิ่นเข้าทะเบียนก่อน/);
  assert.match(priceSlotsBlocker({ ...OIL, scentUsable: false, scentStatus: 'archived' }), /"เลิกใช้".*เปิดใช้กลิ่นก่อน/);
  // ไม่รู้สถานะ/ชื่อ — ยังบอกเหตุได้ ไม่ใช่ข้อความ "ยังไม่ผูก"
  assert.match(priceSlotsBlocker({ ...OIL, scentUsable: false }), /^สูตรหัวน้ำหอม .*กลิ่นของสูตรนี้ ยังใส่ราคา F ไม่ได้$/);
  assert.equal(priceSlotsBlocker({ ...OIL }), '');
  assert.equal(priceSlotsBlocker({ ...OIL, categoryCode: '01-002', scentUsable: false }), '');
  assert.equal(priceSlotsBlocker({}), NO_PRICE_SLOTS_REASON);
});

test('formulaPriceSlots: ประกอบอาร์กิวเมนต์จากสูตร + กลิ่นที่เดียว (หน้าทะเบียน · API · แถวคำร้อง)', () => {
  const formula = { id: 'F1', scentId: 'S1', categoryCode: '02-020' };
  const ok = formulaPriceSlots(formula, { status: 'developing', code: 'PF1' });
  assert.deepEqual(ok.slots.map((s) => `${s.key}:${s.id}`), ['F:S1']);
  assert.equal(ok.blocker, '');
  const archived = formulaPriceSlots(formula, { status: 'archived', code: 'PF1', name: 'Rose' });
  assert.deepEqual(archived.slots, []);
  assert.match(archived.blocker, /กลิ่น PF1 สถานะ "เลิกใช้"/);
  // ไม่รู้สถานะกลิ่น (จอยังโหลดไม่เสร็จ) = ถือว่าใช้ได้ — ด่านจริงอยู่ที่ server
  assert.deepEqual(formulaPriceSlots(formula, null).slots.map((s) => s.key), ['F']);
  assert.deepEqual(formulaPriceSlots({ ...formula, categoryCode: '01-002' }, { status: 'draft' }).slots.map((s) => s.key), ['B', 'FB']);
});

test('ตีกลับด้วยเหตุจริงเมื่อไม่มีช่อง — ไม่ใช่ "ยังไม่ผูก" ลอย ๆ', () => {
  const { slots, blocker } = formulaPriceSlots({ id: 'F1', scentId: 'S1', categoryCode: '02-020' }, { status: 'archived' });
  assert.equal(normalizeSlotPrices(slots, { prices: { B: 300 } }, { blocker }).error, blocker);
  assert.equal(normalizeSlotPrices([], { price: 1 }).error, NO_PRICE_SLOTS_REASON);
});

test('isFragranceOilFormula: หมวด 02-020 + มีกลิ่น เท่านั้น (ตัวเดียวกับราคาที่โชว์บนทะเบียนสูตร)', () => {
  assert.equal(isFragranceOilFormula({ scentId: 'S1', categoryCode: '02-020' }), true);
  assert.equal(isFragranceOilFormula({ scentId: null, categoryCode: '02-020' }), false);
  assert.equal(isFragranceOilFormula({ scentId: 'S1', categoryCode: '01-002' }), false);
  assert.equal(isFragranceOilFormula(null), false);
});

test('🔴 ทุกจอที่ส่ง `slots` ให้ RegistryPriceModal ต้องส่ง `blocker` ด้วย', () => {
  // ไม่มีตัวเรนเดอร์ React ในเทสต์ ⇒ ยามรูปโค้ด: จอที่ลืมส่งเหตุ = หัวน้ำหอมที่ใส่ไม่ได้เห็นแค่ "ยังไม่ผูก" ซึ่งผิดเรื่อง
  // (หน้าทะเบียนกลิ่นไม่ส่ง `slots` = โหมดช่องเดียว ไม่เข้าข่าย)
  const files = readdirSync('src', { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => join('src', f));
  let checked = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const [element] of src.matchAll(/<RegistryPriceModal\b[\s\S]*?\n\s*\/>/g)) {
      if (!/\bslots=/.test(element)) continue;
      checked += 1;
      assert.match(element, /\bblocker=/, `${file}: ส่ง slots แต่ไม่ส่ง blocker`);
    }
  }
  assert.ok(checked >= 4, `เจอจอที่ส่ง slots แค่ ${checked} จอ — ตัวสแกนหาโมดัลไม่เจอแล้วหรือเปล่า`);
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
