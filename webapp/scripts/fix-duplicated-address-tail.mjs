// ── ล้าง "หางซ้ำ" ในข้อความที่อยู่ที่ค้างอยู่ในฐานข้อมูล ──────────────────
//
// อาการ: ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ถูกพิมพ์สองรอบต่อกัน
//   "55 ซอยทุ่งมังกร 1 … แขวงฉิมพลี เขตตลิ่งชัน กรุงเทพมหานคร 10170 แขวงฉิมพลี เขตตลิ่งชัน กรุงเทพมหานคร 10170"
//
// เหตุ: คนวางที่อยู่ **ทั้งก้อน** ลงช่อง `line1` (ตอนกด "เพิ่มที่อยู่" ช่องนั้นคือช่อง
// ที่อยู่ช่องเดียวที่เห็น) แล้วค่อยเลือกจังหวัด/อำเภอ/ตำบล ⇒ composeThaiAddress ต่อหาง
// ให้อีกรอบ · ตัวโค้ดปิดรูแล้ว (ดู tailAlreadyEnds ใน lib/master/thaiAddress.js) แต่
// ข้อความที่ถูกบันทึกไปแล้วยังค้างอยู่ — สคริปต์นี้เก็บกวาดของค้าง
//
// ⭐ ด่านความปลอดภัย: เขียนเฉพาะแถวที่ค่าใหม่เป็น **คำนำหน้าแท้** ของค่าเดิม
// (เดิม = ใหม่ + หางที่เกินมา) ⇒ แตะได้แค่ที่อยู่ที่ซ้ำจริง ไม่มีทางไปเขียนที่อยู่
// อื่นทับ แม้กติกาการประกอบข้อความจะเปลี่ยนไปอีกในอนาคต
//
// ⚠️ ไม่แตะเอกสารที่ออกไปแล้ว: snapshot บนใบเสนอราคาเป็นหลักฐานการค้า (และเป็น
// ส่วนหนึ่งของ contentFingerprint ฉบับที่ตรึง) — แก้เฉพาะใบที่ยังเป็น **ร่างที่ยัง
// ไม่ยื่น** เท่านั้น ใบที่ส่ง/รับแล้วรายงานให้คนตัดสินใจออก Rev. เอง
//
// Usage (ต้องรันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src):
//   node --import ./scripts/test-loader.mjs scripts/fix-duplicated-address-tail.mjs
//   node --import ./scripts/test-loader.mjs scripts/fix-duplicated-address-tail.mjs --commit
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { addressText, addressTextEn } from '../src/lib/master/addresses.js';

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

const short = (v) => String(v || '').replace(/\s+/g, ' ').slice(0, 88);

// ค่าใหม่ "กินได้" ก็ต่อเมื่อของเดิมคือค่าใหม่ + ส่วนเกิน (= หางที่ซ้ำ) เท่านั้น
const isDuplicateOf = (stored, next) => {
  const a = String(stored || '').trim();
  const b = String(next || '').trim();
  return !!b && a !== b && a.startsWith(b);
};

async function fixCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, addresses')
    .order('createdAt', { ascending: true });
  if (error) { console.error('✗ load customers:', error.message); process.exit(1); }

  let rowsFixed = 0;
  let written = 0;
  console.log('\n── ทะเบียนลูกค้า ──────────────────────────────────────────');
  for (const customer of data || []) {
    const rows = Array.isArray(customer.addresses) ? customer.addresses : [];
    if (!rows.length) continue;
    let touched = false;

    const next = rows.map((row) => {
      const patch = {};
      const th = addressText(row);
      const en = addressTextEn(row);
      if (isDuplicateOf(row.address, th)) patch.address = th;
      if (isDuplicateOf(row.addressEn, en)) patch.addressEn = en;
      if (!Object.keys(patch).length) return row;
      touched = true;
      rowsFixed += 1;
      console.log(`  · ${customer.name}`);
      if (patch.address) {
        console.log(`      เดิม: ${short(row.address)}`);
        console.log(`      ใหม่: ${short(patch.address)}`);
      }
      if (patch.addressEn) {
        console.log(`      เดิม(EN): ${short(row.addressEn)}`);
        console.log(`      ใหม่(EN): ${short(patch.addressEn)}`);
      }
      return { ...row, ...patch };
    });

    if (!touched || !commit) continue;
    const { error: updateError } = await supabase
      .from('customers').update({ addresses: next }).eq('id', customer.id);
    if (updateError) console.error(`  ✗ ${customer.name}: ${updateError.message}`);
    else written += 1;
  }
  console.log(`  แถวที่อยู่ที่ต้องแก้: ${rowsFixed}${commit ? ` · บันทึกแล้ว ${written} ราย` : ''}`);
  return rowsFixed;
}

// ใบเสนอราคาถือ **ข้อความ** ที่ตรึงไว้ตอนออกใบ ไม่ได้อ่านสดจากทะเบียน ⇒ แก้ทะเบียน
// แล้วใบเดิมยังพิมพ์หางซ้ำอยู่ · ที่อยู่ใหม่ต้องเอามาจากทะเบียนของลูกค้ารายนั้น
async function fixQuotations() {
  const { data: quotes, error } = await supabase
    .from('quotations')
    .select('id, quoteNumber, status, approvalStatus, customerId, billingAddress, shippingAddress')
    .order('createdAt', { ascending: true });
  if (error) { console.error('✗ load quotations:', error.message); process.exit(1); }

  const { data: customers } = await supabase.from('customers').select('id, addresses');
  const cleanTexts = new Set();
  for (const c of customers || []) {
    for (const row of (Array.isArray(c.addresses) ? c.addresses : [])) {
      const th = addressText(row);
      const en = addressTextEn(row);
      if (th) cleanTexts.add(th.trim());
      if (en) cleanTexts.add(en.trim());
    }
  }
  // ข้อความที่ถูกต้องของแต่ละใบ = ตัวที่เป็นคำนำหน้าของข้อความบนใบ (ยาวสุดที่เข้าเงื่อนไข)
  const cleanOf = (stored) => [...cleanTexts]
    .filter((t) => isDuplicateOf(stored, t))
    .sort((a, b) => b.length - a.length)[0] || null;

  const editable = [];
  const frozen = [];
  for (const q of quotes || []) {
    const patch = {};
    for (const field of ['billingAddress', 'shippingAddress']) {
      const clean = q[field] ? cleanOf(q[field]) : null;
      if (clean) patch[field] = clean;
    }
    if (!Object.keys(patch).length) continue;
    // "ร่างที่ยังไม่ยื่น" คือขั้นเดียวที่เนื้อหาใบยังไม่เป็นหลักฐาน (mig 0155)
    (q.status === 'draft' && q.approvalStatus === 'not_submitted' ? editable : frozen).push({ q, patch });
  }

  console.log('\n── ใบเสนอราคา ─────────────────────────────────────────────');
  console.log(`  ร่างที่ยังไม่ยื่น (แก้ได้): ${editable.length}`);
  for (const { q, patch } of editable) {
    console.log(`  · ${q.quoteNumber}`);
    console.log(`      เดิม: ${short(q.billingAddress)}`);
    console.log(`      ใหม่: ${short(patch.billingAddress || q.billingAddress)}`);
    if (!commit) continue;
    const { error: updateError } = await supabase.from('quotations').update(patch).eq('id', q.id);
    if (updateError) console.error(`  ✗ ${q.quoteNumber}: ${updateError.message}`);
  }

  console.log(`\n  ⚠️ ยื่น/ส่ง/รับแล้ว — ไม่แตะ ต้องออก Rev. เองถ้าจะแก้: ${frozen.length}`);
  for (const { q } of frozen) console.log(`  · ${q.quoteNumber} [${q.status}] ${short(q.billingAddress)}`);
  return { editable: editable.length, frozen: frozen.length };
}

const customerRows = await fixCustomers();
const quoteResult = await fixQuotations();

console.log(`\n${commit ? '✓ เขียนจริงแล้ว' : '• ทดลอง (dry-run) — ยังไม่เขียนอะไรลงฐานข้อมูล'}`);
console.log(`  ที่อยู่ในทะเบียนลูกค้า: ${customerRows} แถว`);
console.log(`  ใบเสนอราคาที่แก้ได้:   ${quoteResult.editable} ใบ`);
console.log(`  ใบที่ต้องออก Rev. เอง:  ${quoteResult.frozen} ใบ`);
if (!commit) console.log('\nรันจริงด้วย: node --import ./scripts/test-loader.mjs scripts/fix-duplicated-address-tail.mjs --commit');
