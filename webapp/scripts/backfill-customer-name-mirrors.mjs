// ── ไล่สำเนาชื่อลูกค้าที่ค้างชื่อเก่าให้ตรงกับทะเบียน ────────────────────
//
// `cascadeCustomerName` แก้เฉพาะ "ตั้งแต่นี้ไป" — แถวที่ค้างมาก่อนหน้ายังเป็นชื่อเก่า
// สคริปต์นี้ไล่เก็บของค้าง เขียนเฉพาะตารางโหมด 'live' ตามทะเบียนกลาง
// (lib/master/customerNameMirrors.js) ⇒ **ไม่มีทางแตะเอกสาร** เพราะ quotations และ
// sales_orders ประกาศเป็น 'frozen' ไว้แล้ว
//
// ⚠️ ไม่แตะ `customers` เลย — จึงไม่ทำให้ลูกค้ารายไหนตกไปรออนุมัติใหม่
// (resetApprovalOnEdit ทำงานตอนแก้ตัวลูกค้าเท่านั้น)
//
// Usage (รันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src):
//   node --import ./scripts/test-loader.mjs scripts/backfill-customer-name-mirrors.mjs
//   node --import ./scripts/test-loader.mjs scripts/backfill-customer-name-mirrors.mjs --commit
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { CUSTOMER_NAME_MIRRORS, customerMirrorValue, liveCustomerNameMirrors } from '../src/lib/master/customerNameMirrors.js';

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
const short = (v) => String(v ?? '(ว่าง)').replace(/\s+/g, ' ').slice(0, 46);

/* 'displayName' ในทะเบียน mirror ไม่ใช่คอลัมน์จริงของ customers — เป็นตัวบอกว่าให้คิด
   จากกติกาสองภาษา · อ่าน customer['displayName'] ตรง ๆ จะได้ null แล้วสคริปต์นี้จะ
   ไล่ "ซ่อม" ลูกค้าที่มีแต่ชื่ออังกฤษให้เป็นค่าว่างทั้งกอง (บั๊กที่รอบนี้มาแก้พอดี)
   ⇒ จึงเรียก `customerMirrorValue` ของทะเบียนกลางตัวเดียวกับที่ cascade ใช้
      ไม่ก๊อปตรรกะมาไว้ที่นี่ ไม่งั้นสองฝั่งเพี้ยนหากันตอนทะเบียนเพิ่ม source ใหม่
   ⚠️ select ต้องหยิบทุกคอลัมน์ที่ resolver ต้องใช้ (`"nameEn"` สำหรับ displayName)
      ไม่งั้น fallback ไม่มีข้อมูลให้ตก แล้วสคริปต์เขียน null ทับของจริง */
const { data: customers, error: custError } = await supabase.from('customers').select('id, name, "nameEn", taxId');
if (custError) { console.error('✗ load customers:', custError.message); process.exit(1); }
const byId = new Map((customers || []).map((c) => [c.id, c]));
console.log(`ลูกค้าในทะเบียน ${byId.size} ราย`);

console.log('\nตารางที่ตรึงไว้ (ไม่แตะ):');
for (const m of CUSTOMER_NAME_MIRRORS.filter((x) => x.mode === 'frozen')) {
  console.log(`  · ${m.table} — ${m.reason.slice(0, 88)}`);
}

let total = 0;
let written = 0;
for (const mirror of liveCustomerNameMirrors()) {
  const columns = ['id', 'customerId', ...Object.keys(mirror.fields)].join(', ');
  const { data: rows, error } = await supabase.from(mirror.table).select(columns);
  if (error) { console.error(`✗ ${mirror.table}: ${error.message}`); continue; }

  const stale = [];
  for (const row of rows || []) {
    const customer = row.customerId ? byId.get(row.customerId) : null;
    if (!customer) continue; // ไม่ผูกลูกค้า / ลูกค้าถูกลบ — ไม่ใช่หน้าที่สคริปต์นี้
    const patch = {};
    for (const [column, source] of Object.entries(mirror.fields)) {
      const want = customerMirrorValue(customer, source);
      const have = row[column] ?? null;
      if (String(want ?? '').trim() !== String(have ?? '').trim()) patch[column] = want;
    }
    if (Object.keys(patch).length) stale.push({ row, patch, customer });
  }

  console.log(`\n── ${mirror.table}: ${rows?.length ?? 0} แถว · ต้องแก้ ${stale.length}`);
  total += stale.length;
  for (const { row, patch, customer } of stale) {
    const cols = Object.keys(patch).map((c) => `${c}: ${short(row[c])} → ${short(patch[c])}`).join(' · ');
    console.log(`  · ${row.id}  ${cols}`);
    void customer;
    if (!commit) continue;
    const { error: updateError } = await supabase.from(mirror.table).update(patch).eq('id', row.id);
    if (updateError) console.error(`    ✗ ${updateError.message}`);
    else written += 1;
  }
}

console.log(`\n${commit ? '✓ เขียนจริงแล้ว' : '• ทดลอง (dry-run) — ยังไม่เขียนอะไรลงฐานข้อมูล'}`);
console.log(`  แถวที่ชื่อไม่ตรงทะเบียน: ${total}${commit ? ` · บันทึกสำเร็จ ${written}` : ''}`);
if (!commit) console.log('\nรันจริงด้วย: node --import ./scripts/test-loader.mjs scripts/backfill-customer-name-mirrors.mjs --commit');
