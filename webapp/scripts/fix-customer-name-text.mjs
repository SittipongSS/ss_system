// ── ล้างตัวอักษร/เว้นวรรคของชื่อลูกค้าในทะเบียน ──────────────────────────
//
// ⭐ ที่มา (2026-08-27): ตอนเทียบทะเบียนกับชีทระบบบัญชีเก่า 49 รายชื่อไม่ตรงกัน
// พอแยกดูแล้วส่วนใหญ่ **ไม่ใช่คนละชื่อ** แต่เป็นตัวอักษร/เว้นวรรคเพี้ยนฝั่งทะเบียน
//
// สิ่งที่แก้ (แก้เฉพาะรูปตัวอักษร ไม่แตะคำ):
//   1. สระอำแยกร่าง — `จํากัด` (U+0E4D นิคหิต + U+0E32 สระอา) → `จำกัด` (U+0E33)
//      พิมพ์ออกมาหน้าตาเหมือนกันเป๊ะ แต่เป็นคนละสตริง ⇒ ค้นหา/เทียบชื่อพลาดเงียบ ๆ
//      🪤 `unicodedata.normalize('NFC')` **ไม่ได้ประกอบกลับให้** และ NFKC ยิ่งแย่ —
//         มันแตก U+0E33 เป็นสองตัวเพิ่มอีก ต้องแทนที่ตรง ๆ เท่านั้น
//   2. `เเ` (สระเอ สองตัว) → `แ` (สระแอ) — พิมพ์เหมือนกัน คนละอักขระ
//   3. ช่องว่างซ้ำ · ช่องว่างหัว/ท้าย · NBSP · ZWSP · ระยะรอบวงเล็บ
//      ("จำกัด(มหาชน)" → "จำกัด (มหาชน)" · "( สำนักงานใหญ่ )" → "(สำนักงานใหญ่)")
//
// ⚠️ **ไม่ถอดคำว่า (สำนักงานใหญ่) ออก** — มติผู้ใช้ 2026-08-27: ถ้าชื่อมีคำนี้อยู่
// แปลว่าคนกรอกตั้งใจใส่ ที่ผิดคือการเว้นวรรค ไม่ใช่ตัวคำ
// (คนละเรื่องกับคำเตือน customerNameBranchWarning ซึ่งเตือนอย่างเดียว ไม่บล็อก)
//
// ⚠️ ต้อง cascade ชื่อไปตารางโหมด 'live' ทุกตาราง (ดู lib/master/customerNameMirrors)
// ไม่งั้นดีล/โครงการ/ทะเบียนสรรพสามิตจะค้างชื่อเก่าถาวร · ตารางโหมด 'frozen'
// (ใบเสนอราคา/ใบสั่งขาย) **ไม่แตะ** — เอกสารที่ออกไปแล้วต้องนิ่ง อยากได้ชื่อใหม่ต้องออก Rev.
//
// Usage:
//   node --import ./scripts/test-loader.mjs scripts/fix-customer-name-text.mjs
//   node --import ./scripts/test-loader.mjs scripts/fix-customer-name-text.mjs --commit
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
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
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── ตัวล้างข้อความ: ย้ายไปอยู่ lib แล้ว (09/11) ให้ตอนบันทึกลูกค้าใช้ตัวเดียวกัน ──
// ⚠️ ห้ามก๊อปกลับมาเขียนในสคริปต์อีก — สองฝั่งเพี้ยนกันเมื่อไร ลูกค้าที่สคริปต์ล้างแล้ว
// จะถูก PATCH ตีความว่า "ชื่อเปลี่ยน" แล้วดีดกลับไปรออนุมัติตอนบันทึกครั้งถัดไป
//
// 09/11/2026 (AR-1056 "บริษัท␣␣กข168 จำกัด␣"): รอบสอง — ถอดชุด BILINGUAL ของรอบ 27/08
// ออกแล้ว (ใส่ไปครบตั้งแต่วันนั้น ถ้าคงไว้ สคริปต์จะเขียนทับชื่อที่คนแก้หลังจากนั้น) ·
// ล้างครบสี่ช่อง name/nameEn/nameTitle/namePerson · อ่านเป็นหน้า · --commit เก็บสำรอง
// ค่าเดิมลง ~/ss-team/archive ก่อนเขียน (ไม่มีถังขยะ กู้ได้จากไฟล์นี้กับ audit เท่านั้น)
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { CUSTOMER_NAME_TEXT_FIELDS, tidyCustomerNameText } from '@/lib/master/customerName';

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, "arCode", name, "nameEn", "nameTitle", "namePerson", "taxId"')
    .order('id')
    .range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const changes = [];
for (const row of rows) {
  const patch = {};
  for (const key of CUSTOMER_NAME_TEXT_FIELDS) {
    if (typeof row[key] !== 'string') continue;
    const next = tidyCustomerNameText(row[key]);
    if (next !== row[key]) patch[key] = next;
  }
  if (Object.keys(patch).length) changes.push({ row, patch });
}

console.log(`ทะเบียน ${rows.length} ราย · ต้องแก้ ${changes.length} ราย\n`);
for (const { row, patch } of changes) {
  console.log(`  ${row.arCode}`);
  for (const [key, next] of Object.entries(patch)) {
    console.log(`     ${key.padEnd(10)}: ${JSON.stringify(row[key])}\n                 -> ${JSON.stringify(next)}`);
  }
}

if (!commit) { console.log('\n[dry-run] ยังไม่เขียนอะไร — ใส่ --commit เพื่อเขียนจริง'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const backup = `${homedir()}/ss-team/archive/customer-name-tidy-backup-${stamp}.json`;
writeFileSync(backup, JSON.stringify(changes.map(({ row, patch }) => ({ id: row.id, arCode: row.arCode, before: row, patch })), null, 1));
console.log(`\nสำรองค่าเดิม ${changes.length} ราย → ${backup}`);

let ok = 0;
const failed = [];
for (const { row, patch } of changes) {
  // อัปเดตตรงที่ฐาน ไม่ผ่าน PATCH — แก้รูปตัวอักษรไม่ใช่การแก้ข้อมูล ไม่ควรดีดไปรออนุมัติ
  const { error: upErr } = await supabase.from('customers').update(patch).eq('id', row.id);
  if (upErr) { failed.push(`${row.arCode}: ${upErr.message}`); continue; }
  // สำเนาชื่อในตารางโหมด live ต้องเดินตามทันที · 🪤 payload ต้องมี taxId ครบ
  // (excise_registrations เขียน taxId จากก้อนนี้ — ขาดไป = ล้างเลขภาษีทิ้ง)
  const bad = await cascadeCustomerName(supabase, row.id, { ...row, ...patch });
  if (bad.length) failed.push(`${row.arCode}: cascade ไม่ผ่านที่ ${bad.join(', ')}`);
  ok += 1;
}
console.log(`\nแก้สำเร็จ ${ok} ราย · มีปัญหา ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
