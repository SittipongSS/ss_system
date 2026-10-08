// ── ยามทิศทางการ import ของ serviceSetup.js (กฎ 16 ของแผน PR-A · mig 0392) ─────────────────────────────
//
// 🐞 วงของ ESM ที่มีอยู่แล้ววันนี้: `intake.js` ↔ `serviceOrders.js` — ทำงานได้เพราะสองไฟล์ไม่อ่านชื่อของอีกฝั่ง
//   ตอนโมดูลรันบรรทัดบนสุด · ถ้า serviceSetup.js ถูกดึงเข้าวงนั้น (หรือวงใหม่ผ่าน serviceRoundsEntry.js)
//   ชื่อที่ import อาจยังไม่ถูกผูกตอนไฟล์ใดไฟล์หนึ่งเริ่มรัน ⇒ `ReferenceError` ตอนโหลดหน้า ไม่ใช่ตอนเทสต์
// ⇒ ล็อกสามอย่าง:
//   1. ไฟล์ในวงเดิม (+ paymentCoverage) ไม่ import serviceSetup
//   2. serviceSetup.js ไม่ดึงอะไรที่ import มันกลับ (ไล่ทั้งกราฟ) — รวม serviceRoundsEntry.js
//   3. ไม่มีค่าคงที่ระดับบนสุดใน serviceSetup.js ที่อ่านชื่อที่ import มา
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (abs) => relative(SRC, abs).split(sep).join('/');
const read = (abs) => readFileSync(abs, 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ทุก specifier ของ import/export-from แบบ static */
function specifiersOf(source) {
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(stripComments(source)))) out.push(m[1]);
  const bare = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = bare.exec(stripComments(source)))) out.push(m[1]);
  return out;
}

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(fromFile), spec);
  else return null; // แพ็กเกจภายนอก
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]) {
    if (existsSync(candidate) && !candidate.endsWith(sep) && /\.(m?js)$/.test(candidate)) return candidate;
  }
  return null;
}

const importsOf = (abs) => specifiersOf(read(abs)).map((spec) => resolveSpecifier(abs, spec)).filter(Boolean);

function closureOf(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    for (const dep of importsOf(file)) {
      if (!seen.has(dep)) { seen.add(dep); stack.push(dep); }
    }
  }
  return seen;
}

const SETUP = join(SRC, 'lib/sales/serviceSetup.js');
const importsSetup = (abs) => importsOf(abs).includes(SETUP);

test('ไฟล์ในวงเดิม (intake ↔ serviceOrders) และ paymentCoverage ไม่ import serviceSetup', () => {
  for (const file of ['lib/service/intake.js', 'lib/sales/serviceOrders.js', 'lib/sales/paymentCoverage.js']) {
    assert.equal(importsSetup(join(SRC, file)), false, `${file} ห้าม import serviceSetup.js (กฎ 16)`);
  }
});

test('serviceSetup.js ไม่ดึง serviceRoundsEntry.js และไม่มีไฟล์ไหนในกราฟของมัน import มันกลับ (ไม่มีวง)', () => {
  const closure = closureOf(SETUP);
  assert.ok(closure.size > 0, 'ตัวไล่กราฟต้องเจอไฟล์ที่ import');
  assert.ok(!closure.has(join(SRC, 'lib/sales/serviceRoundsEntry.js')), 'serviceSetup.js ห้ามดึง serviceRoundsEntry.js');
  const back = [...closure].filter(importsSetup).map(rel);
  assert.deepEqual(back, [], `ไฟล์เหล่านี้ import serviceSetup.js กลับ = วง: ${back.join(', ')}`);
  // ตัวที่ต้องใช้ทั้งสองฝั่งอยู่ในโมดูลใหม่ (เช่น lib/service/legacySetupQueue.js) ไม่ใช่ใน intake.js
  assert.ok(closure.has(join(SRC, 'lib/service/intake.js')), 'serviceSetup.js ใช้ bindTargetError ของ intake.js');
});

test('serviceRoundsEntry.js import serviceSetup.js ได้ (ทิศเดียว)', () => {
  assert.equal(importsSetup(join(SRC, 'lib/sales/serviceRoundsEntry.js')), true);
});

/* ⭐ ไฟล์ใบไม้ของชิป "ค้าง n วัน" (มติเจ้าของ 08/10 "ตามงานค้าง") — serviceSetup.js import มัน (ตัวตัดสิน `serviceBackfillAging` ใช้เลขคณิต/คำ)
   และทะเบียนใบสั่งขายฝั่งจอ import มันตรง ๆ (คำ + ตัวเรียง) โดยตั้งใจไม่พก serviceSetup.js ทั้งก้อน
   ⇒ ใบไม้ import serviceSetup.js กลับเมื่อไร = วง ESM ใหม่ + bundle ของทะเบียนโตทั้งก้อน */
test('serviceBackfillAging.js เป็นใบไม้: serviceSetup.js import มัน · มันและทุกไฟล์ในกราฟของมันไม่ import serviceSetup.js กลับ', () => {
  const LEAF = join(SRC, 'lib/sales/serviceBackfillAging.js');
  assert.ok(importsOf(SETUP).includes(LEAF), 'serviceSetup.js ต้อง import ไฟล์ใบไม้ (ตัวตัดสินอายุอยู่ที่ serviceSetup.js ที่เดียว)');
  assert.equal(importsSetup(LEAF), false, 'ใบไม้ห้าม import serviceSetup.js');
  const closure = closureOf(LEAF);
  assert.ok(closure.size > 0, 'ตัวไล่กราฟต้องเจอไฟล์ที่ใบไม้ import (datePeriods · format)');
  assert.ok(!closure.has(SETUP), 'ไม่มีทางอ้อมจากใบไม้กลับไป serviceSetup.js');
  assert.deepEqual(importsOf(LEAF).map(rel).sort(), ['lib/datePeriods.js', 'lib/format.js'], 'ใบไม้พึ่งแค่ตัวแปลงวันไทยกับตัวจัดรูปกลาง');
  /* ผู้ใช้ฝั่งจอของทะเบียน: ดึงใบไม้ ไม่ดึง serviceSetup.js */
  const listPage = join(SRC, 'app/sales-planning/sales-orders/page.js');
  assert.ok(importsOf(listPage).includes(LEAF));
  assert.equal(importsSetup(listPage), false, 'ทะเบียนใบสั่งขายฝั่งจอไม่พก serviceSetup.js (ก้อนอายุของแถวคิดที่ server)');
  assert.equal(importsSetup(join(SRC, 'components/salesPlanning/ServiceAgingChip.js')), false, 'ชิปไม่ดึง lib ของงานบริการ');
});

test('ไม่มีค่าคงที่ระดับบนสุดใน serviceSetup.js ที่อ่านชื่อที่ import มา', () => {
  const source = stripComments(read(SETUP));
  const imported = new Set();
  for (const m of source.matchAll(/import\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]/g)) {
    const clause = m[1];
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) imported.add(name);
      }
    }
    const def = clause.replace(/\{[\s\S]*?\}/, '').replace(/\*\s+as\s+/, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const name of def) imported.add(name);
  }
  assert.ok(imported.has('categoryOf') && imported.has('bindTargetError'), 'ตัวแกะชื่อที่ import ต้องเห็นชื่อจริง');
  const offenders = source.split('\n')
    .filter((line) => /^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=/.test(line))
    .filter((line) => {
      const first = line.replace(/^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*/, '').match(/^[\w$]+/);
      return first && imported.has(first[0]);
    });
  assert.deepEqual(offenders, [], 'เขียน literal หรืออ่านชื่อที่ import ภายในฟังก์ชันเท่านั้น');
});
