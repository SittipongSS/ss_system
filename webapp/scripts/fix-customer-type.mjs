// ── แก้ประเภทลูกค้าที่ตั้งผิด (บุคคลธรรมดา ↔ นิติบุคคล) ──────────────────
//
// ⭐ ที่มา (มติผู้ใช้ 2026-08-27): สแกนทะเบียน 507 ราย เจอ 12 รายที่ `customerType`
// ขัดกับหลักฐานในแถวตัวเอง — เลข 13 หลักขึ้นต้น '0' = เลขทะเบียนนิติบุคคล ·
// ขึ้นต้น '1'–'8' = เลขบัตรประชาชน · และตัวชื่อก็บอกอีกทาง
// ขึ้นลิสต์เฉพาะรายที่หลักฐาน **ไม่ขัดกันเอง** (เลขกับชื่อชี้ทางเดียวกัน)
//
// ประเภทมีผลจริง 3 อย่าง: ชุดเอกสารแนบที่บังคับ · ป้ายในฟอร์ม ("เลขผู้เสียภาษี"
// vs "เลขประจำตัวประชาชน") · ช่องคำนำหน้าชื่อที่โผล่เฉพาะบุคคล (mig 0296)
//
// ── ทำไม **ไม่** รีเซ็ตสถานะอนุมัติ ────────────────────────────────────
// แก้ผ่าน API ปกติ `customerType` ไม่อยู่ในชุดยกเว้น ⇒ ลูกค้าที่อนุมัติแล้วจะเด้ง
// กลับเป็น pending และ **หลุดจากทุก picker ทันที** (GET กรองเฉพาะ approved)
// เหตุผลของกฎนั้นคือ "ชุดเอกสารที่บังคับเปลี่ยน ต้องตรวจใหม่" — แต่วัดจริงแล้ว
// ทั้ง 5 รายที่อนุมัติอยู่ **ไม่มีเอกสารบังคับครบตั้งแต่ก่อนแก้อยู่แล้ว** (4 ราย
// ไม่มีไฟล์แนบเลย) ⇒ รีเซ็ตไม่ได้อะไรเพิ่ม มีแต่ทำให้งานที่เดินอยู่สะดุด
// (AR-657 มีใบเสนอราคา/ใบสั่งขาย 4 ใบ + ดีล/โครงการ 3)
// ⇒ ตัวนี้เป็น **การแก้ข้อมูลที่กรอกผิด** ไม่ใช่การเปลี่ยนตัวตนลูกค้า จึงคงสถานะไว้
//
// ⚠️ ชื่อ (`name`) ไม่ขยับ ⇒ ไม่ต้อง cascade และเอกสารที่ออกไปแล้วไม่กระทบ
//
// Usage:
//   node --import ./scripts/test-loader.mjs scripts/fix-customer-type.mjs
//   node --import ./scripts/test-loader.mjs scripts/fix-customer-type.mjs --commit
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { customerDocTypes } from '@/lib/master/attachmentTypes';

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

// รหัส → ประเภทที่ถูก (ยืนยันโดยผู้ใช้ 2026-08-27 จาก customer-type-check.csv)
const FIXES = {
  // เลขขึ้นต้น '0' = เลขทะเบียนนิติบุคคล · 7 ใน 8 ชื่อบอกชัด (มหาวิทยาลัย/คณะ/โครงการ/บริษัท)
  'AR-114': 'company',
  'AR-405': 'company',
  'AR-420': 'company',   // BARABARA — บริษัทสวีเดน ตัดสินจากเลขล้วน (ชื่อไม่มีคำบอก)
  'AR-550': 'company',
  'AR-557': 'company',
  'AR-587': 'company',
  'AR-624': 'company',
  'AR-736': 'company',
  // เลขขึ้นต้น '1' = เลขบัตรประชาชน + ชื่อมีคำนำหน้าบุคคล
  'AR-657': 'individual',
  'AR-711': 'individual',
  'AR-873': 'individual',
  'AR-886': 'individual',
};

/* ไฟล์แนบที่ประเภทเอกสารผูกกับ "ประเภทลูกค้า" ฝั่งเดิม — ต้องย้ายคีย์ตามไปด้วย
   ไม่งั้นไฟล์ยังอยู่ในฐานแต่ **หายจากหน้าลูกค้า** เพราะจอวาดการ์ดจาก
   customerDocTypes(ประเภทใหม่) ซึ่งไม่มีคีย์เดิมอยู่ในชุด
   AR-886 เป็นบุคคล ไฟล์ที่แนบไว้คือบัตรประชาชนของเจ้าตัว ไม่ใช่ของ "กรรมการ" */
const DOC_RETAG = { 'AR-886': { from: 'director_id_card', to: 'id_card' } };

const codes = Object.keys(FIXES);
const { data: rows, error } = await supabase
  .from('customers').select('id,arCode,name,taxId,customerType,approvalStatus').in('arCode', codes);
if (error) { console.error(error.message); process.exit(1); }

const found = new Set(rows.map((r) => r.arCode));
const missing = codes.filter((c) => !found.has(c));
if (missing.length) console.log(`⚠ ไม่พบรหัส: ${missing.join(', ')}`);

const plan = rows.filter((r) => r.customerType !== FIXES[r.arCode]);
console.log(`ต้องแก้ ${plan.length} ราย (จาก ${rows.length} ที่หาเจอ)\n`);
for (const r of plan) {
  const next = FIXES[r.arCode];
  const label = (t) => (t === 'individual' ? 'บุคคลธรรมดา' : 'นิติบุคคล');
  console.log(`  ${r.arCode}  ${label(r.customerType)} -> ${label(next)}   [${r.approvalStatus}]  ${r.name}`);
  const before = customerDocTypes(r.customerType).filter((d) => d.required).map((d) => d.key);
  const after = customerDocTypes(next).filter((d) => d.required).map((d) => d.key);
  console.log(`     เอกสารบังคับ: ${before.join(', ')}  ->  ${after.join(', ')}`);
  const retag = DOC_RETAG[r.arCode];
  if (retag) console.log(`     ย้ายคีย์ไฟล์แนบ: ${retag.from} -> ${retag.to}`);
}
console.log('\nℹ สถานะอนุมัติคงเดิมทุกราย (เหตุผลอยู่ที่หัวไฟล์) · ชื่อไม่ขยับ จึงไม่ต้อง cascade');

if (!commit) { console.log('\n[dry-run] ยังไม่เขียนอะไร — ใส่ --commit เพื่อเขียนจริง'); process.exit(0); }

let ok = 0;
const failed = [];
for (const r of plan) {
  const { error: upErr } = await supabase.from('customers')
    .update({ customerType: FIXES[r.arCode] }).eq('id', r.id);
  if (upErr) { failed.push(`${r.arCode}: ${upErr.message}`); continue; }
  const retag = DOC_RETAG[r.arCode];
  if (retag) {
    const { error: tagErr } = await supabase.from('attachments')
      .update({ docType: retag.to })
      .eq('entityType', 'customer').eq('entityId', r.id).eq('docType', retag.from);
    if (tagErr) failed.push(`${r.arCode}: ย้ายคีย์ไฟล์แนบไม่สำเร็จ — ${tagErr.message}`);
  }
  ok += 1;
}
console.log(`\nแก้สำเร็จ ${ok} ราย · ล้ม ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
