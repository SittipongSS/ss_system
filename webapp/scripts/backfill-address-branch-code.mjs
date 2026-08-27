// ── เติมเลขสาขาให้ที่อยู่ที่ยังไม่มี ─────────────────────────────────────
//
// มติผู้ใช้ 2026-08-27: **ทุกที่อยู่ต้องมีเลขสาขาเสมอ ไม่กรอก = '00000' (สำนักงานใหญ่)**
// `normalizeAddresses` เขียนให้แล้วตั้งแต่นี้ไป — สคริปต์นี้เก็บของค้าง
// (ตอนเขียน: 95 จาก 214 แถวไม่มีคีย์ `branchCode` เลย)
//
// พร้อมกันนั้นแปลงข้อความที่แปลว่าสำนักงานใหญ่ ('สำนักงานใหญ่' · 'สนญ.') เป็น '00000'
// ให้เป็นรูปเดียวกันทั้งระบบ — ⚠️ **ชื่อสาขาจริง ('แจ้งวัฒนะ') ไม่แตะ**
//
// ⭐ ด่านความปลอดภัย: เขียนเฉพาะแถวที่ **ต่างกันแค่ `branchCode` เท่านั้น** ถ้าการ
// normalize ขยับฟิลด์อื่นด้วย (ข้อความที่อยู่ · ฟิลด์ย่อย) จะข้ามแถวนั้นแล้วรายงาน —
// สคริปต์นี้มีหน้าที่เดียวคือเติมเลขสาขา ไม่ใช่ re-normalize ทะเบียนทั้งก้อน
//
// ⚠️ ไม่แตะคอลัมน์อื่นของ `customers` — และ `addresses` อยู่ใน
// CUSTOMER_ADDRESS_EXEMPT_FIELDS จึงไม่ทำให้ลูกค้าตกไปรออนุมัติใหม่
//
// Usage (รันจากโฟลเดอร์ webapp):
//   node --import ./scripts/test-loader.mjs scripts/backfill-address-branch-code.mjs
//   node --import ./scripts/test-loader.mjs scripts/backfill-address-branch-code.mjs --commit
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeAddresses } from '../src/lib/master/addresses.js';

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

const commit = process.argv.includes('--commit');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase.from('customers').select('id, name, addresses');
if (error) { console.error('✗ load customers:', error.message); process.exit(1); }

/* ⚠️ เทียบด้วย JSON.stringify ตรง ๆ ไม่ได้ — มัน **ไวต่อลำดับคีย์** ส่วน jsonb ที่เก็บไว้
   กับอ็อบเจกต์ที่ normalizeAddresses สร้างใหม่มีลำดับคีย์คนละแบบ ⇒ แถวที่เนื้อเท่าเดิม
   เป๊ะจะถูกนับเป็น "เปลี่ยน" ทั้งกอง (รอบแรกนับได้ 114 แถวทั้งที่ค่าเท่าเดิม) */
const canon = (v) => JSON.stringify(v, (_k, val) => (
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]]))
    : val
));

/* คีย์ที่เก็บสตริงว่างไว้ vs ไม่มีคีย์เลย = **เนื้อเท่ากัน** — OPTIONAL_ROW_FIELDS ตั้งใจ
   ไม่เขียนคีย์เปล่าลง jsonb แถวยุคเก่าบางแถวจึงมี `subdistrict: ""` ค้างอยู่
   (5 รายในทะเบียน) ถ้าไม่มองว่าเท่ากัน แถวพวกนี้จะถูกข้ามทั้งที่ไม่มีอะไรเสียหาย */
const empty = (v) => v === undefined || v === null || v === '';

// ต่างกันแค่ branchCode หรือเปล่า — เทียบทุกคีย์ของทั้งสองฝั่ง
function onlyBranchChanged(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (k === 'branchCode') continue;
    const a = before?.[k];
    const b = after?.[k];
    if (empty(a) && empty(b)) continue;
    if (canon(a) !== canon(b)) return false;
  }
  return true;
}

let rows = 0;
let filled = 0;
let textToCode = 0;
let tidied = 0;
let written = 0;
const skipped = [];

for (const customer of data || []) {
  const before = Array.isArray(customer.addresses) ? customer.addresses : [];
  if (!before.length) continue;
  const after = normalizeAddresses(before);
  // ⚠️ จำนวนแถวเปลี่ยน = normalize ตัดแถวทิ้ง (ที่อยู่ว่าง) — ไม่ใช่งานของสคริปต์นี้
  if (after.length !== before.length) { skipped.push(`${customer.name} (จำนวนแถวไม่เท่าเดิม)`); continue; }

  let touched = false;
  let bad = false;
  after.forEach((row, i) => {
    rows += 1;
    const old = before[i];
    if (canon(old) === canon(row)) return;
    if (!onlyBranchChanged(old, row)) { bad = true; return; }
    touched = true;
    const had = String(old?.branchCode ?? '').trim();
    if (!had) filled += 1;
    else if (had !== row.branchCode) textToCode += 1;
    // ค่าเลขสาขาเท่าเดิม แต่แถวขยับเพราะ normalize ล้างคีย์ที่เก็บสตริงว่างไว้
    // (เนื้อเท่ากัน — รูปแถวเท่ากับที่ผู้ใช้กดบันทึกเองครั้งถัดไปอยู่แล้ว)
    else tidied += 1;
    console.log(`  · ${customer.name.slice(0, 40)} — ${had || '(ไม่มีคีย์)'} → ${row.branchCode}`);
  });
  if (bad) { skipped.push(`${customer.name} (normalize ขยับฟิลด์อื่นด้วย)`); continue; }
  if (!touched || !commit) continue;

  const { error: updateError } = await supabase
    .from('customers').update({ addresses: after }).eq('id', customer.id);
  if (updateError) console.error(`  ✗ ${customer.name}: ${updateError.message}`);
  else written += 1;
}

console.log(`\n${commit ? '✓ เขียนจริงแล้ว' : '• ทดลอง (dry-run) — ยังไม่เขียนอะไรลงฐานข้อมูล'}`);
console.log(`  แถวที่อยู่ทั้งหมด ${rows}`);
console.log(`  เติม 00000 ให้แถวที่ยังไม่มีเลข: ${filled}`);
console.log(`  แปลงข้อความเป็นเลข ('สำนักงานใหญ่' → '00000'): ${textToCode}`);
console.log(`  เลขเท่าเดิม แต่ล้างคีย์ที่เก็บสตริงว่างพ่วงไปด้วย: ${tidied}`);
if (commit) console.log(`  บันทึกสำเร็จ: ${written} ราย`);
if (skipped.length) {
  console.log(`\n  ⚠️ ข้ามไป ${skipped.length} ราย (ต้องให้คนดู):`);
  for (const s of skipped) console.log(`    · ${s}`);
}
if (!commit) console.log('\nรันจริงด้วย: node --import ./scripts/test-loader.mjs scripts/backfill-address-branch-code.mjs --commit');
