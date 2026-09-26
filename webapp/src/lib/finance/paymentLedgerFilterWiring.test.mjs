// ── ยามต่อสายตัวกรองของทะเบียนการชำระ (/finance/payments) ──────────────────────────────────────────
// ⭐ ตัวกรองหนึ่งตัวต้องต่อสายห้าที่ และ **ไม่มีเทสต์ตัวไหนคุมมาก่อน** (understand.json · finance-ledger · 26/09):
//   FILTER_KEYS (หน้า) → query useMemo + dep array (หน้า) → filterCount (หน้า) → literal `filters` (route) →
//   พารามิเตอร์ของ filterLedger (lib)
//   ตกที่ไหนก็พังเงียบ: ลืม dep = query ค้างค่าเก่า ไม่ยิงใหม่ · ลืม literal = API เมินทั้งจอและไฟล์ Excel
//   ลืมใน filterLedger = route ส่งค่าไปแล้วไม่มีใครอ่าน · ลืม filterCount = ปุ่มตัวกรองบอกว่าไม่ได้กรองอะไร
// ⭐ ไล่ **ทุกคีย์ใน FILTER_KEYS** ไม่ใช่เฉพาะรอบวางบิล (0389) — ตัวกรองถัดไปที่เพิ่มเข้าชุดโดนตรวจเองอัตโนมัติ
// ⚠️ ยามอ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "สายยังต่ออยู่" — ตรรกะจริงอยู่ที่ paymentLedger*.test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end >= 0, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return text.slice(start, end);
}

const PAGE = code('app/finance/payments/page.js');
const ROUTE = code('app/api/finance/payments/route.js');
const LIB = code('lib/finance/paymentLedger.js');

const FILTER_KEYS = JSON.parse(/const FILTER_KEYS = (\[[^\]]*\]);/.exec(PAGE)?.[1] || 'null');
/* ช่วงวัน/คำค้นไม่อยู่ในตัวนับบนปุ่มโดยตั้งใจ — อยู่นอกปุ่มตัวกรอง (ช่อง DateInput · ช่องค้นหา) */
const NOT_COUNTED = new Set(['from', 'to', 'q']);

test('FILTER_KEYS อ่านได้ และมีตัวกรองรอบวางบิล (mig 0389)', () => {
  assert.ok(Array.isArray(FILTER_KEYS) && FILTER_KEYS.length > 0, 'แกะ FILTER_KEYS ไม่ออก — ยามนี้ต้องแก้ตามรูปใหม่');
  assert.ok(FILTER_KEYS.includes('billing'));
});

test('ทุกคีย์ใน FILTER_KEYS: หน้าอ่านจาก URL · ใส่ใน query · อยู่ใน dep array · นับบนปุ่ม', () => {
  const start = PAGE.indexOf('const query = useMemo(');
  const depsAt = PAGE.indexOf('}, [', start);
  assert.ok(start >= 0 && depsAt > start, 'หา query useMemo ไม่เจอ');
  const body = PAGE.slice(start, depsAt);
  const deps = PAGE.slice(depsAt, PAGE.indexOf(']);', depsAt));
  const count = slice(PAGE, 'const filterCount =', ';');
  for (const key of FILTER_KEYS) {
    assert.ok(PAGE.includes(`params.get("${key}")`), `หน้าไม่อ่าน ?${key}= จาก URL`);
    assert.ok(body.includes(`sp.set("${key}"`), `query ไม่ส่ง ${key} ขึ้น API (ไฟล์ Excel ใช้ query ตัวเดียวกัน)`);
    assert.match(deps, new RegExp(`\\b${key}\\b`), `dep array ของ query ไม่มี ${key} — query ค้างค่าเก่า ไม่ยิงใหม่`);
    if (!NOT_COUNTED.has(key)) assert.ok(count.includes(key), `filterCount ไม่นับ ${key}`);
  }
});

test('ทุกคีย์ใน FILTER_KEYS มีค่าที่ผ่านตัวตัดสินแล้วใน `filterValues` — `filtering` อ่านจากก้อนนี้ ไม่ใช่พารามิเตอร์ดิบ', () => {
  const values = slice(PAGE, 'const filterValues = {', '};');
  for (const key of FILTER_KEYS) {
    assert.match(values, new RegExp(`\\b${key}\\b`), `filterValues ไม่มี ${key} — กรองด้วยคีย์นี้แล้วไม่ขึ้น "ล้างตัวกรอง"/"จาก N"`);
  }
  assert.match(PAGE, /const filtering = activeFilterKeys\.length > 0;/);
});

test('ทุกคีย์ใน FILTER_KEYS: route อ่านพารามิเตอร์เข้า literal `filters` · filterLedger รับทุกช่องของ literal', () => {
  const literal = slice(ROUTE, 'const filters = {', '};');
  for (const key of FILTER_KEYS) {
    assert.ok(literal.includes(`searchParams.get('${key}')`), `route ไม่อ่าน ?${key}= — API เมินเงียบทั้งจอและไฟล์`);
  }
  const fields = [...literal.matchAll(/^\s*(\w+)\s*[:,]/gm)].map((m) => m[1]);
  assert.ok(fields.includes('billing') && fields.includes('orderStates'), 'แกะชื่อช่องของ literal ไม่ออก');
  const params = slice(LIB, 'export function filterLedger(rows = [], {', '} = {})');
  for (const field of fields) {
    assert.match(params, new RegExp(`\\b${field}\\b`), `filterLedger ไม่รับ ${field} — route ส่งไปแล้วไม่มีใครอ่าน`);
  }
});

test('รอบวางบิล: ตัวนับ/ส่วนที่ซ่อนคิดที่ route ด้วยตัวกรองชุดเดียวกัน แล้วส่งถึงหน้า · การ์ดกดแล้วกรอง 7 วัน', () => {
  assert.match(ROUTE, /const billingTally = ledgerBillingTally\(all, filters\);/);
  assert.match(slice(ROUTE, 'return ok({', '});'), /\bbillingTally,/);
  assert.match(PAGE, /billingTally: body\.billingTally \|\| null,/);
  assert.match(PAGE, /onClick=\{\(\) => setFilter\("billing", billing === "7d" \? "" : "7d"\)\}/);
  assert.match(slice(PAGE, 'key: "billing"', 'onChange'), /single: true,/);
  // คำร้องที่งวดผูกอยู่ต้องถึง ledgerRow — ไม่ส่ง = ทุกงวด "ยังไม่ขอ" แล้วเลยรอบนับเกินจริงเงียบ ๆ
  assert.match(ROUTE, /billingRequest: billingRequestById\.get\(installment\.billingRequestId\) \|\| null,/);
  // จำนวนงวดของทั้งใบประทับก่อนกรอง ("แสดง n จาก m งวด") — ต้องอยู่ก่อน filterLedger
  const stampAt = ROUTE.indexOf('stampOrderInstallmentCount(all);');
  assert.ok(stampAt > 0 && stampAt < ROUTE.indexOf('filterLedger(all, filters)'), 'ประทับจำนวนงวดหลังกรอง = นับแถวที่เหลือ');
  // ลูกค้าต้องโหลดรอบวางบิลมาด้วย (มีทางถอยก่อนรัน 0389)
  assert.match(ROUTE, /\.select\('id, name, "nameEn", "arCode", "billingRule"'\)/);
  assert.match(ROUTE, /if \(withRule\.error\?\.code !== '42703'\) return withRule;/);
});

/* ⭐ ค่าใหม่ของตัวกรองที่มีอยู่แล้ว (`billing=soon` · รอบสอง 26/09) ไม่ผ่านห้าที่ข้างบน — คีย์ `billing` ต่อสายไว้แล้ว
   แต่ **ค่า** ต้องมี clause ใน filterLedger + ตัวนับใน ledgerBillingTally ของตัวเอง ⇒ ลืม clause = ตัวเลือกในเมนูกดแล้ว
   ไม่กรองอะไรเลย (ทะเบียนเต็มทั้งที่ชิปบอกว่ากรองอยู่) · ลืมตัวนับ = วงเล็บตัวเลขหายจากตัวเลือกนั้นคนเดียว */
test('ทุกค่าของ LEDGER_BILLING_FILTERS มี clause ใน filterLedger และตัวนับใน ledgerBillingTally', () => {
  const values = [...slice(LIB, 'export const LEDGER_BILLING_FILTERS = Object.freeze([', ']);')
    .matchAll(/\{ value: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(values.includes('soon') && values.includes('7d'), 'แกะค่าของ LEDGER_BILLING_FILTERS ไม่ออก');
  const filter = slice(LIB, 'export function filterLedger(', '\nexport function ');
  const tally = slice(LIB, 'export function ledgerBillingTally(', '\nexport function ');
  const counts = slice(tally, 'counts: {', '},');
  for (const value of values) {
    assert.match(filter, new RegExp(`billingFilter === '${value}' && !r\\.\\w+\\) return false;`), `filterLedger ไม่กรอง billing=${value}`);
    assert.match(counts, new RegExp(`(^|[\\s{,])'?${value}'?: base\\.filter`, 'm'), `ledgerBillingTally ไม่นับ ${value}`);
  }
});
