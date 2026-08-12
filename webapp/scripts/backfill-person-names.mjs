/* เก็บกวาดสำเนาชื่อที่ค้างอยู่ก่อนมี fan-out ตอนเปลี่ยนชื่อ (ดู src/lib/personNameFanOut.js)
 *
 * ใช้ลิสต์คอลัมน์ชุดเดียวกับตอน runtime — ไม่มีลิสต์ที่สองให้หลุดจากกัน
 * ค่าตั้งต้นคือ **ซ้อม** (แสดงว่าจะแก้อะไรบ้าง ไม่เขียน) ใส่ --apply เพื่อเขียนจริง
 *
 *   node scripts/backfill-person-names.mjs            # ซ้อม
 *   node scripts/backfill-person-names.mjs --apply    # เขียนจริง
 *
 * อ่านชื่อปัจจุบันจาก Supabase Auth เป็นแหล่งความจริง (รวมบัญชีที่ปิดแล้ว — คนลาออก
 * ยังต้องอ่านชื่อออกจากลีด/เป้าเก่า) · บัญชีที่หา id ไม่เจอ = ข้าม ไม่เดา
 */
import { createClient } from '@supabase/supabase-js';
import { PERSON_NAME_COLUMNS } from '../src/lib/personNameFanOut.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ชื่อปัจจุบันของทุกบัญชี
const names = new Map();
for (let page = 1; page <= 20; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`อ่านรายชื่อผู้ใช้ไม่ได้: ${error.message}`);
  for (const u of data.users) names.set(u.id, String(u.user_metadata?.name || u.email || '').trim());
  if (data.users.length < 200) break;
}
console.log(`บัญชีทั้งหมด ${names.size} ราย`);

let totalStale = 0;
for (const col of PERSON_NAME_COLUMNS) {
  const { data, error } = await supabase
    .from(col.table)
    .select(`id, ${col.idColumn}, ${col.nameColumn}`)
    .not(col.idColumn, 'is', null);
  if (error) {
    console.log(`${col.table}: อ่านไม่ได้ — ${error.message}`);
    continue;
  }

  const stale = data.filter((row) => {
    const live = names.get(row[col.idColumn]);
    const stored = String(row[col.nameColumn] || '').trim();
    return live && stored && stored !== live;
  });
  totalStale += stale.length;

  const byChange = new Map();
  for (const row of stale) {
    const k = `${row[col.nameColumn]} → ${names.get(row[col.idColumn])}`;
    byChange.set(k, (byChange.get(k) || 0) + 1);
  }
  console.log(`\n${col.table}.${col.nameColumn} (${col.label}) — ค้าง ${stale.length}/${data.length} แถว`);
  for (const [change, n] of byChange) console.log(`  ${String(n).padStart(4)}× ${change}`);

  if (!apply || !stale.length) continue;

  // ยิงทีละบัญชี ไม่ใช่ทีละแถว — คำสั่งเดียวจบทุกแถวของคนนั้น
  const perUser = new Map();
  for (const row of stale) perUser.set(row[col.idColumn], names.get(row[col.idColumn]));
  let done = 0;
  for (const [userId, name] of perUser) {
    const { data: updated, error: updateError } = await supabase
      .from(col.table)
      .update({ [col.nameColumn]: name })
      .eq(col.idColumn, userId)
      .neq(col.nameColumn, name)
      .select('id');
    if (updateError) {
      console.log(`  ✗ ${userId}: ${updateError.message}`);
      continue;
    }
    done += updated?.length || 0;
  }
  console.log(`  เขียนแล้ว ${done} แถว`);
}

console.log(`\nรวมแถวที่ค้าง ${totalStale}`);
if (!apply) console.log('[ซ้อม] ยังไม่เขียน — ใส่ --apply เพื่อเขียนจริง');
