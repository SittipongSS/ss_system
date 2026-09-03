// ── แยกคำนำหน้าออกจากชื่อลูกค้าบุคคล → nameTitle / namePerson (mig 0296) ──
//
// ── สิ่งเดียวที่ `name` เปลี่ยนได้คือ "ช่องว่างหลังคำนำหน้า" ─────────────
// ของจริงในทะเบียนเขียนติดกันซะ 28 จาก 55 ราย ('คุณนิดา' ไม่ใช่ 'คุณ นิดา') —
// ถ้าบังคับว่าห้าม `name` ขยับเลย จะแยกได้แค่ครึ่งเดียวแล้วทะเบียนค้างสองมาตรฐาน
// ⇒ ยอมให้เติมช่องว่าง (เป็นการจัดเว้นวรรครูปเดียวกับที่ล้างทั้งทะเบียนไปแล้ว
//    เมื่อ 2026-08-27) แต่ **ตัวคำต้องเหมือนเดิมทุกตัวอักษร**
//
// 🪤 'น.ส.' จึงถูก **ข้าม** — splitCustomerName คืนรูปเต็ม 'นางสาว' ซึ่งเปลี่ยน
// *ตัวคำ* ไม่ใช่เว้นวรรค · เอกสารที่ออกไปแล้วตรึงชื่อเดิมไว้ การเปลี่ยนคำต้องให้
// คนสั่ง ไม่ใช่สคริปต์ตัดสิน — รายพวกนี้ออกมาเป็นรายงานท้ายสคริปต์
// ยกเว้นรหัสที่อยู่ใน TITLE_REWRITE_APPROVED ด้านล่าง = คนสั่งมาแล้วรายตัว
//
// ⚠️ แถวที่ `name` ขยับต้อง cascade ไปตารางโหมด live ด้วย (ดู customerNameMirrors)
//
// 'คุณ' (42 ราย) เขียนลง nameTitle ตามที่เจอ **ไม่แปลงเป็น นาย/นางสาว ให้เอง** —
// เดาเพศจากชื่อไทยไม่ได้ · ผลคือเปิดฟอร์มลูกค้ารายนั้นแล้วเจอคำเตือนสีเหลืองทันที
// ว่า 'คุณ' ใช้บนใบกำกับภาษีไม่ได้ ซึ่งคือจุดที่คนตัดสินใจได้จริง
//
// Usage:
//   node --import ./scripts/test-loader.mjs scripts/backfill-customer-name-title.mjs
//   node --import ./scripts/test-loader.mjs scripts/backfill-customer-name-title.mjs --commit
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { composeCustomerName, splitCustomerName } from '@/lib/master/customerName';
import { cascadeCustomerName } from '@/lib/master/customerNameMirrors';

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const commit = process.argv.includes('--commit');

/* ── รายที่อนุมัติให้เปลี่ยน "ตัวคำ" ของคำนำหน้าได้ (มติผู้ใช้ 2026-08-27) ──
   ปกติสคริปต์ข้ามแถวที่แยกแล้วตัวคำเปลี่ยน เพราะเป็นการตัดสินใจของคน ไม่ใช่ของสคริปต์
   ห้ารายนี้คือกอง 'น.ส.' ที่ผู้ใช้สั่งให้เปลี่ยนเป็นรูปเต็ม 'นางสาว' ทั้งหมด
   ⭐ ทำก่อน deploy โดยตั้งใจ — ถ้าปล่อยไว้ ฟอร์มจะแยก 'น.ส.' สดตอนเปิดแล้วเขียนรูปเต็ม
   ลงไปเองตอนใครก็ตามกดบันทึก ⇒ ชื่อเปลี่ยนแบบไม่มีใครตั้งใจ ทีละใบ
   ⚠️ ทั้งห้ารายยังไม่มีใบเสนอราคา/ใบสั่งขาย จึงไม่มีเอกสารที่ต้องออก Rev. */
const TITLE_REWRITE_APPROVED = new Set(['AR-165', 'AR-616', 'AR-681', 'AR-880', 'AR-886']);
const supabase = createClient(url, key, { auth: { persistSession: false } });

/* 🔴 payload ที่ส่งเข้า `cascadeCustomerName` (`{ ...row, ...patch }` ด้านล่าง) ต้องมี
   **ทุก source ที่ทะเบียน customerNameMirrors ประกาศไว้** — คอลัมน์ที่ไม่ได้ select
   จะเป็น undefined แล้ว cascade ประทับ null ทับของจริงในตารางปลายทาง
   ของจริงที่เคยพลาด: ไม่ได้หยิบ `"taxId"` ⇒ excise_registrations.taxId โดนล้างเป็น null
   และไม่ได้หยิบ `"nameEn"` ⇒ resolver 'displayName' ไม่มีชื่ออังกฤษให้ตก
   ⇒ เพิ่ม source ใหม่ในทะเบียนเมื่อไร ต้องมาเติม select บรรทัดนี้ด้วยเสมอ */
const { data: rows, error } = await supabase
  .from('customers').select('id,arCode,name,"nameEn",customerType,nameTitle,namePerson,"taxId"').limit(2000);
if (error) { console.error(error.message); process.exit(1); }

const bare = (value) => String(value ?? '').replace(/\s+/g, '');
const plan = [];
const mismatched = [];
for (const row of rows) {
  if (row.namePerson) continue;                       // แยกไว้แล้ว
  if (row.customerType !== 'individual') continue;    // นิติบุคคลไม่มีคำนำหน้า
  const parts = splitCustomerName(row.name || '');
  if (!parts.namePerson) continue;                    // ชื่อว่าง — ไม่มีอะไรให้แยก
  /* ⭐ ด่านกันข้อมูลเพี้ยน: ต่อกลับแล้วต้องได้ `name` เดิม **ยกเว้นช่องว่าง**
     เทียบแบบยุบช่องว่างทิ้ง ⇒ 'คุณนิดา ก' กับ 'คุณ นิดา ก' ผ่านทั้งคู่ แต่
     'น.ส.ก' ที่กลายเป็น 'นางสาว ก' ตกด่านเพราะตัวคำเปลี่ยน */
  if (bare(composeCustomerName(parts)) !== bare(row.name || '')) {
    if (!TITLE_REWRITE_APPROVED.has(row.arCode)) { mismatched.push({ row, parts }); continue; }
  }
  plan.push({ row, parts, renames: composeCustomerName(parts) !== (row.name || '') });
}

const byTitle = {};
for (const { parts } of plan) byTitle[parts.nameTitle || '(ไม่มีคำนำหน้า)'] = (byTitle[parts.nameTitle || '(ไม่มีคำนำหน้า)'] || 0) + 1;

console.log(`ลูกค้า ${rows.length} ราย · เป็นบุคคลและยังไม่แยก ${plan.length} ราย`);
console.log('แยกได้เป็น:');
for (const [title, n] of Object.entries(byTitle).sort((a, b) => b[1] - a[1])) console.log(`   ${title.padEnd(16)} ${n}`);
const renamed = plan.filter((p) => p.renames);
// แยกรายงานสองกอง — "เว้นวรรคเพิ่ม" กับ "ตัวคำเปลี่ยน" คนละน้ำหนักกันมาก
const spacedOnly = renamed.filter(({ row, parts }) => bare(composeCustomerName(parts)) === bare(row.name || ''));
const reworded = renamed.filter(({ row, parts }) => bare(composeCustomerName(parts)) !== bare(row.name || ''));
console.log(`\nชื่อจะได้ช่องว่างหลังคำนำหน้าเพิ่ม (ตัวคำเท่าเดิม): ${spacedOnly.length} ราย`);
for (const { row, parts } of spacedOnly) console.log(`   ${row.arCode}: ${JSON.stringify(row.name)} -> ${JSON.stringify(composeCustomerName(parts))}`);
if (reworded.length) {
  console.log(`\n⭐ **ตัวคำเปลี่ยน** ${reworded.length} ราย — อยู่ใน TITLE_REWRITE_APPROVED (คนสั่งมาแล้ว):`);
  for (const { row, parts } of reworded) console.log(`   ${row.arCode}: ${JSON.stringify(row.name)} -> ${JSON.stringify(composeCustomerName(parts))}`);
}
if (mismatched.length) {
  console.log(`\n⚠ ข้ามไว้ ${mismatched.length} ราย — แยกแล้ว **ตัวคำ** เปลี่ยน ต้องให้คนสั่ง:`);
  for (const { row, parts } of mismatched) console.log(`   ${row.arCode}: ${JSON.stringify(row.name)} -> ${JSON.stringify(composeCustomerName(parts))}`);
}
const needsReview = plan.filter(({ parts }) => parts.nameTitle === 'คุณ');
if (needsReview.length) {
  console.log(`\nℹ ${needsReview.length} รายเขียนเป็น 'คุณ' ตามเดิม — เปิดฟอร์มแล้วจะเจอคำเตือนให้เปลี่ยนเป็น นาย/นาง/นางสาว`);
}

if (!commit) { console.log('\n[dry-run] ยังไม่เขียนอะไร — ใส่ --commit เพื่อเขียนจริง'); process.exit(0); }

let ok = 0;
const failed = [];
for (const { row, parts, renames } of plan) {
  const patch = { nameTitle: parts.nameTitle || null, namePerson: parts.namePerson };
  // `name` เขียนก็ต่อเมื่อช่องว่างเปลี่ยนจริง — แถวที่เหมือนเดิมไม่ต้องแตะให้เปลือง
  if (renames) patch.name = composeCustomerName(parts);
  const { error: upErr } = await supabase.from('customers').update(patch).eq('id', row.id);
  if (upErr) { failed.push(`${row.arCode}: ${upErr.message}`); continue; }
  if (renames) {
    const bad = await cascadeCustomerName(supabase, row.id, { ...row, ...patch });
    if (bad.length) failed.push(`${row.arCode}: cascade ไม่ผ่านที่ ${bad.join(', ')}`);
  }
  ok += 1;
}
console.log(`\nแยกสำเร็จ ${ok} ราย · ล้ม ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
