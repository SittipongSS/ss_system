#!/usr/bin/env node
/* ── ทะเบียนทีมในฐาน ต้องตรงกับค่าคงที่ในโค้ด (งวด T-5) ──────────────────
 *
 * ⭐ **ทำไมยังมีค่าคงที่อยู่ทั้งที่มีทะเบียนแล้ว**: ด่านสิทธิ์ทุกตัว (`inScope` ·
 *   `canEditService` · `canAccessSahamit` …) อ่านทีมแบบ **sync ตอน render** ทั้งฝั่ง
 *   client และ server ⇒ อ่านจากฐานไม่ได้โดยไม่รื้อ ADR 0015 ทั้งฉบับ
 *   ⇒ ทีมขายจึงมีสองที่โดยเจตนา: **ทะเบียนเป็นของจริงที่คนแก้** · const เป็นสำเนา
 *   ที่ด่านสิทธิ์อ่าน — และด่านนี้คือสิ่งที่ทำให้สองฝั่ง "ไม่มีวันเพี้ยนเงียบ ๆ"
 *
 * ตรวจสามอย่าง: รหัสครบตรงกัน · **ลำดับตรงกัน** (sortOrder ↔ ลำดับใน TEAMS) ·
 * ป้ายตรงกัน — ข้อกลางคือข้อที่เคยพลาดจริง (โค้ดมีสามชุดที่เรียงไม่ตรงกัน)
 *
 * ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY เหมือน check:refs/check:columns
 * ไม่มีคีย์ = ข้าม (เหมือนด่านพี่น้อง) ไม่ใช่ตก
 */
import { TEAMS, TEAM_LABELS } from '../src/lib/permissions.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.log('check:teams ข้าม — ไม่มี SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  process.exit(0);
}

const res = await fetch(
  `${url}/rest/v1/teams?select=code,name,kind,isActive,sortOrder&kind=eq.sales&order=sortOrder.asc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) {
  console.error(`check:teams อ่านทะเบียนไม่ได้ (${res.status}) — ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();

const problems = [];

/* ⚠️ นับเฉพาะทีมขายที่ยังใช้งาน — ทีมที่ปิดแล้วยังอยู่ในทะเบียนเพื่ออ่านป้ายย้อนหลัง
   แต่ไม่ต้องอยู่ใน const (const คือ "ทีมที่ยังตั้งให้คนใหม่ได้") */
const active = rows.filter((r) => r.isActive !== false);
const inDb = active.map((r) => r.code);

for (const code of TEAMS) {
  if (!inDb.includes(code)) problems.push(`โค้ดมีทีม ${code} แต่ทะเบียนไม่มี (หรือถูกปิดไปแล้ว)`);
}
for (const code of inDb) {
  if (!TEAMS.includes(code)) {
    problems.push(`ทะเบียนมีทีมขาย ${code} แต่ค่าคงที่ TEAMS ยังไม่มี — ด่านสิทธิ์จะปฏิเสธคนที่อยู่ทีมนี้`);
  }
}

if (!problems.length) {
  const orderInDb = inDb.join(',');
  const orderInCode = TEAMS.join(',');
  if (orderInDb !== orderInCode) {
    problems.push(`ลำดับไม่ตรง — ทะเบียน (sortOrder): ${orderInDb} · โค้ด (TEAMS): ${orderInCode}`);
  }
  for (const row of active) {
    if (TEAM_LABELS[row.code] && TEAM_LABELS[row.code] !== row.name) {
      problems.push(`ป้ายทีม ${row.code} ไม่ตรง — ทะเบียน "${row.name}" · โค้ด "${TEAM_LABELS[row.code]}"`);
    }
  }
}

if (problems.length) {
  console.error('\n❌ ทะเบียนทีมกับค่าคงที่ในโค้ดไม่ตรงกัน\n');
  for (const p of problems) console.error(`   · ${p}`);
  console.error('\nแก้ที่ src/lib/permissions.js (TEAMS · TEAM_LABELS) หรือที่ทะเบียนให้ตรงกัน');
  console.error('⚠️ ทีมขายใหม่ที่มีแต่ในทะเบียน จะถูกด่านสิทธิ์ปฏิเสธทุกจุดจนกว่าจะเพิ่มใน TEAMS\n');
  process.exit(1);
}

console.log(`check:teams ผ่าน — ทีมขาย ${inDb.length} ทีม ตรงกันทั้งรหัส ลำดับ และป้าย`);
