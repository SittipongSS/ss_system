/* ยอดของดีลต้องมาจากเอกสาร (มติผู้ใช้ 2026-09-16 รอบบ่าย)
 *   *"ถ้า QT SO ถูกต้อง แม่นยำ แล้ว FC เช็คยอดจากตรงนั้น มันก็น่าจะถูกมั้ย"*
 * · Actual = Σ ใบสั่งขายที่อนุมัติ (ก่อน VAT) — ทริกเกอร์เขียนให้อยู่แล้ว (0353/0360)
 * · ยอดดีล (FC) = ใบเสนอราคาที่ลูกค้ารับ — ก่อน mig 0361 ไม่มีใครเขียนตอนรับใบเลย
 * · รายงานวางแผนผลิตต้องอ่านบรรทัดจากใบที่ลูกค้ารับ ไม่ใช่ใบที่ FC บังเอิญชี้อยู่
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportQuotationIdOf } from '@/lib/sales/reportQuotation';
import { isWonAwaitingSo } from '@/lib/sales/dashboardMetrics';
import { forecastBreakdownOfDeal } from '@/lib/sales/forecastBreakdown';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const mig0284 = read('supabase/migrations/0284_accept_quotation_without_evidence.sql');
const mig0361 = read('supabase/migrations/0361_deal_value_from_accepted_quotation.sql');
const fnBody = (sql) => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.accept_quotation_atomic(');
  return sql.slice(start, sql.indexOf('$$;', start));
};

test('mig 0361: รับใบ = เขียนยอดดีลจากใบนั้น · ชี้ใบที่รับ · เก็บเลขกรอกมือไว้', () => {
  const body = fnBody(mig0361);
  assert.match(body, /"projectValue" = v_won_value,/);
  assert.match(body, /"forecastSource" = 'quotation',/);
  assert.match(body, /"forecastQuotationId" = v_quote\.id,/);
  // ⚠️ ต้องเป็น CASE ไม่ใช่ COALESCE — forecastManualValue เป็น NOT NULL DEFAULT 0 (0337)
  //    กิ่งสำรองของ COALESCE จึงไม่มีวันทำงาน แล้วเลขที่ AE กรอกมือหายเงียบ
  assert.match(body, /"forecastManualValue" = CASE WHEN d\."forecastSource" = 'manual' THEN d\."projectValue" ELSE d\."forecastManualValue" END,/);
  assert.doesNotMatch(body, /"forecastManualValue" = COALESCE\(/, 'COALESCE กับคอลัมน์ NOT NULL DEFAULT 0 = กิ่งตาย');
  // ยอดที่เขียนคือตัวเดียวกับที่ใช้เป็น wonValue = ยอดก่อน VAT ของใบ (GREATEST กันติดลบ)
  assert.match(body, /v_won_value := GREATEST\(0, v_quote\."totalAmount" - COALESCE\(v_quote\."vatAmount", 0\)\);/);
});

test('mig 0361 = 0284 ทั้งไฟล์ + เพิ่มสี่บรรทัดเท่านั้น (ไม่มีคำสั่งอื่นแอบมาด้วย)', () => {
  // เทียบ **ทั้งไฟล์** ไม่ใช่แค่ตัวฟังก์ชัน — คำสั่ง backfill / ALTER / GRANT ที่ต่อท้ายหลัง $$;
  // จะไม่โผล่ถ้าเทียบเฉพาะนิยาม และไฟล์นี้เป็นไฟล์ที่ผู้ใช้จะก๊อปไปรันมือทั้งก้อน
  const added = /^"(projectValue|forecastSource|forecastQuotationId|forecastManualValue)" =/;
  const strip = (sql) => sql.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--') && !added.test(l)).join('\n');
  assert.equal(strip(mig0361), strip(mig0284), 'ทั้งไฟล์ต้องต่างจาก 0284 แค่สี่ช่องที่เพิ่มในคำสั่ง UPDATE เดิม');
});

test('ทริกเกอร์ Actual ไม่ถูกแตะ — ยอด Actual ยังมาจากใบสั่งขายที่อนุมัติเท่านั้น', () => {
  assert.doesNotMatch(mig0361, /CREATE OR REPLACE FUNCTION public\.sync_sales_order_actual/);
  assert.doesNotMatch(mig0361, /CREATE OR REPLACE FUNCTION public\.enforce_sales_order_actual_on_deal/);
});

test('รายงานวางแผนผลิต: ใบที่ลูกค้ารับมาก่อนใบที่ FC ชี้', () => {
  assert.equal(reportQuotationIdOf({ metadata: { acceptedQuotationId: 'QT-รับ' }, forecastSource: 'quotation', forecastQuotationId: 'QT-อื่น' }), 'QT-รับ');
  assert.equal(reportQuotationIdOf({ forecastSource: 'quotation', forecastQuotationId: 'QT-อื่น' }), 'QT-อื่น');
  assert.equal(reportQuotationIdOf({ forecastSource: 'manual', forecastQuotationId: 'QT-อื่น' }), null, 'ดีลที่ไม่ได้เดินตามใบ ไม่ยืมใบมาวางแผนผลิต');
  assert.equal(reportQuotationIdOf({}), null);
  assert.equal(reportQuotationIdOf(null), null);
  const route = read('src/app/api/sales-planning/forecast-report/route.js');
  assert.match(route, /import \{ reportQuotationIdOf \} from '@\/lib\/sales\/reportQuotation';/);
  assert.match(route, /const reportQuoteId = reportQuotationIdOf\(deal\);/);
  assert.match(route, /quotationLines: linesByQuote\.get\(reportQuoteId\) \|\| \[\],/);
  assert.match(route, /quoteNumber: quoteNumberById\.get\(reportQuoteId\) \|\| null,/);
  assert.doesNotMatch(route, /linesByQuote\.get\(deal\.forecastQuotationId\)/, 'ห้ามเหลือทางเก่าไว้');
});

/* กองรอยื่น SO หลังมติรอบบ่าย: ใบอนุมัติแล้ว (แม้ 0 บาท = ส่วนลด 100%) = จบ ออกจากกอง */
test('ดีลที่มี SO อนุมัติแล้ว ไม่อยู่ในกองรอยื่น SO แม้ยอดใบเป็น 0', () => {
  const base = { stage: 'won', projectValue: 182160, wonValue: 0, metadata: { actualSource: 'sale_order' } };
  const zeroApproved = { ...base, metadata: { ...base.metadata, wonMonth: '2026-08', wonValueExVat: 0 } };
  assert.equal(isWonAwaitingSo(zeroApproved), false, 'ใบ 0 บาทที่อนุมัติแล้ว = จบ');
  const noSo = { ...base, metadata: { ...base.metadata, wonMonth: null } };
  assert.equal(isWonAwaitingSo(noSo), true, 'ยังไม่มีใบอนุมัติ = ยังรอ');
  const zeroPending = { ...base, metadata: { ...base.metadata, wonMonth: null, soPendingAmount: 0, soPendingCount: 1 } };
  assert.equal(isWonAwaitingSo(zeroPending), true, 'ใบที่ยื่นแล้วยอด 0 ยังไม่มีเงินเข้า = ยังรอ');
  const pending = { ...base, metadata: { ...base.metadata, wonMonth: null, soPendingAmount: 182160, soPendingCount: 1 } };
  assert.equal(isWonAwaitingSo(pending), false, 'มีเงินรออนุมัติ = ไปกองรออนุมัติ');
});

/* สคริปต์ backfill: กติกาคัดดีล/ค่าที่เขียน อยู่ใน dealValueBackfill.test.mjs (ทดสอบตัวฟังก์ชันจริง
   ไม่ใช่เทียบสตริง) — ที่นี่เหลือแค่ยืนยันว่ามันเดินตามใบที่ลูกค้ารับเหมือนทางอื่นทั้งระบบ */
test('สคริปต์ backfill เดินตามใบที่ลูกค้ารับตัวเดียวกับ mig 0361', () => {
  const script = read('scripts/backfill-deal-fc-from-accepted-quote.mjs');
  assert.match(script, /from '\.\.\/src\/lib\/sales\/dealValueBackfill\.js'/);
  assert.match(script, /planDealValueBackfill\(deals, quoteIndexOf\(quotes\)\)/);
  const planner = read('src/lib/sales/dealValueBackfill.js');
  assert.match(planner, /acceptedQuotationId/);
  assert.match(planner, /quotationWonAmount\(quote\)/);
});

/* ── รายงาน FC รายหมวด (Excel) ────────────────────────────────────────────── */
test('breakdown: ดีลที่ลูกค้ารับใบแล้ว เดินตามบรรทัดของใบ แม้ forecastSource ยังเป็น manual', () => {
  // ของจริง 16/09: ดีล Won 171 ใบมี acceptedQuotationId ทุกใบ แต่ 129 ใบยัง forecastSource = 'manual'
  const rows = forecastBreakdownOfDeal(
    { id: 'D', projectValue: 100000, forecastSource: 'manual', metadata: { acceptedQuotationId: 'Q' } },
    {
      quotationLines: [{ id: 'L1', productId: 'P1', qty: 200, unit: 'ชิ้น', unitPrice: 500, lineTotal: 100000, sortOrder: 0 }],
      valueItems: [{ seq: 1, categoryCode: '09-999', qty: 1, unit: 'งาน', unitPrice: 100000, amount: 100000 }],
      productById: new Map([['P1', { id: 'P1', fgCode: 'FG-1', categoryCode: '01-002', volume: 30, volumeUnit: 'ml', saleUnit: 'ชิ้น' }]]),
      quoteNumber: 'QT-รับ',
    },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].categoryCode, '01-002', 'ต้องมาจากบรรทัดใบ ไม่ใช่แถวรายหมวดที่กรอกไว้ก่อน');
  assert.equal(rows[0].source, 'quotation');
  assert.equal(rows[0].quoteNumber, 'QT-รับ');
  assert.equal(rows[0].fcAmount, 100000);
});

test('breakdown: ดีลที่ยังไม่มีใบที่ลูกค้ารับ ยังใช้แถวรายหมวดเหมือนเดิม (ป้าย manual ไม่เพี้ยน)', () => {
  const rows = forecastBreakdownOfDeal(
    { id: 'D', projectValue: 90000, forecastSource: 'manual', metadata: { wonMonth: '2026-09' } },
    {
      quotationLines: [{ id: 'L1', productId: 'P1', qty: 1, unit: 'ชิ้น', unitPrice: 999999, lineTotal: 999999, sortOrder: 0 }],
      valueItems: [{ seq: 1, categoryCode: '02-001', qty: 300, unit: 'ขวด', unitPrice: 300, amount: 90000 }],
      productById: new Map(),
    },
  );
  assert.equal(rows[0].categoryCode, '02-001');
  assert.equal(rows[0].source, 'manual');
  assert.equal(rows[0].quoteNumber, null);
});

test('รายงาน: ดีลยอด 0 ที่มีใบ ยังต้องอยู่ในไฟล์ — ของยังต้องผลิต', () => {
  const route = read('src/app/api/sales-planning/forecast-report/route.js');
  /* 🐞 เดิม `if (!Number(deal.projectValue)) continue;` ⇒ ใบที่ลด 100% (ยอด 0 · มติผู้ใช้ 2026-09-16)
     หายจากไฟล์ทั้งดีล ทั้งที่จำนวน/ปริมาตรของมันคือสิ่งที่ฝ่ายผลิตต้องเตรียม */
  assert.match(route, /if \(!Number\(deal\.projectValue\) && !reportQuotationIdOf\(deal\)\) continue;/);
  assert.doesNotMatch(route, /if \(!Number\(deal\.projectValue\)\) continue;/, 'ห้ามเหลือด่านเก่าที่ตัดด้วยยอดอย่างเดียว');
});

/* ── ย้อนรับใบ ───────────────────────────────────────────────────────────── */
test('ย้อนรับใบ: ดีลที่กลับมาเปิดต้องคิดยอดใหม่ ไม่ค้างยอดของใบที่ถูกย้อน', () => {
  const route = read('src/app/api/sales-planning/quotations/[id]/unaccept/route.js');
  /* RPC ย้อนรับใบ (unaccept_quotation_atomic) ไม่คืนสี่ช่องที่ mig 0361 เขียนตอนรับใบ
     ⇒ ไม่เรียกตัวนี้ = ดีลเปิดค้างยอด/ชี้ใบที่เพิ่งถูกย้อน */
  assert.match(route, /import \{ applyForecastSource \} from '@\/lib\/sales\/forecastSourceRepo';/);
  assert.match(route, /await applyForecastSource\(supabase, before\.deal\.id, \{ cause: 'unaccept' \}\);/);
  // ต้องอยู่ **หลัง** การย้อนรับใบสำเร็จ และไม่ล้มคำขอถ้าคิดยอดไม่ได้
  assert.ok(route.indexOf('applyForecastSource(supabase') > route.indexOf('recordAudit'), 'ต้องเรียกหลังย้อนรับใบเสร็จ');
  assert.match(route, /catch \(forecastError\) \{/, 'คิดยอดพังต้องไม่ล้มคำขอที่ commit ไปแล้ว');
  // ห้ามกลืนเงียบ — เส้นอนุมัติใบส่ง forecast กลับให้จอ เส้นนี้ต้องพูดภาษาเดียวกัน
  assert.match(route, /deal: result\?\.deal \|\| null, forecast \}\);/, 'ต้องส่ง forecast กลับให้จอ');
});

/* ── หน้าดีล: การ์ดมูลค่าคาดการณ์แยกตามหมวด ─────────────────────────────── */
test('หน้าดีล: หัวการ์ดรายหมวดรวมจากแถวจริง + บอกยอดตามใบเมื่อไม่ตรง', () => {
  const page = read('src/app/sales-planning/deals/[id]/page.js');
  /* 🐞 เดิมหัวการ์ดเขียน `รวม ${money(deal.projectValue)}` ⇒ ทันทีที่ยอดดีลเดินตามใบ (mig 0361)
     หัวการ์ดขัดกับผลบวกของแถวในการ์ดตัวเอง โดยไม่มีอะไรบนจอบอกว่าทำไม */
  assert.match(page, /const valueItemsTotal = \(deal\?\.valueItems \|\| \[\]\)\.reduce\(/);
  assert.match(page, /meta=\{`\$\{deal\.valueItems\.length\} หมวด · รวม \$\{money\(valueItemsTotal\)\}`\}/);
  assert.doesNotMatch(page, /หมวด · รวม \$\{money\(deal\.projectValue\)\}/, 'ห้ามกลับไปใช้ยอดดีลเป็นผลรวมของตาราง');
  assert.match(page, /valueItemsDiffer &&/);
  assert.match(page, /ยอดดีลตอนนี้ \{money\(deal\.projectValue\)\}/);
  /* ⚠️ คำต้องตามที่มาจริง — ดีลเปิดที่ FC เดินตามใบที่อนุมัติภายใน ยังไม่มีใบที่ลูกค้ารับ */
  assert.match(page, /acceptedQuote\s*\n?\s*\? ` ตามใบเสนอราคาที่ลูกค้ารับ/);
  assert.match(page, /ตามใบเสนอราคาที่ FC เดินตาม/);
  assert.doesNotMatch(
    page,
    /ยอดดีลตอนนี้ \{money\(deal\.projectValue\)\} ตามใบเสนอราคาที่ลูกค้ารับ/,
    'ห้ามเขียน "ใบที่ลูกค้ารับ" แบบไม่มีเงื่อนไข — ดีลเปิดยังไม่มีใบแบบนั้น',
  );
});
