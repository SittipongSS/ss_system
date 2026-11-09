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
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
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
/* อ่านครบทุกแถวเป็นหน้า ๆ — PostgREST ตัดที่ 1,000 แถวเงียบ ๆ (ลูกค้า 598 · FG 771
   ณ 09/11 ใกล้เพดานแล้ว) เกินเมื่อไรแถวท้ายตารางจะไม่ถูกตรวจเลยโดยไม่มีใครรู้ */
async function selectAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) return { error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) return { data: rows };
  }
}

const { data: customers, error: custError } = await selectAll('customers', 'id, "arCode", name, "nameEn", "taxId"');
if (custError) { console.error('✗ load customers:', custError.message); process.exit(1); }
const byId = new Map((customers || []).map((c) => [c.id, c]));
console.log(`ลูกค้าในทะเบียน ${byId.size} ราย`);

console.log('\nตารางที่ตรึงไว้ (ไม่แตะ):');
for (const m of CUSTOMER_NAME_MIRRORS.filter((x) => x.mode === 'frozen')) {
  console.log(`  · ${m.table} — ${m.reason.slice(0, 88)}`);
}

let total = 0;
let written = 0;
const backup = [];
for (const mirror of liveCustomerNameMirrors()) {
  /* ไม่หยิบ `id` — ตารางแชร์ (scent_/formula_customer_shares) ไม่มีคอลัมน์ id
     (คีย์เป็นคู่ scentId/formulaId + customerId) · ค่าที่ต้องเขียนมาจากลูกค้าล้วน ๆ
     จึงเขียนทีละ "ลูกค้า" ด้วย `.eq('customerId', …)` รูปเดียวกับ cascade ตอนแก้ลูกค้า */
  const columns = ['"customerId"', ...Object.keys(mirror.fields).map((c) => `"${c}"`)].join(', ');
  const { data: rows, error } = await selectAll(mirror.table, columns);
  if (error) { console.error(`✗ ${mirror.table}: ${error.message}`); continue; }

  const staleByCustomer = new Map();
  for (const row of rows || []) {
    const customer = row.customerId ? byId.get(row.customerId) : null;
    if (!customer) continue; // ไม่ผูกลูกค้า / ลูกค้าถูกลบ — ไม่ใช่หน้าที่สคริปต์นี้
    const patch = {};
    let differs = false;
    for (const [column, source] of Object.entries(mirror.fields)) {
      const want = customerMirrorValue(customer, source);
      patch[column] = want;
      if (String(want ?? '').trim() !== String(row[column] ?? '').trim()) differs = true;
    }
    if (!differs) continue;
    const entry = staleByCustomer.get(customer.id) || { customer, patch, rows: [] };
    entry.rows.push(row);
    staleByCustomer.set(customer.id, entry);
  }

  const staleRows = [...staleByCustomer.values()].reduce((n, e) => n + e.rows.length, 0);
  console.log(`\n── ${mirror.table}: ${rows?.length ?? 0} แถว · ต้องแก้ ${staleRows} (ลูกค้า ${staleByCustomer.size} ราย)`);
  total += staleRows;
  for (const { customer, patch, rows: stale } of staleByCustomer.values()) {
    const olds = [...new Set(stale.map((r) => short(r.customerName)))].join(' / ');
    console.log(`  · ${customer.arCode || customer.id} ×${stale.length}  ${olds} → ${short(patch.customerName)}`);
    if (!commit) continue;
    // สำรองแถวเต็มของลูกค้ารายนี้ก่อนเขียน (ไม่มีถังขยะ — กู้ได้จากไฟล์นี้เท่านั้น)
    const { data: before, error: backupError } = await supabase.from(mirror.table).select('*').eq('customerId', customer.id);
    if (backupError) { console.error(`    ✗ สำรองไม่ได้ ข้ามลูกค้ารายนี้: ${backupError.message}`); continue; }
    backup.push({ table: mirror.table, customerId: customer.id, patch, rows: before });
    // เขียนทั้งกอง patch ของลูกค้ารายนี้ (รวมช่องที่ตรงอยู่แล้ว ค่าเดียวกัน = ไม่เปลี่ยน)
    const { error: updateError } = await supabase.from(mirror.table).update(patch).eq('customerId', customer.id);
    if (updateError) console.error(`    ✗ ${updateError.message}`);
    else written += stale.length;
  }
}

if (commit && backup.length) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const file = `${homedir()}/ss-team/archive/customer-name-mirrors-backup-${stamp}.json`;
  writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nสำรองแถวก่อนเขียน ${backup.length} ชุด → ${file}`);
}
console.log(`\n${commit ? '✓ เขียนจริงแล้ว' : '• ทดลอง (dry-run) — ยังไม่เขียนอะไรลงฐานข้อมูล'}`);
console.log(`  แถวที่ชื่อไม่ตรงทะเบียน: ${total}${commit ? ` · บันทึกสำเร็จ ${written}` : ''}`);
if (!commit) console.log('\nรันจริงด้วย: node --import ./scripts/test-loader.mjs scripts/backfill-customer-name-mirrors.mjs --commit');
