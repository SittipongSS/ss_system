// ── รายงานเลขประจำตัวผู้เสียภาษีที่ซ้ำ/รูปแบบผิดในทะเบียนลูกค้า ──────────
//
// อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น — ใช้สองจังหวะ:
//   1. ก่อนรัน migration 0318 (unique index จะล้มถ้ายังมีเลขซ้ำ)
//   2. ตรวจสุขภาพทะเบียนเป็นระยะ
//
// เทียบด้วย `taxIdKey` ตัวเดียวกับที่ฟอร์ม/API ใช้ ⇒ เห็นคู่ซ้ำที่ `.eq` และ unique
// ของ DB มองไม่เห็น (เลขเดียวกันแต่เก็บคนละรูป: มีขีด / ศูนย์นำหน้าหายตอนผ่าน Excel)
//
// Usage (รันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src):
//   node --import ./scripts/test-loader.mjs scripts/check-customer-tax-id.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { TAX_ID_LENGTH, taxIdKey } from '../src/lib/master/customerTaxId.js';

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

const supabase = createClient(url, key, { auth: { persistSession: false } });

/* ⚠️ ต้องไล่ทีละหน้า — เพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ ไม่มี error
   (รายงานที่ตัดแถวทิ้ง = บอกว่า "ไม่ซ้ำ" ทั้งที่ยังไม่ได้ดูครบ) */
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from('customers').select('id, arCode, name, taxId, branchCode, isActive')
    .order('arCode', { ascending: true })
    .range(from, from + 999);
  if (error) { console.error('✗ load customers:', error.message); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const label = (row) => `${row.arCode || '(ไม่มีรหัส)'} ${String(row.name || '').slice(0, 34)}`;
const withTax = rows.filter((r) => taxIdKey(r.taxId));
console.log(`ลูกค้าทั้งหมด ${rows.length} ราย · มีเลขผู้เสียภาษี ${withTax.length} · ไม่มี ${rows.length - withTax.length}`);

// ── เลขซ้ำ (เทียบด้วยคีย์) ────────────────────────────────────────────────
const groups = new Map();
for (const row of withTax) {
  const k = taxIdKey(row.taxId);
  groups.set(k, [...(groups.get(k) || []), row]);
}
const duplicates = [...groups.entries()].filter(([, list]) => list.length > 1);
console.log(`\n── เลขซ้ำ ${duplicates.length} เลข ${duplicates.length ? '(migration 0318 จะล้มจนกว่าจะเหลือ 0)' : '✓'}`);
for (const [k, list] of duplicates) {
  console.log(`  ${k}`);
  for (const row of list) {
    const branch = String(row.branchCode || '00000');
    console.log(`     · ${label(row)} · สาขา ${branch} · เก็บไว้เป็น "${row.taxId}"${row.isActive === false ? ' · พักใช้' : ''}`);
  }
}

// ── รูปแบบที่ต้องไล่แก้ ───────────────────────────────────────────────────
const messy = withTax.filter((r) => !new RegExp(`^\\d{${TAX_ID_LENGTH}}$`).test(String(r.taxId)));
console.log(`\n── เลขที่ไม่ใช่ตัวเลข ${TAX_ID_LENGTH} หลักล้วน ${messy.length} แถว`);
for (const row of messy) {
  const digits = String(row.taxId).replace(/\D/g, '');
  const why = /[A-Za-z]/.test(row.taxId) ? 'มีตัวอักษร (เลขต่างชาติ?)'
    : digits.length === TAX_ID_LENGTH ? 'มีตัวคั่น'
      : digits.length === TAX_ID_LENGTH - 1 ? 'ศูนย์นำหน้าหาย'
        : `${digits.length} หลัก`;
  console.log(`  · ${label(row)} — "${row.taxId}" (${why})`);
}

// ── เลขสาขาที่ไม่ใช่ 5 หลัก ────────────────────────────────────────────────
// ไม่ใช่ส่วนหนึ่งของคีย์ซ้ำแล้ว แต่ขึ้นใบกำกับภาษีเต็มรูป จึงรายงานคู่กันไว้
const badBranch = rows.filter((r) => r.branchCode && !/^\d{5}$/.test(String(r.branchCode)));
console.log(`\n── เลขสาขาที่ไม่ใช่ตัวเลข 5 หลัก ${badBranch.length} แถว`);
for (const row of badBranch) console.log(`  · ${label(row)} — "${row.branchCode}"`);

process.exit(duplicates.length ? 1 : 0);
