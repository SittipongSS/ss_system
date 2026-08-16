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
import { REFERENCE_REGISTRY, referenceTableNames } from '../src/lib/master/entityReferences.js';

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
const openApi = await res.json();
const spec2def = (entitySpec) => Object.fromEntries(
  Object.entries(openApi.definitions || {}).filter(([, def]) => def?.properties?.[entitySpec.column]),
);

let failed = false;
for (const [entity, spec] of Object.entries(REFERENCE_REGISTRY)) {
  const live = Object.entries(spec2def(spec)).map(([name]) => name).sort();
  const declared = new Set([...referenceTableNames(entity), ...Object.keys(spec.ignored)]);
  const missing = live.filter((t) => !declared.has(t));
  const stale = referenceTableNames(entity).filter((t) => !live.includes(t));

  if (missing.length) {
    console.error(`\n❌ [${entity}] มี ${missing.length} ตารางที่อ้างถึง แต่ไม่อยู่ในทะเบียน — ลบแล้วแถวพวกนี้จะเสียสายเชื่อมเงียบ ๆ\n`);
    for (const t of missing) console.error(`   ${t}`);
    console.error(`
เพิ่มลง REFERENCE_REGISTRY.${entity}.tables ใน src/lib/master/entityReferences.js พร้อม label ภาษาไทย
ถ้าตารางนั้นไม่ควรกันการลบจริง ๆ ให้ใส่ .ignored พร้อมเหตุผล`);
    failed = true;
  }
  if (stale.length) {
    console.error(`\n❌ [${entity}] ทะเบียนอ้างตารางที่ไม่มีบนฐานแล้ว ${stale.length} ตัว — ด่านลบจะพังทั้งเส้นเพราะ query ล้ม\n`);
    for (const t of stale) console.error(`   ${t}`);
    failed = true;
  }
  if (!missing.length && !stale.length) {
    console.log(`  [${entity}] ${live.length} ตารางที่ถือ ${spec.column} อยู่ในทะเบียนครบ`);
  }
}
if (failed) process.exit(1);

console.log('check:refs ผ่าน');
