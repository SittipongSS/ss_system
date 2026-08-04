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
  assert.match(src, /drafts\.length > 1 && \(\s*<Tabs/, 'ใบเดียวต้องไม่โผล่แท็บ');
});

test('ใบที่ไม่ได้เลือกถูกซ่อน ไม่ใช่เรียงต่อกันลงมา (ต้นเหตุที่ต้องเลื่อนจอ)', () => {
  assert.match(src, /hidden=\{drafts\.length > 1 && index !== active\}/);
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
