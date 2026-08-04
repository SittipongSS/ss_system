// ── โมดัลสร้างดีลจากลีด: แท็บ + กดใหม่แล้วต้องไม่ได้ดีลซ้ำ ──────────────────
//
// มติผู้ใช้ 2026-08-04: ฟอร์มดีลมี 12 ช่อง เรียง 2 ใบลงมาตรง ๆ ทำให้เลื่อนจอยาว
// → เปลี่ยนเป็นแท็บ
//
// ⚠️ แท็บ **ซ่อนใบอื่นไว้** ซึ่งทำให้บั๊กที่มีอยู่เดิมมองไม่เห็นยิ่งขึ้น:
// การสร้างเป็นทีละใบและไม่มี rollback — ใบที่ 2 พัง ใบที่ 1 เกิดจริงไปแล้ว
// ของเดิมกดใหม่ = **สร้างใบที่ 1 ซ้ำอีกใบ** โดยไม่มีอะไรเตือน
// เทสต์ชุดนี้ล็อกทั้งสองเรื่องไว้ด้วยกัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = readFileSync(join(ROOT, 'src/components/salesPlanning/LeadDealModal.js'), 'utf8');
const css = readFileSync(join(ROOT, 'src/components/salesPlanning/LeadDealModal.module.css'), 'utf8');

test('ใช้ Tabs กลางของระบบ ไม่ได้เขียน tab bar เอง', () => {
  assert.match(src, /import Tabs from "@\/components\/ui\/Tabs"/);
  assert.match(src, /drafts\.length > 1 \? \(\s*<Tabs/, 'ใบเดียวต้องไม่โผล่แท็บ');
});

test('ใบที่ไม่ได้เลือกถูกซ่อน ไม่ใช่เรียงต่อกันลงมา (ต้นเหตุที่ต้องเลื่อนจอ)', () => {
  assert.match(src, /hidden=\{drafts\.length > 1 && index !== active\}/);
});

/* 🐞 อาการที่ผู้ใช้เจอรอบแรก: กดแท็บแล้วไม่มีอะไรเปลี่ยน ฟอร์มเหมือนทับกัน
   ต้นเหตุ: `.draft` มี `display: flex` ซึ่ง specificity สูงกว่า UA style
   `[hidden] { display: none }` ⇒ attribute `hidden` ไม่มีผลเลย
   ⚠️ กับดักนี้กัดทุกครั้งที่ element มี display ของตัวเองแล้วไปพึ่ง hidden */
test('CSS ต้องกลบ display ของ .draft ตอน hidden ไม่งั้น attribute ไม่มีผล', () => {
  assert.match(css, /\.draft\[hidden\]\s*\{[^}]*display:\s*none/,
    '.draft ประกาศ display เอง ต้องมี .draft[hidden] { display: none } คู่เสมอ');
  // ยืนยันว่าเงื่อนไขยังอยู่จริง — ถ้าวันหนึ่ง .draft เลิกใช้ flex ก็ยังไม่เสียหาย
  assert.match(css, /\.draft\s*\{[^}]*display:\s*flex/);
});

test('แท็บกับปุ่มเพิ่มดีลอยู่แถวเดียวกัน เหนือฟอร์ม', () => {
  const tabRowAt = src.indexOf('className={styles.tabRow}');
  const formAt = src.indexOf('{drafts.map((draft, index) => (');
  assert.ok(tabRowAt > 0 && tabRowAt < formAt, 'แถบหัวต้องมาก่อนฟอร์ม');
  // ปุ่มเพิ่มต้องอยู่ในแถบหัว ไม่ใช่ลอยอยู่ใต้ฟอร์มเหมือนเดิม
  const rowBlock = src.slice(tabRowAt, formAt);
  assert.match(rowBlock, /onClick=\{addDraft\}/, 'ปุ่มเพิ่มดีลต้องอยู่ในแถบหัว');
  assert.doesNotMatch(src, /styles\.add\b/, 'บล็อกปุ่มเพิ่มอันเดิมใต้ฟอร์มต้องไม่เหลือ');
  assert.match(css, /\.tabRow\s*\{/);
});

/* updater ของ setState ต้องบริสุทธิ์ — React เรียกซ้ำได้ (StrictMode/concurrent)
   เรียก setActive ข้างในจึงเป็นบั๊กที่จะโผล่แบบสุ่ม */
test('addDraft ไม่ทำ side effect ใน updater ของ setDrafts', () => {
  const block = src.slice(src.indexOf('const addDraft ='), src.indexOf('const remaining ='));
  assert.doesNotMatch(block, /setDrafts\(\(prev\) => \{[\s\S]*setActive/,
    'ห้ามเรียก setActive ข้างใน updater');
  assert.match(block, /setActive\(drafts\.length\)/, 'ใบใหม่ต่อท้าย → index = จำนวนใบตอนนี้');
});

// ⭐ หัวใจของ PR: กดสร้างใหม่หลังพังกลางทาง ต้องไม่ได้ดีลซ้ำ
test('กด "สร้าง" ใหม่ ต้องข้ามใบที่สร้างสำเร็จไปแล้ว', () => {
  assert.match(src, /if \(!state\.dealId\) \{/, 'ต้องเช็คก่อนว่าใบนี้เกิดไปแล้วหรือยัง');
  assert.match(src, /state\.dealId = data\.id;[\s\S]{0,200}?setDone\(/,
    'ต้องบันทึกว่าเกิดแล้วทันทีที่ดีลถูกสร้าง');
});

test('ดีลเกิดแล้วแต่ผูกโครงการพลาด — รอบถัดไปผูกอย่างเดียว ไม่สร้างดีลใหม่', () => {
  // บันทึก dealId ก่อนเรียก link-project เสมอ ไม่งั้น retry จะสร้างดีลซ้ำ
  const createAt = src.indexOf('state.dealId = data.id');
  const linkAt = src.indexOf('/link-project');
  assert.ok(createAt > 0 && linkAt > createAt, 'ต้องบันทึก dealId ก่อนลองผูกโครงการ');
  assert.match(src, /if \(draft\.projectId && !state\.linked\)/);
});

test('ปุ่มนับเฉพาะใบที่ยังไม่ได้สร้าง ไม่ใช่จำนวนใบทั้งหมด', () => {
  assert.match(src, /const remaining = drafts\.filter\(\(draft\) => !done\[draft\._key\]\?\.dealId\)\.length/);
  assert.match(src, /`สร้าง \$\{remaining\} ดีล`/);
  assert.match(src, /disabled=\{busy \|\| !remaining\}/, 'สร้างครบแล้วต้องกดซ้ำไม่ได้');
});

test('พังที่ใบไหน ต้องพาไปแท็บนั้น + ติดป้ายให้เห็น', () => {
  assert.match(src, /setActive\(index\); setFailedKey\(current\._key\)/);
  assert.match(src, /failedKey === draft\._key \? <CircleAlert/);
});

test('ป้ายแท็บบอกใบที่สร้างแล้วด้วย — แท็บซ่อนใบอื่นไว้ ต้องรู้โดยไม่ต้องกดดู', () => {
  assert.match(src, /state\?\.dealId \? <Check/);
  assert.match(css, /\.tabLabel\s*\{/);
});

// ลบใบกลางทางแล้ว index เลื่อน — ถ้า `done` ผูกกับ index สถานะจะไปเกาะผิดใบ
test('สถานะรายใบผูกกับ _key ไม่ใช่ index', () => {
  assert.match(src, /_key: 1/, 'ใบแรกต้องมี _key');
  assert.match(src, /done\[draft\._key\]/);
  assert.doesNotMatch(src, /done\[index\]/, 'ห้ามผูกสถานะกับ index');
});

test('_key เป็นของฝั่งจอ ห้ามหลุดไปกับ body ที่ยิง API', () => {
  assert.match(src, /const \{ _key, \.\.\.payload \} = draft/);
  assert.match(src, /JSON\.stringify\(\{\s*\.\.\.payload,/);
});
