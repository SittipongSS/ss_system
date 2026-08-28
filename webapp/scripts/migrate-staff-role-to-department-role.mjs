// ย้ายผู้ใช้ role `staff` ไปเป็น role ของฝ่ายตัวเอง (pc/pd/wh/qc/ts/rd/finance).
//
// WHY: มติผู้ใช้ 2026-08-28 — *"จะไม่มีตำแหน่ง staff แล้วทุกฝ่าย"* · เดิม PC/PD/WH/QC/TS
// ใช้ role `staff` ตัวเดียวร่วมกัน ⇒ cap ต้องถือกว้างระดับ role แล้วไปแคบด้วยฝ่ายที่
// helper ปลายทางทุกตัว · ตอนนี้แต่ละฝ่ายมี role ของตัวเองและถือ cap เท่างานจริง
//
// ⚠️ **รันก่อน deploy โค้ดชุดใหม่** — โค้ดใหม่ไม่มี `staff` ใน ROLE_CAPS แล้ว
// (`roleOf` แปลงให้ตอนอ่านโดยดูจากฝ่าย แต่ด่านชั้น proxy เห็นแค่ role จึงช่วยไม่ได้ทุกจุด)
// ⚠️ ผู้ใช้ที่ยังถือโทเคนเก่าต้อง **login ใหม่** ถึงจะได้ role ใหม่ติดตัว
//
// Usage:  node scripts/migrate-staff-role-to-department-role.mjs [--dry-run]
// อ่าน SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY จาก .env.local (หรือ env)
//
// Idempotent: ใครไม่ได้เป็น `staff` ข้ามหมด · รันซ้ำได้
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* env มาจาก process.env ก็ได้ */ }

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ขาด SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ตั้งใน .env.local)');
  process.exit(1);
}

// ต้องตรงกับ LEGACY_STAFF_ROLE_BY_DEPARTMENT ใน src/lib/permissions.js
const ROLE_BY_DEPARTMENT = {
  PC: 'pc', PD: 'pd', WH: 'wh', QC: 'qc', TS: 'ts', RD: 'rd', FN: 'finance',
};
// ฝ่ายที่เคยเก็บด้วยชื่อเก่า (ดู LEGACY_DEPARTMENT)
const LEGACY_DEPARTMENT = { SALES: 'SA', LEGAL: 'RA', LG: 'RA', VIEWER: 'Viewer' };
const deptOf = (raw) => {
  const code = String(raw ?? '').trim();
  return LEGACY_DEPARTMENT[code.toUpperCase()] || code;
};

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(url, key, { auth: { persistSession: false } });

if (DRY_RUN) console.log('— DRY RUN — ไม่เขียนอะไรทั้งนั้น —\n');

let page = 1;
let moved = 0;
let stuck = 0;

for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error(`✗ listUsers (page ${page}): ${error.message}`);
    process.exit(1);
  }
  const users = data?.users || [];
  if (users.length === 0) break;

  for (const user of users) {
    const meta = user.app_metadata || {};
    if (meta.role !== 'staff') continue;
    const dept = deptOf(meta.department);
    const role = ROLE_BY_DEPARTMENT[dept];
    if (!role) {
      // ⚠️ ไม่เดา — ไม่มีฝ่ายเก็บไว้ = ไม่รู้ว่าเขาทำงานฝ่ายไหน ต้องให้คนตัดสิน
      console.error(`✗ ${user.email}: ฝ่าย ${meta.department || '(ว่าง)'} ไม่มี role ปลายทาง — ตั้งฝ่ายให้ก่อน`);
      stuck += 1;
      continue;
    }
    console.log(`${DRY_RUN ? '(dry)' : '✓'} ${user.email}: staff → ${role} (ฝ่าย ${dept})`);
    if (DRY_RUN) { moved += 1; continue; }
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { ...meta, role },
    });
    if (updateError) {
      console.error(`✗ ${user.email}: ${updateError.message}`);
      stuck += 1;
      continue;
    }
    moved += 1;
  }
  if (users.length < 1000) break;
  page += 1;
}

console.log(`\nย้ายแล้ว ${moved} บัญชี · ค้าง ${stuck} บัญชี`);
if (stuck) process.exit(1);
