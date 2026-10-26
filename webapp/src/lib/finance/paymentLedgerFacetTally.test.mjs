// ── ทะเบียนการชำระ: เลขบนการ์ด = แถวที่เห็นหลังกดการ์ด (ตรวจตัวเลข M10 · M10b · 20/10/2026) ─────────────
// 🐞 การ์ดสามใบ "แทนค่า" ตัวกรองของตัวเองตอนกด (รอบวางบิล → 7d · ใบกำกับ → missing · สถานะ → reported)
//    แต่เดิมอ่านเลขจาก `ledgerSummary(แถวที่ผ่านตัวกรองทุกตัวแล้ว)` ⇒ ตัวกรองของการ์ดตั้งค่าอื่นค้างอยู่ = การ์ดบอก 0
//    กดแล้วได้หลายงวด · ตัวเลือก "ยังไม่ออกใบ (n)" ในเมนูก็อ่านเลขเดียวกันนั้น
// ⭐ เทสต์ไล่ทุกค่าของตัวกรองที่ชนกัน แล้วเทียบเลขของการ์ดกับ **filterLedger หลังใส่พารามิเตอร์ที่การ์ดกด** ตรง ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  filterLedger, ledgerBillingTally, ledgerFacetTally, ledgerRow, ledgerSummary,
} from './paymentLedger.js';

const TODAY = '2026-09-25';
const RULE_5_25 = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
const make = (extra = {}) => ledgerRow({
  installment: {
    id: `SOI-${extra.id || extra.seq || 1}`, seq: 1, label: 'มัดจำ', percent: 50, amount: 1000, status: 'pending', evidence: [],
    ...extra,
  },
  order: { id: 'SOR-1', orderNumber: 'SO-26080050-0', customerId: 'CUS-267' },
  quotation: null,
  customer: { id: 'CUS-267', name: 'บริษัท เจอร์นัล แล็บ จำกัด', arCode: 'AR-267', billingRule: RULE_5_25 },
  todayIso: TODAY,
});

/* ชุดที่ทุกการ์ดมีของ และตัวกรองแต่ละตัวมีค่าที่ "ชนกัน" ให้ตั้งค้างได้จริง */
const fixture = () => [
  make({ id: 'p1', seq: 1, billingDate: '2026-09-28', amount: 100.1 }), // ถึงรอบ 7 วัน
  make({ id: 'p2', seq: 2, billingDate: '2026-09-27', amount: 200.2, status: 'reported', paidOn: '2026-09-20' }), // 7 วัน + รอรับรอง + ค้างใบกำกับ
  make({ id: 'p3', seq: 3, billingDate: '2026-09-10', amount: 300.3 }), // เลยรอบ
  make({ id: 'p4', seq: 4, amount: 400.4, status: 'reported', paidOn: '2026-09-21' }), // รอรับรอง + ค้างใบกำกับ
  make({ id: 'p5', seq: 5, amount: 500.5, status: 'confirmed', paidOn: '2026-09-01' }), // ค้างใบกำกับ
  make({ id: 'p6', seq: 6, amount: 600.6, status: 'confirmed', paidOn: '2026-08-01', taxInvoiceNo: 'IV-1', taxInvoiceDate: '2026-08-02' }),
  make({ id: 'p7', seq: 7, billingDate: '2026-10-01', amount: 700.7, status: 'reported', paidOn: '2026-09-22', taxInvoiceNo: 'IV-2' }), // 7 วัน + รอรับรอง + ออกใบแล้ว
];

const BILLINGS = ['', 'soon', '7d', 'month', 'late', 'missing', 'cutoff'];
const INVOICES = ['', 'missing', 'issued'];
const STATUSES = [[], ['pending'], ['reported'], ['confirmed'], ['pending', 'confirmed']];
const QUERIES = ['', 'มัดจำ', 'ไม่มีคำนี้'];

function* combos() {
  for (const billing of BILLINGS) {
    for (const taxInvoice of INVOICES) {
      for (const status of STATUSES) {
        for (const q of QUERIES) yield { billing, taxInvoice, status, q, on: billing === 'cutoff' ? '2026-09-30' : '' };
      }
    }
  }
}

test('ถึงรอบวางบิล 7 วัน: เลข/ยอดบนการ์ด = แถวหลังกด (billing → 7d) ทุกค่าของตัวกรองที่ค้างอยู่', () => {
  const all = fixture();
  let checked = 0;
  for (const f of combos()) {
    const tally = ledgerBillingTally(all, f);
    const after = filterLedger(all, { ...f, billing: '7d' });
    assert.equal(tally.counts['7d'], after.length, JSON.stringify(f));
    assert.equal(tally.amounts['7d'], ledgerSummary(after).totalAmount, `ยอด ${JSON.stringify(f)}`);
    checked += 1;
  }
  assert.ok(checked > 100);
});

test('🔴 ของจริงที่พัง: กรอง "เลยรอบ" อยู่ การ์ด 7 วันเคยบอก 0 ทั้งที่กดแล้วได้งวด', () => {
  const all = fixture();
  const f = { billing: 'late' };
  const shown = filterLedger(all, f);
  assert.equal(ledgerSummary(shown).billingIn7DaysCount, 0, 'เลขเดิม (summary ของแถวที่กรองแล้ว) — ตัวที่โกหก');
  // p1 เท่านั้น — p2/p7 แจ้งชำระแล้ว ไม่ใช่งานวางบิล 7 วัน (ธงของ ledgerRow)
  assert.equal(ledgerBillingTally(all, f).counts['7d'], 1);
  assert.deepEqual(filterLedger(all, { ...f, billing: '7d' }).map((r) => r.id), ['p1']);
});

test('ยังไม่ออกใบกำกับ: เลข/ยอดบนการ์ดและตัวเลือก = แถวหลังกด (taxInvoice → missing) ทุกค่าของตัวกรองที่ค้างอยู่', () => {
  const all = fixture();
  for (const f of combos()) {
    const { missingInvoice } = ledgerFacetTally(all, f);
    const after = filterLedger(all, { ...f, taxInvoice: 'missing' });
    assert.equal(missingInvoice.count, after.length, JSON.stringify(f));
    assert.equal(missingInvoice.amount, ledgerSummary(after).missingInvoiceAmount, `ยอด ${JSON.stringify(f)}`);
  }
});

test('รอบัญชีรับรอง: เลข/ยอดบนการ์ด = แถวหลังกด (status → reported) ทุกค่าของตัวกรองที่ค้างอยู่', () => {
  const all = fixture();
  for (const f of combos()) {
    const { awaiting } = ledgerFacetTally(all, f);
    const after = filterLedger(all, { ...f, status: ['reported'] });
    assert.equal(awaiting.count, after.length, JSON.stringify(f));
    assert.equal(awaiting.amount, ledgerSummary(after).awaitingAmount, `ยอด ${JSON.stringify(f)}`);
  }
});

test('🔴 ของจริงที่พัง: ตั้ง "ออกใบแล้ว" อยู่ การ์ดเคยบอก 0 · ติ๊ก "รอชำระ" อยู่ การ์ดรอรับรองเคยบอก 0', () => {
  const all = fixture();
  const issued = { taxInvoice: 'issued' };
  assert.equal(ledgerSummary(filterLedger(all, issued)).missingInvoiceCount, 0);
  assert.equal(ledgerFacetTally(all, issued).missingInvoice.count, 3);
  assert.equal(filterLedger(all, { ...issued, taxInvoice: 'missing' }).length, 3);

  const pending = { status: ['pending'] };
  assert.equal(ledgerSummary(filterLedger(all, pending)).awaitingCount, 0);
  assert.equal(ledgerFacetTally(all, pending).awaiting.count, 3);
  assert.equal(filterLedger(all, { ...pending, status: ['reported'] }).length, 3);
});

test('ไม่มีตัวกรองชนกัน = เลขเดิมของ summary (การแก้ไม่ขยับตัวเลขของคนที่ไม่ได้กรอง)', () => {
  const all = fixture();
  const s = ledgerSummary(filterLedger(all, {}));
  const facet = ledgerFacetTally(all, {});
  assert.equal(facet.awaiting.count, s.awaitingCount);
  assert.equal(facet.awaiting.amount, s.awaitingAmount);
  assert.equal(facet.missingInvoice.count, s.missingInvoiceCount);
  assert.equal(ledgerBillingTally(all, {}).counts['7d'], s.billingIn7DaysCount);
  assert.equal(ledgerBillingTally(all, {}).amounts['7d'], s.billingIn7DaysAmount);
});

// ── ยามต่อสาย: route คิด → ส่งถึงหน้า → การ์ดอ่านจากตัวนับที่ถอดตัวกรองของตัวเอง ─────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('ยามต่อสาย: route คืน facetTally · หน้าอ่าน · การ์ดสามใบและตัวเลือกใบกำกับไม่อ่าน summary แล้ว', () => {
  const ROUTE = code('app/api/finance/payments/route.js');
  const PAGE = code('app/finance/payments/page.js');
  assert.match(ROUTE, /const facetTally = ledgerFacetTally\(all, filters\);/);
  assert.match(ROUTE.slice(ROUTE.indexOf('return ok({')), /\bfacetTally,/);
  assert.match(PAGE, /facetTally: body\.facetTally \|\| null,/);
  assert.match(PAGE, /label="รอบัญชีรับรอง" value=\{fmtMoney\(awaitingCard\.amount\)\}/);
  assert.match(PAGE, /label="ยังไม่ออกใบกำกับ" value=\{`\$\{missingInvoiceCard\.count\} งวด`\}/);
  assert.match(PAGE, /value=\{`\$\{billing7dCount\} งวด`\}/);
  assert.match(PAGE, /const billing7dCount = billingTally\?\.counts\?\.\["7d"\] \?\? 0;/);
  assert.match(PAGE, /ยังไม่ออกใบ\$\{missingInvoiceCard\.count \?/);
  for (const stale of ['summary.billingIn7DaysCount', 'summary.billingIn7DaysAmount', 'summary.missingInvoiceCount',
    'summary.missingInvoiceAmount', 'summary.awaitingCount', 'summary.awaitingAmount', 'summary?.missingInvoiceCount']) {
    assert.ok(!PAGE.includes(stale), `หน้ายังอ่าน ${stale} — เลขของการ์ดที่แทนค่าตัวกรองต้องมาจากตัวนับที่ถอดตัวกรองนั้น`);
  }
});
