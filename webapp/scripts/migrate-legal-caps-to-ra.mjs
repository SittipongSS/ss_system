// เปลี่ยนชื่อสิทธิ์รายคนที่ตกค้างจากรอบ LG → RA: legal:view/legal:approve → ra:view/ra:approve
//
// WHY: รอบเปลี่ยนชื่อฝ่ายกฎหมาย (2026-08-28 · docs/legal-to-ra-rename.md) ย้าย **role**
// ครบแล้ว แต่ `app_metadata.extraCaps` (สิทธิ์ที่ grant รายคน) ยังเขียนชื่อเก่าอยู่
// ⇒ `sanitizeExtraCaps` ตัดทิ้งเงียบ ๆ เพราะไม่อยู่ใน GRANTABLE_CAPS ⇒ **คนที่ถูก grant
// ให้ทำงานแทนฝ่าย RA ไม่ได้สิทธิ์นั้นจริง** และไม่มี error ให้ใครเห็น
// (`npm run check:users` เป็นตัวที่จับได้)
//
// Usage:  node scripts/migrate-legal-caps-to-ra.mjs [--dry-run]
// อ่าน SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY จาก .env.local (หรือ env)
//
// Idempotent: บัญชีที่ไม่มีชื่อเก่าข้ามหมด · รันซ้ำได้
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

const RENAMED_CAPS = { 'legal:view': 'ra:view', 'legal:approve': 'ra:approve' };

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(url, key, { auth: { persistSession: false } });

if (DRY_RUN) console.log('— DRY RUN — ไม่เขียนอะไรทั้งนั้น —\n');

let page = 1;
let fixed = 0;
let failed = 0;

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
    const caps = Array.isArray(meta.extraCaps) ? meta.extraCaps : [];
    if (!caps.some((c) => RENAMED_CAPS[c])) continue;
    // ⚠️ dedupe — บางบัญชีอาจถูก grant ชื่อใหม่ไปแล้วด้วย ชื่อซ้ำจะเพี้ยนตอนแสดงผล
    const next = [...new Set(caps.map((c) => RENAMED_CAPS[c] || c))];
    console.log(`${DRY_RUN ? '(dry)' : '✓'} ${user.email}: ${caps.join(', ')} → ${next.join(', ')}`);
    if (DRY_RUN) { fixed += 1; continue; }
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { ...meta, extraCaps: next },
    });
    if (updateError) {
      console.error(`✗ ${user.email}: ${updateError.message}`);
      failed += 1;
      continue;
    }
    fixed += 1;
  }
  if (users.length < 1000) break;
  page += 1;
}

console.log(`\nแก้แล้ว ${fixed} บัญชี · พลาด ${failed} บัญชี`);
if (failed) process.exit(1);
