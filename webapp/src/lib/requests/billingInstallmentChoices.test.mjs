// ตัวเลือกงวดของคำร้องขอเอกสารการเงิน (PR-2 · มติเจ้าของ 28/10/2026) + ลิงก์จากหน้า QT + ต่อสายจอ
// ⭐ สิ่งที่ล็อก: มีงวดจริงบน SO = งวดจริง (ผูกด้วย id) · ยังไม่มี = แผนของ QT (ผูกด้วยเลข) · งวดที่มีคำร้องแล้วยังเลือกได้ ·
//   งวดยกมา/คืนเงิน/โมฆะเลือกไม่ได้ · คำร้อง "ไม่ระบุงวด" แยกแถว · หา SO จาก QT ด้วยใบที่มีชีวิต (ไม่ใช่ maybeSingle)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { billingInstallmentChoices, installmentChoiceKey, installmentChoicePayload } from './billingInstallmentChoices.js';
import { quotationBillingRequestHref } from '../sales/billingRequestHref.js';

const quotation = {
  id: 'QT-1', totalAmount: 1000,
  paymentPlan: { type: 'installment', installments: [{ label: 'มัดจำ', percent: 50 }, { label: 'ก่อนส่งของ', percent: 50 }] },
};
const order = { id: 'SO-1', orderNumber: 'SO-26100001-0', status: 'approved' };
const inst = (id, seq, extra = {}) => ({ id, seq, label: `งวดที่ ${seq}`, percent: 50, amount: 500, status: 'pending', billingRequestId: null, ...extra });

test('ยังไม่มีงวดจริง = แผนของ QT (ผูกด้วยเลข) · คำร้องที่เลือกเลขไว้แล้วอยู่ใต้แถว', () => {
  const out = billingInstallmentChoices({
    quotation,
    requests: [
      { id: 'R1', docNo: 'RQ-1', status: 'pending', installmentId: null, installmentSeq: 1 },
      { id: 'R2', docNo: '', status: 'draft', installmentId: null, installmentSeq: null },
    ],
  });
  assert.equal(out.source, 'plan');
  assert.deepEqual(out.rows.map((r) => [r.key, r.seq, r.label, r.amount, r.installmentId]), [
    ['seq:1', 1, 'มัดจำ', 500, null], ['seq:2', 2, 'ก่อนส่งของ', 500, null],
  ]);
  assert.deepEqual(out.rows[0].requests, [{ id: 'R1', docNo: 'RQ-1', status: 'pending' }]);
  assert.deepEqual(out.unassigned, [{ id: 'R2', docNo: '', status: 'draft' }]);
  // ใบสั่งขายที่ยังไม่มีแถวงวด (ร่างที่ยังไม่เริ่มติดตาม) = ยังเป็นแผน แต่บอกเลขใบ
  assert.equal(billingInstallmentChoices({ quotation, order, installments: [] }).source, 'plan');
  // ไม่มีแผน / ชำระเต็มจำนวน = หนึ่งงวด 100% (กติกาเดียวกับ installmentsFromPaymentPlan — ไม่ใช่ศูนย์งวด)
  const full = billingInstallmentChoices({ quotation: { id: 'Q', totalAmount: 800, paymentPlan: null } });
  assert.deepEqual(full.rows.map((r) => [r.key, r.percent, r.amount]), [['seq:1', 100, 800]]);
  assert.equal(billingInstallmentChoices({ quotation: null }).source, 'none');
});

test('มีงวดจริงบน SO = งวดจริง (ผูกด้วย id) · หลายคำร้องต่องวด · งวดยกมา/คืนเงิน/โมฆะเลือกไม่ได้', () => {
  const out = billingInstallmentChoices({
    quotation, order,
    installments: [
      inst('I2', 2, { label: 'ก่อนส่งของ' }),
      inst('I1', 1, { status: 'confirmed', billingRequestId: 'R1' }),
      inst('I3', 3, { kind: 'opening' }),
      inst('I4', 4, { status: 'confirmed', refundedAt: '2026-10-01T00:00:00Z' }),
    ],
    requests: [
      { id: 'R1', docNo: 'RQ-1', status: 'closed', installmentId: 'I1', createdAt: '2026-10-01' },
      { id: 'R2', docNo: 'RQ-2', status: 'pending', installmentId: 'I1', createdAt: '2026-10-02' },
      { id: 'R9', docNo: 'RQ-9', status: 'pending', installmentId: 'I-OLD', createdAt: '2026-10-03' }, // งวดของใบเก่าที่ยกเลิก
    ],
  });
  assert.equal(out.source, 'order');
  assert.equal(out.orderNumber, 'SO-26100001-0');
  assert.deepEqual(out.rows.map((r) => r.key), ['id:I1', 'id:I2', 'id:I3', 'id:I4'], 'เรียงตามเลขงวด');
  assert.deepEqual(out.rows[0].requests.map((r) => r.id), ['R1', 'R2'], 'งวดที่รับรองแล้วมีสองคำร้องได้');
  assert.equal(out.rows[0].blocked, '', 'รับรองแล้วยังขอเอกสารได้ (ใบเสร็จ)');
  assert.match(out.rows[2].blocked, /^งวดยกมา/);
  assert.match(out.rows[3].blocked, /คืนเงินแล้ว/);
  assert.deepEqual(out.unassigned.map((r) => r.id), ['R9']);
  const voided = billingInstallmentChoices({ quotation, order: { ...order, status: 'cancelled' }, installments: [inst('I1', 1)] });
  assert.match(voided.rows[0].blocked, /โมฆะ/);
});

test('installmentChoicePayload / installmentChoiceKey — ไทล์ ↔ ช่องของ POST และค่าที่มากับลิงก์', () => {
  const plan = billingInstallmentChoices({ quotation });
  const real = billingInstallmentChoices({ quotation, order, installments: [inst('I1', 1), inst('I3', 2, { kind: 'opening' })] });
  assert.deepEqual(installmentChoicePayload(plan, 'seq:2'), { installmentSeq: 2 });
  assert.deepEqual(installmentChoicePayload(real, 'id:I1'), { linkInstallmentId: 'I1' });
  assert.deepEqual(installmentChoicePayload(real, 'id:I3'), {}, 'งวดที่เลือกไม่ได้ = ไม่ส่ง');
  assert.deepEqual(installmentChoicePayload(real, ''), {});
  assert.equal(installmentChoiceKey(real, { installmentId: 'I1' }), 'id:I1');
  assert.equal(installmentChoiceKey(plan, { installmentSeq: '2' }), 'seq:2');
  assert.equal(installmentChoiceKey(real, { installmentSeq: 1 }), '', 'เลขแผนไม่ชี้งวดจริง (เลขหลังปรับแผนไม่ใช่เลขในแผน)');
  assert.equal(installmentChoiceKey(plan, { installmentId: 'I9' }), '');
});

test('quotationBillingRequestHref: ปุ่มรวมไม่เติมงวด · รายแถวเติมยอด + งวดจริง/เลขแผน · กลับหน้า QT', () => {
  const params = (href) => Object.fromEntries(new URL(href, 'http://x').searchParams);
  assert.deepEqual(params(quotationBillingRequestHref({ id: 'QT-1' })),
    { kind: 'billing_doc', quotationId: 'QT-1', returnTo: '/sa/quotations/QT-1' });
  assert.deepEqual(params(quotationBillingRequestHref({ id: 'QT-1' }, { seq: 2, amount: 500, installmentId: null })),
    { kind: 'billing_doc', quotationId: 'QT-1', returnTo: '/sa/quotations/QT-1', billAmount: '500', installmentSeq: '2' });
  assert.deepEqual(params(quotationBillingRequestHref({ id: 'QT-1' }, { seq: 1, amount: 500, installmentId: 'I1' })),
    { kind: 'billing_doc', quotationId: 'QT-1', returnTo: '/sa/quotations/QT-1', billAmount: '500', installmentId: 'I1' });
  // ทุกพารามิเตอร์ = ที่หน้า /requests/new อ่านจริง
  const page = readFileSync('src/app/requests/new/page.js', 'utf8');
  for (const name of ['kind', 'quotationId', 'returnTo', 'billAmount', 'installmentId', 'installmentSeq']) {
    assert.ok(page.includes(`searchParams.get("${name}")`), name);
  }
});

/* ── ต่อสายที่ route/จอ (ยามรูปของโค้ด) ───────────────────────────────────────────────────── */
test('หา SO จาก QT = ใบที่มีชีวิต (isLiveSalesOrder) ไม่ใช่ maybeSingle — UNIQUE ถอดตั้งแต่ 0161/0169', () => {
  const route = readFileSync('src/app/api/sa/requests/billing-installments/route.js', 'utf8');
  assert.match(route, /const order = \(orders \|\| \[\]\)\.find\(isLiveSalesOrder\) \|\| null;/);
  assert.match(route, /await loadScoped\(supabase, 'quotations', quotationId, user, 'view'\)/, 'ด่านเห็นตามดีลของ QT');
  const post = readFileSync('src/app/api/sa/requests/route.js', 'utf8');
  const seqBlock = post.slice(post.indexOf('const seqInput = body.installmentSeq;'), post.indexOf('installmentSeq = seq;'));
  assert.match(seqBlock, /\.find\(isLiveSalesOrder\)/);
  assert.doesNotMatch(seqBlock, /from\('sales_orders'\)[^;]*maybeSingle/);
});

test('ฟอร์ม: ไทล์ส่งงวดที่เลือกทาง extra · เปลี่ยนใบล้างงวด · ช่องยอด remount ตามงวด · โหมดแก้อ่านอย่างเดียว', () => {
  const page = readFileSync('src/app/requests/new/page.js', 'utf8');
  assert.match(page, /const installmentExtra = installmentPick\?\.installmentId \? \{ linkInstallmentId: installmentPick\.installmentId \}/);
  assert.match(page, /: installmentPick\?\.installmentSeq \? \{ installmentSeq: installmentPick\.installmentSeq \} : \{\};/);
  assert.match(page, /confirmData \? \{ confirmsRequestId: confirms \} : installmentExtra/);
  assert.match(page, /installmentPrefill=\{installmentPrefill\}/);
  const form = readFileSync('src/components/requests/RequestForm.js', 'utf8');
  assert.match(form, /billPercent: null, billAmount: null, installmentPick: null,/, 'เปลี่ยนใบ = งวดเดิมเป็นของใบเก่า');
  assert.match(form, /onPick=\{\(pick\) => set\(\{ installmentPick: pick, billPercent: null, billAmount: pick \? pick\.amount : null \}\)\}/);
  assert.match(form, /key=\{`\$\{value\.quotationId \|\| "no-quotation"\}\|\$\{value\.installmentPick\?\.key \|\| "none"\}`\}/);
  assert.match(form, /<DerivedField label="งวดชำระ" from="แนบ\/ถอดที่การ์ดการชำระของใบสั่งขาย" value=\{lockedRefs\.installment\} \/>/);
});

test('หน้า QT: บล็อกตามงวด + ปุ่มรวม — ด่านเดียวกับ POST (billingQuotationError · costing:edit) · ไม่ขึ้นตอนแก้ใบ', () => {
  const qt = readFileSync('src/app/sales-planning/quotations/[id]/page.js', 'utf8');
  assert.match(qt, /const canOpenRequest = useCan\("costing:edit"\);/);
  assert.match(qt, /quote && !billingQuotationError\(quote\) && !editMode \? \(\s*<QuotationBillingRequests quotation=\{quote\} canRequest=\{canOpenRequest\} \/>/);
  assert.match(qt, /visible: !!quote && !billingQuotationError\(quote\) && !editMode && canOpenRequest,\s*href: quote \? quotationBillingRequestHref\(quote\) : undefined,/);
});
