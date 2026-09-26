// ── แป้นพิมพ์บนจอขึ้นอยู่ไหม (แผน §10.5 · §3.5) ────────────────────────────────
//
// ⭐ ตัวเลขทุกเคสมาจากเครื่องจริงที่ช่างถือ — iPhone 390×844 · iPad ต่อแป้นจริง · Android ที่หดทั้งหน้า
//   ⇒ เคสที่แถบต้อง **อยู่** สำคัญเท่ากับเคสที่แถบต้องหลบ (แถบที่หายเองคือปุ่มส่งงานที่หาไม่เจอ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { OSK_MIN_PX, isTextEntry, keyboardLikelyUp } from './onScreenKeyboard.js';

const input = (type = 'text', extra = {}) => ({ tagName: 'INPUT', type, ...extra });

test('iPhone 844 → เห็น 510 ขณะพิมพ์ = แป้นขึ้น', () => {
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 844, visualHeight: 510 }), true);
});

test('iPad ต่อแป้นจริง 1024 → 960 (แถบคำแนะนำของแป้น) = แป้นไม่ขึ้น แถบอยู่', () => {
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 1024, visualHeight: 960 }), false);
});

test('🔴 Android หดทั้งหน้าไปพร้อมแป้น (หน้า = ส่วนที่เห็น = 520) — จำความสูงก่อนแป้นไว้ (780) ถึงจับได้', () => {
  assert.equal(keyboardLikelyUp({
    editableFocused: true, layoutHeight: 520, visualHeight: 520, baselineHeight: 780,
  }), true);
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 520, visualHeight: 520 }), false,
    'ไม่มีความสูงเดิมให้เทียบ = มองไม่เห็นแป้น (ข้อนี้คือเหตุที่ต้องจำ baseline)');
});

test('ซูมสองนิ้ว (เห็น 422 ที่สเกล 2) ไม่ใช่แป้น — คูณสเกลกลับก่อนเทียบ', () => {
  assert.equal(keyboardLikelyUp({
    editableFocused: true, layoutHeight: 844, visualHeight: 422, visualScale: 2,
  }), false);
});

test('ไม่ได้โฟกัสช่องพิมพ์ = แป้นไม่ขึ้น แม้ส่วนที่เห็นจะเตี้ย', () => {
  assert.equal(keyboardLikelyUp({ editableFocused: false, layoutHeight: 844, visualHeight: 510 }), false);
});

test('เบราว์เซอร์ไม่มี visualViewport = ไม่รู้ ⇒ แถบอยู่', () => {
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 844, visualHeight: null }), false);
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 844 }), false);
  assert.equal(keyboardLikelyUp(), false, 'เรียกเปล่าต้องไม่ระเบิด');
});

test(`เส้นแบ่งอยู่ที่ ${OSK_MIN_PX}px — แถบเครื่องมือ Safari ยุบ/กางไม่นับเป็นแป้น`, () => {
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 844, visualHeight: 844 - OSK_MIN_PX }), false);
  assert.equal(keyboardLikelyUp({ editableFocused: true, layoutHeight: 844, visualHeight: 844 - OSK_MIN_PX - 1 }), true);
});

test('ช่องที่เรียกแป้น: ช่องข้อความ/ตัวเลข/ค้นหา · textarea · contenteditable', () => {
  assert.equal(isTextEntry(input()), true);
  assert.equal(isTextEntry(input('text', { inputMode: 'decimal' })), true);
  assert.equal(isTextEntry(input('search')), true);
  assert.equal(isTextEntry(input('number')), true);
  assert.equal(isTextEntry({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextEntry({ tagName: 'DIV', getAttribute: (n) => (n === 'contenteditable' ? 'true' : null) }), true);
});

test('ช่องที่ไม่เรียกแป้น: ติ๊ก · ไฟล์ · ปุ่ม · select · ช่องอ่านอย่างเดียว/ปิดอยู่ · ของที่ไม่ใช่ element', () => {
  assert.equal(isTextEntry(input('checkbox')), false);
  assert.equal(isTextEntry(input('file')), false);
  assert.equal(isTextEntry(input('radio')), false);
  assert.equal(isTextEntry(input('submit')), false);
  assert.equal(isTextEntry(input('range')), false);
  assert.equal(isTextEntry({ tagName: 'SELECT' }), false);
  assert.equal(isTextEntry({ tagName: 'BUTTON' }), false);
  assert.equal(isTextEntry(input('text', { readOnly: true })), false);
  assert.equal(isTextEntry({ tagName: 'TEXTAREA', disabled: true }), false);
  assert.equal(isTextEntry(null), false);
  assert.equal(isTextEntry(undefined), false);
  assert.equal(isTextEntry({ tagName: 'DIV', getAttribute: () => 'false' }), false);
});

/* ══ ตัวต่อสาย `useOnScreenKeyboard` (ชุด S6) — จำความสูงก่อนแป้นรายแนวจอ · เลื่อนช่องขึ้นครั้งเดียว ══ */
import { OSK_START, oskOrientationKey, oskStep } from './onScreenKeyboard.js';
import { readFileSync } from 'node:fs';

const reading = (over = {}) => ({
  editableFocused: false, orientation: 'portrait', layoutHeight: 780, visualHeight: 780, visualScale: 1, ...over,
});

test('แนวจอ: ถามเครื่องก่อน (ไม่เปลี่ยนตามแป้น) · ไม่มีค่อยเทียบกว้าง/สูง', () => {
  assert.equal(oskOrientationKey({ orientationType: 'portrait-primary', width: 900, height: 400 }), 'portrait',
    '🔴 แท็บเล็ต Android แนวตั้งที่หดทั้งหน้า: หน้าเหลือ 768×624 ดูเหมือนแนวนอน — ต้องเชื่อเครื่อง');
  assert.equal(oskOrientationKey({ orientationType: 'landscape-secondary', width: 400, height: 900 }), 'landscape');
  assert.equal(oskOrientationKey({ width: 1024, height: 768 }), 'landscape');
  assert.equal(oskOrientationKey({ width: 390, height: 844 }), 'portrait');
  assert.equal(oskOrientationKey(), 'portrait', 'เรียกเปล่าต้องไม่ระเบิด');
});

test('🔴 Android หดทั้งหน้า: จำความสูงตอนไม่ได้พิมพ์ แล้วใช้เทียบตอนแป้นขึ้น', () => {
  let { state, rose } = oskStep(OSK_START, reading());
  assert.equal(state.up, false);
  assert.equal(rose, false);
  assert.equal(state.baselines.portrait, 780);
  ({ state, rose } = oskStep(state, reading({ editableFocused: true, layoutHeight: 520, visualHeight: 520 })));
  assert.equal(state.up, true);
  assert.equal(rose, true, 'จังหวะแป้นเพิ่งขึ้น = เลื่อนช่องที่พิมพ์ให้พ้นขอบ');
  assert.equal(state.baselines.portrait, 780, 'ระหว่างพิมพ์ห้ามจำความสูงใหม่ (หน้าที่หดแล้วจะกลายเป็นฐาน)');
  ({ state, rose } = oskStep(state, reading({ editableFocused: true, layoutHeight: 520, visualHeight: 520 })));
  assert.equal(rose, false, 'เลื่อนครั้งเดียวต่อการขึ้นหนึ่งครั้ง — ไม่งั้นหน้ากระตุกทุก scroll ของ visualViewport');
  ({ state } = oskStep(state, reading()));
  assert.equal(state.up, false);
});

test('ฐานแยกตามแนวจอ — หมุนเครื่องแล้วไม่เอาความสูงแนวตั้งมาเทียบแนวนอน', () => {
  let { state } = oskStep(OSK_START, reading({ layoutHeight: 844, visualHeight: 844 }));
  ({ state } = oskStep(state, reading({ orientation: 'landscape', layoutHeight: 390, visualHeight: 390 })));
  assert.deepEqual(state.baselines, { portrait: 844, landscape: 390 });
  const { state: typing } = oskStep(state, reading({
    orientation: 'landscape', editableFocused: true, layoutHeight: 390, visualHeight: 330,
  }));
  assert.equal(typing.up, false, 'แนวนอนเตี้ยลง 60px (แถบคำแนะนำ) ไม่ใช่แป้น — ถ้าเทียบกับ 844 จะเดาผิด');
});

test('ไม่มี visualViewport = แถบอยู่เสมอ แม้โฟกัสช่องพิมพ์', () => {
  const { state } = oskStep(OSK_START, reading({ editableFocused: true, visualHeight: null }));
  assert.equal(state.up, false);
});

test('ตัวต่อสาย: ติดธงที่ <html> · ถอดตอนเลิกใช้ · ฟังโฟกัสและ visualViewport · ไม่มีตรรกะของตัวเอง', () => {
  const hook = readFileSync(new URL('./useOnScreenKeyboard.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(hook, /oskStep\(/);
  assert.match(hook, /root\.dataset\.osk = "up"/);
  assert.match(hook, /delete root\.dataset\.osk/);
  for (const event of ['"focusin"', '"focusout"', '"resize"', '"scroll"']) {
    assert.match(hook, new RegExp(event), `ต้องฟัง ${event}`);
  }
  assert.match(hook, /requestAnimationFrame\(/, 'โฟกัสย้ายช่อง = focusout แล้ว focusin — ตรวจเฟรมถัดไป ไม่งั้นแถบกะพริบ');
  assert.match(hook, /scrollIntoView(\?\.)?\(\{ block: "nearest" \}\)/);
  assert.doesNotMatch(hook, /keyboardLikelyUp\(|OSK_MIN_PX/, 'เส้นตัดสินอยู่ที่ onScreenKeyboard.js ที่เดียว');
});
