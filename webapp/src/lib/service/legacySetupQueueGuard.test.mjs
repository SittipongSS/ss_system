// ── ยามสายไฟของถังใบเดิม (mig 0392 · PR-A · D14 · กฎ 16) ────────────────────────────────────────────
//
// ⭐ ตัวถังมีเทสต์หน่วยแล้ว (legacySetupQueue.test.mjs) — ไฟล์นี้กันสามอย่างที่เทสต์หน่วยมองไม่เห็น:
//   1. **select ของผู้เรียก** — ถังโยนเมื่อใบไม่มีคีย์ `serviceTermsOpenedAt` ก็จริง แต่ยามนี้จับได้ตั้งแต่ก่อนรัน
//      (ใบที่เปิดงานให้ TS แล้วกลับมาโผล่ในถังใบเดิม = โรคเดียวกับ `serviceContractId` ที่ตกจาก select ของคิวนี้)
//   2. **ถังผูกโซนเดิมไม่กลับมา** — `bindQueue` ถูกถอด · ใครเรียกชื่อนี้อีก = ถังที่ TS ผูกโซนเองกลับมาทางหลังบ้าน
//   3. **ทิศทาง import** — `intake.js` ↔ `serviceOrders.js` เป็นวงอยู่แล้ว · `serviceSetup.js` import ทั้งคู่
//      ⇒ `intake.js` import `serviceSetup` เมื่อไร วง ESM จะปิดสนิทและโมดูลหนึ่งได้ชื่อที่ยังไม่ผูกตอนโหลด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = relative(SRC, fileURLToPath(import.meta.url)).split(sep).join('/');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(m?js|jsx)$/.test(entry.name)) out.push(relative(SRC, full).split(sep).join('/'));
  }
  return out;
}
const FILES = sourceFiles();
const code = (rel) => stripComments(readFileSync(join(SRC, rel), 'utf8'));
const isTest = (rel) => rel.includes('.test.');

test('🔴 ทุกผู้เรียก legacySetupQueue( มี "serviceTermsOpenedAt" ใน select ของ sales_orders', () => {
  const callers = FILES.filter((rel) => !isTest(rel) && rel !== 'lib/service/legacySetupQueue.js')
    .filter((rel) => /\blegacySetupQueue\(/.test(code(rel)));
  assert.ok(callers.length >= 1, 'ต้องมีผู้เรียกอย่างน้อยหนึ่งราย (route คิวงานเข้าใหม่) — ไม่เจอ = ยามนี้ไม่ได้ตรวจอะไร');
  const offenders = [];
  for (const rel of callers) {
    const src = code(rel);
    const selects = [...src.matchAll(/from\(\s*['"]sales_orders['"]\s*\)\s*\.select\(\s*'([^']*)'/g)].map((m) => m[1]);
    if (!selects.length) { offenders.push(`${rel} — ไม่เจอ select ของ sales_orders`); continue; }
    if (!selects.some((cols) => cols.includes('"serviceTermsOpenedAt"'))) offenders.push(`${rel} — select ไม่มี "serviceTermsOpenedAt"`);
  }
  assert.deepEqual(offenders, []);
});

/* ⚠️ นับเฉพาะ "ใช้จริง" (import · ดึงจาก dynamic import · เรียก) — ยามที่ยืนยันว่าชื่อนี้ **ไม่อยู่** ในไฟล์อื่น
   (`assert.doesNotMatch(route, /bindQueue/)`) ต้องไม่ทำให้ยามนี้แดง */
const USES_BIND_QUEUE = [
  /import\s*\{[^}]*\bbindQueue\b[^}]*\}\s*from/,
  /\{[^}]*\bbindQueue\b[^}]*\}\s*=\s*await\s+import\(/,
  /\bbindQueue\s*\(/,
];
test('🔴 ถังผูกโซนของ TS (bindQueue) ถอดแล้ว — ไม่มีไฟล์ไหน import หรือเรียกชื่อนี้อีก', () => {
  const offenders = FILES.filter((rel) => rel !== SELF)
    .filter((rel) => { const src = code(rel); return USES_BIND_QUEUE.some((re) => re.test(src)); });
  assert.deepEqual(offenders, [], 'ใช้ legacySetupQueue (ถังใบเดิม · ดูอย่างเดียว) แทน');
  // ตัวตรวจต้องจับของจริงได้ — กันยามที่ regex พังแล้วผ่านทุกไฟล์เงียบ ๆ
  assert.ok(USES_BIND_QUEUE[0].test("import { bindQueue, planQueue } from '@/lib/service/intake';"));
  assert.ok(USES_BIND_QUEUE[1].test("const { bindQueue } = await import('../service/intake.js');"));
  assert.ok(USES_BIND_QUEUE.every((re) => !re.test("assert.doesNotMatch(route, /bindQueue/, 'x');")));
});

test('🔴 intake.js ไม่ import serviceSetup (กฎ 16) · ถังใบเดิมอยู่ไฟล์แยกที่ import ได้ทั้งสองฝั่ง', () => {
  const intake = code('lib/service/intake.js');
  assert.doesNotMatch(intake, /from\s+['"][^'"]*serviceSetup['"]/);
  assert.doesNotMatch(intake, /import\(\s*['"][^'"]*serviceSetup['"]\s*\)/);
  assert.doesNotMatch(intake, /from\s+['"][^'"]*legacySetupQueue['"]/, 'ถังใบเดิม import intake.js — กลับทิศ = วงใหม่');
  const legacy = code('lib/service/legacySetupQueue.js');
  assert.match(legacy, /from '@\/lib\/sales\/serviceSetup';/);
  assert.match(legacy, /from '@\/lib\/service\/intake';/);
  // ตัวตัดสินห้ามอ่าน serviceSetupState เอง (D28) — ถามผ่าน serviceBackfillState/serviceBackfillAwaitingReview เท่านั้น
  assert.doesNotMatch(legacy, /\.serviceSetupState\b/);
});

test('F19: route คิวงานเข้าใหม่ส่งชุดลูกค้าที่มีไซต์ (ไซต์ที่ใช้งาน) เข้าถังใบเดิม — ไม่ส่ง = แถวไม่บอก TS ว่าต้องเพิ่มไซต์', () => {
  const route = code('app/api/service/intake/route.js');
  const call = route.slice(route.indexOf('legacySetupQueue({'), route.indexOf('});', route.indexOf('legacySetupQueue({')));
  assert.match(call, /\bcustomersWithSite\b/);
  assert.match(route, /const customersWithSite = new Set\(\(sites \|\| \[\]\)\.filter\(\(s\) => s\?\.isActive !== false\)/);
});

test('0396: select ใบของ route งานเข้าใหม่พกคอลัมน์ผู้เปิดแก้/เวลา/เหตุผล — ไม่มี = ป้าย "แก้หลังอนุมัติ" บนแท็บ TS หายเงียบ (serviceSetupReopened ได้ undefined)', () => {
  const route = code('app/api/service/intake/route.js');
  const selects = [...route.matchAll(/from\(\s*['"]sales_orders['"]\s*\)\s*\.select\(\s*'([^']*)'/g)].map((m) => m[1]);
  const legacy = selects.find((cols) => cols.includes('"serviceTermsOpenedAt"'));
  assert.ok(legacy, 'ต้องเจอ select ของถังใบเดิม');
  for (const col of ['"serviceSetupReopenedAt"', '"serviceSetupReopenedByName"', '"serviceSetupReopenedReason"']) {
    assert.ok(legacy.includes(col), `select ขาด ${col}`);
  }
  assert.match(code('lib/service/legacySetupQueue.js'), /reopened: serviceSetupReopened\(order\),/, 'ถามตัวตัดสินกลาง ไม่อ่านคอลัมน์เอง');
});

test('0404: select ใบของ route งานเข้าใหม่พกคอลัมน์ตราการข้าม (เวลา + ชื่อ) — ไม่มี = ป้าย "ข้ามตอนยื่น" บนแท็บ TS หายเงียบ (serviceSetupDeferred ได้ undefined)', () => {
  const route = code('app/api/service/intake/route.js');
  const selects = [...route.matchAll(/from\(\s*['"]sales_orders['"]\s*\)\s*\.select\(\s*'([^']*)'/g)].map((m) => m[1]);
  const legacy = selects.find((cols) => cols.includes('"serviceTermsOpenedAt"'));
  assert.ok(legacy, 'ต้องเจอ select ของถังใบเดิม');
  for (const col of ['"serviceSetupDeferredAt"', '"serviceSetupDeferredByName"']) assert.ok(legacy.includes(col), `select ขาด ${col}`);
  /* ตัวตัดสินกลางเทียบเวลากับการเปิดแก้ (เหตุการณ์ที่เกิดทีหลังชนะ) ⇒ คอลัมน์เวลาเปิดแก้ต้องอยู่ใน select เดียวกัน */
  assert.ok(legacy.includes('"serviceSetupReopenedAt"'));
  assert.equal(selects.filter((cols) => cols.includes('serviceSetupDeferred')).length, 1, 'ต่อท้าย select ตัวเดิม — ไม่เพิ่มคำสั่งอ่านใบ');
  const lib = code('lib/service/legacySetupQueue.js');
  assert.match(lib, /deferred: serviceSetupDeferred\(order\),/, 'ถามตัวตัดสินกลาง ไม่อ่านคอลัมน์เอง');
  assert.doesNotMatch(lib, /\.serviceSetupDeferred(At|ById|ByName)\b/, 'ถังไม่อ่านคอลัมน์ของตราการข้ามเอง');
  assert.doesNotMatch(lib, /ข้ามตอนยื่น/, 'คำอยู่ที่ SERVICE_DEFERRED_TEXT ที่เดียว');
  /* intake.js ยังไม่ import serviceSetup (กฎ 16) — ป้ายของใบที่ข้ามอยู่ในไฟล์ถังเท่านั้น */
  assert.doesNotMatch(code('lib/service/intake.js'), /serviceSetupDeferred|SERVICE_DEFERRED_TEXT/);
});
