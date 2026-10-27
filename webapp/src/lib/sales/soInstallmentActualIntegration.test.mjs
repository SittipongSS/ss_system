// ── นับ Actual ทั้งใบ / รายงวด (mig 0412 · docs/so-installment-actual.md) — รอยต่อระหว่างชั้นที่รอบรวมงานเก็บตก ──────────
// ⭐ ทุกเทสต์ในไฟล์นี้ยืนยันสองทาง: ใบรายงวดพูดยอดที่นับแล้ว · ใบทั้งใบ (ทุกใบวันนี้) ได้ประโยคเดิมทุกตัวอักษร
// ⚠️ ไม่ต่อฐาน — ตัวคิด/ข้อความล้วน + อ่านซอร์สของจอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paymentCarryPrompt, paymentPlanEditPrompt } from '../approvalPrompt.js';
import { installmentActualLabelOf, replanPromptFacts } from './installmentReplan.js';
import { serviceReopenPrompt, serviceSetupApprovalEffects } from './serviceSetup.js';
import { documentWorkflowError, WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8');

const INSTALLMENT_SO = Object.freeze({
  id: 'SOR-1', orderNumber: 'SO-26100001-0', status: 'approved', origin: 'pipeline', actualMode: 'installment',
  totalAmount: 107000, actualAmount: 100000, actualCountedAmount: 33000, actualSubmittedAmount: 0,
  approvedAt: '2026-10-05T03:00:00.000Z',
});
const WHOLE_SO = Object.freeze({ ...INSTALLMENT_SO, actualMode: 'order', actualCountedAmount: 0 });

/* ── 1. โมดัลปรับแผนงวด / ยกเงิน: บรรทัด "Actual ไม่เปลี่ยน" ─────────────────────────────────────────────── */
test('installmentActualLabelOf: ใบรายงวด = ยอดที่นับแล้ว · ใบทั้งใบ/ใบเก่าก่อน 0412 = ว่าง', () => {
  assert.equal(installmentActualLabelOf(INSTALLMENT_SO), '฿33,000.00');
  assert.equal(installmentActualLabelOf(WHOLE_SO), '');
  assert.equal(installmentActualLabelOf({ ...WHOLE_SO, actualMode: undefined }), '');
});

test('โมดัลปรับแผนงวด: ใบรายงวดบอกยอดที่นับแล้ว ไม่ใช่ "ยอดเต็ม เดือนอนุมัติใบ" · ใบทั้งใบประโยคเดิม', () => {
  const before = [{ id: 'I1', seq: 1, amount: 53500, status: 'confirmed' }, { id: 'I2', seq: 2, amount: 53500, status: 'pending' }];
  const after = [{ id: 'I1', seq: 1, amount: 53500 }, { id: 'I2', seq: 2, amount: 30000 }, { id: null, seq: 3, amount: 23500 }];
  const inst = paymentPlanEditPrompt(replanPromptFacts(INSTALLMENT_SO, before, after)).detail;
  assert.match(inst, /ยอด Actual รายงวดที่นับแล้ว ฿33,000\.00 ไม่เปลี่ยน/);
  assert.doesNotMatch(inst, /ยอด Actual ฿100,000\.00 เดือน/);
  const whole = paymentPlanEditPrompt(replanPromptFacts(WHOLE_SO, before, after)).detail;
  assert.match(whole, /ยอด Actual ฿100,000\.00 เดือน .+ ไม่เปลี่ยน — ใบยังอนุมัติอยู่ ไม่ต้องย้อนการอนุมัติ/);
  assert.doesNotMatch(whole, /รายงวด/);
});

test('โมดัลยกเงิน: ใบรายงวดบอกว่างวดที่ยกมาต้องยื่น-อนุมัติในใบนี้อีกรอบ (0412 ล้างช่อง Actual ของแถวที่ยก)', () => {
  const base = {
    orderNumber: 'SO-2', sourceNumber: 'SO-1', count: 1, amountLabel: '฿10.00', totalLabel: '฿107,000.00',
    actualAmountLabel: '฿100,000.00', actualMonthLabel: 'ต.ค. 2569',
  };
  const inst = paymentCarryPrompt({ ...base, installmentActualLabel: '฿33,000.00' }).detail;
  assert.match(inst, /ยอด Actual รายงวดที่นับแล้วของใบนี้ ฿33,000\.00 ไม่เปลี่ยน — งวดที่ยกมาต้องยื่นขอนับและให้ AE Sup อนุมัติในใบนี้อีกรอบ/);
  const whole = paymentCarryPrompt(base).detail;
  assert.match(whole, /ยอด Actual ฿100,000\.00 เดือน ต\.ค\. 2569 ของใบนี้ไม่เปลี่ยน — SO-1 ยกเลิกแล้วไม่นับ Actual อยู่แล้ว/);
  /* review รอบสอง 26/10: เงินที่ยกแทนงวดที่นับตอนอนุมัติใบทั้งงวด — Actual ย้ายไปแถวที่ยก (RPC 0412 C2) ⇒ แถวนั้นไม่ต้องยื่นอีก */
  const moved = 'Actual ที่นับไว้ตอนอนุมัติใบของงวดที่ 1 ฿30,000.00 (ก่อน VAT) ย้ายไปอยู่กับงวดที่ยกมา (งวดที่ 1) — ยอดและเดือน Actual ไม่เปลี่ยน';
  const one = paymentCarryPrompt({ ...base, installmentActualLabel: '฿30,000.00', actualMovedLine: moved }).detail;
  assert.ok(one.includes(`· ${moved}`), one);
  assert.match(one, /ไม่เปลี่ยน — ไม่มีงวดที่ยกมาต้องยื่นขอนับเพิ่ม/);
  assert.doesNotMatch(one, /งวดที่ยกมาต้องยื่นขอนับและให้ AE Sup/);
  const two = paymentCarryPrompt({ ...base, count: 2, installmentActualLabel: '฿30,000.00', actualMovedLine: moved }).detail;
  assert.match(two, /งวดที่ยกมางวดอื่นต้องยื่นขอนับและให้ AE Sup อนุมัติในใบนี้อีกรอบ/);
  // แผงงวดส่ง facts ทั้งก้อนเข้า prompt — คีย์ต้องเดินถึง (ไม่ใช่ประกอบเองที่จอ)
  assert.match(code('lib/sales/installmentCarry.js'), /installmentActualLabel: installmentActualLabelOf\(order\),/);
  assert.match(code('lib/sales/installmentReplan.js'), /installmentActualLabel: installmentActualLabelOf\(order\),/);
});

/* ── 2. โมดัลอนุมัติ/เปิดแก้งานบริการ: "ไม่แตะ Actual … เท่าเดิม" ─────────────────────────────────────────── */
test('งานบริการ: บรรทัด "ไม่แตะ Actual" ของใบรายงวดบอกยอดที่นับแล้วจากยอดเต็ม · ใบทั้งใบประโยคเดิม', () => {
  const ctx = (order) => ({ order, lines: [], installments: [], zones: [], fgOptionIds: new Set() });
  const effects = (order) => serviceSetupApprovalEffects(ctx(order), { flow: 'backfill' }).filter(Boolean).join('\n');
  assert.match(effects(INSTALLMENT_SO), /— Actual รายงวด นับแล้ว ฿33,000\.00 จาก ฿100,000\.00 · ยอดรวม ฿107,000\.00/);
  assert.match(effects(WHOLE_SO), /— Actual ต\.ค\. \d{4} ฿100,000\.00 · ยอดรวม ฿107,000\.00/);
  const reopen = (order) => serviceReopenPrompt(ctx(order)).effects.filter(Boolean).join('\n');
  assert.match(reopen(INSTALLMENT_SO), /Actual รายงวด นับแล้ว ฿33,000\.00 จาก ฿100,000\.00/);
  assert.match(reopen(WHOLE_SO), /— Actual ต\.ค\. \d{4} ฿100,000\.00 · ยอดรวม/);
});

/* ── 3. ข้อความไทยของรหัสที่ไม่ใช่ RPC: CHECK หัวใบ + ด่านของไฟล์ตอนรันบน SQL Editor ─────────────────────────── */
test('ทุก RAISE ของ 0412 (รวม mig_0412_*) และ CHECK หัวใบมีข้อความไทย — ไม่ตกเป็น 500 ข้อความกลาง', () => {
  const sql = code('../supabase/migrations/0412_so_installment_actual.sql').replace(/--[^\n]*/g, '');
  const raised = new Set([...sql.matchAll(/RAISE EXCEPTION '([a-z][a-z0-9_]+)/g)].map((m) => m[1]));
  assert.ok([...raised].some((c) => c.startsWith('mig_0412_')), 'ต้องเจอด่านของไฟล์');
  for (const raw of raised) {
    // RAISE ของด่านไฟล์บางตัวต่อท้ายบริบท (requires_0378_0382 — …) — ตัวแปลหาด้วย includes
    assert.ok(WORKFLOW_ERROR_CODES.some((c) => raw.includes(c) || c.includes(raw)), `${raw} ยังไม่มีข้อความไทย`);
  }
  for (const check of ['sales_orders_actual_mode_valid', 'sales_orders_actual_cache_sane', 'sales_order_installments_actual_shape']) {
    assert.match(sql, new RegExp(`CONSTRAINT ${check}`), `${check} ต้องเป็นชื่อ CHECK จริงของ 0412`);
    const mapped = documentWorkflowError({ code: '23514', message: `violates check constraint "${check}"` });
    assert.equal(mapped.status, 409, check);
    assert.equal(mapped.code, check);
  }
  assert.equal(documentWorkflowError(new Error('mig_0412_patch_anchor _so_installments_write_plan lock=1/1/0')).status, 409);
});

/* ── 4. จอ: การ์ดใบสั่งขายบนหน้าใบเสนอราคา + จำนวนงวดของตัวเลือกแบบการนับ ──────────────────────────────────── */
test('หน้าใบเสนอราคา: การ์ด SO ของใบรายงวดพูดยอดที่นับแล้วผ่านตัวกลาง · ใบทั้งใบประโยคเดิม', () => {
  const page = code('app/sales-planning/quotations/[id]/page.js');
  assert.match(page, /isInstallmentActualOrder\(quote\.salesOrder\)\s*\? `Actual รายงวด · นับแล้ว \$\{fmtMoney\(salesOrderActual\(quote\.salesOrder\)\)\} จาก \$\{fmtMoney\(quote\.salesOrder\.actualAmount\)\} ก่อน VAT`\s*: `Actual ก่อน VAT \$\{fmtMoney\(quote\.salesOrder\.actualAmount\)\}`/);
  // route พกสามช่องของ 0412 มาให้แล้ว (ไม่มี actualMode = ถือเป็นทั้งใบ ยอดเกินจริง)
  assert.match(code('app/api/sales-planning/quotations/[id]/route.js'), /"actualMode", "actualCountedAmount", "actualSubmittedAmount"/);
});

test('หน้าใบสั่งขาย: สิทธิ์เลือก "รายงวด" นับงวดด้วย installmentCountAtFreeze ตัวเดียวกับ route (ไม่ใช่ installments.length)', () => {
  const page = code('app/sales-planning/sales-orders/[id]/page.js');
  const route = code('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(page, /import \{ installmentCountAtFreeze \} from "@\/lib\/sales\/salesOrderActualRoute";/);
  assert.match(page, /const eligibility = actualModeEligibility\(order, frozenCount\);/);
  assert.match(route, /installmentCountAtFreeze\(/);
  // ไฟล์ของ route ใช้ฝั่ง client ได้ — ไม่ดึงอะไรของ server (ฐาน/next/server) เข้ามา
  const helper = code('lib/sales/salesOrderActualRoute.js');
  assert.doesNotMatch(helper, /from ['"](@\/lib\/supabase|next\/server|@\/lib\/serverAuth|node:)/);
});
