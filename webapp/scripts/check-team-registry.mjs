#!/usr/bin/env node
/* ── ทะเบียนทีมขายในฐาน ต้องไม่เสียของเก่า และโค้ดต้องรู้จักป้ายของทีมที่ใช้งานอยู่ ──
 *
 * ⭐ **เปลี่ยนหน้าที่ 2026-09-07** (มติผู้ใช้: ปลดล็อกให้สร้างทีมขายใหม่ได้)
 *   เดิมด่านนี้บังคับ "ทะเบียน = ค่าคงที่ TEAMS" ทั้งสองทาง ⇒ สร้างทีมขายใหม่ = ด่านแดง
 *   แต่ **ของที่มีค่าจริงมันไม่ได้คุ้มเลย**: ลบ KA/ODM/SV ออกจากทะเบียนก็ยังผ่านฉลุย
 *   (ตรวจจริงด้วย fixture 6 ชุด 2026-09-07)
 *
 *   วันนี้ทางเขียนทุกเส้นเทียบกับ **ทะเบียนสด** แล้ว (`loadSalesTeamCodes`) ⇒ ทีมใหม่
 *   ใช้งานได้เองโดยไม่ต้องแตะโค้ด · ด่านนี้จึงเหลือสองหน้าที่ที่ยังจริง:
 *     ① **สามทีมตั้งต้นต้องไม่หายและไม่ถูกปิด** — รหัสถูกก๊อปเป็นข้อความลง 20 คอลัมน์
 *        ใน 19 ตาราง และเป็นค่าถอยของฝั่งจอที่อ่านแบบ sync
 *     ② ~~ป้ายของทีมที่โค้ดรู้จักต้องตรงกับทะเบียน~~ — **ตายไปแล้ว (2026-09-07)** พร้อมกับ
 *        `TEAM_LABELS` · ชื่อทีมมีบ้านเดียวคือทะเบียน ไม่มีสำเนาในโค้ดให้เพี้ยนอีก
 *        และกฎข้อนี้เองคือสิ่งที่ทำให้ "เปลี่ยนชื่อทีม" กลายเป็นเหตุการณ์ที่ทำ CI แดง
 *
 * ⚠️ ลำดับ (sortOrder ↔ ลำดับใน TEAMS) ตรวจ **เฉพาะสามทีมตั้งต้น** — ของเดิมเทียบทั้งชุด
 *   ซึ่งทำให้การสลับลำดับบนจอทำ CI แดงในใบที่ไม่ได้แตะเรื่องนี้เลย
 *
 * ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY เหมือน check:refs/check:columns
 * ไม่มีคีย์ = ข้าม (เหมือนด่านพี่น้อง) ไม่ใช่ตก
 *
 * ✅ **CI ตั้ง secret แล้ว — ด่านนี้รันจริงทุกรอบ** (ตรวจ 2026-09-08 จาก run ของ main:
 *   ขั้น "Team registry" → success ไม่ใช่ skipped) · บรรทัดเดิมเขียนว่า "ถูกข้ามทุกรอบ"
 *   ซึ่งค้างมาจากตอนที่ยังไม่ได้ตั้ง secret
 * 🪤 คอมเมนต์สถานะแบบนี้เน่าเงียบ — คนอ่านจะเชื่อว่าด่านไม่ทำงานแล้วข้ามการแก้จริง
 *   (กฎเดียวกับที่ AGENTS.md เตือนเรื่องบรรทัดสถานะในเอกสาร) ⇒ ยืนยันกับ CI ก่อนเชื่อ
 */
import { TEAMS } from '../src/lib/permissions.js';

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

/* ⚠️ นับเฉพาะทีมขายที่ยังใช้งาน — ทีมที่ปิดแล้วยังอยู่ในทะเบียนเพื่ออ่านป้ายย้อนหลัง */
const active = rows.filter((r) => r.isActive !== false);
const inDb = active.map((r) => r.code);

// ① สามทีมตั้งต้นต้องยังอยู่และยังเปิดใช้งาน
for (const code of TEAMS) {
  if (!inDb.includes(code)) {
    problems.push(`ทีมตั้งต้น ${code} หายจากทะเบียนหรือถูกปิด — รหัสนี้ถูกอ้างในข้อมูลเก่าทั้งระบบ`);
  }
}

// ⚠️ ลำดับ: เทียบเฉพาะสามทีมตั้งต้น (ทีมใหม่แทรกตรงไหนก็ได้)
if (!problems.length) {
  const legacyOrder = inDb.filter((code) => TEAMS.includes(code)).join(',');
  if (legacyOrder !== TEAMS.join(',')) {
    problems.push(`ลำดับของทีมตั้งต้นไม่ตรง — ทะเบียน: ${legacyOrder} · โค้ด: ${TEAMS.join(',')}`);
  }
}

if (problems.length) {
  console.error('\n❌ ทะเบียนทีมขายมีปัญหา\n');
  for (const p of problems) console.error(`   · ${p}`);
  console.error('\nแก้ที่ทะเบียน (/sa/teams) หรือที่ src/lib/permissions.js (TEAMS) ให้ตรงกัน\n');
  process.exit(1);
}

console.log(`check:teams ผ่าน — ทีมขายที่ใช้งานอยู่ ${inDb.length} ทีม · ทีมตั้งต้นครบ ${TEAMS.length} ทีม`);
