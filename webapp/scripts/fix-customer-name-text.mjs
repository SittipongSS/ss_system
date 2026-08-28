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

// ── ตัวล้างข้อความ ───────────────────────────────────────────────────────
const SARA_AM_SPLIT = /ํา/g;   // ํ + า  → ำ
const SARA_E_DOUBLE = /เเ/g;   // เ + เ  → แ
export function tidyName(value) {
  let s = String(value ?? '').normalize('NFC');
  s = s.replace(SARA_AM_SPLIT, 'ำ').replace(SARA_E_DOUBLE, 'แ');
  s = s.replace(/ /g, ' ').replace(/[​‌‍﻿]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');  // ( x ) → (x)
  s = s.replace(/(\S)\(/g, '$1 (');                     // จำกัด(มหาชน) → จำกัด (มหาชน)
  return s;
}

// ── ชื่อสองภาษา: ทะเบียนเก็บไทยที่ `name` อังกฤษที่ `nameEn` (mig 0283) ──
// สามรายนี้ทะเบียนกับชีทเป็นคนละภาษาของบริษัทเดียวกัน ⇒ เก็บทั้งคู่ ไม่ต้องเลือก
// (มติผู้ใช้ 2026-08-27) · ชื่อไทยที่ยังไม่มีในทะเบียนหยิบมาจากชีท
const BILINGUAL = {
  'AR-306': { name: 'บริษัท เคพี อาร์ท เซ็นเตอร์ (ประเทศไทย) จำกัด (สำนักงานใหญ่)', nameEn: 'KP ART CENTER (THAILAND) COMPANY LIMITED' },
  'AR-316': { name: 'บริษัท ไอ คอนโด ภูเก็ต จำกัด', nameEn: 'iCondo Phuket Co.,Ltd' },
  'AR-609': { name: 'บริษัท เอนคอมพาส จำกัด', nameEn: 'Encompass Co., Ltd.' },
};

const { data: rows, error } = await supabase
  .from('customers').select('id,arCode,name,nameEn,taxId').limit(2000);
if (error) { console.error(error.message); process.exit(1); }

const changes = [];
for (const row of rows) {
  const patch = {};
  const forced = BILINGUAL[row.arCode];
  const nextName = tidyName(forced?.name ?? row.name);
  if (nextName !== (row.name ?? '')) patch.name = nextName;
  if (forced?.nameEn) {
    const nextEn = tidyName(forced.nameEn);
    if (nextEn !== (row.nameEn ?? '')) patch.nameEn = nextEn;
  }
  if (Object.keys(patch).length) changes.push({ row, patch });
}

console.log(`ทะเบียน ${rows.length} ราย · ต้องแก้ ${changes.length} ราย\n`);
for (const { row, patch } of changes) {
  console.log(`  ${row.arCode}`);
  if (patch.name) console.log(`     ชื่อ  : ${JSON.stringify(row.name)}\n          -> ${JSON.stringify(patch.name)}`);
  if (patch.nameEn) console.log(`     อังกฤษ: ${JSON.stringify(row.nameEn)} -> ${JSON.stringify(patch.nameEn)}`);
}

if (!commit) { console.log('\n[dry-run] ยังไม่เขียนอะไร — ใส่ --commit เพื่อเขียนจริง'); process.exit(0); }

let ok = 0;
const failed = [];
for (const { row, patch } of changes) {
  const { error: upErr } = await supabase.from('customers').update(patch).eq('id', row.id);
  if (upErr) { failed.push(`${row.arCode}: ${upErr.message}`); continue; }
  // สำเนาชื่อในตารางโหมด live ต้องเดินตามทันที (ดูเหตุผลที่หัว customerNameMirrors)
  const bad = await cascadeCustomerName(supabase, row.id, { ...row, ...patch });
  if (bad.length) failed.push(`${row.arCode}: cascade ไม่ผ่านที่ ${bad.join(', ')}`);
  ok += 1;
}
console.log(`\nแก้สำเร็จ ${ok} ราย · มีปัญหา ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
