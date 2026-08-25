// ── เครื่องมือตรวจ Drive ต้องอ่านตารางให้ครบ ไม่ใช่ 1000 แถวแรก ─────────────
//
// 🐞 ของจริงบน prod 2026-08-25: หน้าตั้งค่า → ที่เก็บไฟล์ รายงานว่ามีไฟล์กำพร้าบน
// Drive **120 ไฟล์** · สุ่มเช็คกับฐานข้อมูลแล้วพบว่าไฟล์ของคำร้องและเรื่องแจ้งปัญหา
// **ถูกอ้างอยู่จริงใน `entity_updates.attachments[]`** — ตัวรวบผู้อ้างอิงอ่าน
// `entity_updates` ด้วย `.select()` เปล่า ๆ ซึ่ง PostgREST ตัดที่ 1000 แถว (ตารางนี้
// มี 4,486 แถว) ⇒ แถวที่ถือไฟล์ส่วนใหญ่อยู่นอกพันแถวแรก ⇒ ไฟล์ที่มีคนอ้างถูกนับ
// เป็นกำพร้า
//
// ⚠️ **นี่ไม่ใช่แค่ตัวเลขผิด** — หน้าเดียวกันมีปุ่ม "ทิ้งไฟล์กำพร้า" และ
// "ล้างแถวกำพร้า" ซึ่งคำนวณจากฟังก์ชันชุดเดียวกัน ⇒ กดแล้วลบของที่ยังใช้อยู่จริง
// `loadOrphanAttachmentRows` ก็เข้าข่ายเดียวกัน: `personal_tasks` มี 1,000+ แถว
// ⇒ ชุด "แม่ที่ยังอยู่" ถูกตัด แล้วแถวไฟล์แนบที่ยังดีถูกตัดสินว่ากำพร้า
//
// กติกา: ทุก query ที่อาจคืนหลายแถวในโมดูลนี้ต้องผ่าน `fetchAll()` พร้อม `.order()`
// ที่นิ่ง (ดู lib/supabaseFetchAll.js) · ข้อยกเว้นคือ query ที่คืนแถวเดียว
// (`maybeSingle`) และคำสั่งลบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./driveMaintenance.js', import.meta.url)), 'utf8');

test('อ่านผ่าน fetchAll — ไม่มี .select() ลอย ๆ ที่โดนเพดาน 1000 แถว', () => {
  const bare = [];
  for (let i = source.indexOf('.select('); i !== -1; i = source.indexOf('.select(', i + 1)) {
    const before = source.slice(Math.max(0, i - 160), i);
    const after = source.slice(i, i + 240);
    // อยู่ในคำสั่งลบ (`.delete().in(...).select('id')`) = ไม่ใช่การอ่านหลายแถว
    if (/\.delete\(\)/.test(before)) continue;
    // คืนแถวเดียวอยู่แล้ว
    if (/\.maybeSingle\(\)|\.single\(\)/.test(after)) continue;
    if (/fetchAll\(\s*\(\)\s*=>/.test(before)) continue;
    bare.push(source.slice(Math.max(0, i - 90), i + 60).split('\n').pop().trim());
  }
  assert.deepEqual(
    bare,
    [],
    'query ที่ยังอ่านไม่ครบ (เพดาน 1000 แถวของ PostgREST):\n  ' + bare.join('\n  ')
    + '\nห่อด้วย fetchAll(() => …) พร้อม .order() ที่นิ่ง',
  );
});

test('ต้อง import fetchAll จริง ไม่ใช่เขียนลูปเองในไฟล์', () => {
  assert.match(source, /import \{ fetchAll \} from '@\/lib\/supabaseFetchAll'/);
});

/* `.in()` ที่รายการยาวมีสองปัญหาพร้อมกัน: URL ของ PostgREST ยาวเกินจนถูกปฏิเสธ
   และผลลัพธ์เองก็โดนเพดานแถว — ตัวที่เจ็บคือชุด "แม่ที่ยังอยู่" ของ
   loadOrphanAttachmentRows ซึ่งเป็นตัวตัดสินว่าแถวไหนจะถูกลบ */
test('รายการ id ยาว ๆ ต้องหั่นเป็นชุดก่อนยิง .in()', () => {
  assert.match(
    source,
    /for \(let i = 0; i < ids\.length; i \+= \d+\)/,
    'loadOrphanAttachmentRows ต้องไล่ ids ทีละชุด ไม่ใช่ยัดทั้งก้อนใส่ .in()',
  );
});
