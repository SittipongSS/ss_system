#!/usr/bin/env node
/* ── ทะเบียน "ใครอ้างถึงลูกค้า" ต้องครบเท่าฐานจริง ────────────────────────────
 *
 * 🐞 ด่านก่อนลบลูกค้าเคยตรวจแค่ 4 ตาราง ทั้งที่บนฐานจริงมี 25 ตารางถือ `customerId`
 * และ FK หลายตัวเป็น `ON DELETE SET NULL` ⇒ ลบผ่านแล้วเอกสารเสียสายเชื่อมเงียบ ๆ
 *
 * ลิสต์ที่เขียนมือจะตกหล่นทุกครั้งที่เพิ่มตารางใหม่ (เกิดมาแล้ว: `products` เพิ่งถูกเพิ่ม
 * เข้าด่านเมื่อ 2026-08-13 หลังพบว่าสินค้ากลายเป็นกำพร้า) ⇒ ให้ฐานเป็นคนบอกว่าครบไหม
 *
 * ⚠️ ต้องมี env ถึงจะทำงาน — ไม่มีแล้ว **ข้ามเงียบ** เหมือน check:columns
 * ถ้า CI ไม่ได้ตั้ง env ไว้ ด่านนี้เท่ากับไม่มี (เจตนา: ไม่บล็อกเครื่อง dev ที่ยังไม่ตั้งค่า)
 *
 * รัน: npm run check:refs
 */
import { readFileSync } from 'node:fs';
import { CUSTOMER_REFERENCE_TABLE_NAMES, CUSTOMER_REFERENCE_IGNORED } from '../src/lib/master/customerReferences.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('ข้าม: ไม่มี SUPABASE_URL / SERVICE_ROLE_KEY (ดู .env.example)');
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`อ่านสคีมาจากฐานไม่สำเร็จ: HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();

// ตารางที่ถือคอลัมน์ `customerId` บนฐานจริง
const live = Object.entries(spec.definitions || {})
  .filter(([, def]) => def?.properties?.customerId)
  .map(([name]) => name)
  .sort();

const declared = new Set([...CUSTOMER_REFERENCE_TABLE_NAMES, ...Object.keys(CUSTOMER_REFERENCE_IGNORED)]);
const missing = live.filter((t) => !declared.has(t));
const stale = CUSTOMER_REFERENCE_TABLE_NAMES.filter((t) => !live.includes(t));

if (missing.length) {
  console.error(`\n❌ มี ${missing.length} ตารางที่อ้างถึงลูกค้าแต่ไม่อยู่ในทะเบียน — ลบลูกค้าแล้วแถวพวกนี้จะเสียสายเชื่อมเงียบ ๆ\n`);
  for (const t of missing) console.error(`   ${t}`);
  console.error(`
เพิ่มลง CUSTOMER_REFERENCE_TABLES ใน src/lib/master/customerReferences.js พร้อม label ภาษาไทย
ถ้าตารางนั้นไม่ควรกันการลบจริง ๆ ให้ใส่ CUSTOMER_REFERENCE_IGNORED พร้อมเหตุผล\n`);
  process.exit(1);
}

if (stale.length) {
  console.error(`\n❌ ทะเบียนอ้างตารางที่ไม่มีบนฐานแล้ว ${stale.length} ตัว — ด่านลบจะพังทั้งเส้นเพราะ query ล้ม\n`);
  for (const t of stale) console.error(`   ${t}`);
  process.exit(1);
}

console.log(`check:refs ผ่าน — ${live.length} ตารางที่ถือ customerId อยู่ในทะเบียนครบ`);
