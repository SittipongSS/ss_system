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
  assert.match(body, /"forecastManualValue" = COALESCE\(d\."forecastManualValue", d\."projectValue"\),/);
  // ยอดที่เขียนคือตัวเดียวกับที่ใช้เป็น wonValue = ยอดก่อน VAT ของใบ (GREATEST กันติดลบ)
  assert.match(body, /v_won_value := GREATEST\(0, v_quote\."totalAmount" - COALESCE\(v_quote\."vatAmount", 0\)\);/);
});

test('mig 0361 = 0284 ทุกตัวอักษร + เพิ่มสี่บรรทัดเท่านั้น (ไม่ได้แก้ด่านอื่นติดมือ)', () => {
  const strip = (s) => s.split('\n')
    .filter((l) => !/"(projectValue|forecastSource|forecastQuotationId|forecastManualValue)" =/.test(l))
    .filter((l) => !/^\s*(--|$)/.test(l))
    .map((l) => l.trim()).join('\n');
  assert.equal(strip(fnBody(mig0361)), strip(fnBody(mig0284)), 'นิยามต้องต่างจาก 0284 แค่สี่ช่องที่เพิ่ม');
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

test('สคริปต์ backfill: ซ้อมเป็นค่าตั้งต้น · ไม่แตะช่องที่ปลุกทริกเกอร์ Actual', () => {
  const script = read('scripts/backfill-deal-fc-from-accepted-quote.mjs');
  assert.match(script, /const apply = process\.argv\.includes\('--apply'\);/);
  assert.match(script, /if \(!apply\) \{/);
  const patch = script.slice(script.indexOf('const patch = {'), script.indexOf('};', script.indexOf('const patch = {')));
  for (const banned of ['stage', 'wonValue', 'metadata']) {
    assert.doesNotMatch(patch, new RegExp(`\\b${banned}:`), `ห้ามเขียน ${banned} — ทริกเกอร์ Actual จะถูกปลุก`);
  }
  assert.match(patch, /projectValue: t\.next,/);
  assert.match(script, /acceptedQuotationId/);
});
