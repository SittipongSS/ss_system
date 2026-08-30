// ── ยุบใบลูกค้าที่ซ้ำ (เลขผู้เสียภาษี + สาขาเดียวกัน) ────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-30 ("ทาง ก"): **ลบไม่ได้** เพราะใบส่วนเกินถือเนื้อในของตัวเอง
// (ที่อยู่/ผู้ติดต่อ/แบรนด์) แม้จะไม่มีเอกสารอ้างถึงเลยก็ตาม ⇒ ยุบด้วยการ
//   1. ย้าย **เฉพาะของที่ใบหลักยังไม่มี** เข้าใบหลัก
//   2. พักใบส่วนเกิน (isActive=false) + ปั๊ก metadata.mergedInto ไว้ว่ายุบเข้าใบไหน
// ใบที่พักใช้ยังอ่านย้อนหลังได้ทั้งใบ และเปิดกลับได้ถ้ายุบผิด (ต่างจากลบซึ่งกู้ได้แค่
// จาก audit_logs.before — ดู [[deleted-data-recovery]])
//
// unique ของ mig 0318 เป็น partial `where "isActive" is distinct from false` ⇒ พัก
// ใบส่วนเกินแล้ว index สร้างได้ทันที ไม่ต้องลบอะไร
//
// ── สิ่งที่ย้าย / ไม่ย้าย ────────────────────────────────────────────────
// ย้าย: ช่องเดี่ยวที่ใบหลัก **ว่าง** · แบรนด์/ผู้ติดต่อที่ยังไม่มี (เทียบแบบ normalize)
// ไม่ย้าย: **ที่อยู่** — คู่ที่เจอจริงเป็นที่อยู่เดียวกันที่เขียนคนละสำนวน ('942/47
//   อาคารชาญอิสสระทาวเวอร์ ชั้นที่ 1' vs '942/47 ชั้นที่ 1 อาคารชาญอิสสระทาวเวอร์')
//   ซึ่งโปรแกรมตัดสินไม่ได้ว่าซ้ำ ⇒ ก๊อปเข้าไปก็ได้ที่อยู่เกือบเหมือนกันสองรายการบน
//   ใบที่มีเอกสารจริง · สคริปต์จึง **รายงานให้ดู** แล้วให้คนตัดสิน (ข้อความยังอยู่ครบ
//   บนใบที่พักใช้) · สั่ง --move-addresses ถ้าอยากให้ก๊อปตามไปด้วย
//
// Usage (รันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src):
//   node --import ./scripts/test-loader.mjs scripts/merge-duplicate-customers.mjs
//   node --import ./scripts/test-loader.mjs scripts/merge-duplicate-customers.mjs --commit
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { branchKeyOf, taxIdKey, taxIdStore } from '../src/lib/master/customerTaxId.js';

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
const moveAddresses = process.argv.includes('--move-addresses');
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ตารางที่ถือ customerId — ใช้ตัดสินว่าใบไหนคือ "ใบหลัก" · ตารางที่ไม่มีจริงจะ error
// แล้วถูกข้าม (ไม่ต้องไล่แก้ลิสต์ทุกครั้งที่ schema ขยับ)
const REF_TABLES = [
  'projects', 'sales_deals', 'quotations', 'sales_orders', 'orders', 'products',
  'excise_registrations', 'contracts', 'dept_requests', 'personal_tasks', 'project_tasks',
  'service_sites', 'sales_leads',
];

const text = (v) => String(v ?? '').trim();
const squash = (v) => text(v).replace(/\s+/g, '');
const digits = (v) => text(v).replace(/\D/g, '');
const label = (row) => `${row.arCode || '(ไม่มีรหัส)'} ${text(row.name).slice(0, 34)}`;

async function referenceCount(id) {
  let total = 0;
  const detail = [];
  for (const table of REF_TABLES) {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('customerId', id);
    if (error || !count) continue;
    total += count;
    detail.push(`${table}=${count}`);
  }
  const { count: attachments } = await supabase
    .from('attachments').select('id', { count: 'exact', head: true }).eq('parentId', id);
  if (attachments) { total += attachments; detail.push(`attachments=${attachments}`); }
  return { total, detail };
}

/* ⚠️ ต้องไล่ทีละหน้า — เพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ ไม่มี error */
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('customers').select('*').order('arCode').range(from, from + 999);
  if (error) { console.error('✗ load customers:', error.message); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

// เฉพาะใบที่ยังใช้งาน — ใบที่พักใช้ไม่ถูกนับว่าซ้ำ (ตรงกับ unique partial ของ mig 0318)
const active = rows.filter((r) => r.isActive !== false && taxIdKey(r.taxId));
const groups = new Map();
for (const row of active) {
  const k = `${taxIdKey(row.taxId)}|${branchKeyOf(row.branchCode)}`;
  groups.set(k, [...(groups.get(k) || []), row]);
}
const duplicates = [...groups.entries()].filter(([, list]) => list.length > 1);

console.log(`ลูกค้าที่ยังใช้งาน ${active.length} ราย · คู่ซ้ำ (เลข + สาขา) ${duplicates.length} คู่`);
if (!duplicates.length) { console.log('ไม่มีอะไรให้ยุบ ✓'); process.exit(0); }
console.log(commit ? '\n*** โหมดเขียนจริง (--commit) ***' : '\n*** โหมดลองดู (ยังไม่เขียนอะไร) — เติม --commit เพื่อลงจริง ***');

const backup = [];
const plans = [];

for (const [k, list] of duplicates) {
  // ใบหลัก = ใบที่มีเอกสารอ้างมากที่สุด · เท่ากันให้ใบที่เก่ากว่าชนะ (เลขที่ออกก่อน
  // มักเป็นใบที่คนใช้กันมาจริง ส่วนใบใหม่มาจากรอบนำเข้า/ล้างข้อมูล)
  const scored = [];
  for (const row of list) scored.push({ row, refs: await referenceCount(row.id) });
  scored.sort((a, b) => b.refs.total - a.refs.total
    || text(a.row.createdAt).localeCompare(text(b.row.createdAt)));
  const keeper = scored[0];
  const surplus = scored.slice(1);

  console.log(`\n── ${k.replace('|', '  สาขา ')}`);
  console.log(`   ใบหลัก  ${label(keeper.row)} · ${keeper.refs.detail.join(' ') || 'ไม่มีเอกสารอ้าง'}`);

  const patch = {};
  // เลขในใบหลักเก็บให้เป็นรูปมาตรฐานไปเลย — รูปที่มีขีดคือตัวที่ทำให้ซ้ำหลุดด่านมาแต่แรก
  const cleanTax = taxIdStore(keeper.row.taxId);
  if (cleanTax && cleanTax !== keeper.row.taxId) patch.taxId = cleanTax;

  for (const { row, refs } of surplus) {
    console.log(`   ใบที่พัก ${label(row)} · ${refs.detail.join(' ') || 'ไม่มีเอกสารอ้าง'}`);
    if (refs.total) {
      console.log('     ⚠️ ใบนี้มีเอกสารอ้างอยู่ — ข้ามทั้งคู่ ต้องย้ายเอกสารด้วยมือก่อน');
      patch.__skip = true;
    }
  }
  if (patch.__skip) { continue; }

  for (const { row } of surplus) {
    // ช่องเดี่ยวที่ใบหลักว่าง — เติมได้ปลอดภัย (ไม่ทับของเดิมสักช่อง)
    for (const field of ['creditTerms', 'phone', 'email', 'nameEn', 'contactPerson', 'contactPhone', 'driveFolderId']) {
      const mine = patch[field] !== undefined ? patch[field] : keeper.row[field];
      if (!text(mine) && text(row[field])) patch[field] = row[field];
    }
    // แบรนด์ที่ยังไม่มี (เทียบชื่อแบบตัดช่องว่าง/ตัวพิมพ์)
    const brands = patch.brands || keeper.row.brands || [];
    const brandKey = (b) => `${squash(b?.en).toLowerCase()}|${squash(b?.th)}`;
    const haveBrands = new Set(brands.map(brandKey));
    for (const b of row.brands || []) {
      if (haveBrands.has(brandKey(b))) continue;
      haveBrands.add(brandKey(b));
      patch.brands = [...(patch.brands || brands), b];
    }
    // ผู้ติดต่อที่ยังไม่มี (เทียบเบอร์เป็นหลัก · ไม่มีเบอร์ค่อยเทียบชื่อ)
    const contacts = patch.contacts || keeper.row.contacts || [];
    const contactKey = (c) => digits(c?.phone) || squash(c?.name);
    const haveContacts = new Set(contacts.map(contactKey));
    for (const c of row.contacts || []) {
      if (!contactKey(c) || haveContacts.has(contactKey(c))) continue;
      haveContacts.add(contactKey(c));
      patch.contacts = [...(patch.contacts || contacts), c];
    }
    // ที่อยู่ — ค่าตั้งต้นคือรายงานอย่างเดียว (เหตุผลอยู่หัวไฟล์)
    const addresses = patch.addresses || keeper.row.addresses || [];
    const haveAddresses = new Set(addresses.map((a) => squash(a?.address)));
    for (const a of row.addresses || []) {
      if (haveAddresses.has(squash(a?.address))) continue;
      if (moveAddresses) {
        haveAddresses.add(squash(a?.address));
        patch.addresses = [...(patch.addresses || addresses), { ...a, label: text(a.label) || `จาก ${row.arCode}` }];
      } else {
        console.log(`     ℹ ที่อยู่ที่ไม่ได้ย้าย (อ่านได้จากใบที่พักไว้): ${text(a.address).slice(0, 60)}…`);
      }
    }
  }

  const fields = Object.keys(patch);
  console.log(fields.length
    ? `     → ใบหลักได้เพิ่ม: ${fields.join(', ')}`
    : '     → ใบหลักไม่ต้องแก้อะไร');
  for (const { row } of surplus) console.log(`     → พักใช้ ${row.arCode} + ปั๊ก metadata.mergedInto = ${keeper.row.arCode}`);

  plans.push({ keeper: keeper.row, surplus: surplus.map((s) => s.row), patch });
  backup.push(keeper.row, ...surplus.map((s) => s.row));
}

if (!plans.length) { console.log('\nไม่มีคู่ไหนยุบอัตโนมัติได้'); process.exit(1); }
if (!commit) { console.log('\nยังไม่ได้เขียนอะไร — เติม --commit เพื่อลงจริง'); process.exit(0); }

// สำรองก่อนเขียนเสมอ — ทะเบียนนี้ไม่มีถังขยะ ([[deleted-data-recovery]])
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const backupPath = path.join(homedir(), 'ss-team', 'archive', `customer-merge-backup-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nสำรองแถวที่จะถูกแตะไว้ที่ ${backupPath} (${backup.length} แถว)`);

for (const plan of plans) {
  // ⚠️ **พักใบส่วนเกินก่อน แล้วค่อยแก้ใบหลัก** — ระหว่างที่ unique เดิมของ mig 0039
  // (`customers_taxid_branch_key`, เทียบสตริงดิบ ไม่ใช่ partial) ยังอยู่ ลำดับนี้คือ
  // ลำดับเดียวที่ทำให้ทั้งคู่ไม่ชนกันกลางทาง
  for (const row of plan.surplus) {
    const metadata = {
      ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
      mergedInto: plan.keeper.arCode,
      mergedIntoId: plan.keeper.id,
      mergedAt: new Date().toISOString(),
    };
    const { error } = await supabase.from('customers').update({ isActive: false, metadata }).eq('id', row.id);
    if (error) { console.error(`✗ ${row.arCode}:`, error.message); process.exit(1); }
    console.log(`✓ ${row.arCode} พักใช้แล้ว (ยุบเข้า ${plan.keeper.arCode})`);
  }

  // เลขของใบหลักแยกเป็นคำสั่งของตัวเอง — ระหว่างที่ unique เดิมยังอยู่ การเปลี่ยน
  // '0-1055-…' ให้เป็นตัวเลขล้วนคือการไปชนสตริงของใบที่เพิ่งพักไป (index เดิมไม่ได้
  // มองข้ามใบที่พักใช้) ⇒ ล้มได้อย่างเดียวคือตรงนี้ ไม่ใช่ทั้งก้อน
  const { taxId, ...rest } = plan.patch;
  if (Object.keys(rest).length) {
    const { error } = await supabase.from('customers').update(rest).eq('id', plan.keeper.id);
    if (error) { console.error(`✗ ${plan.keeper.arCode}:`, error.message); process.exit(1); }
    console.log(`✓ ${plan.keeper.arCode} อัปเดตแล้ว (${Object.keys(rest).join(', ')})`);
  }
  if (taxId) {
    const { error } = await supabase.from('customers').update({ taxId }).eq('id', plan.keeper.id);
    if (!error) console.log(`✓ ${plan.keeper.arCode} เลขผู้เสียภาษีเก็บเป็นตัวเลขล้วนแล้ว`);
    else if (error.code === '23505') {
      console.log(`ℹ ${plan.keeper.arCode} ยังเก็บเลขเป็น "${plan.keeper.taxId}" — unique เดิมของ mig 0039`);
      console.log('   เทียบสตริงดิบและไม่ข้ามใบที่พักใช้ ⇒ แก้ได้หลังรัน mig 0318 (เปิดใบแล้วกดบันทึกก็พอ)');
    } else { console.error(`✗ ${plan.keeper.arCode}:`, error.message); process.exit(1); }
  }
}
console.log('\nเสร็จ — รัน npm run check:taxid ซ้ำเพื่อยืนยันว่าเหลือ 0 คู่');
