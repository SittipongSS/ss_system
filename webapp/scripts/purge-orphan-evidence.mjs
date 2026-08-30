// ── กวาดไฟล์หลักฐานกำพร้าใน bucket ส่วนตัว ────────────────────────────────
//
// 🐞 ที่มา (2026-08-30): เส้นลบใบเสนอราคา/ใบสั่งขายไม่เคยแตะ Storage เลย ⇒ ทุกใบที่
// ถูกลบทิ้งไฟล์ไว้ใต้โฟลเดอร์ของตัวเองถาวร · แก้ที่ต้นเหตุแล้ว (purgePrivateEvidence
// ใน lib/upload/privateEvidence.js) สคริปต์นี้ไว้เก็บของที่ค้างมาก่อนหน้านั้น
//
// ⭐ **กำพร้า = โฟลเดอร์ที่ไม่มีแถวของมันในตารางแล้ว** — ตัดสินจากตาราง ไม่ใช่จาก
// อายุไฟล์ · ไฟล์ของใบที่ยังอยู่ (รวมใบร่างที่เพิ่งอัปแล้วยังไม่กดสร้าง) ไม่ถูกแตะ
//
// ⚠️ ตั้งต้นเป็น dry-run เสมอ · ต้องใส่ --apply ถึงจะลบจริง
//
// Usage (รันจากโฟลเดอร์ webapp):
//   node scripts/purge-orphan-evidence.mjs
//   node scripts/purge-orphan-evidence.mjs --apply
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).');
  process.exit(1);
}
const bucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || 'sales-evidence';
const apply = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });

// โฟลเดอร์ระดับบนของ bucket ↔ ตารางเจ้าของ (ดู TARGETS ใน lib/upload/privateEvidence.js)
const ROOTS = [
  { prefix: 'quotations', table: 'quotations' },
  { prefix: 'sales-orders', table: 'sales_orders' },
];

const list = async (prefix) => {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix}: ${error.message}`);
  return data || [];
};

let totalFiles = 0;
let totalBytes = 0;
const toRemove = [];

for (const root of ROOTS) {
  const folders = (await list(root.prefix)).map((item) => item.name);
  if (!folders.length) continue;

  // ไล่ทีละก้อนเพราะ `in.(...)` ยาวเกินไปจะชน URL limit
  const alive = new Set();
  for (let i = 0; i < folders.length; i += 200) {
    const chunk = folders.slice(i, i + 200);
    const { data, error } = await supabase.from(root.table).select('id').in('id', chunk);
    if (error) throw new Error(`${root.table}: ${error.message}`);
    for (const row of data || []) alive.add(row.id);
  }

  const orphans = folders.filter((name) => !alive.has(name));
  console.log(`${root.prefix}: โฟลเดอร์ ${folders.length} · กำพร้า ${orphans.length}`);

  for (const orphan of orphans) {
    for (const sub of await list(`${root.prefix}/${orphan}`)) {
      for (const file of await list(`${root.prefix}/${orphan}/${sub.name}`)) {
        // รายการที่ Storage คืนแบบ "โฟลเดอร์" มี id = null — ไม่ใช่ไฟล์ ห้ามสั่งลบ
        if (!file?.id) continue;
        totalFiles += 1;
        totalBytes += file.metadata?.size || 0;
        toRemove.push(`${root.prefix}/${orphan}/${sub.name}/${file.name}`);
      }
    }
  }
}

console.log(`\nไฟล์กำพร้า ${totalFiles} ไฟล์ · ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
for (const path of toRemove.slice(0, 20)) console.log(`  ${path}`);
if (toRemove.length > 20) console.log(`  … อีก ${toRemove.length - 20} ไฟล์`);

if (!apply) {
  console.log('\ndry-run — ใส่ --apply เพื่อลบจริง');
  process.exit(0);
}
if (!toRemove.length) process.exit(0);

for (let i = 0; i < toRemove.length; i += 100) {
  const { error } = await supabase.storage.from(bucket).remove(toRemove.slice(i, i + 100));
  if (error) {
    console.error('ลบไม่สำเร็จ:', error.message);
    process.exit(1);
  }
}
console.log(`\nลบแล้ว ${toRemove.length} ไฟล์`);
