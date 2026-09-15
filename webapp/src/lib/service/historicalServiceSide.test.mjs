// ── ใบสั่งขายย้อนหลังฝั่งบริการ (mig 0360 · แผน P1 §3-K) — ยามสายไฟที่เทสต์หน่วยมองไม่เห็น ─────────────
//
// ⭐ ตัวตัดสิน (fgSummary · bindQueue · bindTargetError · evaluateVisitGate) มีเทสต์หน่วยของตัวเองแล้ว
//   ไฟล์นี้กัน "สายไฟ": select ที่ต้องพกคอลัมน์ของ 0360 · route ที่ต้องเรียกตัวตัดสินก่อนเขียน ·
//   ตัวโหลดบริบทด่านที่ห้ามกลืน error · จอที่ต้องถามตัวตัดสินตัวเดียวกับ server
// 🔴 คอลัมน์ตกจาก select = ตัวตัดสินได้ undefined แล้วตอบผิดเงียบ ๆ — คิวนี้เจอมาแล้วกับ `serviceContractId`
//    (UAT 2026-09-01: ชิป "ยังไม่ผูกสัญญา" ทุกใบตลอดกาล) · `check:columns` จับได้แค่คอลัมน์ที่ไม่มีในฐาน
//    ไม่ใช่คอลัมน์ที่ลืมเลือก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const selectOf = (src, table) => {
  const hit = src.match(new RegExp(`from\\(\\s*'${table}'\\s*\\)\\s*\\.select\\('([^']*)'`));
  assert.ok(hit, `หา select ของ ${table} ไม่เจอ`);
  return hit[1];
};

test('คิวงานเข้าใหม่: ใบพก origin + เลขเดิม + ร่องรอยยกเว้น · บรรทัดพกจุดติดตั้ง', () => {
  const route = code('app/api/service/intake/route.js');
  const orders = selectOf(route, 'sales_orders');
  for (const col of ['origin', '"historicalQuoteRef"', '"historicalExpressRef"', '"historicalInvoiceRef"', '"paymentGateExemptAt"']) {
    assert.ok(orders.includes(col), `select ของใบต้องมี ${col}`);
  }
  assert.ok(selectOf(route, 'sales_order_lines').includes('"installationPoint"'));
});

test('ผูกโซน: ตรวจปลายทางด้วย bindTargetError ก่อนเขียน · ตัดวันของ term จาก body · audit รายแถวพกจุดติดตั้ง', () => {
  const route = code('app/api/service/intake/bind/route.js');
  const sites = selectOf(route, 'service_sites');
  for (const col of ['"customerId"', 'kind', '"isActive"']) assert.ok(sites.includes(col), `select ไซต์ต้องมี ${col}`);
  assert.ok(selectOf(route, 'service_zones').includes('"isActive"'));
  assert.ok(selectOf(route, 'sales_order_lines').includes('"installationPoint"'));
  const check = route.indexOf('bindTargetError(');
  const insert = route.indexOf(".from('service_zone_terms').insert(");
  assert.ok(check > 0 && insert > check, 'ต้องตรวจปลายทางก่อน insert ทั้งชุด');
  /* เรียกตัวตัดสินแล้วทิ้งผล = ด่านหายเงียบ ⇒ ตรึงการตีกลับเองด้วย */
  const guard = route.indexOf('if (targetError) return badRequest(targetError);');
  assert.ok(guard > check && guard < insert, 'ต้องตีกลับทันทีเมื่อปลายทางผิด ก่อน insert');
  assert.match(route, /delete safeRow\.startDate;\s*delete safeRow\.endDate;/);
  assert.match(route, /normalizeTermInput\(\{\s*\.\.\.snapshot,\s*\.\.\.safeRow,/);
  assert.doesNotMatch(route, /\.\.\.row,/, 'ห้ามกระจาย body ดิบลง normalizeTermInput');
  assert.match(route, /installationPoint: linesById\.get\(t\.salesOrderLineId\)\?\.installationPoint \?\? null/);
});

test('🔴 บริบทด่านเข้าไซต์: เลือก origin + paymentGateExemptAt และไม่กลืน error ของทั้งสามก้อน', () => {
  const src = code('lib/service/gateContext.js');
  const orders = selectOf(src, 'sales_orders');
  assert.ok(orders.includes('origin') && orders.includes('"paymentGateExemptAt"'));
  const loads = src.match(/const \{[^}]*\} = await fetchInChunks\(/g) || [];
  assert.equal(loads.length, 3, 'ใบ · งวด · สัญญา');
  for (const load of loads) assert.match(load, /error:/, `ต้องรับ error: ${load}`);
  for (const name of ['orderError', 'installmentError', 'contractError']) {
    assert.match(src, new RegExp(`if \\(${name}\\) throw ${name};`), name);
  }
});

test('ด่านเข้าไซต์: ยกเว้นเฉพาะข้อ② ผ่าน historicalGateExempt — ไม่แตะข้อ① และไม่อ่านคอลัมน์เอง', () => {
  const src = code('lib/service/visitGate.js');
  const linked = src.indexOf('const linked = live.filter(');
  const paid = src.indexOf('const paid = covered.filter(');
  const exempt = src.indexOf('historicalGateExempt(pick(ordersById, t.salesOrderId))');
  assert.ok(linked > 0 && paid > linked && exempt > paid, 'ยกเว้นต้องอยู่ในตัวกรองข้อเงิน หลังข้อสัญญา');
  assert.doesNotMatch(src.slice(0, paid), /historicalGateExempt\(/, 'ห้ามยกเว้นก่อนถึงข้อเงิน');
  assert.doesNotMatch(src, /paymentGateExemptAt/, 'ถามผ่านตัวตัดสินกลางเท่านั้น (ถาม origin ด้วยเสมอ)');
});

test('wizard: ใบย้อนหลังชี้ไป "เพิ่มไซต์ย้อนหลัง" ด้วยลิงก์ (ไม่ฝังโมดัล) · ถามด่านปลายทางตัวเดียวกับ server ก่อนส่ง', () => {
  const src = code('components/service/IntakeWizard.js');
  assert.match(src, /const historical = isHistoricalOrder\(order\);/);
  const links = src.match(/<Link href="\/service\/sites" className=\{styles\.siteLink\}>เพิ่มไซต์ย้อนหลัง<\/Link>/g) || [];
  assert.equal(links.length, 2, 'สองจุดที่เคยชี้ทางใบคำร้องประเมินพื้นที่');
  assert.doesNotMatch(src, /LegacySiteModal/, 'โมดัลอยู่หลังสิทธิ์ของหน้าทะเบียนไซต์ (siteOrigin.test)');
  const ask = src.indexOf('bindTargetError(');
  assert.ok(ask > 0 && ask < src.indexOf('await onDone('), 'ต้องถามก่อนส่ง');
  /* ถามแล้วไม่หยุด = เหตุโผล่หลัง server ตีกลับ (ปุ่มกับด่านไม่ตรงกัน) ⇒ ตรึงการหยุดก่อนส่ง */
  const stop = src.search(/if \(targetErrors\.length\) \{\s*setError\(\[\.\.\.new Set\(targetErrors\)\]\.join\(" · "\)\);\s*return;\s*\}/);
  assert.ok(stop > ask && stop < src.indexOf('await onDone('), 'ต้องหยุดก่อนส่งเมื่อปลายทางผิด');
  assert.match(src, /\{group\.installationPoint && \(/);
});

test('หน้างานเข้าใหม่: ป้าย "ย้อนหลัง" ตัดสินด้วย isHistoricalOrder · ชิปยกเว้นด่านเงินอ่านจาก readiness', () => {
  const src = code('app/service/intake/page.js');
  assert.match(src, /isHistoricalOrder\(row\) && \(\s*<span className="cell-sub">\s*<StatusBadge tone="info" size="sm" label="ย้อนหลัง" \/>/);
  // ชิปอยู่ใน PaidBadge (#1720 แยกคอมโพเนนต์ให้ตาราง + การ์ดใช้ร่วม) — ตัวอ่านเดียวคือ readiness.paymentGateExempt
  assert.match(src, /function PaidBadge\(\{ readiness \}\) \{[\s\S]{0,400}readiness\?\.paymentGateExempt[\s\S]{0,80}label="ยกเว้นด่านเงิน"/);
  assert.equal((src.match(/<PaidBadge readiness=\{row\.readiness\} \/>/g) || []).length >= 2, true, 'ตารางและการ์ดใช้ PaidBadge ตัวเดียวกัน');
  assert.equal((src.match(/label="ย้อนหลัง"/g) || []).length, 2, 'ป้ายย้อนหลังขึ้นทั้งตารางและการ์ด');
});
