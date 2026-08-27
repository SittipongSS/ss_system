// ── นำเข้าลูกค้าจากชีทระบบเก่า → customers (สถานะ pending) ────────────────
//
// ที่มา: Google Sheet "รายละเอียดลูกค้า AR" แท็บ "ลูกค้า (ตาราง)" 512 ราย ที่
// export ออกมาเป็น CSV แล้วคัดเฉพาะแถวที่ไม่มีข้อทักท้วง (คอลัมน์ `_note` ว่าง)
// และยังไม่มี arCode นั้นในระบบ (คอลัมน์ `_inDb` ว่าง)
//
// ⭐ **เข้าเป็น pending เสมอ** — ข้อมูลชุดนี้ยังไม่มีใครตรวจ (เลขภาษี/สาขา/ที่อยู่
// มาจากระบบบัญชีเก่า) จึงต้องผ่านหน้าอนุมัติทะเบียนลูกค้าก่อนใช้งานจริง
// สาย GET ปกติกรองเฉพาะ approved อยู่แล้ว ⇒ ของชุดนี้จะยังไม่โผล่ใน picker ไหน
//
// ⭐ **ประกอบที่อยู่ผ่าน normalizeAddresses/legacyAddressMirror ของแอปเอง** ไม่ได้
// เขียน jsonb มือ — กติกาเรื่องกระจก (address/shippingAddress/branchCode) กับ
// การประกอบข้อความไทยจากฟิลด์ย่อยจะได้ไม่แตกจากที่ฟอร์มทำ
//
// ⭐ ทุกแถวปั๊ม metadata.importBatch ไว้ ⇒ ย้อนกลับได้ด้วยคำสั่งเดียว:
//    delete from customers where metadata->>'importBatch' = '<batch>';
//
// Usage:
//   node --import ./scripts/test-loader.mjs scripts/import-customers-from-sheet.mjs <file.csv>
//   node --import ./scripts/test-loader.mjs scripts/import-customers-from-sheet.mjs <file.csv> --commit
// (ต้องใช้ test-loader เพราะ lib ฝั่งแอป import ด้วย alias '@/…')
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import DATA from '../src/data/thaiAdmin.js';
import { buildAddressIndex, parseThaiAddress } from '@/lib/master/thaiAddress';
import { legacyAddressMirror, normalizeAddresses } from '@/lib/master/addresses';
import { taxIdDigits } from '@/lib/master/customerTaxId';

// --- tiny .env.local loader (no dependency) ---
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

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const csvPath = args.find((a) => !a.startsWith('--'));
if (!csvPath) {
  console.error('Usage: import-customers-from-sheet.mjs <file.csv> [--commit]');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const index = buildAddressIndex(DATA);

// ── CSV reader (รองรับ quote + newline ในเซลล์) ───────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

const raw = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const table = parseCsv(raw);
const header = table[0].map((h) => h.trim());
const records = table.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));

// เกณฑ์คัด: ไม่มีข้อทักท้วง + ยังไม่มีรหัสนี้ในระบบ
const picked = records.filter((r) => !r._note && !r._inDb);
const skippedNote = records.filter((r) => r._note).length;
const skippedInDb = records.filter((r) => !r._note && r._inDb).length;

// เวลาไทยสำหรับป้ายกำกับชุดนำเข้า (ตัว timestamptz เก็บเป็น UTC ตามปกติ)
const now = new Date();
const bangkok = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);
const batch = `sheet-ar-${bangkok}`;
const nowIso = now.toISOString();

// ── ประกอบแถวลูกค้า ──────────────────────────────────────────────────────
function buildAddressRow(rec) {
  const parts = {
    line1: rec.addrLine1,
    subdistrict: rec.subdistrict,
    district: rec.district,
    province: rec.province,
    postcode: rec.postcode,
  };
  // เติมรหัสตำบล/อำเภอ/จังหวัด จากทะเบียนกรมการปกครอง (เหมือน backfill-address-structure):
  // ป้อนข้อความที่อยู่เต็มให้ parser แล้วเก็บเฉพาะ *รหัส* ที่จับได้ — ตัวข้อความยังใช้
  // ของที่แยกมาจากชีทตามเดิม ไม่ให้ parser มาเขียนทับชื่อที่คนกรอกไว้
  // ⚠️ ป้อน `address` (ข้อความเต็มที่มีคำว่า ตำบล/อำเภอ/จังหวัด) ไม่ใช่ชื่อเปล่า ๆ
  // ต่อกัน — parser จับระดับจากคำนำหน้า ถ้าไม่มีจะคืนรหัสว่างทั้งชุด
  const parsed = parseThaiAddress(rec.address, index).parts;
  if (parsed?.provinceCode) {
    parts.provinceCode = parsed.provinceCode;
    if (parsed.districtCode) parts.districtCode = parsed.districtCode;
    if (parsed.subdistrictCode) parts.subdistrictCode = parsed.subdistrictCode;
  }
  return {
    ...parts,
    label: 'ที่อยู่ออกเอกสาร',
    branchCode: rec.branchCode,
    useFor: 'both',
    // ⭐ ตรึงข้อความตามที่ระบบเก่าพิมพ์ไว้ ไม่ให้ตัวประกอบเขียนใหม่ — เอกสารเก่าที่
    // อ้างลูกค้ารายนี้ต้องอ่านที่อยู่ได้เหมือนเดิมทุกตัวอักษร (กติกาเดียวกับ
    // backfill-address-structure) · คนตรวจกดปิดทีละรายได้ที่ฟอร์ม
    address: rec.address,
    addressOverride: true,
  };
}

const rowsToInsert = [];
const problems = [];
for (const rec of picked) {
  const addresses = normalizeAddresses([buildAddressRow(rec)]);
  const mirror = legacyAddressMirror(addresses, { fallbackBranchCode: rec.branchCode });
  if (!mirror.address) { problems.push(`${rec.arCode}: ประกอบที่อยู่ไม่ได้`); continue; }
  const contacts = (rec.contactPerson || rec.contactPhone)
    ? [{ name: rec.contactPerson || '', phone: rec.contactPhone || '', email: '' }]
    : [];
  const primary = contacts[0] || {};
  rowsToInsert.push({
    id: `CUS-${randomUUID()}`,
    arCode: rec.arCode,
    name: rec.name || null,
    nameEn: rec.nameEn || null,
    taxId: taxIdDigits(rec.taxId) || null,
    customerType: rec.customerType === 'individual' ? 'individual' : 'company',
    addresses,
    branchCode: mirror.branchCode,
    address: mirror.address,
    shippingAddress: mirror.shippingAddress,
    phone: null,
    brands: [],
    isActive: true,
    contacts,
    contactPerson: primary.name || null,
    contactPhone: primary.phone || null,
    email: primary.email || null,
    creditTerms: rec.creditTerms || null,
    // ร่องรอยที่มา — ใช้ย้อนกลับทั้งชุด และให้คนตรวจรู้ว่าแถวนี้ยังไม่มีใครดู
    metadata: {
      importBatch: batch,
      importSource: 'google-sheet:ลูกค้า (ตาราง)',
      legacySalesCode: rec.salesCode || null,   // SA0xx — ยังไม่มีตารางแมปเป็น user id
      legacyPriceType: rec.priceType || null,
      legacyCreditLimit: rec.creditLimit || null,
      legacyGlAccount: rec.glAccount || null,
    },
    // ไม่มีเจ้าของ/ทีม — สคริปต์ไม่ได้รันในนามใคร คนอนุมัติเป็นคนกำหนดทีมตอนตรวจ
    team: null,
    teams: [],
    ownerId: null,
    approvalStatus: 'pending',
    submittedBy: null,
    submittedByName: 'นำเข้าจากทะเบียนลูกค้าระบบเก่า',
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    createdAt: nowIso,
  });
}

console.log(`อ่าน CSV: ${records.length} แถว`);
console.log(`  ข้าม (มีข้อทักท้วง _note): ${skippedNote}`);
console.log(`  ข้าม (รหัสมีในระบบแล้ว):   ${skippedInDb}`);
console.log(`  เตรียมนำเข้า:              ${rowsToInsert.length}`);
const noCode = rowsToInsert.filter((r) => !r.addresses[0]?.provinceCode);
console.log(`  ในนั้น จับรหัสจังหวัดไม่ได้ (ตัวข้อความยังใช้ได้ปกติ): ${noCode.length}`);
if (noCode.length) console.log(`   ${noCode.map((r) => r.arCode).join(' ')}`);
if (problems.length) console.log(`  ประกอบไม่ผ่าน: ${problems.length}\n   ${problems.join('\n   ')}`);
console.log(`  batch: ${batch}`);

const sample = rowsToInsert[0];
if (sample) {
  console.log('\nตัวอย่างแถวแรก:');
  console.log(JSON.stringify({
    arCode: sample.arCode, name: sample.name, taxId: sample.taxId,
    branchCode: sample.branchCode, address: sample.address,
    addresses: sample.addresses, customerType: sample.customerType,
    approvalStatus: sample.approvalStatus,
  }, null, 2));
}

if (!commit) {
  console.log('\n[dry-run] ยังไม่เขียนอะไร — ใส่ --commit เพื่อเขียนจริง');
  process.exit(0);
}

// ── เขียนจริง ทีละก้อน ────────────────────────────────────────────────────
// ก้อนละ 50 เพื่อให้แถวที่ชน unique ไม่ล้มทั้ง 300 แถว และเห็นว่าล้มก้อนไหน
const SIZE = 50;
let ok = 0;
const failed = [];
for (let i = 0; i < rowsToInsert.length; i += SIZE) {
  const chunk = rowsToInsert.slice(i, i + SIZE);
  const { error } = await supabase.from('customers').insert(chunk);
  if (error) {
    // ก้อนล้ม → ลองรายตัวเพื่อแยกว่าตัวไหนผิด แถวที่ดีจะได้เข้าให้ครบ
    for (const row of chunk) {
      const { error: one } = await supabase.from('customers').insert(row);
      if (one) failed.push(`${row.arCode}: ${one.message}`);
      else ok += 1;
    }
  } else ok += chunk.length;
  console.log(`  ...${Math.min(i + SIZE, rowsToInsert.length)}/${rowsToInsert.length}`);
}

console.log(`\nเขียนสำเร็จ ${ok} แถว · ล้ม ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
console.log(`\nย้อนกลับทั้งชุด: delete from customers where metadata->>'importBatch' = '${batch}';`);
