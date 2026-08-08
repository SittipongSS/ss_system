// ── โมดัลสร้างดีล (ตัวกลาง): แท็บ + กดใหม่แล้วต้องไม่ได้ดีลซ้ำ ────────────────
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
const src = readFileSync(join(ROOT, 'src/components/salesPlanning/DealCreateModal.js'), 'utf8');
const css = readFileSync(join(ROOT, 'src/components/salesPlanning/DealCreateModal.module.css'), 'utf8');

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

/* มติ 2026-08-08 (โครงสามชั้น — artifact 83d209ac): แถบแท็บ+ปุ่มเพิ่มย้ายจาก
   แถวแรกของฟอร์มไปเป็น **โซน toolbar ของ Modal** — เจตนาเดิมของมติ 2026-08-04
   ยังครบ (แท็บกับปุ่มเพิ่มอยู่ด้วยกัน เหนือฟอร์ม มองออกว่าเพิ่ม "แท็บ")
   และได้เพิ่ม: แถบนี้นิ่ง ไม่เลื่อนหายไปกับฟอร์ม */
test('แท็บกับปุ่มเพิ่มดีลอยู่ด้วยกันบนแถบเครื่องมือของโมดัล', () => {
  const toolbarAt = src.indexOf('const toolbar = (');
  assert.ok(toolbarAt > 0, 'ต้องประกอบแถบเครื่องมือก่อน return');
  const toolbarBlock = src.slice(toolbarAt, src.indexOf('return ('));
  assert.match(toolbarBlock, /onClick=\{addDraft\}/, 'ปุ่มเพิ่มดีลต้องอยู่ในแถบเครื่องมือ');
  assert.match(toolbarBlock, /<Tabs/, 'แท็บอยู่แถบเดียวกับปุ่มเพิ่ม');
  assert.match(src, /toolbar=\{toolbar\}/,
    'ต้องส่งเข้าโซน toolbar ของ Modal — อยู่เหนือฟอร์มและไม่เลื่อนตามเนื้อหา');
  assert.doesNotMatch(src, /styles\.add\b/, 'บล็อกปุ่มเพิ่มอันเดิมใต้ฟอร์มต้องไม่เหลือ');
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

// `lockedProjectId`/`legacy` เป็นธงของฟอร์ม ไม่ใช่คอลัมน์ของดีล — ต้องถูกตัดออก
// ที่จุดเดียวกับ `_key` ก่อนยิง API (legacy เดินทางต่อใน metadata เท่านั้น)
test('ธงฝั่งจอ (_key / lockedProjectId / legacy) ห้ามหลุดไปกับ body ที่ยิง API', () => {
  assert.match(src, /const \{ _key, lockedProjectId, legacy, \.\.\.rest \} = draft/);
  assert.doesNotMatch(src, /JSON\.stringify\(\{[^}]*_key/, '_key ห้ามอยู่ใน body');
});

/* ── หนึ่งโมดัลสำหรับทุกที่ที่เปิดดีลได้ (มติผู้ใช้ 2026-08-05) ─────────────────
   ก่อนหน้านี้หน้ารวมดีลมีโมดัล "เพิ่มดีล" ของตัวเองอีกชุด แล้วเพี้ยนจากฝั่งลีดจริง ๆ
   ตามที่ AGENTS.md เตือน: ฝั่งลีดเป็นแท็บ/ฝั่งรวมดีลเรียงการ์ดยาว · ฝั่งลีดกันสร้างซ้ำ
   ฝั่งรวมดีลไม่กัน · ฝั่งรวมดีลบังคับเลือกประเภทดีล ฝั่งลีดไม่บังคับ */
test('ทุกหน้าที่สร้างดีลใช้โมดัลตัวเดียวกัน — ไม่มีฟอร์มสร้างชุดที่สอง', () => {
  const PAGES = [
    'src/app/sales-planning/deals/page.js',
    'src/app/sales-planning/leads/page.js',
    'src/app/sales-planning/leads/[id]/page.js',
  ];
  for (const rel of PAGES) {
    const page = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(page, /<DealCreateModal/, `${rel} ต้องใช้โมดัลกลาง`);
  }
  // หน้ารวมดีลเหลือ DealFormFields ไว้แค่โมดัล "แก้ไข" — ถ้ามีลูปสร้างหลายใบกลับมา
  // แปลว่ามีฟอร์มสร้างชุดที่สองอีกแล้ว
  const deals = readFileSync(join(ROOT, 'src/app/sales-planning/deals/page.js'), 'utf8');
  assert.doesNotMatch(deals, /createDeals/, 'หน้ารวมดีลต้องไม่มี state ของฟอร์มสร้างเองแล้ว');
});

test('เปิดจากหน้ารวมดีล (ไม่มีลีด) ต้องไม่ผูก metadata.leadId และไม่เด้งหน้า', () => {
  assert.match(src, /lead\s*=\s*null/, 'lead เป็น optional');
  // metadata ประกอบแบบมีเงื่อนไข: leadId เฉพาะตอนมาจากลีด · legacy เฉพาะดีลเก่า
  assert.match(src, /\.\.\.\(lead \? \{ leadId: lead\.id, source: "lead", leadChannel: lead\.channel \} : \{\}\)/,
    'ผูกลีดเฉพาะตอนมาจากลีด');
  assert.match(src, /\.\.\.\(legacy \? \{ legacy: true \} : \{\}\)/,
    'ธงดีลเก่าไปกับ metadata เฉพาะตอนเปิดสวิตช์');
  assert.match(src, /if \(lead\) router\.push\(/, 'เด้งไปหน้าดีลเฉพาะตอนมาจากลีด');
});

test('บังคับกรอกชื่อดีล + ประเภทดีล ก่อนยิง API (เดิมมีเฉพาะฝั่งหน้ารวมดีล)', () => {
  assert.match(src, /if \(!draft\.title\?\.trim\(\)\) throw new Error/);
  assert.match(src, /if \(!draft\.dealType\) \{/);
});

test('FC% ตอนสร้างเป็นโหมดอัตโนมัติ — ไม่ให้กรอกเอง', () => {
  assert.match(src, /probabilityMode="auto"/);
});
