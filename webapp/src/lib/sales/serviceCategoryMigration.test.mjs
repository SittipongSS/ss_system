// ── mig 0422: หมวดแพ็คเกจบริการเป็นชุด {02-001, 02-037} (มติเจ้าของ 03/11) ─────────────────────────────────────
//
// ⭐ ฝั่ง JS มีสองชุด (SERVICE_ROUND_CATEGORIES ของ serviceOrders.js · PACK_LINE_CATEGORIES ของ linePacks.js ซึ่งเป็นใบของกราฟ import)
//    และค่าตรงในไฟล์ที่ห้ามอ่านชื่อที่ import (กฎ 16) · ฝั่งฐานมีตัวตัดสินเดียว public.service_package_categories() ของ 0422
//    ⇒ ไฟล์นี้ยึดให้ทุกชุดเท่ากัน และพิสูจน์ว่าแพตช์ของ 0422 ปะนิยามที่รันอยู่ของห้าฟังก์ชันได้จริง:
//      anchor แต่ละแถวเจอ **ครั้งเดียวพอดี** ในเนื้อที่ repo ถือ (ฐานจะตรวจซ้ำกับ prosrc + pg_get_functiondef แล้ว RAISE เองถ้าไม่ตรง)
//      · หลังปะไม่เหลือการเทียบ = '02-001' · ป้ายครบ · ตัวตรวจท้ายรู้จักป้ายทุกตัว
//    ส่วนยาม T2: นิพจน์หมวดหลังปะ = categoryExpression ของ quoteLinePackGuardCases.json ที่เปลี่ยนแค่ตัวเทียบ ⇒ กรณีเดิมทุกกรณี
//    ที่ย้ายรหัสเป็น 02-037 ต้องได้คำตอบเดิม (ฝั่ง JS ตอบด้วย lineTakesPacks ตัวเดียวกับด่านของเซิร์ฟเวอร์)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PACK_LINE_CATEGORIES, lineTakesPacks } from './linePacks.js';
import { SERVICE_ROUND_CATEGORIES, lineIsServicePackage } from './serviceOrders.js';
import { serviceLineRole } from './serviceSetup.js';
import { SERVICE_PACKAGE_CATEGORIES } from './historicalOrderPlan.js';
import { PROTECTED_PRODUCT_CATEGORY_CODES } from '../master/productCategory.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const RAW = read('0422_service_package_category_02_037.sql');
const SRC = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/* นิยามที่ repo ถือของแต่ละฟังก์ชัน (ไฟล์ที่ CREATE ตัวที่รันอยู่ — แพตช์ภายหลังไม่แตะบรรทัดหมวด: ผลไล่จุด 03/11) */
const DEFINERS = Object.freeze({
  sales_order_line_service_role: '0392_so_service_setup.sql',
  sales_order_service_setup_errors: '0392_so_service_setup.sql',
  save_sales_order_service_setup: '0400_so_service_line_period.sql',
  historical_so_check_lines: '0379_historical_so_quote_lines.sql',
  quotation_line_pack_keep: '0410_quotation_line_pack_guard.sql',
});

function bodyOf(fn) {
  const sql = read(DEFINERS[fn]);
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  assert.ok(from >= 0, `${DEFINERS[fn]} ต้องนิยาม ${fn}`);
  const as = /AS (\$\w*\$)/.exec(sql.slice(from));
  const start = from + as.index + as[0].length;
  return sql.slice(start, sql.indexOf(as[1], start));
}

/* แถว VALUES ของ DO $patch$: (ชื่อฟังก์ชัน, $re$anchor$re$, $rp$replacement$rp$, 'ป้าย') */
const PATCH = /DO \$patch\$([\s\S]*?)\$patch\$;/.exec(RAW)[1];
const ROWS = [...PATCH.matchAll(/\('([a-z_]+)',\s*\$re\$([\s\S]*?)\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g)]
  .map((m) => ({ fn: m[1], anchor: m[2], replacement: m[3], marker: m[4] }));
const VERIFY = /DO \$verify\$([\s\S]*?)\$verify\$;/.exec(RAW)[1];

/* regexp_replace ของ Postgres ใช้ \1 · JS ใช้ $1 — anchor ทุกตัวของไฟล์นี้เป็น regex ที่สองฝั่งอ่านเหมือนกัน (ไม่มี lookbehind/คลาสพิเศษ) */
const toJsReplacement = (rp) => rp.replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1');
function patched() {
  const out = Object.fromEntries(Object.keys(DEFINERS).map((fn) => [fn, bodyOf(fn)]));
  for (const row of ROWS) {
    const hits = [...out[row.fn].matchAll(new RegExp(row.anchor, 'g'))].length;
    assert.equal(hits, 1, `${row.fn} [${row.marker}]: anchor ต้องเจอครั้งเดียวพอดี (เจอ ${hits})`);
    out[row.fn] = out[row.fn].replace(new RegExp(row.anchor), toJsReplacement(row.replacement));
  }
  return out;
}

test('⭐ ชุดหมวดเท่ากันทุกบ้าน: ฐาน (0422) = SERVICE_ROUND_CATEGORIES = PACK_LINE_CATEGORIES = ใบย้อนหลัง · 02-011 ไม่อยู่ · กันลบทั้งสองรหัส', () => {
  const sql = /SELECT ARRAY\[([^\]]*)\]::text\[\];/.exec(RAW);
  assert.ok(sql, '0422 ต้องนิยามชุดเป็น ARRAY[...]::text[]');
  const db = [...sql[1].matchAll(/'(\d{2}-\d{3})'/g)].map((m) => m[1]);
  assert.deepEqual(db, ['02-001', '02-037']);
  assert.deepEqual([...SERVICE_ROUND_CATEGORIES], db);
  assert.deepEqual([...PACK_LINE_CATEGORIES], db);
  assert.equal(SERVICE_PACKAGE_CATEGORIES, SERVICE_ROUND_CATEGORIES);
  assert.equal(db.includes('02-011'), false, 'มติ 03/11: 02-011 (ขายน้ำหอมเติมเป็นกิโล) ไม่ใช่หมวดบริการ');
  for (const code of db) assert.ok(PROTECTED_PRODUCT_CATEGORY_CODES.includes(code), `${code} ต้องอยู่ในลิสต์กันลบ`);
  /* ค่าตรงในไฟล์ที่อ่านชื่อที่ import ไม่ได้ (กฎ 16) — ต้องเป็นชุดเดียวกัน */
  for (const rel of ['./serviceSetup.js', './serviceSetupRepo.js', '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js']) {
    assert.ok(SRC(rel).includes("Object.freeze(['02-001', '02-037'])"), `${rel} ต้องถือชุดเดียวกัน`);
    assert.doesNotMatch(SRC(rel), /PACKAGE_CATEGORY = '02-001'/, `${rel} ยังเทียบค่าเดียว`);
  }
});

test('🔴 แพตช์ของ 0422 ปะห้าฟังก์ชันได้ — anchor ครั้งเดียว · ไม่เหลือ = \'02-001\' · ป้ายครบ · ตัวตรวจท้ายรู้จักทุกป้าย', () => {
  assert.equal(ROWS.length, 10);
  assert.deepEqual([...new Set(ROWS.map((r) => r.fn))].sort(), Object.keys(DEFINERS).sort());
  const before = Object.fromEntries(Object.keys(DEFINERS).map((fn) => [fn, bodyOf(fn)]));
  for (const fn of Object.keys(DEFINERS)) assert.match(before[fn], /= '02-001'/, `${fn}: รุ่นก่อนต้องเทียบค่าเดียว (ถ้าไม่ — ไฟล์นี้ปะผิดตัว)`);
  const after = patched();
  for (const fn of Object.keys(DEFINERS)) {
    assert.doesNotMatch(after[fn], /= '02-001'/, `${fn}: ยังเหลือการเทียบ = '02-001'`);
    assert.match(after[fn], /= ANY \(public\.service_package_categories\(\)\) \/\* 0422\/[A-Z]\d \*\//, `${fn}: ต้องเรียกตัวตัดสินหมวด`);
  }
  /* ป้ายของแถวหนึ่งห้ามโผล่ในข้อความของแถวอื่น (วงปะเห็น "ปะไว้แล้ว" แล้วข้ามเงียบ) · ป้ายต้องอยู่ในเนื้อหลังปะ */
  for (const row of ROWS) {
    assert.ok(after[row.fn].includes(row.marker), `${row.fn}: หลังปะต้องมีป้าย ${row.marker}`);
    assert.equal(before[row.fn].includes(row.marker), false, `${row.fn}: ป้าย ${row.marker} มีอยู่ก่อนปะ = ถูกข้าม`);
    for (const other of ROWS.filter((r) => r !== row && r.fn === row.fn)) {
      assert.equal(other.replacement.includes(row.marker), false, `ป้าย ${row.marker} โผล่ในข้อความของแถว ${other.marker}`);
    }
    assert.ok(VERIFY.includes(`'${row.fn}', '${row.marker}'`), `ตัวตรวจท้ายต้องเช็กป้าย ${row.marker}`);
  }
  /* ข้อความของยาม T2 พูดสองหมวด — ไม่เหลือ "(หมวด 02-001)" เดี่ยว */
  assert.doesNotMatch(after.quotation_line_pack_keep, /\(หมวด 02-001\)/);
  assert.equal([...after.quotation_line_pack_keep.matchAll(/\(หมวด 02-001 หรือ 02-037\)/g)].length, 2);
  assert.match(after.quotation_line_pack_keep, /บรรทัดหมวด 02-001 \/ 02-037 ห้ามเสียเลขแพ็ค/);
});

test('🪤 0422 ไม่เขียน "FUNCTION public.<ชื่อที่ถูกปะ>" (ยามนิยามล่าสุดของ 0379/0392/0400 หาเจ้าของด้วยข้อความนั้น) · สิทธิ์ของตัวใหม่ = service_role อย่างเดียว', () => {
  for (const fn of Object.keys(DEFINERS)) assert.equal(RAW.includes(`FUNCTION public.${fn}`), false, fn);
  assert.match(RAW, /REVOKE ALL ON FUNCTION public\.service_package_categories\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(RAW, /GRANT EXECUTE ON FUNCTION public\.service_package_categories\(\) TO service_role;/);
  assert.match(RAW, /CREATE OR REPLACE FUNCTION public\.service_package_categories\(\)\nRETURNS text\[\]\nLANGUAGE sql\nIMMUTABLE\nSET search_path = public\n/);
  for (const code of ['mig_0422_patch_overload', 'mig_0422_patch_anchor', 'mig_0422_verify']) assert.ok(RAW.includes(code), code);
});

test('🔴 ยาม T2 หลังปะ: นิพจน์หมวด = categoryExpression ของ 0410 ที่เปลี่ยนแค่ตัวเทียบ ⇒ ทุกกรณีที่ย้ายเป็น 02-037 ได้คำตอบเดิม (JS = lineTakesPacks) · 02-011 ไม่ได้', () => {
  const cases = JSON.parse(readFileSync(new URL('./quoteLinePackGuardCases.json', import.meta.url), 'utf8'));
  const expected = cases.categoryExpression
    .replace(`substring(NEW."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001'`, `substring(NEW."fgCode" from '[0-9]{2}-[0-9]{3}') = ANY (public.service_package_categories()) /* 0422/K1 */`)
    .replace(`NEW.metadata ->> 'categoryCode' = '02-001'`, `NEW.metadata ->> 'categoryCode' = ANY (public.service_package_categories()) /* 0422/K2 */`);
  assert.notEqual(expected, cases.categoryExpression);
  assert.ok(patched().quotation_line_pack_keep.includes(expected), 'นิพจน์หมวดของ T2 หลังปะต้องเป็นรูปนี้ทุกตัวอักษร');
  const swap = (line, code) => JSON.parse(JSON.stringify(line).replaceAll('02-001', code));
  let moved = 0;
  for (const row of cases.cases) {
    if (!JSON.stringify(row.line).includes('02-001')) continue;
    moved += 1;
    assert.equal(lineTakesPacks(swap(row.line, '02-037'), null), row.takesPacks, `${row.id} → 02-037`);
    assert.equal(lineTakesPacks(swap(row.line, '02-011'), null), false, `${row.id} → 02-011`);
  }
  assert.ok(moved >= 10, `ย้ายได้ ${moved} กรณี`);
});

test('JS ตอบ 02-037 เหมือน 02-001 ทุกตัวตัดสิน: แพ็ค/เดือน · แพ็คเกจบริการ (ด่านเงิน) · ชนิดบรรทัดของใบสั่งขาย (FG และบรรทัดพิมพ์เอง)', () => {
  for (const [code, yes] of [['02-001', true], ['02-037', true], ['02-011', false], ['01-006', false]]) {
    const fg = `FG-0533-${code}-10301`;
    assert.equal(lineTakesPacks({ fgCode: fg }, null), yes, `แพ็ค ${code}`);
    assert.equal(lineIsServicePackage({ fgCode: fg }), yes, `แพ็คเกจ ${code}`);
    assert.equal(serviceLineRole({ fgCode: fg, productId: 'P1', metadata: {} }), yes ? 'package' : 'not_service', `ชนิด FG ${code}`);
    assert.equal(serviceLineRole({ metadata: { categoryCode: code } }), yes ? 'package' : 'not_service', `ชนิดพิมพ์เอง ${code}`);
    assert.equal(lineTakesPacks({ metadata: { categoryCode: code } }, null), yes, `แพ็คพิมพ์เอง ${code}`);
  }
});
