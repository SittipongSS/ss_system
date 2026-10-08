// ── ยามของปลายทางที่รับ ref ไฟล์หลักฐานใบสั่งขาย (รอบสองของด่านที่มาไฟล์ · 2026-10-09) ──────────────────
//
// 🐞 ที่มา: `sanitizeEvidenceAttachments` โหมดตั้งต้นปล่อย `{ fileUrl:'x', driveFileId }` และ `{ fileUrl:'x', storagePath }`
//    ที่ไม่มี storageBucket ลงแถวได้ — confirm-file สตรีม Drive id นั้นออกมา · เส้นลบใบสั่งขายตามไปลบ object นั้น ·
//    ส่วน action `report` ของงวดเรียกเปล่าไม่ส่ง options เลย ⇒ รับ ref ที่ชี้ไฟล์ไหนก็ได้มาเป็นสลิป
// ⭐ ฝั่ง server ทุกจุดต้องเรียกด้วย `privateOnly: true` (bucket ส่วนตัว + โฟลเดอร์ของเอกสารใบนั้น + ชื่อ object เดียว)
//    ⇒ ทะเบียนข้างล่างคือรายชื่อผู้เรียกทั้งหมด: จุดเรียกใหม่ที่ไม่ลงทะเบียน = แดง · ชื่อที่ไม่มีจุดเรียกแล้ว = แดง
// ⚠️ เราต์คุยกับฐาน/Storage จริง (รันในเทสต์ไม่ได้) ⇒ ล็อก **รูปและลำดับของโค้ด** · ตรรกะของตัวกรองอยู่ที่
//    orderConfirmationDocs.test.mjs · ของตัวลบอยู่ที่ evidencePurge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeEvidenceAttachments } from './orderConfirmationDocs.js';
import { PRIVATE_EVIDENCE_BUCKET, privateEvidencePrefix } from '../upload/privateEvidence.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const read = (rel) => strip(readFileSync(join(SRC, rel), 'utf8'));
const order = (text, needles, label) => {
  let from = 0;
  for (const needle of needles) {
    const at = text.indexOf(needle, from);
    assert.ok(at >= 0, `${label}: ไม่พบ ${needle} (หรืออยู่ผิดลำดับ)`);
    from = at + needle.length;
  }
};

/* ── ทะเบียนผู้เรียกฝั่ง server ──────────────────────────────────────────────
   `privateOnly: true` = ทุกจุดเรียกในไฟล์นั้นต้องส่งโหมดเข้ม · `why` = เหตุที่ไฟล์นั้นไม่ต้องส่งเอง */
const SINKS = {
  'app/api/sales-planning/sales-orders/route.js': { privateOnly: true },
  'app/api/sales-planning/sales-orders/[id]/route.js': { privateOnly: true },
  'app/api/sales-planning/sales-orders/[id]/installments/route.js': { privateOnly: true },
  'lib/sales/historicalOrderCommit.js': { privateOnly: true },
  'lib/sales/orderConfirmationDocs.js': {
    why: 'ตัวนิยาม — validateOrderConfirmation ส่ง attachmentOptions ของผู้เรียกต่อให้ตัวกรองทั้งก้อน',
  },
};
const CALL_RE = /\b(sanitizeEvidenceAttachments|validateOrderConfirmation)\(/g;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') && !entry.name.includes('.test.') ? [full] : [];
  });
}

/* ข้อความในวงเล็บของการเรียกหนึ่งครั้ง (นับวงเล็บ) */
function callArgs(text, openAt) {
  let depth = 0;
  for (let i = openAt; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && (depth -= 1) === 0) return text.slice(openAt + 1, i);
  }
  return text.slice(openAt + 1);
}

/* จุดเรียกจริงของไฟล์ (ไม่นับบรรทัดนิยามฟังก์ชัน) */
function callsOf(text) {
  const calls = [];
  for (const match of text.matchAll(CALL_RE)) {
    if (/function\s+$/.test(text.slice(0, match.index))) continue;
    calls.push({ name: match[1], args: callArgs(text, match.index + match[0].length - 1) });
  }
  return calls;
}

/* โหมดเข้มอยู่ "ที่การเรียก": เขียนในวงเล็บเอง หรือส่งตัวแปร options ที่ประกาศ `const x = { … privateOnly: true … }` ในไฟล์เดียวกัน */
function passesPrivateOnly(text, call) {
  if (call.args.includes('privateOnly: true')) return true;
  const named = call.args.match(/,\s*([A-Za-z_$][\w$]*)\s*$/);
  if (!named) return false;
  // ถึง `};` ตัวแรก — ข้างในมี `${…}` ของ template ได้ จึงไม่หยุดที่ `}` ตัวแรก
  const declared = text.match(new RegExp(`const ${named[1]} = \\{[\\s\\S]*?\\};`));
  return Boolean(declared && declared[0].includes('privateOnly: true'));
}

test('🔴 ทะเบียนผู้เรียกตัวกรองหลักฐานฝั่ง server ครบ — จุดเรียกใหม่ต้องลงทะเบียน · ชื่อที่ไม่มีจุดเรียกแล้วต้องเอาออก', () => {
  const found = new Map();
  for (const root of ['app/api', 'lib']) {
    for (const full of walk(join(SRC, root))) {
      const raw = readFileSync(full, 'utf8');
      // ไฟล์ใน lib ที่เป็น client component ไม่ใช่ปลายทางเขียน (ทุกอย่างใต้ app/api เป็น server เสมอ)
      if (root === 'lib' && /^\s*['"]use client['"]/.test(raw)) continue;
      const text = strip(raw);
      const calls = callsOf(text);
      if (calls.length) found.set(relative(SRC, full).split('\\').join('/'), { text, calls });
    }
  }
  assert.deepEqual([...found.keys()].sort(), Object.keys(SINKS).sort(),
    'ผู้เรียก sanitizeEvidenceAttachments( / validateOrderConfirmation( ฝั่ง server ต้องตรงกับทะเบียน SINKS');
  for (const [file, entry] of Object.entries(SINKS)) {
    if (!entry.privateOnly) {
      assert.ok(typeof entry.why === 'string' && entry.why.length > 20, `${file}: ไม่ส่ง privateOnly ต้องบอกเหตุ`);
      continue;
    }
    const { text, calls } = found.get(file);
    for (const call of calls) {
      assert.ok(passesPrivateOnly(text, call), `${file}: ${call.name}(${call.args.trim().slice(0, 60)}…) ต้องส่ง privateOnly: true`);
    }
  }
});

test('ตัวตรวจของทะเบียนจับการเรียกเปล่าได้จริง (รูปเดิมของ action report)', () => {
  const bare = 'const evidence = sanitizeEvidenceAttachments(body.evidence);';
  assert.equal(passesPrivateOnly(bare, callsOf(bare)[0]), false);
  const loose = 'const opts = { allowedStorageBucket: b };\nconst c = validateOrderConfirmation(body.confirmation || {}, opts);';
  assert.equal(passesPrivateOnly(loose, callsOf(loose)[0]), false);
  const strict = 'const opts = { allowedStorageBucket: b, privateOnly: true };\nconst c = validateOrderConfirmation(x, opts);';
  assert.equal(passesPrivateOnly(strict, callsOf(strict)[0]), true);
  assert.equal(callsOf('export function sanitizeEvidenceAttachments(input) {}').length, 0, 'บรรทัดนิยามไม่ใช่จุดเรียก');
});

/* ── สร้างใบสั่งขาย ─────────────────────────────────────────────────────── */
test('POST ใบสั่งขาย: เอกสารยืนยัน + หลักฐานงวดแรกใช้ options ชุดเดียว (โฟลเดอร์ของใบเสนอราคาใบนั้น · โหมดเข้ม) แล้วตรวจว่าไฟล์มีจริงก่อนออกเลขใบ', () => {
  const create = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(create, /const attachmentOptions = \{\s*allowedStorageBucket: privateBucket,\s*allowedStoragePathPrefix: `quotations\/\$\{safeQuoteId\}\/order-confirmation\/`,\s*privateOnly: true,\s*\};/);
  order(create, [
    'const attachmentOptions = {',
    'validateOrderConfirmation(body.confirmation || {}, attachmentOptions)',
    'sanitizeEvidenceAttachments(body.firstPayment?.evidence, attachmentOptions)',
    'await missingStoredEvidence(supabase, privateBucket, [',
    'if (storageMiss) return badRequest(storageMiss);',
    'p_overrides: {',
  ], 'POST sales-orders');
});

/* ── ชุดที่ผ่านด่านสั้นกว่าชุดที่ส่ง = 400 ทั้งคำขอ (ไม่บันทึกชุดที่สั้นลงเงียบ ๆ) ──────────── */
test('🔴 POST ใบสั่งขาย: ไฟล์ยืนยัน/หลักฐานงวดแรกที่ผ่านด่านไม่ครบ = 400 ก่อนถามที่เก็บไฟล์และก่อนออกเลขใบ', () => {
  const create = read('app/api/sales-planning/sales-orders/route.js');
  order(create, [
    'const confirmCheck = validateOrderConfirmation(body.confirmation || {}, attachmentOptions);',
    'if (!confirmCheck.ok) return badRequest(confirmCheck.error);',
    'const confirmation = confirmCheck.confirmation;',
    'if (evidenceRefsDropped(body.confirmation?.attachments, confirmation?.attachments)) {',
    'return badRequest(EVIDENCE_REFS_DROPPED_TEXT);',
    'const firstEvidence = sanitizeEvidenceAttachments(body.firstPayment?.evidence, attachmentOptions);',
    'if (evidenceRefsDropped(body.firstPayment?.evidence, firstEvidence)) return badRequest(EVIDENCE_REFS_DROPPED_TEXT);',
    'await missingStoredEvidence(supabase, privateBucket, [',
    "genId('SOR')",
    "supabase.rpc('create_sales_order_draft'",
  ], 'POST sales-orders: ชุดไม่ครบ');
});

test('🔴 PATCH save: ชุดไฟล์ยืนยันที่ผ่านด่านสั้นกว่าที่ส่ง = 400 ก่อนประกอบ patch (ชุดนี้ทับของเดิม) — เว้นเฉพาะใบที่ยังไม่มีไฟล์ของตัวเอง', () => {
  const detail = read('app/api/sales-planning/sales-orders/[id]/route.js');
  order(detail, [
    "if ('confirmation' in body) {",
    'if (!check.ok) return badRequest(check.error);',
    'const ownsConfirmFiles = Array.isArray(before.confirmAttachments) && before.confirmAttachments.length > 0;',
    'if (ownsConfirmFiles && evidenceRefsDropped(body.confirmation?.attachments, check.confirmation?.attachments)) {',
    'return badRequest(EVIDENCE_REFS_DROPPED_TEXT);',
    'await missingStoredEvidence(supabase, privateBucket, check.confirmation?.attachments || [])',
    'confirmPatch = {',
    'confirmAttachments: check.confirmation?.attachments || [],',
  ], 'PATCH save: ชุดไม่ครบ');
  assert.equal(detail.split('evidenceRefsDropped(').length - 1, 1, 'เราต์นี้รับไฟล์ยืนยันจุดเดียว');
});

/* ── บันทึกใบร่าง + ลบใบ ─────────────────────────────────────────────────── */
test('🔴 PATCH save: โฟลเดอร์มาจาก privateEvidencePrefix ของใบเสนอราคาต้นทาง — ไม่ประกอบ path จาก quotationId ที่ว่าง', () => {
  const detail = read('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.doesNotMatch(detail, /`quotations\/\$\{/, 'ห้ามประกอบโฟลเดอร์ใบเสนอราคาเองในเราต์นี้ (id ว่าง = quotations//order-confirmation/)');
  assert.doesNotMatch(detail, /before\.quotationId \|\| ''/);
  assert.match(detail, /validateOrderConfirmation\(body\.confirmation \|\| \{\}, \{\s*allowedStorageBucket: privateBucket,\s*allowedStoragePathPrefix: privateEvidencePrefix\('sales_order_confirmation', before\.quotationId\),\s*privateOnly: true,\s*\}\);/);
  order(detail, [
    "if ('confirmation' in body) {",
    'validateOrderConfirmation(body.confirmation || {}, {',
    'if (!check.ok) return badRequest(check.error);',
    'await missingStoredEvidence(supabase, privateBucket, check.confirmation?.attachments || [])',
    'if (missing) return badRequest(missing);',
    'confirmAttachments: check.confirmation?.attachments || [],',
  ], 'PATCH save');
});

test('🔴 ใบที่ไม่มีใบเสนอราคาต้นทาง: โฟลเดอร์เป็น null ⇒ โหมดเข้มไม่รับสักไฟล์ (รวม path ที่ขึ้นต้น quotations//order-confirmation/)', () => {
  for (const empty of [null, undefined, '']) {
    const prefix = privateEvidencePrefix('sales_order_confirmation', empty);
    assert.equal(prefix, null);
    const kept = sanitizeEvidenceAttachments([
      { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: 'quotations//order-confirmation/1_a_po.pdf', fileName: 'po.pdf' },
      { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: 'quotations/QT-1/order-confirmation/1_a_po.pdf', fileName: 'po.pdf' },
      { fileUrl: 'https://drive.google.com/file/d/abc/view', driveFileId: 'abc', fileName: 'po.pdf' },
    ], { allowedStorageBucket: PRIVATE_EVIDENCE_BUCKET, allowedStoragePathPrefix: prefix, privateOnly: true });
    assert.deepEqual(kept, []);
  }
  // ใบที่มีใบเสนอราคา: โฟลเดอร์เดียวกับที่จออัป (entityType sales_order_confirmation + quotationId)
  const own = privateEvidencePrefix('sales_order_confirmation', 'QT-1');
  assert.equal(own, 'quotations/QT-1/order-confirmation/');
  const kept = sanitizeEvidenceAttachments([
    { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: `${own}1_a_po.pdf`, fileName: 'po.pdf', fileUrl: 'x', driveFileId: 'abc' },
    { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: 'quotations/QT-2/order-confirmation/1_a_po.pdf' },
    { fileUrl: 'x', storagePath: `${own}2_b_po.pdf` },
  ], { allowedStorageBucket: PRIVATE_EVIDENCE_BUCKET, allowedStoragePathPrefix: own, privateOnly: true });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].storagePath, `${own}1_a_po.pdf`);
  assert.equal(kept[0].fileUrl, null);
  assert.equal(kept[0].driveFileId, null);
});

test('🔴 DELETE ใบสั่งขาย: ลบไฟล์ยืนยันเฉพาะใน bucket ส่วนตัวใต้โฟลเดอร์ของใบเสนอราคาต้นทาง — ไม่มีใบเสนอราคา = prefixes ว่าง', () => {
  const detail = read('app/api/sales-planning/sales-orders/[id]/route.js');
  const calls = [...detail.matchAll(/removeEvidenceRefs\(/g)].map((m) => callArgs(detail, m.index + m[0].length - 1));
  assert.equal(calls.length, 1, 'เราต์นี้ลบไฟล์ตาม ref จุดเดียว');
  assert.match(calls[0], /^\s*supabase,\s*Array\.isArray\(before\.confirmAttachments\) \? before\.confirmAttachments : \[\],\s*\{ bucket: PRIVATE_EVIDENCE_BUCKET, prefixes: confirmPrefix \? \[confirmPrefix\] : \[\] \},\s*$/);
  order(detail, [
    ".from('sales_orders').delete().eq('id', id)",
    "await purgePrivateEvidence(supabase, 'sales_orders', id);",
    "const confirmPrefix = privateEvidencePrefix('sales_order_confirmation', before.quotationId);",
    'await removeEvidenceRefs(',
  ], 'DELETE sales-orders');
});

/* ── งวดชำระ ─────────────────────────────────────────────────────────────── */
const INSTALLMENTS = read('app/api/sales-planning/sales-orders/[id]/installments/route.js');
const branch = (action) => {
  const start = INSTALLMENTS.indexOf(`} else if (action === '${action}') {`);
  assert.ok(start >= 0, `ไม่พบกิ่ง ${action}`);
  return INSTALLMENTS.slice(start, INSTALLMENTS.indexOf('} else if (action ===', start + 10));
};

test('🔴 แจ้งชำระ (report): สลิปต้องอยู่ใต้ payments/ ของใบนี้ในโหมดเข้ม และไฟล์ต้องมีจริง ก่อนประกอบ patch', () => {
  const report = branch('report');
  assert.doesNotMatch(INSTALLMENTS, /sanitizeEvidenceAttachments\(body\.evidence\)/, 'ห้ามกลับไปเรียกเปล่า');
  assert.match(report, /sanitizeEvidenceAttachments\(body\.evidence, \{\s*allowedStorageBucket: PRIVATE_EVIDENCE_BUCKET,\s*allowedStoragePathPrefix: privateEvidencePrefix\('sales_order_payment_evidence', order\.id\),\s*privateOnly: true,\s*\}\);/);
  order(report, [
    'const evidence = sanitizeEvidenceAttachments(body.evidence, {',
    "if (!evidence.length) return badRequest('ต้องแนบหลักฐานการชำระอย่างน้อย 1 ไฟล์');",
    // ส่งมา n ไฟล์แต่ผ่านไม่ครบ = 400 ทั้งคำขอ ก่อนถามที่เก็บไฟล์และก่อนประกอบ patch
    'if (evidenceRefsDropped(body.evidence, evidence)) return badRequest(EVIDENCE_REFS_DROPPED_TEXT);',
    'const evidenceMiss = await missingStoredEvidence(supabase, PRIVATE_EVIDENCE_BUCKET, evidence);',
    'if (evidenceMiss) return badRequest(evidenceMiss);',
    'patch = {',
  ], 'report');
  // งวดต้องเป็นของใบใน URL ก่อนถึงกิ่งนี้ ⇒ `order.id` คือใบเดียวกับที่จออัปไฟล์ให้ (งวดที่ยกมาก็อยู่ใต้ใบใหม่แล้ว)
  order(INSTALLMENTS, [
    "if (!row || row.salesOrderId !== order.id) return notFound('ไม่พบงวดในใบสั่งขายนี้');",
    "} else if (action === 'report') {",
  ], 'report: ด่านเจ้าของงวด');
  // โฟลเดอร์ที่ด่านยอมรับ = โฟลเดอร์ที่ /api/upload/session เขียนให้ entityType เดียวกัน
  assert.equal(privateEvidencePrefix('sales_order_payment_evidence', 'SOR-1'), 'sales-orders/SOR-1/payments/');
});

test('🔴 ใบกำกับภาษี (tax-invoice): ไฟล์ใหม่ผ่านโหมดเข้ม + มีจริง · ส่งมาแต่ไม่ผ่าน = 400 · ไม่ส่งไฟล์ = เก็บไฟล์เดิม', () => {
  const invoice = branch('tax-invoice');
  assert.match(invoice, /const newFile = sanitizeEvidenceAttachments\(\s*body\.taxInvoiceFile \? \[body\.taxInvoiceFile\] : \[\],\s*\{\s*allowedStorageBucket: PRIVATE_EVIDENCE_BUCKET,\s*allowedStoragePathPrefix: privateEvidencePrefix\('sales_order_tax_invoice', order\.id\),\s*privateOnly: true,\s*\},\s*\)\[0\];/);
  order(invoice, [
    'const newFile = sanitizeEvidenceAttachments(',
    'if (body.taxInvoiceFile && !newFile) {',
    'return badRequest(',
    'const fileMiss = newFile ? await missingStoredEvidence(supabase, PRIVATE_EVIDENCE_BUCKET, [newFile]) : null;',
    'if (fileMiss) return badRequest(fileMiss);',
    'const file = newFile',
    '|| row.taxInvoiceFile || null;',
    'patch = taxInvoicePatch({',
  ], 'tax-invoice');
  // ไฟล์เดิมของแถวไม่ถูกตรวจซ้ำ (แก้แค่เลข/วันที่ต้องไม่ล้มเพราะไฟล์เก่า)
  assert.doesNotMatch(invoice, /missingStoredEvidence\([^)]*row\.taxInvoiceFile/);
  assert.match(invoice, /ไฟล์ใบกำกับภาษีต้องเป็นไฟล์ที่อัปโหลดผ่านระบบ/);
  assert.equal(privateEvidencePrefix('sales_order_tax_invoice', 'SOR-1'), 'sales-orders/SOR-1/tax-invoices/');
});
