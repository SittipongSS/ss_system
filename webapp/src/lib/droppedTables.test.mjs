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
  dept_request_item_tiers: '0219 — ชั้นจำนวนถูกถอดพร้อมหัวข้อขอราคา (ม-28): '
    + 'ราคาในโมเดลใหม่เป็นราคาเดียวที่ RD ใส่ในใบเดิมตอนลูกค้าคอนเฟิร์ม',
  personal_task_updates: '0184 — เธรดอยู่ที่ entity_updates (entityType=\'personal_task\')',
  sales_deal_activities: '0184 — ฟีดดีลอยู่ที่ entity_updates (entityType=\'deal\')',
  scent_revisions: '0206 — กลิ่น 1 ตัวส่งครั้งเดียว: วันที่ส่งอยู่ที่ scents.sentAt · '
    + 'ลูกค้าให้แก้ = กลิ่น *ตัวใหม่* ที่ชี้กลับด้วย derivedFromScentId ไม่ใช่ Rev. ของตัวเดิม',
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

// ── คอลัมน์ที่ migration DROP ไปแล้ว ──────────────────────────────────────
//
// 🐞 ที่มา: mig 0204 DROP `dept_requests.productTypeId` แต่ `POST /api/sa/requests`
// ยังใส่คีย์นั้นลง insert อยู่ ⇒ **เปิดคำร้องไม่ได้เลยทุกหัวข้อ** เพราะ PostgREST
// ปฏิเสธทั้งก้อนเมื่อ body มีคอลัมน์ที่ไม่มีจริง (PGRST204) ไม่ใช่แค่เมินค่านั้นทิ้ง
// · build ผ่าน · eslint ผ่าน · เทสต์ผ่าน — ชื่อคอลัมน์เป็นแค่คีย์ในอ็อบเจกต์
//
// ⚠️ ตรวจเฉพาะ **ทางเขียน/ทางอ่าน DB** (lib + api) ไม่รวม components — หน้าจอถือ
// ชื่อเดียวกันไว้เป็นชื่อช่องในฟอร์มได้โดยไม่แตะ DB (เช่น RequestForm ที่เก็บ
// productTypeId ไว้รอหัวข้อ "พัฒนาผลิตภัณฑ์" ซึ่งจะเขียนลง *รายแถว* แทน)
const DROPPED_COLUMNS = {
  productTypeId: '0204 — หมวดสินค้าย้ายไปรายแถว (dept_request_items.categoryCode)',
};

const DB_DIRS = ['lib', 'app/api'];

test('ทางที่แตะ DB ต้องไม่อ้างคอลัมน์ที่ถูก DROP ไปแล้ว', () => {
  const offenders = [];
  for (const file of jsFiles(SRC)) {
    const rel = path.relative(SRC, file);
    if (!DB_DIRS.some((d) => rel.startsWith(d + path.sep))) continue;
    if (/\.test\.mjs$/.test(rel)) continue;
    // ตัดคอมเมนต์ทิ้งก่อน — บันทึกว่า "เคยมีคอลัมน์นี้" เป็นสิ่งที่ควรเขียนไว้
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const [column, note] of Object.entries(DROPPED_COLUMNS)) {
      if (new RegExp(`\\b${column}\\b`).test(src)) {
        offenders.push(`${rel} → ${column} (${note})`);
      }
    }
  }
  assert.deepEqual(offenders, [], `ยังอ้างคอลัมน์ที่ถูกลบไปแล้ว:\n  ${offenders.join('\n  ')}`);
});
