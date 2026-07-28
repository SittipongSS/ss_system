// ── ห้ามอ่านตารางที่ migration ลบทิ้งไปแล้ว ──────────────────────────────
//
// ⭐ ที่มา: mig 0174 DROP `inquiries` + `inquiry_messages` แต่มีสองจุดที่ยัง query
// ตารางเก่าอยู่ และ **ไม่มีอะไรจับได้เลย** — build ผ่าน, เทสต์ผ่าน, eslint ผ่าน
// เพราะชื่อตารางเป็นสตริง · แถมทั้งสองจุดใช้ `const { data } = await supabase…`
// ซึ่งทิ้ง error ไป ผลคือ "การ์ดคำร้องบนหน้าโครงการว่างเปล่า" กับ "สร้างงานจาก
// ข้อความไม่ได้" เงียบ ๆ หลาย commit กว่าจะเจอ
//
// **มี migration ที่ DROP TABLE เมื่อไร ให้เติมชื่อตารางลงลิสต์นี้ทันที** —
// เทสต์นี้คือสิ่งเดียวที่จับได้ว่ามีคนหลงเหลืออยู่
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ตาราง → migration ที่ลบทิ้ง + ที่อยู่ใหม่ของข้อมูล (ใส่ในข้อความ error ให้คนแก้ทันที)
const DROPPED = {
  inquiries: '0174 — คำร้องอยู่ที่ dept_requests แล้ว',
  inquiry_messages: '0174 — เธรดอยู่ที่ entity_updates (entityType=\'dept_request\')',
  material_price_asks: '0173 — เปลี่ยนชื่อเป็น dept_requests',
  material_price_ask_items: '0173 — เปลี่ยนชื่อเป็น dept_request_items',
  material_price_ask_tiers: '0173 — เปลี่ยนชื่อเป็น dept_request_item_tiers',
};

const SRC = fileURLToPath(new URL('../', import.meta.url));

function jsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { jsFiles(full, out); continue; }
    if (/\.(js|mjs)$/.test(entry) && full !== fileURLToPath(import.meta.url)) out.push(full);
  }
  return out;
}

test('ไม่มีโค้ดไหนยัง query ตารางที่ถูก DROP ไปแล้ว', () => {
  const offenders = [];
  for (const file of jsFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const [table, note] of Object.entries(DROPPED)) {
      // จับเฉพาะรูปแบบที่ยิง PostgREST จริง — ชื่อตารางในคอมเมนต์/ข้อความไม่นับ
      const hit = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]`).test(src)
        || new RegExp(`\\bfrom\\s+public\\.${table}\\b`).test(src);
      if (hit) offenders.push(`${path.relative(SRC, file)} → ${table} (${note})`);
    }
  }
  assert.deepEqual(offenders, [], `ยังอ่านตารางที่ถูกลบไปแล้ว:\n  ${offenders.join('\n  ')}`);
});
