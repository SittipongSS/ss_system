// ── แยกที่อยู่ลูกค้าที่เป็นข้อความก้อนเดียว → ฟิลด์ย่อย (จังหวัด/อำเภอ/ตำบล) ──
//
// ทำไมไม่ทำใน migration 0217: ต้องเทียบกับทะเบียนกรมการปกครอง 7,452 ตำบล ซึ่งอยู่
// ในโค้ด (src/data/thaiAdmin.js) ไม่ใช่ในฐานข้อมูล
//
// ⭐ **ไม่แตะข้อความที่พิมพ์ลงเอกสาร**: เขียนเฉพาะฟิลด์ย่อย + ตั้ง addressOverride
// = true เพื่อให้ `address` เดิมถูกใช้ตามเดิมเป๊ะทุกตัวอักษร ⇒ ไม่มีใบไหนเปลี่ยน
// หน้าตาเพราะสคริปต์นี้ · ผู้ใช้ค่อยกดปิด "พิมพ์ข้อความเอง" ทีละรายเมื่อพร้อมให้
// ระบบประกอบข้อความให้ (เห็นผลก่อนบันทึกที่ฟอร์ม)
//
// เกณฑ์: เขียนเฉพาะแถวที่จับ **จังหวัดได้** เท่านั้น · แถวที่จับได้ไม่ครบทุกระดับ
// ยังเขียน (จังหวัดอย่างเดียวก็ต่อยอดรายงานได้แล้ว) แต่รายงานแยกให้เห็นว่าอันไหน
// ต้องให้คนดู
//
// Usage:
//   node scripts/backfill-address-structure.mjs            # dry-run (ค่าตั้งต้น)
//   node scripts/backfill-address-structure.mjs --commit   # เขียนจริง
// อ่าน SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY จาก .env.local (หรือ env)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import DATA from '../src/data/thaiAdmin.js';
import { buildAddressIndex, parseThaiAddress } from '../src/lib/master/thaiAddress.js';

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

const commit = process.argv.includes('--commit');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const index = buildAddressIndex(DATA);

const stats = { customers: 0, rows: 0, full: 0, partial: 0, skipped: 0, written: 0 };
const review = [];

async function main() {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, addresses')
    .order('createdAt', { ascending: true });
  if (error) { console.error('✗ load customers:', error.message); process.exit(1); }

  for (const customer of customers || []) {
    const rows = Array.isArray(customer.addresses) ? customer.addresses : [];
    if (!rows.length) continue;
    let touched = false;

    const next = rows.map((row) => {
      // แถวที่แยกไว้แล้ว (มีจังหวัด) หรือไม่มีข้อความให้แยก → ข้าม
      if (row?.province || !String(row?.address || '').trim()) return row;
      stats.rows += 1;

      const { parts, matched } = parseThaiAddress(row.address, index);
      if (!parts || !matched.province) {
        stats.skipped += 1;
        review.push({ customer: customer.name, address: row.address, reason: 'จับจังหวัดไม่ได้' });
        return row;
      }

      // รหัสไปรษณีย์ที่ได้จาก **ตำบล** ถือว่าครบแล้ว — ที่อยู่จำนวนมากไม่เขียนรหัส
      // ไปรษณีย์ไว้เลย และรหัสจากทะเบียนตำบลน่าเชื่อถือกว่าที่คนพิมพ์เองด้วยซ้ำ
      const complete = matched.district && matched.subdistrict && !!parts.postcode;
      if (complete) stats.full += 1;
      else {
        stats.partial += 1;
        review.push({
          customer: customer.name,
          address: row.address,
          reason: `ได้ไม่ครบ — ${[
            matched.district ? null : 'อำเภอ',
            matched.subdistrict ? null : 'ตำบล',
            parts.postcode ? null : 'รหัสไปรษณีย์',
          ].filter(Boolean).join('/')}`,
        });
      }

      touched = true;
      return {
        ...row,
        ...parts,
        // ข้อความบนเอกสารต้องไม่ขยับ — ผู้ใช้ปลดธงนี้เองเมื่อตรวจแล้วพอใจ
        addressOverride: true,
      };
    });

    if (!touched) continue;
    stats.customers += 1;
    if (!commit) continue;

    const { error: updateError } = await supabase
      .from('customers')
      .update({ addresses: next })
      .eq('id', customer.id);
    if (updateError) console.error(`✗ ${customer.name}: ${updateError.message}`);
    else stats.written += 1;
  }

  console.log(`\n${commit ? '✓ เขียนจริง' : '• ทดลอง (dry-run) — ยังไม่เขียน'}`);
  console.log(`  ที่อยู่ที่ยังไม่แยก: ${stats.rows} รายการ จากลูกค้า ${stats.customers} ราย`);
  console.log(`  แยกได้ครบทุกระดับ:  ${stats.full}`);
  console.log(`  แยกได้บางส่วน:      ${stats.partial}  ← ต้องให้คนตรวจ`);
  console.log(`  แยกไม่ได้เลย:       ${stats.skipped}  ← ต้องกรอกเอง`);
  if (commit) console.log(`  บันทึกสำเร็จ:       ${stats.written} ราย`);

  if (review.length) {
    console.log('\nรายการที่ต้องให้คนดู:');
    for (const r of review.slice(0, 50)) console.log(`  · [${r.reason}] ${r.customer} — ${r.address.replace(/\s+/g, ' ').slice(0, 90)}`);
    if (review.length > 50) console.log(`  … อีก ${review.length - 50} รายการ`);
  }
  if (!commit) console.log('\nรันจริงด้วย: node scripts/backfill-address-structure.mjs --commit');
}

main().catch((err) => { console.error(err); process.exit(1); });
