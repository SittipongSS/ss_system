// ── ยามตัวโหลดของ "ช่วงบริการของรอบขาย" (mig 0400 · ช่วงบริการแยกรายรายการ) ─────────────────────────────────────
//
// ⭐ ตัวตัดสินล้วนมีเทสต์หน่วยแล้ว (terms.test · intakePlanFacts.test · renewals.test) — ไฟล์นี้กัน "สายไฟ" ที่พังเงียบ:
//   ใบโหมด 'line' ช่วงของใบเป็นแค่ช่วงรวม · รอบขายต้องใช้ช่วงของรายการที่ **ตัวโหลดแนบให้** (`withLinePeriods` / `attachLinePeriods`)
//   ตัวโหลดไหนอ่านช่วงของใบมาใช้กับรอบขายแล้วลืม ① เลือก `servicePeriodMode` หรือ ② แนบช่วงของบรรทัด ⇒ `termPeriodOf` ถอยไปใช้
//   ช่วงรวมของใบ: สาขาที่จบก่อน "ยังไม่จบ" · ป้ายขายแล้วนับซ้อนกับใบต่อสัญญา · ทะเบียนต่อสัญญาเตือนช้าไปเป็นเดือน — ไม่มี error ให้เห็น
//   (บทเรียนเดียวกับ `serviceContractId` ที่ตกจาก select ของคิวจน "ยังไม่ผูกสัญญา" ทุกใบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(m?js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(relative(SRC, full).split(sep).join('/'));
  }
  return out;
}
const code = (rel) => stripComments(readFileSync(join(SRC, rel), 'utf8'));
/* select ของ sales_orders ที่เขียนเป็นสตริงตรง ๆ หลัง `.from('sales_orders')` (รูปเดียวกับยามเงิน/ยามถังใบเดิม) */
const orderSelects = (src) => [...src.matchAll(/from\(\s*['"]sales_orders['"]\s*\)\s*\.select\(\s*'([^']*)'/g)].map((m) => m[1]);
const namesPeriod = (cols) => cols.includes('"servicePeriodFrom"') || cols.includes('"servicePeriodTo"');
const ATTACHES = /\b(attachLinePeriods|withLinePeriods)\(/;

/* ตัวอ่านฝั่ง TS/ต่อสัญญา ที่รู้จักวันนี้ — หายไปจากผลสแกน = ยามนี้ไม่ได้ตรวจอะไร (regex พัง/ไฟล์ย้าย) */
const KNOWN = [
  'app/api/service/intake/route.js',
  'app/api/service/customers/[customerId]/zones/route.js',
  'app/api/service/sites/[id]/zones/[zoneId]/detail/route.js',
  'app/api/sales-planning/renewals/route.js',
  'lib/service/zoneSalesRepo.js',
];

test('🔴 ทุกไฟล์ใต้ lib/service และ app/api ที่ select ช่วงบริการของใบ ต้องเลือก "servicePeriodMode" และแนบช่วงของบรรทัดให้รอบขาย', () => {
  const files = [...sourceFiles(join(SRC, 'lib/service')), ...sourceFiles(join(SRC, 'app/api'))];
  const readers = [];
  const offenders = [];
  for (const rel of files) {
    const src = code(rel);
    const selects = orderSelects(src).filter(namesPeriod);
    if (!selects.length) continue;
    readers.push(rel);
    for (const cols of selects) {
      if (!cols.includes('"servicePeriodMode"')) offenders.push(`${rel} — select ช่วงของใบไม่มี "servicePeriodMode"`);
    }
    if (!ATTACHES.test(src)) offenders.push(`${rel} — ไม่ได้เรียก attachLinePeriods( / withLinePeriods(`);
  }
  assert.deepEqual(offenders, []);
  assert.deepEqual([...readers].sort(), [...KNOWN].sort(),
    'ตัวอ่านช่วงของใบฝั่ง TS เปลี่ยน — เพิ่ม/ลบแล้วต้องตัดสินว่ารอบขายของมันใช้ช่วงของรายการไหม (แผน IMPL_PLAN_PERIOD §3.2) แล้วแก้รายชื่อนี้');
});

test('route คิวงานเข้าใหม่: บรรทัดพกช่วงของรายการ · แนบให้ term จากบรรทัดที่โหลดอยู่แล้ว (ไม่ยิงเพิ่ม) ก่อนเข้าคิวรอตั้งรอบ', () => {
  const route = code('app/api/service/intake/route.js');
  const lines = route.match(/from\(\s*'sales_order_lines'\s*\)\s*\.select\('([^']*)'/)?.[1] || '';
  for (const col of ['"servicePeriodFrom"', '"servicePeriodTo"', '"serviceRounds"', '"serviceKind"']) assert.ok(lines.includes(col), `select ของบรรทัดต้องมี ${col}`);
  assert.doesNotMatch(lines, /unitPrice|lineTotal|discount/, '🔒 ฝ่ายบริการไม่เห็นราคา');
  assert.match(route, /import \{ withLinePeriods \} from '@\/lib\/service\/terms';/);
  assert.match(route, /const terms = withLinePeriods\(rawTerms, ordersById, linesById\);/);
  const attach = route.indexOf('const terms = withLinePeriods(');
  assert.ok(attach > route.indexOf('const linesById = new Map('), 'แนบหลังมี linesById');
  assert.ok(attach < route.indexOf('orphanPlanRows({') && attach < route.indexOf('decoratePlanRows(planQueue({'), 'คิว/รอบกำพร้าใช้ term ที่แนบช่วงแล้ว');
  assert.doesNotMatch(route, /termPeriodRepo/, 'ไม่ต้องอ่านบรรทัดซ้ำ — มีอยู่ในมือแล้ว');
  /* จำนวนคำสั่งอ่านใบของ route นี้เท่าเดิม (ใบของคิว + ใบในโซ่รอบกำพร้า) — โหมดต่อท้าย select ตัวเดิม */
  assert.equal(orderSelects(route).length, 2);
});

test('ตัวอ่านที่เหลือสี่ตัว: แนบช่วงกับ term ดิบก่อนใช้/ส่งออก — ชื่อ `terms` ที่ไหลต่อคือชุดที่แนบแล้ว', () => {
  for (const rel of KNOWN.filter((file) => file !== 'app/api/service/intake/route.js')) {
    const src = code(rel);
    assert.match(src, /import \{ attachLinePeriods \} from '@\/lib\/service\/termPeriodRepo';/, rel);
    assert.match(src, /const terms = await attachLinePeriods\(supabase, rawTerms, /, rel);
    assert.equal((src.match(/attachLinePeriods\(/g) || []).length, 1, `${rel}: แนบครั้งเดียว`);
    /* term ดิบใช้ได้แค่หา id ของใบ (ก่อนรู้โหมด) — หลังแนบแล้วห้ามใช้ชุดดิบอีก */
    const after = src.slice(src.indexOf('const terms = await attachLinePeriods('));
    assert.equal((after.match(/\brawTerms\b/g) || []).length, 1, `${rel}: หลังแนบแล้วต้องไม่อ่าน rawTerms อีก`);
  }
  /* หน้าโซนคิด `termsSoldNow` ในเบราว์เซอร์จาก terms + orders ของ response ⇒ ชุดที่ส่งออกต้องเป็นชุดที่แนบแล้ว */
  const detail = code('app/api/service/sites/[id]/zones/[zoneId]/detail/route.js');
  const reply = detail.slice(detail.indexOf('return ok({'));
  assert.match(reply, /\bterms,/);
  assert.doesNotMatch(reply, /rawTerms/);
});

test('ตัวตัดสินฝั่ง TS อ่านช่วงผ่าน termPeriodOf — ไม่อ่าน order.servicePeriodTo/From ตรง ๆ (ทะเบียนต่อสัญญา · ตัวรวมข้ามใบ)', () => {
  const renewals = code('lib/service/renewals.js');
  assert.match(renewals, /const periodTo = termPeriodOf\(term, order\)\.to;/);
  assert.doesNotMatch(renewals, /order\.servicePeriod(From|To)/);
  const terms = code('lib/service/terms.js');
  const soldNow = terms.slice(terms.indexOf('export function termsSoldNow('), terms.indexOf('export function serviceTermZoneCount('));
  assert.match(soldNow, /termPeriodPhase\(term, order, todayIso\) === 'current'/);
  assert.doesNotMatch(soldNow, /orderPeriodPhase\(|order\.servicePeriod/);
  assert.doesNotMatch(terms, /^import[^;]*serviceSetup/m, 'terms.js ไม่ลากตัวตัดสินของฝ่ายขายเข้ามา (ถูก import ฝั่งจอ)');
});
