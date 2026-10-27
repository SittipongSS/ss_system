// ── จอของ "นับ Actual ทั้งใบ / รายงวด" (mig 0412 · มติเจ้าของ 26/10/2026 · docs/so-installment-actual.md) ─────────────────
//
// ยามสองชั้น:
//   1. ข้อความโมดัล (lib/approvalPrompt.js) — ทุกคำสั่งของงวดบอกผลที่ตรวจได้ (ยอดก่อน VAT · กองที่ยอดย้ายไป · เดือน) และใบทั้งใบ
//      ได้คำเดิมทุกตัวอักษร (กติกาโมดัลอนุมัติ #1223)
//   2. ต่อสายของจอ (อ่าน source) — โมดัลอนุมัติเลือกแบบด้วยแผ่น (ไม่ใช่ดรอปดาวน์) แล้วส่ง `actualMode` ทุกครั้ง · ปุ่มของงวดถามด่าน
//      ตัวเดียวกับ route (`gate` → installmentActionError) · บัญชีรับรองงวดที่ยังไม่อนุมัติ = ปุ่มโชว์แต่ดับ + เหตุ ·
//      อนุมัติแล้วนับงวดแรกไม่สำเร็จ = ทักเตือนพร้อมทางกู้ "นับงวด 1"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installmentActualSubLine, installmentActualSubParts, wonDealForecastHint } from './dealAmountDisplay.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  installmentActualApprovePrompt, installmentActualCountRestLines, installmentActualRejectLines, installmentActualStartPrompt,
  installmentActualSubmitPrompt, installmentActualWithdrawPrompt, paymentConfirmPrompt,
} from '../approvalPrompt.js';
import { INSTALLMENT_REMAINING_LABEL } from './dashboardMetrics.js';
import { PENDING_APPROVAL_LABEL } from './salesOrderWorkflow.js';
import {
  INSTALLMENT_ACTUAL_AFTER_COUNT_REST, INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, INSTALLMENT_ACTUAL_REPORT_BLOCKED, INSTALLMENT_ACTUAL_SELF_APPROVAL,
  INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL, INSTALLMENT_ACTUAL_UNFROZEN, countRestBlocker, installmentActualActionError, installmentActualCountRestDone,
  INSTALLMENT_ACTUAL_START_LABEL, INSTALLMENT_ACTUAL_START_LEFT_LABEL, installmentActualCountedLate,
  installmentActualLockReason, installmentActualNextStep,
  installmentActualReadyForOwner, installmentActualReportWaitReason, installmentActualShares, installmentActualStartPreview,
  installmentActualUnfrozen, nextSubmittableInstallment,
} from './salesOrderActualMode.js';
import { documentWorkflowError } from './documentWorkflowErrors.js';
import { actualGateStatus } from './salesOrderActualRoute.js';
import { installmentActionError } from './salesOrderPayments.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์ทิ้ง (คงเลขบรรทัด) — ยามอ่านโค้ด ไม่ใช่คำอธิบาย */
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}
const bullets = (prompt) => prompt.detail.split('\n').filter((line) => line.startsWith('· '));
/* ทักหลังอนุมัติแบบรายงวดของหน้าใบ — รันตัวจริงจาก source (ตัวแปรระดับไฟล์ที่มันอ้าง: APPROVE_INSTALLMENT_COUNT_REST_TOAST) */
const approveInstallmentToastOf = (page) => new Function(
  `${slice(page, 'const APPROVE_INSTALLMENT_COUNT_REST_TOAST = ', ';\n')};\n${slice(page, 'const approveInstallmentToast = ', '\n};\n')}\n};\nreturn approveInstallmentToast;`,
)();

const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const DIALOG = 'components/salesPlanning/InstallmentConfirmDialog.js';
const FN_PAGE = 'app/finance/payments/page.js';

// ── 1. ข้อความโมดัล ──────────────────────────────────────────────────────────────────────────────────────────

test('บัญชีรับรองงวดของใบรายงวด: ไม่พูด "ยอดเต็มตั้งแต่ใบอนุมัติ" — งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด + ยื่นงวดถัดไปได้', () => {
  const whole = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿33,000.00', orderStatus: 'approved' });
  assert.match(whole.detail, /ยอด Actual ของฝ่ายขายไม่เปลี่ยน — เป็นยอดเต็มตั้งแต่ใบอนุมัติแล้ว/, 'ใบทั้งใบ = คำเดิม');
  assert.deepEqual(paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿33,000.00', orderStatus: 'approved', actualMode: 'order' }), whole,
    'ส่ง actualMode=order = ผลเท่าไม่ส่งทุกตัวอักษร');

  const inst = paymentConfirmPrompt({
    label: 'งวดที่ 2', amount: '฿33,000.00', orderStatus: 'approved', actualMode: 'installment',
    nextInstallmentLabel: 'งวดที่ 3 ฿34,000.00', nextNeedsActualSubmit: true, actualApprovedVia: 'review',
  });
  assert.doesNotMatch(inst.detail, /ยอดเต็มตั้งแต่ใบอนุมัติ/);
  assert.match(inst.detail, /ยอด Actual ไม่เปลี่ยน — ใบนี้นับ Actual รายงวด งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด/);
  assert.match(inst.detail, /ฝ่ายขายยื่นขอนับ Actual งวดถัดไป \(งวดที่ 3 ฿34,000\.00\) ได้ทันทีหลังรับรอง/);
  assert.match(inst.detail, /ถ้ารับรองผิด บัญชีถอนได้ที่เมนู “ถอนคำรับรอง”/, 'ทางถอนยังอยู่');
  /* 🐞 review 26/10: งวดสุดท้าย / งวดถัดไปยื่นหรือนับแล้ว (นับที่เหลือทั้งหมด) — เคยสัญญา "ยื่นงวดถัดไปได้" ทั้งที่ไม่มีขั้นนั้น */
  const noNext = paymentConfirmPrompt({ label: 'งวดที่ 3', amount: '฿34,000.00', orderStatus: 'approved', actualMode: 'installment',
    actualApprovedVia: 'review' });
  assert.doesNotMatch(noNext.detail, /ยื่นขอนับ Actual งวดถัดไป/, 'งวดสุดท้าย = ไม่มีบรรทัดยื่นงวดถัดไป');
  assert.match(noNext.detail, /งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด/);
  /* 🐞 UAT FN 27/10 ข้อ 4: บรรทัด Actual ตามทางที่งวดถูกนับ — งวดที่นับตอนอนุมัติใบ / นับที่เหลือทั้งหมด / ระบบนับเอง ไม่ใช่ "ตอนอนุมัติงวด" */
  const via = (over) => paymentConfirmPrompt({ label: 'งวดที่ 1', amount: '฿1.00', orderStatus: 'approved', actualMode: 'installment', ...over }).detail;
  assert.match(via({ actualApprovedVia: 'so_approval' }), /งวดนี้นับไปแล้วตอน AE Sup อนุมัติใบ/);
  assert.match(via({ actualApprovedVia: 'count_rest' }), /งวดนี้นับไปแล้วตอน AE Sup กด “นับที่เหลือทั้งหมด”/);
  assert.match(via({ actualApprovedVia: 'count_rest', actualAutoCounted: true }), /งวดนี้ระบบนับให้อัตโนมัติแล้ว \(ใบกด “นับที่เหลือทั้งหมด” ไว้ · มติข้อ 10\)/);
  assert.match(via({}), /ใบนี้นับ Actual รายงวด งวดนี้นับ Actual ไปแล้ว$/m, 'ไม่รู้ทาง = ไม่อ้างจังหวะ');
  for (const v of ['so_approval', 'count_rest', null]) assert.doesNotMatch(via({ actualApprovedVia: v }), /ตอน AE Sup อนุมัติงวด/);
  const nextCounted = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿33,000.00', orderStatus: 'approved', actualMode: 'installment',
    nextInstallmentLabel: 'งวดที่ 3 ฿34,000.00', nextNeedsActualSubmit: false });
  assert.doesNotMatch(nextCounted.detail, /ยื่นขอนับ Actual งวดถัดไป/, 'งวดถัดไปนับแล้ว/ยื่นแล้ว = ไม่มีบรรทัด');

  /* ใบที่ย้อนการอนุมัติ/ยกเลิก — คำของสถานะใบชนะ (Actual ของใบไม่นับอยู่แล้ว) */
  const revoked = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿1.00', orderStatus: 'approval_revoked', actualMode: 'installment' });
  assert.match(revoked.detail, /ระหว่างรอ Rev\. ใบนี้ไม่นับ Actual/);
  assert.doesNotMatch(revoked.detail, /นับ Actual รายงวด/);
});

test('ยื่น/ดึงกลับ/อนุมัติงวด: บอกยอดก่อน VAT · กองที่ยอดย้ายไป · เดือนที่นับ — ป้ายปุ่มเป็นคำกริยาเดียวกับปุ่มที่กดมา', () => {
  const labels = { pendingLabel: PENDING_APPROVAL_LABEL, remainingLabel: INSTALLMENT_REMAINING_LABEL };
  const submit = installmentActualSubmitPrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00', ...labels });
  assert.equal(submit.confirmLabel, 'ยื่นขอนับงวดนี้');
  assert.equal(submit.description, 'ยืนยันยื่นขอนับ Actual งวดที่ 2 · ฿33,000.00 หรือไม่');
  assert.match(bullets(submit)[0], /ยอดประมาณ ฿33,000\.00 \(ก่อน VAT\) ย้ายจาก “รอนับรายงวด” ขึ้นเป็น “รออนุมัติ” — ยังไม่นับเป็น Actual/);
  assert.ok(bullets(submit).some((line) => /แจ้งสลิปงวดนี้ได้หลัง AE Sup อนุมัติ/.test(line)), 'ลำดับมติข้อ 4: ยื่น → อนุมัติ → แจ้งสลิป');

  const withdraw = installmentActualWithdrawPrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00', ...labels });
  assert.equal(withdraw.confirmLabel, 'ดึงคำขอกลับ');
  assert.match(bullets(withdraw)[0], /ออกจาก “รออนุมัติ” กลับไปกอง “รอนับรายงวด”/);

  const approve = installmentActualApprovePrompt({
    label: 'งวดที่ 2', shareLabel: '฿33,000.00', monthLabel: 'ต.ค. 2569', countedAfterLabel: '฿66,000.00',
    totalLabel: '฿100,000.00', progressAfterLabel: '2/3 งวด', submittedByName: 'Kamonrat', pendingLabel: PENDING_APPROVAL_LABEL,
    nextNeedsSubmit: true,
  });
  assert.equal(approve.confirmLabel, 'อนุมัติงวดและนับ Actual');
  const lines = bullets(approve);
  assert.match(lines[0], /ยอด ฿33,000\.00 \(ก่อน VAT\) ย้ายจาก “รออนุมัติ” เข้าเป็น Actual ของเดือน ต\.ค\. 2569 \(เดือนที่อนุมัติงวด\)/);
  assert.match(lines[1], /Actual ของใบเป็น ฿66,000\.00 จาก ฿100,000\.00 \(นับแล้ว 2\/3 งวด\)/);
  assert.ok(lines.some((line) => /ฝ่ายขาย \(Kamonrat\) แจ้งสลิปงวดนี้ได้ แล้วบัญชีรับรองเงิน — งวดถัดไปยื่นได้หลังบัญชีรับรองงวดนี้/.test(line)));
  assert.ok(lines.some((line) => /ถอยได้ทางเดียวคือย้อนการอนุมัติทั้งใบ/.test(line)), 'ไม่มีถอนการอนุมัติงวดเดี่ยว (ค่าตั้งต้นในเอกสารมติ)');

  /* 🐞 review รอบสอง 26/10: งวดสุดท้าย (3/3 · หรือ 12/12 ของใบบริการ) ไม่มีงวดถัดไป · งวดที่แจ้งสลิปไว้แล้วไม่ต้องแจ้งซ้ำ */
  const last = bullets(installmentActualApprovePrompt({
    label: 'งวดที่ 3', shareLabel: '฿34,000.00', monthLabel: 'ธ.ค. 2569', countedAfterLabel: '฿100,000.00', totalLabel: '฿100,000.00',
    progressAfterLabel: '3/3 งวด', pendingLabel: PENDING_APPROVAL_LABEL, nextNeedsSubmit: false,
  }));
  assert.ok(last.every((line) => !/งวดถัดไป/.test(line)), 'งวดสุดท้ายไม่สัญญางวดถัดไป');
  assert.ok(last.some((line) => /^· ฝ่ายขายแจ้งสลิปงวดนี้ได้ แล้วบัญชีรับรองเงิน$/.test(line)));
  const prepaid = bullets(installmentActualApprovePrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00', slipReported: true, nextNeedsSubmit: true }));
  assert.ok(prepaid.every((line) => !/แจ้งสลิปงวดนี้ได้/.test(line)), 'สลิปแจ้งไว้แล้ว = ไม่บอกให้แจ้งซ้ำ');
  assert.ok(prepaid.some((line) => /^· สลิปงวดนี้แจ้งไว้แล้ว — บัญชีรับรองเงินได้หลังอนุมัติ — งวดถัดไปยื่นได้หลังบัญชีรับรองงวดนี้$/.test(line)));
  /* แผงคิดสองธงจากแถวจริง (เกณฑ์เดียวกับโมดัลรับรอง: งวดถัดไปยังไม่ยื่น/ถูกตีกลับ) */
  const panel = code(PANEL);
  assert.match(panel, /nextNeedsSubmit: Boolean\(nextRow\) && \(nextRow\.actualStatus == null \|\| nextRow\.actualStatus === "rejected"\),/);
  /* review รอบสี่: ส่งสถานะเงินจริง (reported/confirmed แยกกัน) ไม่ใช่ธงรวม */
  assert.match(panel, /nextNeedsSubmit: [^\n]*\n\s*slipStatus: \["reported", "confirmed"\]\.includes\(row\?\.status\) \? row\.status : null,/);
  assert.doesNotMatch(panel, /slipReported:/);
});

test('ตีกลับงวด · นับที่เหลือทั้งหมด · นับงวด 1: บอกผลครบ (ไม่มีบรรทัดว่าง/undefined)', () => {
  const reject = installmentActualRejectLines({
    shareLabel: '฿33,000.00', pendingLabel: PENDING_APPROVAL_LABEL, remainingLabel: INSTALLMENT_REMAINING_LABEL,
  });
  assert.equal(reject.length, 2);
  assert.match(reject[0], /ออกจาก “รออนุมัติ” กลับไปกอง “รอนับรายงวด” — ไม่นับเป็น Actual/);

  const rest = installmentActualCountRestLines({
    count: 2, amountLabel: '฿67,000.00', monthLabel: 'ต.ค. 2569', totalLabel: '฿100,000.00', submittedCount: 1,
  });
  assert.match(rest[0], /งวดที่ยังไม่นับ 2 งวด รวม ฿67,000\.00 \(ก่อน VAT\) เข้าเป็น Actual ของเดือน ต\.ค\. 2569 ทันที — Actual ของใบครบ ฿100,000\.00/);
  assert.ok(rest.some((line) => /งวดที่ยื่นรออนุมัติอยู่ 1 งวด นับรวมไปด้วย/.test(line)));
  assert.ok(rest.some((line) => /ทางเดียว — ใบนี้นับทั้งก้อนจากนี้ไป/.test(line)), 'มติข้อ 8: ทางเดียว');
  // มติข้อ 10: กดแล้วงวดที่เพิ่มทีหลังนับให้เอง · Rev. แบบรายงวดก็นับให้ — ไม่ชี้ทาง "ออก Rev. แล้วกลับไปนับรายงวด" อีก
  assert.ok(rest.some((line) => /งวดที่เพิ่มทีหลัง \(ปรับแผนแบ่งงวด · ยกเงินเข้า\) ระบบนับ Actual ให้เองทันที ไม่ต้องยื่น/.test(line)));
  assert.ok(rest.every((line) => !/ต้องย้อนการอนุมัติแล้วออก Rev\./.test(line)));
  assert.ok(!installmentActualCountRestLines({ count: 1, amountLabel: '฿1.00', monthLabel: 'x', totalLabel: '฿1.00' })
    .some((line) => /ยื่นรออนุมัติ/.test(line)), 'ไม่มีงวดที่ยื่นอยู่ = ไม่พูด');

  const start = installmentActualStartPrompt({
    startLabel: 'งวด 1', amountLabel: '฿33,000.00', monthLabel: 'ต.ค. 2569', restAmountLabel: '฿67,000.00',
    remainingLabel: INSTALLMENT_REMAINING_LABEL,
  });
  assert.equal(start.confirmLabel, 'นับ Actual งวด 1');
  assert.match(bullets(start)[0], /งวด 1 ฿33,000\.00 \(ก่อน VAT\) เข้าเป็น Actual ของเดือน ต\.ค\. 2569/);
  assert.match(bullets(start)[1], /ที่เหลือ ฿67,000\.00 \(ก่อน VAT\) ยังอยู่กอง “รอนับรายงวด”/);
  assert.ok(bullets(start).some((line) => /กดซ้ำได้ไม่นับซ้ำ/.test(line)), 'RPC รันซ้ำได้ — โมดัลต้องไม่ขู่ว่านับซ้ำ');
  for (const prompt of [start, installmentActualSubmitPrompt({}), installmentActualApprovePrompt({})]) {
    assert.doesNotMatch(prompt.detail, /undefined|null/);
  }
});

/* ตัวเลขที่จอส่งเข้าโมดัลมาจากไฟล์กติกา (คู่กับ SQL) — 107,000 รวม VAT 7,000 แบ่ง 3 งวด = 33,000 / 33,000 / 34,000 (ผลของ harness PGlite) */
test('ภาพก่อนกดอนุมัติแบบรายงวด: งวด 1 นับทันที ที่เหลือ = Actual เต็ม − งวด 1 (ตัวคิดเดียวกับ RPC)', () => {
  const order = { actualMode: 'installment', status: 'pending_approval', origin: 'pipeline', totalAmount: 107000, actualAmount: 100000 };
  const rows = [
    { id: 'i1', seq: 1, amount: 35310, status: 'pending' },
    { id: 'i2', seq: 2, amount: 35310, status: 'pending' },
    { id: 'i3', seq: 3, amount: 36380, status: 'pending' },
  ];
  const start = installmentActualStartPreview(order, rows);
  assert.deepEqual(start.rows.map((row) => row.seq), [1]);
  assert.equal(start.amount, 33000);
  assert.deepEqual(installmentActualShares(order, rows).map((share) => share.amount), [33000, 33000, 34000]);
});

// ── 2. ต่อสายของจอ ───────────────────────────────────────────────────────────────────────────────────────────

test('หน้าใบ: โมดัลอนุมัติเลือกแบบด้วยแผ่น (OptionTiles · ไม่ใช่ดรอปดาวน์) แล้วส่ง actualMode ทุกครั้ง — Admin Override ด้วย', () => {
  const page = code(SO_PAGE);
  assert.match(page, /import OptionTiles from "@\/components\/ui\/OptionTiles";/);
  const choice = slice(page, 'function ActualModeChoice(', '\n}\n');
  assert.match(choice, /<OptionTiles/);
  assert.doesNotMatch(choice, /<Select|SearchableSelect|<select/, 'ชุดตายตัวสองตัวเลือก = แผ่น (memory: direct controls over dropdowns)');
  assert.match(choice, /label: "นับ Actual ทั้งใบ"/);
  assert.match(choice, /label: "นับ Actual รายงวด"/);
  assert.match(choice, /disabled: !eligible,/, 'เลือกไม่ได้ = แผ่นดับ ไม่ซ่อน');
  assert.match(choice, /\{eligibility && !eligible \? <p className="form-note">\{eligibility\.reason\}<\/p> : null\}/, 'เหตุเป็นตัวหนังสือใต้แผ่น');

  /* โมดัลอนุมัติปกติ: ผล/ป้ายปุ่มคิดต่อแบบ · ส่งแบบที่เลือก (ref — closure ตอนเปิดเห็นค่าเก่า) */
  const approve = slice(page, 'if (action === "approve") {', '\n      return;');
  assert.match(approve, /const plan = approveActualPlan\(\);/);
  assert.match(approve, /\.\.\.approveActualLines\(mode, plan\),/);
  /* มติข้อ 10 (review รอบสี่): Rev. ของใบที่กดนับที่เหลือทั้งหมด = ป้ายปุ่มบอกว่านับที่ค้างทั้งหมด ไม่ใช่ "งวด 1" */
  /* UAT 27/10 ข้อ 10: ป้ายของแผ่นรายงวดคิดจากงวดที่ขั้นนับตอนอนุมัติจะนับจริง (plan.start) — ไม่ใช่ "งวด 1" ตายตัว */
  assert.match(approve, /confirmLabel: mode === ACTUAL_MODE_INSTALLMENT \? approveInstallmentConfirmLabel\(plan\) : APPROVE_CONFIRM_ORDER_LABEL,/);
  assert.match(approve, /actualEligibility: \{ \.\.\.plan\.eligibility, countRestDone: plan\.countRestDone \},/);
  assert.match(approve, /action: \(\) => requestAction\("approve", \{ actualMode: approveActualModeRef\.current \}\),/);
  assert.match(page, /const APPROVE_CONFIRM_ORDER_LABEL = "อนุมัติและนับ Actual";/);
  assert.doesNotMatch(page, /"อนุมัติและนับ Actual งวด 1"/, 'ป้าย "งวด 1" ตายตัวต้องไม่กลับมา');
  const labelOf = new Function('fmtNumber', `${slice(page, 'const APPROVE_CONFIRM_COUNT_REST_LABEL = ', ';\n')};\n`
    + `${slice(page, 'const approveInstallmentConfirmLabel = ', '\n};\n')}\n};\nreturn approveInstallmentConfirmLabel;`)(String);
  assert.equal(labelOf({ start: { rows: [{ seq: 1 }] } }), 'อนุมัติและนับ Actual งวด 1');
  assert.equal(labelOf({ start: { rows: [{ seq: 3 }] } }), 'อนุมัติและนับ Actual งวด 3', 'ใบ Rev. ที่งวด 1–2 นับไว้แล้ว');
  assert.equal(labelOf({ start: { rows: [{ seq: 1 }, { seq: 3 }] } }), 'อนุมัติและนับ Actual 2 งวด', 'งวด 1 + งวด 0 บาท/งวดที่รับรองแล้ว');
  assert.equal(labelOf({ start: { rows: [] } }), 'อนุมัติ (นับ Actual รายงวด)', 'ไม่มีงวดใหม่ให้นับ (Rev. — มติข้อ 7)');
  assert.equal(labelOf({ countRestDone: true, start: { rows: [{ seq: 4 }] } }), 'อนุมัติและนับ Actual ที่ค้างทั้งหมด', 'มติข้อ 10 คงเดิม');
  assert.equal(labelOf({ start: { rows: [{ seq: 1 }] } }, { override: true }), 'ยืนยัน Override และนับ Actual งวด 1');
  assert.equal(labelOf({ start: { rows: [] } }, { override: true }), 'ยืนยัน Override (นับ Actual รายงวด)');
  assert.equal(labelOf({ countRestDone: true }, { override: true }), 'ยืนยัน Override และนับ Actual ที่ค้างทั้งหมด');
  /* UAT 27/10 ข้อ 9: แผ่นอยู่เหนือรายการผลลัพธ์ (`lead` ของ ConfirmDialog) — สลับแผ่นแล้วรายการยาวขึ้น แผ่นไม่เลื่อนหนีเคอร์เซอร์ */
  assert.match(page, /lead=\{confirmState\?\.actualModes \? \(\s*<ActualModeChoice\s+value=\{confirmState\.actualMode\}/);
  assert.doesNotMatch(page, /[^=]\{confirmState\?\.actualModes \? \(\s*<ActualModeChoice/, 'แผ่นไม่อยู่ใน children (ท้ายกล่อง) แล้ว');
  const dialog = code('components/ui/ConfirmDialog.js');
  assert.match(dialog, /\{resolvedDescription && <p id=\{`\$\{descriptionId\}-q`\}>\{thaiText\(resolvedDescription\)\}<\/p>\}\s*<div className="confirm-dialog-lead">\{lead\}<\/div>\s*\{detail && <p className="confirm-dialog-detail"/,
    'คำถาม → ตัวเลือก → รายการผลลัพธ์');
  const choose = slice(page, 'const chooseApproveActualMode = (mode) => {', '};');
  assert.match(choose, /approveActualModeRef\.current = mode;/);
  /* กล่องวาดชุดของแผ่นที่เลือก */
  assert.match(page, /const confirmView = confirmState\?\.actualModes\s*\? \{ \.\.\.confirmState, \.\.\.confirmState\.actualModes\[confirmState\.actualMode \|\| ACTUAL_MODE_ORDER\] \}/);
  for (const key of ['title', 'description', 'detail', 'confirmLabel']) {
    assert.match(page, new RegExp(`${key}=\\{confirmView\\?\\.${key}\\}`), `ConfirmDialog อ่าน ${key} จาก confirmView`);
  }

  /* ทั้งใบ = ประโยคเดิม · รายงวด = งวดแรก + ที่เหลือ ("รอนับรายงวด" ตามเดือนครบกำหนด) + ลำดับยื่น */
  const lines = slice(page, 'function approveActualLines(mode, plan) {', '\n  }\n');
  assert.match(lines, /`ยอด \$\{fmtMoney\(order\.actualAmount\)\} ย้ายจาก "\$\{PENDING_APPROVAL_LABEL\}" เข้าเป็น Actual ของเดือน \$\{formatMonthLabel\(currentMonth\(\)\)\}/);
  /* UAT 27/10 ข้อ 11: บรรทัดรายงวดใช้ “…” แบบเดียวกับโมดัลรายงวดของ lib/approvalPrompt (บรรทัดทั้งใบคงประโยคเดิม) */
  assert.match(lines, /ระหว่างรอขึ้นเป็น “\$\{INSTALLMENT_REMAINING_LABEL\}” ตามเดือนครบกำหนด/);
  assert.match(lines, /\(ก่อน VAT\) ย้ายจาก “\$\{PENDING_APPROVAL_LABEL\}” เข้าเป็น Actual ของเดือน \$\{month\}/);
  assert.match(lines, /"ฝ่ายขายยื่นขอนับงวดถัดไปได้หลังบัญชีรับรองเงินงวดก่อน"/);
  /* 🐞 review 26/10: ผลข้างเคียงใหญ่สุดของแผ่นรายงวดต้องอยู่ในโมดัล (#1223) — สลิป/รับรองเงินของงวดที่ยังไม่นับรอ AE Sup ทุกงวด ·
     ใบงานบริการ "จ่ายถึง"/นัดช่างเดินตามสองขั้นนั้น (ธงตัวเดียวกับด่านเงิน) */
  assert.match(lines, /"งวดที่ยังไม่นับ: ฝ่ายขายแจ้งสลิป\/บัญชีรับรองเงินได้หลัง AE Sup อนุมัตินับงวดนั้นแล้ว/);
  assert.match(lines, /hasServiceRounds\s*\? "ใบงานบริการ: “จ่ายถึง” และนัดช่างหลังช่วงที่รับรองแล้ว ขยับเมื่อ AE Sup อนุมัติงวดนั้นและบัญชีรับรองเงินแล้ว — ทุกงวด"\s*: null,/);
  assert.match(page, /const hasServiceRounds = orderHasServiceRounds\(order, order\?\.lines\);/);
  assert.match(slice(page, 'function ActualModeChoice(', '\n}\n'), /"งวด 1 เข้าเดือนนี้ · งวดถัดไป ยื่น → AE Sup อนุมัติ → แจ้งสลิป → บัญชีรับรอง"/);
  const plan = slice(page, 'function approveActualPlan() {', '\n  }\n');
  assert.match(plan, /actualModeEligibility\(order, frozenCount\)/, 'สิทธิ์เลือกจากไฟล์กติกาตัวเดียวกับ route');
  // จำนวนงวดตัวเดียวกับ route (installmentCountAtFreeze — คู่กับทุกกิ่งของ freezeInstallments) ไม่ใช่ installments.length ตรง ๆ
  assert.match(plan, /installmentCountAtFreeze\(installments, \{ plan, totalAmount: order\?\.totalAmount \}\)/);
  assert.match(plan, /installmentActualStartPreview\(order, planRows\)/);
  assert.match(plan, /order\?\.previousActualMode === ACTUAL_MODE_INSTALLMENT && eligibility\.eligible/, 'Rev. = แบบของใบก่อนหน้า');

  /* Admin Override ของใบ pipeline: ตัวเลือกเดียวกัน · ส่งแบบที่เลือก · ป้ายปุ่มตามแบบ */
  const override = slice(page, 'async function approveWithAdminOverride() {', '\n  }\n');
  assert.match(override, /requestAction\("approve", \{ overrideReason: "", actualMode \}\)/);
  assert.match(page, /<ActualModeChoice\s+value=\{overrideActualMode\}/);
  assert.match(page, /\? approveInstallmentConfirmLabel\(overridePlan, \{ override: true \}\)/, 'Override พูดตรงกับโมดัลปกติ');
  assert.match(page, /eligibility=\{\{ \.\.\.overridePlan\.eligibility, countRestDone: overridePlan\.countRestDone \}\}/);
});

test('หน้าใบ: นับงวดแรกล้มหลังอนุมัติ = ทักเตือนพร้อมทางกู้ "นับงวด 1" · ทักสำเร็จพูดตามแบบ', () => {
  const page = code(SO_PAGE);
  const request = slice(page, 'async function requestAction(action, payload = {}) {', '\n  async function save()');
  assert.match(request, /if \(action === "approve" && data\?\.installmentActualStartFailed\) \{\s*notifyToast\.warning\(data\.installmentActualNoRows \? APPROVE_INSTALLMENT_NO_ROWS_TOAST\s*: data\.installmentFreezeFailed \? approveFreezeFailedToast\(data\.installmentActualAlreadyCounted\)\s*: data\.installmentActualAlreadyCounted \? APPROVE_INSTALLMENT_START_LEFT_TOAST : APPROVE_INSTALLMENT_START_FAILED_TOAST,\s*RESPONSE_WARNING_TOAST\);/);
  /* review รอบสาม 26/10: ตัวหยุดยอดล้ม = route ไม่นับ ⇒ ทักบอกปุ่มกู้ (ตรึงแล้วนับ) ตามงวดที่ค้าง · ผลของปุ่มกู้บอกงวดที่นับได้จริง */
  assert.match(page, /const approveFreezeFailedToast = \(alreadyCounted\) => [^;]*\$\{alreadyCounted \? INSTALLMENT_ACTUAL_START_LEFT_LABEL : INSTALLMENT_ACTUAL_START_LABEL\}/);
  assert.match(page, /const actualStartToast = \(data, countRestDone = false\) => \{\s*if \(Number\(data\?\.counted\) > 0\) \{\s*return `นับ Actual งวด \$\{/);
  assert.match(request, /: action === "actual_start"\s*\? actualStartToast\(data, installmentActualCountRestDone\(installments\)\)/);
  assert.match(request, /kind: action === "withdraw" \|\| \(action === "actual_start" && !\(Number\(data\?\.counted\) > 0\)\) \? "info" : "success",/);
  assert.doesNotMatch(page, /นับ Actual งวดแรกแล้ว/, 'ปุ่มกู้นับงวดที่ค้าง ไม่ใช่ "งวดแรก" เสมอ');
  /* 🐞 review รอบสอง 26/10: ใบที่งวด 1 นับแล้ว (Rev.) แต่ขั้นนับล้ม — ไม่พูด "ยังนับงวด 1 ไม่สำเร็จ" · ชื่อปุ่มกู้ตรงกับแผง */
  assert.match(page, /const APPROVE_INSTALLMENT_START_LEFT_TOAST = [^;]*\$\{INSTALLMENT_ACTUAL_START_LEFT_LABEL\}/);
  assert.match(page, /const APPROVE_INSTALLMENT_START_FAILED_TOAST = [^;]*“นับงวด 1”/);
  /* ใบยังไม่มีงวด (review 26/10): ปุ่ม "นับงวด 1" โชว์เมื่อใบมีงวดแล้ว ⇒ ทักบอก "เริ่มติดตามการชำระ" ก่อน */
  assert.match(page, /const APPROVE_INSTALLMENT_NO_ROWS_TOAST = [^;]*“เริ่มติดตามการชำระ” แล้วกด “นับงวด 1”/);
  assert.match(request, /action === "approve" && payload\.actualMode === ACTUAL_MODE_INSTALLMENT\s*\? approveInstallmentToast\(data, \{ rows: installments, countRestDone: installmentActualCountRestDone\(installments\) \}\)/);
  /* คำสั่งระดับใบ: ส่งเวอร์ชันที่ตาเห็น · ไม่ลองซ้ำ (requestAction → apiFetch PATCH) */
  const run = slice(page, 'async function runActualOrderAction(action, { reason } = {}) {', '\n  }\n');
  assert.match(run, /requestAction\(action, \{[\s\S]*expectedUpdatedAt: order\?\.updatedAt,/);
  assert.match(page, /onActualOrderAction=\{runActualOrderAction\}/);
  /* PATCH งวด actual_* = ดึงตัวใบสด (cache ยอดของใบขยับตามงวด) */
  const inst = slice(page, 'async function runInstallmentAction(', 'function leaveEditMode');
  assert.match(inst, /if \(String\(action\)\.startsWith\("actual_"\)\) refreshOrder\(\);/);
  for (const action of ['actual_submit', 'actual_withdraw', 'actual_approve', 'actual_reject']) {
    assert.match(inst, new RegExp(`${action}: "`), `toast ของ ${action}`);
  }
});

test('หน้าใบ: การ์ดสรุป/ราง/สถานะของใบรายงวดพูด "นับแล้ว x/y งวด" จาก cache ของใบ — ใบทั้งใบคำเดิม', () => {
  const page = code(SO_PAGE);
  assert.match(page, /const instActual = isInstallmentActualOrder\(order\) && !historical;/);
  assert.match(page, /const instCounted = instActual \? salesOrderCountedActual\(order\) : 0;/);
  assert.match(page, /hint: amountKind === "actual" \? \(instProgress \? `\$\{instProgressText\} · \$\{fmtMoney\(instCounted\)\}` : fmtMoney\(order\.actualAmount\)\)/);
  assert.match(page, /<StatusBadge size="sm" tone="info" label="รายงวด" \/>/);
  assert.match(page, /\{instActual && <StatusBadge size="sm" tone="info" label="Actual รายงวด" \/>\}/);
  assert.match(page, /label: "Actual ก่อน VAT · รายงวด", tone: "success", value: `\$\{fmtMoney\(instCounted\)\} \/ \$\{fmtMoney\(order\.actualAmount\)\}`/);
  assert.match(page, /\{ label: "Actual ก่อน VAT", tone: "success" \}/, 'กิ่งของใบทั้งใบอยู่ครบ');
  /* ย้อนการอนุมัติ: ยอดที่หลุดคือยอดที่นับแล้ว */
  assert.match(page, /`ยอด Actual ที่นับแล้ว \$\{fmtMoney\(instCounted\)\} \(\$\{instProgressText\}\) จะถูกนำออก/);
});

test('แผงงวด: ปุ่มของงวดรายงวดถามด่านตัวเดียวกับ route · บัญชีรับรองงวดที่ยังไม่อนุมัติ = ปุ่มดับ + เหตุ · ทุกคำสั่งมีโมดัล', () => {
  const panel = code(PANEL);
  /* `gate` ส่งใบ + เจ้าของดีลเหมือน route PATCH — ไม่ส่ง = ด่านรายงวดเงียบ (ฐานเป็นยามคนเดียว) */
  const gate = slice(panel, 'const gate = (row, action, options) => installmentActionError(row, action, user, {', '});');
  assert.match(gate, /order, dealOwnerId: order\?\.deal\?\.ownerId,/);
  for (const action of ['actual_submit', 'actual_approve', 'actual_withdraw']) {
    assert.match(panel, new RegExp(`!gate\\(row, "${action}"\\)`), `${action} ถาม gate`);
  }
  assert.match(panel, /!gate\(row, "actual_reject", \{ reason: "x"\.repeat\(INSTALLMENT_ACTUAL_REASON_MIN\) \}\)/);
  /* UAT 27/10 ข้อ 3: ป้ายในแถวสั้น ("อนุมัติงวด") — ความหมายเต็มอยู่ที่โมดัล + title */
  assert.match(panel, /\? \{ label: INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL, title: "อนุมัติงวดและนับ Actual", onClick: \(\) => openActualAsk\("actual_approve", row\) \}/);
  assert.equal(INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL, 'อนุมัติงวด');
  assert.match(panel, /<Button tone="primary" size="sm" disabled=\{!!busy\} onClick=\{primary\.onClick\} title=\{primary\.title\}>/);
  assert.match(panel, /\? \{ label: "ยื่นขอนับงวดนี้", onClick: \(\) => openActualAsk\("actual_submit", row\) \}/);
  assert.match(panel, /label: "ดึงคำขอกลับ"/);
  assert.match(panel, /label: "ตีกลับงวด"/);
  /* ปุ่มของบัญชีที่ติดด่าน: เหตุจากด่านตัวเดียวกัน (ข้อความของ trigger) · ปุ่มอยู่ กดแล้วบอกเหตุเต็ม (GatedAction) + aria-describedby
     · ช่องสถานะ = คำสั้น ("AE Sup" ไม่ขาด) + ประโยคเต็มสำหรับโปรแกรมอ่านจอ + title (UAT FN 27/10 ข้อ 6) */
  assert.match(panel, /const confirmActualLock = instMode && !row\.preview && gate\(row, "confirm"\) === INSTALLMENT_ACTUAL_CONFIRM_BLOCKED;/);
  assert.match(panel, /<GatedAction tone="primary" size="sm" blocker=\{actualLock\} blockerKind="warning" aria-describedby=\{actualLockId\}>/);
  assert.match(panel, /<small id=\{actualLockId\} className=\{styles\.gateNote\} title=\{actualLock\}>\s*<span aria-hidden="true">\{keepPhrases\(actualLockShort, GATE_KEEP\)\}<\/span>\s*<span className="sr-only">\{actualLock\}<\/span>\s*<\/small>/);
  assert.match(panel, /const GATE_KEEP = Object\.freeze\(\["AE Sup"\]\);/);
  /* คอลัมน์ที่จมใต้กลุ่มตรึงขวามีคำใบ้ว่าเลื่อนได้ (TableScroll edgeHint → เงาซ้ายของ .statusCell) */
  assert.match(panel, /<TableScroll family="editable" surface="auto" cells="stacked" edgeHint/);
  /* ชิปสถานะการนับจากไฟล์กติกา */
  assert.match(panel, /installmentActualState\(row, order, saved\)/);
  assert.match(panel, /label=\{ACTUAL_STATE_LABELS\[actualState\]\}/);
  /* ระดับใบ: "นับงวด 1" (ทางกู้) · "นับที่เหลือทั้งหมด" (GatedAction + countRestBlocker) */
  assert.match(panel, /countRestBlocker\(order, saved, user\)/);
  assert.match(panel, /onActualOrderAction\?\.\("actual_count_rest", \{ reason: /);
  assert.match(panel, /openActualAsk\("actual_start"\)/);
  /* 🐞 review รอบสอง 26/10: ปุ่มกู้โชว์เมื่อขั้นนับตอนอนุมัติยังมีงวดค้าง (ไม่ใช่ "ยังไม่มีงวดไหนนับ") · ป้ายตามงวดที่ค้าง */
  /* review รอบสี่: ปุ่มกู้โชว์ตราบที่มีงวดยังไม่ตรึงด้วย (ทางเดียวที่ตรึงงวด) แม้ไม่มีงวดค้างให้นับ */
  assert.match(panel, /const actualUnfrozen = instLive && installmentActualUnfrozen\(saved\);/);
  assert.match(panel, /const actualStartVisible = instLive && Boolean\(onActualOrderAction\) && isSalesManager\(user\?\.role\)\s*&& \(installmentActualStartPending\(saved\)\.length > 0 \|\| actualUnfrozen\);/);
  assert.match(panel, /const actualStartLabel = actualStartVisible \? installmentActualStartButtonLabel\(saved\) : "";/);
  assert.match(panel, /onClick=\{\(\) => openActualAsk\("actual_start"\)\}>\s*\{actualStartLabel\}\s*<\/Button>/);
  /* โมดัลยืนยันของแผงเอง (เหตุที่ API ตีกลับอยู่ในกล่อง) · ผลคิดจากแถวล่าสุด */
  const dialog = slice(panel, '<ConfirmDialog\n        open={Boolean(actualAsk && actualAskPrompt)}', '/>');
  assert.match(dialog, /error=\{error\}/);
  assert.match(panel, /const row = live\(ask\.row\);/);
  assert.match(panel, /\? await onAction\(live\(ask\.row\), ask\.action\)/);
  assert.match(panel, /minLength=\{INSTALLMENT_ACTUAL_REASON_MIN\}\s*maxLength=\{INSTALLMENT_ACTUAL_REASON_MAX\}/);
});

/* ของจริงของด่านที่แผงถาม — ตัวเดียวกับ route: บัญชีรับรองงวดที่ยังไม่อนุมัติได้คำของ trigger (ปุ่มดับ + เหตุ) · อนุมัติแล้วรับรองได้ */
test('ด่านที่แผงถาม: บัญชีรับรองงวดของใบรายงวดได้หลัง AE Sup อนุมัติงวดเท่านั้น · ใบทั้งใบไม่โดน', () => {
  const fn = { id: 'U-FN', role: 'finance', department: 'FN' };
  const order = { id: 'SO1', origin: 'pipeline', status: 'approved', actualMode: 'installment', totalAmount: 107000, deal: { ownerId: 'U-AE' } };
  const reported = { id: 'i2', seq: 2, status: 'reported', amount: 35310 };
  const rows = [{ id: 'i1', seq: 1, status: 'confirmed', amount: 35310, actualStatus: 'approved' }, reported];
  const ask = (row, o) => installmentActionError(row, 'confirm', fn, { rows, orderTotal: 107000, order: o, dealOwnerId: 'U-AE' });
  assert.equal(ask(reported, order), INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, 'แผงจับคำนี้ตรง ๆ เพื่อวาดปุ่มดับ + เหตุ');
  assert.equal(ask({ ...reported, actualStatus: 'submitted' }, order), INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, 'ยื่นแล้วยังไม่อนุมัติ = ยังรับรองไม่ได้');
  assert.equal(ask({ ...reported, actualStatus: 'approved', actualAmount: 33000 }, order), null);
  assert.equal(ask(reported, { ...order, actualMode: 'order' }), null, 'ใบทั้งใบ = ด่านเดิม');
  /* 🐞 review 26/10: ใบรายงวดที่ยกเลิก — งวดที่จ่ายมาแล้วแต่ยังไม่นับต้องรับรองได้ (แล้วบัญชีบันทึกคืนเงิน) · ไม่มีใครอนุมัตินับงวดของใบยกเลิกได้ */
  const cancelled = { ...order, status: 'cancelled' };
  assert.equal(installmentActionError(reported, 'confirm', fn, { rows, orderTotal: 107000, order: cancelled, orderCancelled: true, dealOwnerId: 'U-AE' }),
    null, 'ใบยกเลิก: รับรองได้ (ทางคืนเงิน 23/09 D4)');
  assert.equal(ask(reported, { ...order, status: 'approval_revoked' }), INSTALLMENT_ACTUAL_CONFIRM_BLOCKED, 'ใบย้อนอนุมัติยังกัน (งวดย้ายไปใบ Rev.)');
});

test('โมดัลรับรอง + ทะเบียนบัญชี: แบบการนับของใบไปถึงผลลัพธ์ · งวดที่ยังไม่อนุมัติ = ปุ่มยืนยันดับ + เหตุ', () => {
  const dialog = code(DIALOG);
  assert.match(dialog, /const actualMode = order\?\.actualMode \?\? row\.actualMode \?\? "order";/);
  /* ใบยกเลิกไม่ติดด่าน (review 26/10 — รับรองแล้วคืนเงินได้) · เหตุบอกคนที่ต้องทำต่อตามสถานะการนับ */
  assert.match(dialog, /const orderStatus = order\?\.status \?\? row\.orderStatus \?\? null;/);
  assert.match(dialog, /const orderCancelled = orderStatus === "cancelled";/);
  /* 🐞 review รอบสอง 26/10: ใบยกเลิก/ย้อนอนุมัติไม่นับ Actual — แถว "นับ Actual" ต้องไม่โชว์ยอด/"ยังไม่อนุมัติงวด" ขัดกับผลลัพธ์ */
  assert.match(dialog, /const actualLive = !orderStatus \|\| orderStatus === "approved";/);
  assert.match(dialog, /\{!actualLive\s*\? <span className="cell-quiet">\{ACTUAL_NOT_LIVE_TEXT\[orderStatus\] \|\| ACTUAL_NOT_LIVE_TEXT\.other\}<\/span>/);
  assert.match(read(DIALOG), /cancelled: "ไม่นับ — ใบยกเลิกแล้ว",\s*approval_revoked: "ไม่นับ — ใบถูกย้อนการอนุมัติ \(รอออก Rev\.\)",/);
  assert.match(dialog, /const actualBlocked = installmentActual && !orderCancelled && "actualStatus" in row && row\.actualStatus !== "approved";/);
  assert.match(dialog, /disabled=\{busy \|\| actualBlocked\}/);
  assert.match(dialog, /\{actualBlocked \? <StatusNotice tone="warning">\{installmentActualLockReason\(row, order\)\}<\/StatusNotice> : null\}/);
  assert.match(dialog, /nextNeedsActualSubmit: Boolean\(next\) && \(next\.actualStatus == null \|\| next\.actualStatus === "rejected"\),/);
  /* UAT FN 27/10 ข้อ 4: ทางที่งวดถูกนับไปถึงบรรทัด Actual ของผลลัพธ์ (แถวทะเบียนพก actualApprovedVia/actualNote — ledgerRow) */
  assert.match(dialog, /actualApprovedVia: row\?\.actualStatus === "approved" \? row\?\.actualApprovedVia \|\| null : null,\s*actualAutoCounted: installmentActualAutoCounted\(row\),/);
  assert.match(code(PANEL), /actualMode: order\?\.actualMode,\s*row, multi: rows\.length > 1,/, 'บัญชีบันทึกรับชำระขั้นเดียว (แผง) พูดชุดเดียวกัน');

  const fn = code(FN_PAGE);
  assert.match(fn, /actualMode: confirmFor\.actualMode,/);
  assert.match(fn, /const actualLock = row\.actualAwaitingApproval \? installmentActualLockReason\(row, \{ status: row\.orderStatus \}\) : null;/);
  assert.match(fn, /\{actualLock \? <span id=\{actualLockId\} className=\{styles\.qlock\}>\{actualLock\}<\/span> : null\}/);
  /* สลิปที่แจ้งแล้วแต่ติดด่าน — บอกบัญชีว่ารออะไร ไม่หายเงียบ: API สรุปรายใบ (ledgerHeldSummary · ถอดตัวกรองสถานะ) — UAT FN 27/10 ข้อ 1 */
  assert.match(fn, /\{held\.count > 0 && \(/, 'สลิปที่แจ้งแล้วแต่ติดด่าน — บอกบัญชีว่ารออะไร ไม่หายเงียบ');
  assert.match(code('lib/finance/paymentLedger.js'), /held: ledgerHeldSummary\(anyStatus\.filter\(ledgerHeld\)\),/);
});

/* 🐞 review 26/10: ข้อความ/ราง/คิวของจอหลังนับไปบางงวด — ไม่บอกสิ่งที่ไม่จริง */
test('หน้าใบ: ราง "นับ Actual" ยังไม่ ✓ จนนับครบ · คำอธิบายสถานะหลังนับครบไม่พูด "งวดที่เหลือ"', () => {
  const page = code(SO_PAGE);
  const step = slice(page, 'label: "นับ Actual",', 'hint:');
  assert.match(step, /\.\.\.\(order\.status === "approved" && instProgress && !instProgress\.complete \? \{ state: "current" \} : \{\}\),/,
    'ใบรายงวดที่ยังนับไม่ครบ = ขั้นนี้ยังเดิน (workflowStepsFromIndex: state ที่ประกาศชนะ index)');
  /* UAT 27/10 ข้อ 8: สภาพพิเศษ (งวดไม่ตรึง · นับครบ · ใบนับทั้งก้อนที่มีงวดค้าง · ยังไม่มีงวด) พูดขั้นถัดไปจาก installmentActualNextStep
     (ตัวเดียวกับบรรทัดสรุปของการ์ดการชำระ) — "งวดที่เหลือนับเมื่อ AE Sup อนุมัติแต่ละงวด" เหลือเฉพาะสภาพปกติ */
  assert.match(page, /const instNextStep = instActual && order\.status === "approved" && !\(order\.installmentsError && !installments\.length\)\s*\? installmentActualNextStep\(order, installments\) : null;/);
  assert.match(page, /instNextStep \? instNextStep\.text\s*: ownerNextInst \? `งวดที่ \$\{ownerNextInst\.seq\} [\s\S]{0,200}?ที่แท็บการชำระ \(“ยื่นขอนับงวดนี้”\)"\s*: "งวดที่เหลือนับเมื่อ AE Sup อนุมัติแต่ละงวด"/);
  /* 🐞 review รอบสอง 26/10: เจ้าของดีลที่เลนเจ้าของดีลส่งมา — ภาพรวมบอกงานของเขา (ตัวตัดสินเดียวกับเลน) + ป้ายบนแท็บการชำระ */
  assert.match(page, /const ownerNextInst = instActual && order\.status === "approved" && order\.meId && order\.meId === order\.deal\?\.ownerId\s*&& !instProgress\?\.complete \? nextSubmittableInstallment\(order, installments\) : null;/);
  assert.doesNotMatch(page, /<CountBadge count=\{1\}/, 'ไม่มีป้ายตัวเลขบนแท็บ (กฎ 3: ป้ายแท็บมาจากข้อหลังกดยื่นเท่านั้น)');
});

test('แผงงวด: ผู้อนุมัติเห็นปุ่มอนุมัติงวดที่ดับ + เหตุเมื่องวดก่อนถูกถอนคำรับรอง · เหตุของปุ่มบัญชีตามสถานะการนับ · สรุปหลังนับครบ', () => {
  const panel = code(PANEL);
  /* UAT FN 27/10 ข้อ 3: งวดทั้งใบไปถึงตัวตัดสิน — งวดก่อนหน้ายังไม่รับรอง = งานของบัญชี (ไม่ใช่ "รอ AE Sup") */
  assert.match(panel, /const actualLockReason = confirmActualLock \|\| reportActualLock \|\| revokedReportLock\s*\? installmentActualLockReason\(row, order, \{ countRestDone, rows: saved \}\) : "";/);
  /* 🐞 review รอบสอง 26/10: ใบรายงวดที่ย้อนอนุมัติ — ฝ่ายขายเห็นปุ่มแจ้งชำระดับ + เหตุ "ออก Rev." แทนแถวเงียบ */
  assert.match(panel, /const revokedReportLock = instMode && !row\.preview && order\?\.status === "approval_revoked"\s*&& !confirmActualLock && !reportActualLock && installmentPreviousConfirmed\(row, saved\)\s*&& gate\(row, "report", \{ paidOn: "placeholder" \}\) === INSTALLMENT_ACTUAL_REPORT_BLOCKED;/);
  assert.match(panel, /const approveBlocked = instMode && !row\.preview && row\.actualStatus === "submitted"\s*&& gate\(row, "actual_approve"\) === INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED;/);
  /* review รอบสาม 26/10: ผู้อนุมัติเปิดงวดที่ตัวเองยื่น = ปุ่มอนุมัติดับ + เหตุ · ฝ่ายขายที่ไม่ใช่เจ้าของดีล = "แจ้งลูกค้าจ่ายแล้ว" ดับ + เหตุ
     (เดิมสองกรณีนี้ไม่มีปุ่มและไม่มีเหตุ) · ใบที่กดนับที่เหลือทั้งหมดแล้วบอกให้กดซ้ำ */
  /* UAT FN 27/10 ข้อ 3: ผู้อนุมัติที่ติด previous_unconfirmed ได้เหตุที่บอกงวดและคนที่ต้องทำต่อ (installmentActualApproveWait) */
  assert.match(panel, /const approveWait = approveBlocked \? installmentActualApproveWait\(row, saved\) : null;/);
  assert.match(panel, /const actualLock = primary \? ""\s*: unfrozenLock \? INSTALLMENT_ACTUAL_UNFROZEN\s*: approveBlocked \? approveWait\.text\s*: approveSelf \? INSTALLMENT_ACTUAL_SELF_APPROVAL\s*: actualLockReason\s*\|\| \(salesReportLock \? installmentActualReportWaitReason\(row, order\?\.deal\?\.ownerName, \{ countRestDone \}\) : ""\);/);
  /* คำสั้นของเหตุเดียวกัน (ช่องสถานะ · UAT FN 27/10 ข้อ 6) — กิ่งเดียวกันทุกตัว */
  assert.match(panel, /const actualLockShort = !actualLock \? ""\s*: unfrozenLock \? INSTALLMENT_ACTUAL_UNFROZEN_SHORT\s*: approveBlocked \? approveWait\.short\s*: approveSelf \? INSTALLMENT_ACTUAL_SELF_APPROVAL_SHORT\s*: actualLockReason \? installmentActualLockShort\(row, order, \{ countRestDone, rows: saved \}\)\s*: installmentActualReportWaitShort\(row, \{ countRestDone \}\);/);
  assert.match(panel, /const approveSelf = instMode && !row\.preview && row\.actualStatus === "submitted" && !approveBlocked\s*&& gate\(row, "actual_approve"\) === INSTALLMENT_ACTUAL_SELF_APPROVAL;/);
  assert.match(panel, /const salesReportLock = instLive && !row\.preview && !confirmActualLock && !reportActualLock && !revokedReportLock\s*&& installmentPreviousConfirmed\(row, saved\)\s*&& gate\(row, "report", \{ paidOn: "placeholder" \}\) === INSTALLMENT_ACTUAL_REPORT_BLOCKED;/);
  assert.match(panel, /\{unfrozenLock \? \(row\.actualStatus === "submitted" \? INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL : "ยื่นขอนับงวดนี้"\)\s*: approveBlocked \|\| approveSelf \? INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL\s*: revokedReportLock \|\| salesReportLock \? "แจ้งลูกค้าจ่ายแล้ว"\s*: reportActualLock \? "บันทึกการรับชำระ" : "บัญชีคอนเฟิร์ม"\}/);
  /* มติข้อ 10: ใบที่กดนับที่เหลือทั้งหมดแล้ว — งวดที่เพิ่มนับให้อัตโนมัติ (ไม่ใช่ "AE Sup กดอีกครั้ง" ของรอบสาม) · งวดค้าง = ปุ่มกู้ "นับงวดที่ค้าง" */
  /* UAT 27/10 ข้อ 1 · 8 · 11: ขั้นถัดไปของสภาพพิเศษมาจาก installmentActualNextStep (ตัวเดียวกับหัวใบ) — คำทดสอบอยู่ที่เทสต์ของตัวนั้น */
  assert.match(panel, /const actualNextStep = instLive && !installmentsReadError \? installmentActualNextStep\(order, saved\) : null;/);
  assert.match(panel, /\[\.\.\.actualSummaryParts, actualNextStep\?\.text \|\| "งวดถัดไปยื่นขอนับได้หลังบัญชีรับรองเงินงวดก่อน"\]\.join\(" · "\)/);
  assert.match(panel, /<small>\{keepPhrases\(actualSummaryNote, actualSummaryParts\)\}<\/small>/, 'คู่ "ป้าย ฿ยอด" ไม่ขาดกลาง');
  /* UAT 27/10 ข้อ 11: นับครบแล้ว = ปุ่ม "นับที่เหลือทั้งหมด" ทักโทนแจ้ง (ไม่ใช่ toast แดง) */
  assert.match(panel, /blocker=\{countRestGate\.blocker\} blockerKind=\{countRestGate\.kind \|\| "error"\}/);
  assert.doesNotMatch(panel, /AE Sup กดอีกครั้ง/);
  assert.match(panel, /const countRestDone = instMode && installmentActualCountRestDone\(saved\);/);
  // แถวที่ฐานนับให้เอง (มติข้อ 10) แยกคำจาก "นับที่เหลือทั้งหมด" ที่ AE Sup กดเอง · โมดัลปรับแผน/ยกเงินบอกกติกานี้ในคำนำ
  assert.match(panel, /installmentActualAutoCounted\(row\) \? "นับอัตโนมัติ"\s*: row\.actualApprovedVia === "count_rest" \? "นับที่เหลือทั้งหมด" : ""/);
  assert.match(panel, /\{countRestDone \? " · ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว: งวดที่เพิ่มนับ Actual ให้อัตโนมัติตอนบันทึก ไม่ต้องยื่น" : null\}/);
  assert.match(panel, /\{countRestDone \? " · ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว: งวดที่ยกมานับ Actual ให้อัตโนมัติตอนยก ไม่ต้องยื่น" : null\}/);
  // โมดัล: ยื่นงวดที่แจ้งสลิปไว้แล้ว / ผู้อนุมัติยื่นเอง · นับงวด 1 ที่งวดยังไม่ตรึง
  assert.match(panel, /slipStatus: \["reported", "confirmed"\]\.includes\(row\?\.status\) \? row\.status : null,\s*selfApprover: isSalesManager\(user\?\.role\) && user\?\.role !== "admin",/);
  assert.match(panel, /freezeFirst: actualUnfrozen,\s*\}\);/);
  assert.match(panel, /submittedCount: [^\n]*\n[^\n]*\n\s*freezeFirst: actualUnfrozen,/, 'โมดัลนับที่เหลือทั้งหมดบอกว่าตรึงก่อน');
});

test('ด่านของแผง (review รอบสาม 26/10 · มติข้อ 10): AC/AE อื่นแจ้งสลิปไม่ได้และยื่นไม่ได้ ⇒ เหตุบอกเจ้าของดีล · ผู้อนุมัติยื่นเอง ⇒ self_approval · นับที่เหลือแล้ว = นับให้เอง ไม่ต้องยื่น', () => {
  const order = { id: 'SOR-1', status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null, deal: { ownerId: 'U-OWNER', ownerName: 'เจ้าของ' } };
  const rows = [
    { id: 'I1', seq: 1, amount: 53500, status: 'confirmed', actualStatus: 'approved', actualAmount: 50000, frozenAt: 'x' },
    { id: 'I2', seq: 2, amount: 53500, status: 'pending', actualStatus: null, frozenAt: 'x' },
  ];
  const gate = (row, action, user, extra = {}) => installmentActionError(row, action, user, { order, rows, dealOwnerId: 'U-OWNER', ...extra });
  for (const role of ['ac', 'ae', 'senior_ae', 'ac_supervisor']) {
    const user = { id: `U-${role}`, role };
    assert.equal(gate(rows[1], 'report', user, { paidOn: '2026-10-26' }), INSTALLMENT_ACTUAL_REPORT_BLOCKED, role);
    assert.ok(gate(rows[1], 'actual_submit', user), `${role}: ยื่นไม่ได้ (ไม่ใช่เจ้าของดีล)`);
  }
  assert.match(installmentActualReportWaitReason(rows[1], 'เจ้าของ'), /รอเจ้าของดีล \(เจ้าของ\) ยื่นขอนับงวดนี้ และ AE Sup อนุมัติก่อน จึงแจ้งสลิปได้/);
  assert.match(installmentActualReportWaitReason({ ...rows[1], actualStatus: 'submitted' }), /^รอ AE Sup อนุมัตินับ Actual งวดนี้ก่อน/);
  const sup = { id: 'U-SUP', role: 'ae_supervisor' };
  const mine = { ...rows[1], actualStatus: 'submitted', actualSubmittedAt: 'x', actualSubmittedById: 'U-SUP' };
  assert.equal(installmentActionError(mine, 'actual_approve', sup, { order, rows: [rows[0], mine] }), INSTALLMENT_ACTUAL_SELF_APPROVAL);
  /* มติข้อ 10 (26/10): ใบที่กดนับที่เหลือทั้งหมดแล้ว — งวดที่เพิ่มทีหลังฐานนับให้เอง · งวดที่ยังค้างบนจอได้ = ขั้นนับของ Rev. ยังไม่จบ
     ⇒ เหตุบอกปุ่มกู้ "นับงวดที่ค้าง" (ไม่ใช่ "รอฝ่ายขายยื่น" และไม่ใช่ "กดนับที่เหลือทั้งหมดอีกครั้ง" ของรอบสาม) · ยื่นไม่ได้ (ด่าน JS) */
  const afterRest = [{ ...rows[0], actualApprovedVia: 'count_rest' }, rows[1]];
  assert.equal(installmentActualCountRestDone(afterRest), true);
  assert.equal(installmentActualCountRestDone(rows), false);
  const lock = installmentActualLockReason(rows[1], order, { countRestDone: true });
  assert.match(lock, /ระบบนับ Actual ให้เอง ไม่ต้องยื่น \(มติข้อ 10\)/);
  assert.match(lock, /‘นับงวดที่ค้าง’/);
  assert.doesNotMatch(lock, /รอฝ่ายขายยื่น|อีกครั้ง/);
  assert.match(installmentActualLockReason(rows[1], order), /รอฝ่ายขายยื่นขอนับ/);
  assert.match(installmentActualReportWaitReason(rows[1], '', { countRestDone: true }), /ไม่ต้องยื่น[\s\S]*จึงแจ้งสลิปได้$/);
  assert.doesNotMatch(installmentActualReportWaitReason(rows[1], '', { countRestDone: true }), /อีกครั้ง/);
  const owner = { id: 'U-OWNER', role: 'ae' };
  assert.equal(gate(rows[1], 'actual_submit', owner, { rows: afterRest }), INSTALLMENT_ACTUAL_AFTER_COUNT_REST, 'เจ้าของดีลยื่นไม่ได้ — ไม่ต้องยื่น');
  assert.equal(gate(rows[1], 'actual_submit', owner), null, 'ใบที่ยังเดินรายงวด เจ้าของดีลยื่นได้ตามเดิม');
  assert.equal(actualGateStatus(INSTALLMENT_ACTUAL_AFTER_COUNT_REST), 409, 'route ตอบ 409 (สถานะของใบ ไม่ใช่สิทธิ์)');
});

test('โมดัลยื่น/นับงวดที่ค้าง (review รอบสาม 26/10): สลิปแจ้งไว้แล้วไม่บอกให้แจ้งซ้ำ · ผู้อนุมัติยื่นเองรู้ก่อนกด · หัวโมดัลตามงวดที่นับ', () => {
  const plain = bullets(installmentActualSubmitPrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00' }));
  assert.ok(plain.some((l) => /แจ้งสลิปงวดนี้ได้หลัง AE Sup อนุมัติ/.test(l)));
  assert.ok(plain.every((l) => !/อนุมัติเองไม่ได้/.test(l)));
  const reported = bullets(installmentActualSubmitPrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00', slipReported: true, selfApprover: true }));
  assert.ok(reported.every((l) => !/แจ้งสลิปงวดนี้ได้/.test(l)), 'สลิปแจ้งไว้แล้ว');
  assert.ok(reported.some((l) => /^· สลิปงวดนี้แจ้งไว้แล้ว — บัญชีรับรองเงินได้หลัง AE Sup อนุมัติงวด/.test(l)));
  assert.ok(reported.some((l) => /คุณอนุมัติเองไม่ได้ — ต้องให้ผู้อนุมัติคนอื่นกดอนุมัติ/.test(l)));
  const left = installmentActualStartPrompt({ startLabel: 'งวด 3', amountLabel: '฿34,000.00', monthLabel: 'ต.ค. 2569' });
  assert.equal(left.title, 'นับ Actual งวด 3');
  assert.doesNotMatch(left.title, /งวดแรก/);
  assert.ok(bullets(left).every((l) => !/ตรึงงวด/.test(l)), 'งวดตรึงครบแล้ว = ไม่พูด');
  const freeze = installmentActualStartPrompt({ startLabel: 'งวด 1', amountLabel: '฿50,000.00', freezeFirst: true });
  assert.match(bullets(freeze)[0], /^· ตรึงงวดชำระที่ยังไม่ตรึงก่อน/);
});

test('ทะเบียน SO: แถวใบรายงวดที่อนุมัติแล้วบอกยอดที่นับแล้ว + กองที่เหลือใต้ยอดเต็ม (หัวกลุ่ม/การ์ดนับเฉพาะที่นับแล้ว) · ค้นเจอ', () => {
  const list = code('app/sales-planning/sales-orders/page.js');
  /* ตัวกลางย้ายไป dealAmountDisplay (review รอบสอง 26/10 — ตาราง SO หน้าดีล/โครงการใช้ตัวเดียวกัน) */
  assert.match(list, /import \{ installmentActualSubLine \} from "@\/lib\/sales\/dealAmountDisplay";/);
  assert.doesNotMatch(list, /function installmentActualSubLine/, 'ไม่มีสำเนาของตัวเองในทะเบียน');
  const order = { status: 'approved', origin: 'pipeline', actualMode: 'installment', actualAmount: 93457.94,
    actualCountedAmount: 31152.64, actualSubmittedAmount: 31152.64 };
  assert.equal(installmentActualSubLine(order), 'Actual รายงวด · นับแล้ว ฿31,152.64 · รออนุมัติ ฿31,152.64 · รอนับรายงวด ฿31,152.66');
  assert.equal(installmentActualSubLine({ ...order, actualSubmittedAmount: 0, actualCountedAmount: 93457.94 }),
    'Actual รายงวด · นับแล้ว ฿93,457.94', 'กองที่เป็นศูนย์ไม่ขึ้น');
  assert.equal(installmentActualSubLine({ ...order, actualMode: 'order' }), null, 'ใบทั้งใบ = หน้าตาเดิม');
  assert.equal(installmentActualSubLine({ ...order, status: 'approval_revoked' }), null, 'ใบที่ไม่นับ = ไม่มีบรรทัดนี้');
  /* UAT 27/10 ข้อ 4–5: วาดผ่านชิ้นกลาง InstallmentActualSubLine (ท่อนละคู่ "ป้าย ฿ยอด" ห่อ keepPhrases) — ข้อความรวมเท่าเดิมทุกตัวอักษร */
  assert.match(list, /\{amountKind === "actual"\s*\? <InstallmentActualSubLine order=\{row\} \/>/);
  assert.deepEqual(installmentActualSubParts(order),
    ['Actual รายงวด', 'นับแล้ว ฿31,152.64', 'รออนุมัติ ฿31,152.64', 'รอนับรายงวด ฿31,152.66']);
  assert.equal(installmentActualSubParts(order).join(' · '), installmentActualSubLine(order));
  assert.equal(installmentActualSubParts({ ...order, actualMode: 'order' }), null);
  const sub = code('components/salesPlanning/InstallmentActualSubLine.js');
  assert.match(sub, /const parts = installmentActualSubParts\(order\);\s*if \(!parts\) return null;/);
  assert.match(sub, /\{keepPhrases\(parts\.join\(" · "\), parts\)\}/);
  assert.match(list, /\.concat\(installmentActualSubLine\(row\)\)/, 'ตาเห็นบนแถว = ค้นเจอ');
});

/* 🐞 review รอบสอง 26/10: ตาราง SO หน้าดีล/หน้าโครงการโชว์แค่ยอดที่นับแล้วในคอลัมน์ "ยอดก่อน VAT" ไม่มีคำกำกับ (ใบ ฿93k อ่านเป็น ฿31k) */
test('หน้าดีล + หน้าโครงการ: ใบรายงวดที่อนุมัติแล้ว = ยอดเต็มของใบ + บรรทัดรองบอกกอง (ตัวเดียวกับทะเบียน SO)', () => {
  const deal = code('app/sales-planning/deals/[id]/page.js');
  const cell = slice(deal, 'const soAmountCell = (order) => {', '\n  };');
  /* ตารางสี่คอลัมน์ในการ์ดแคบ (~440px) = `compact` (ขนาดหมายเหตุรอง) — ท่อนที่กว้างสุดพอดีคอลัมน์ยอด ไม่ดันตารางเกินกล่อง */
  assert.match(cell, /const sub = installmentActualSubLine\(order\);\s*return sub\s*\? <>\{money\(Math\.max\(0, Number\(order\?\.actualAmount\) \|\| 0\)\)\}<InstallmentActualSubLine order=\{order\} compact \/><\/>\s*: money\(salesOrderActual\(order\)\);/);
  assert.match(read('components/salesPlanning/InstallmentActualSubLine.module.css'), /\.compact\.compact \{\s*font-size: var\(--fs-1\);/);
  /* UAT 27/10 ข้อ 4: เลขที่ SO + ป้ายสถานะห้ามขาดบรรทัด · ข้อ 5: คำใต้การ์ด Won ห่อคู่ "ป้าย ฿ยอด" (wonHint.keep) */
  assert.match(deal, /<td className=\{`mono \$\{styles\.soNoWrap\}`\}><Link href=\{`\/sa\/sales-orders\/\$\{order\.id\}`\}/);
  assert.match(deal, /<td className=\{styles\.soNoWrap\}><span className="ui-badge"/);
  assert.match(read('app/sales-planning/deals/[id]/page.module.css'), /\.soNoWrap \{ white-space: nowrap; \}/);
  assert.match(deal, /keepPhrases\(wonHint\.text, wonHint\.keep\)/);
  const hint = wonDealForecastHint({ deal: { stage: 'won' }, forecast: 350000, actual: 100000, actualCount: 1, instRemaining: 200000 });
  assert.deepEqual(hint.keep, ['นับแล้ว ฿100,000.00', 'รอนับรายงวด ฿200,000.00', 'คาดการณ์ ฿350,000.00', 'ต่างเมื่อนับครบ ฿50,000.00']);
  assert.equal(hint.keep.join(' · '), hint.text);
  const hub = code('components/pm/ProjectDealsHub.js');
  assert.match(hub, /\{amount\.kind === "actual" && \(installmentActualSubLine\(order\)\s*\? <>\{fmtMoney\(amount\.documentAmount\)\}<InstallmentActualSubLine order=\{order\} \/><\/>\s*: fmtMoney\(amount\.amount\)\)\}/);
  assert.match(code('app/api/pm/projects/[id]/route.js'), /"actualMode", "actualCountedAmount", "actualSubmittedAmount"/, 'select ของโครงการพก cache สามช่อง');
});

/* review รอบสาม 26/10 — สองจอที่นับ/บอกเหตุผิดกอง */
test('ทะเบียนการชำระ: แถบงวดที่ติดด่านบอกคนที่ต้องทำต่อรายงวด (ไม่ชี้ AE Sup ทุกงวด) — UAT FN 27/10: รายใบ + เหตุของงวดนั้นเอง', () => {
  const page = code(FN_PAGE);
  /* เหตุรายงวดจากตัวตัดสินเดียวกับปุ่มรับรอง (ledgerHeldSummary → installmentActualHold) · คำสั้น + title ประโยคเต็ม · "AE Sup" ไม่ขาด */
  assert.match(page, /<span key=\{row\.id\} className=\{styles\.heldRow\} title=\{row\.text\}>/);
  assert.match(page, /\{keepPhrases\(row\.short, HELD_KEEP\)\}/);
  assert.match(page, /const HELD_KEEP = \["AE Sup"\];/);
  assert.doesNotMatch(page, /AE Sup ต้องอนุมัตินับ Actual งวดนั้นก่อน/, 'คำเดิมที่ชี้ AE Sup ทุกงวด');
  assert.doesNotMatch(page, /ยื่นได้หลังบัญชีรับรองงวดก่อนหน้าของใบเดียวกัน/, 'วงเล็บรวมที่เท็จกับงวดแรก (ข้อ 5)');
});

test('ทะเบียน SO: การ์ด "รอตรวจอนุมัติ" + "· n ใบ" ของหัวกลุ่ม = ใบ pending_approval ล้วน · งวดที่ยื่นของใบรายงวดบอกแยกเป็น "งวด"', () => {
  const page = code('app/sales-planning/sales-orders/page.js');
  assert.match(page, /pending: amounts\.pendingOrderCount,\s*pendingApproval: amounts\.pendingOrderAmount,/);
  assert.doesNotMatch(page, /pending: amounts\.pendingApprovalCount/);
  /* UAT 27/10 ข้อ 6: หมายเหตุการ์ดเป็นบรรทัดเดียวตัด "…" ⇒ note สั้น + title ประโยคเต็ม (งวดของใบรายงวดยังบอกแยกเป็น "งวด") */
  assert.match(page, /note=\{pendingCardNote\.note\}\s*title=\{pendingCardNote\.title\}/);
  const cardNote = slice(page, 'const pendingCardNoteOf = (summary) => {', '\n};\n');
  assert.match(cardNote, /const inst = `\$\{INSTALLMENT_REVIEW_LABEL\} \$\{fmtMoney\(summary\.instPendingAmount\)\} \(\$\{summary\.instPending\} งวด\)`;/);
  assert.match(cardNote, /title: `\$\{base\} · \$\{instPendingNote\(summary\.instPending, summary\.instPendingAmount\)\}`,/);
  assert.match(page, /amount=\{pendingOfBucket\.pendingOrderAmount\}\s*count=\{pendingOfBucket\.pendingOrderCount\}/);
  assert.match(page, /const instPendingNote = \(count, amount\) => `\$\{INSTALLMENT_REVIEW_LABEL\} \$\{fmtMoney\(amount\)\} \(\$\{count\} งวด/);
});

/* มติเจ้าของข้อ 10 (26/10): Rev. ของใบที่กด "นับที่เหลือทั้งหมด" (งวด via count_rest ติดมา) อนุมัติแบบรายงวด = start นับทุกงวดที่ค้าง ⇒
   โมดัลอนุมัติบอก "นับทั้งก้อนต่อ" แทนกติกายื่นรายงวด (ภาพก่อนกดจาก installmentActualStartPreview ตัวเดียวกับ RPC) */
test('หน้าใบ (มติข้อ 10): โมดัลอนุมัติ Rev. ของใบที่กดนับที่เหลือทั้งหมด — บอกว่านับทั้งก้อนต่อ ไม่พูดกติกายื่นรายงวด', () => {
  const page = code(SO_PAGE);
  assert.match(page, /countRestDone: installmentActualCountRestDone\(planRows\),/);
  const lines = slice(page, 'function approveActualLines(mode, plan)', '\n  }\n');
  assert.match(lines, /\.\.\.\(plan\.countRestDone \? \[\s*"ใบก่อนหน้ากด “นับที่เหลือทั้งหมด” ไว้แล้ว — ใบนี้นับทั้งก้อนต่อ:[^"]*ไม่ต้องยื่น \(มติข้อ 10\)",\s*\] : \[\s*"ฝ่ายขายยื่นขอนับงวดถัดไปได้หลังบัญชีรับรองเงินงวดก่อน",/);
  // ภาพก่อนกด: งวดที่ค้างทั้งหมดนับทันที (ไม่ใช่แค่งวด 1)
  const order = { actualAmount: 100000, totalAmount: 107000 };
  const rows = [
    { id: 'R1', seq: 1, amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'so_approval' },
    { id: 'R2', seq: 2, amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'count_rest' },
    { id: 'R3', seq: 3, amount: 21400, actualStatus: 'approved', actualAmount: 40000, actualApprovedVia: 'count_rest' },
    { id: 'N4', seq: 4, amount: 21400, actualStatus: null },
  ];
  assert.deepEqual(installmentActualStartPreview(order, rows).rows.map((r) => [r.seq, r.amount]), [[4, 0]]);
});

/* ════ review รอบสี่ 26/10 ═══════════════════════════════════════════════════════════════════════════════════════════════════ */

/* 🐞 ตัวหยุดยอดล้มตอนอนุมัติ (งวดยังไม่ตรึง) — รอบสามกันแค่ทางกู้ "นับงวด 1" · ยื่น/อนุมัติงวดยังนับงวดที่ไม่ตรึงได้ ⇒ บัญชีรับรองไม่ได้ (draft_pending)
   งวด 2 ยื่นไม่ได้ตลอดไป และปุ่มกู้หายเพราะไม่มีงวดค้างให้นับ (ฮาร์เนส 0412 ข้อ 25 พิสูจน์ฝั่งฐาน) */
test('รอบสี่: งวดยังไม่ตรึง — ยื่น/อนุมัติงวดติดด่าน (คำเดียวกับรหัสของฐาน · 409) · ดึงกลับไม่ติด · เลนเจ้าของดีลไม่ชวนยื่น · นับที่เหลือทั้งหมดไม่บล็อก (route ตรึงให้)', () => {
  const order = { id: 'SOR-1', status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null, deal: { ownerId: 'U-OWNER' } };
  const rows = [
    { id: 'I1', seq: 1, amount: 50000, status: 'pending', actualStatus: null, frozenAt: null },
    { id: 'I2', seq: 2, amount: 50000, status: 'pending', actualStatus: null, frozenAt: null },
  ];
  const owner = { id: 'U-OWNER', role: 'ae' };
  const sup = { id: 'U-SUP', role: 'ae_supervisor' };
  assert.equal(installmentActualUnfrozen(rows), true);
  assert.equal(installmentActualActionError(rows[0], 'actual_submit', owner, { order, rows }), INSTALLMENT_ACTUAL_UNFROZEN);
  const submitted = { ...rows[0], actualStatus: 'submitted', actualSubmittedById: 'U-OWNER' };
  const withSubmitted = [submitted, rows[1]];
  assert.equal(installmentActualActionError(submitted, 'actual_approve', sup, { order, rows: withSubmitted }), INSTALLMENT_ACTUAL_UNFROZEN);
  assert.equal(installmentActualActionError(submitted, 'actual_withdraw', owner, { order, rows: withSubmitted }), null, 'ดึงกลับ (ถอย) ไม่ติด');
  // สิทธิ์ก่อน: คนที่ยื่นไม่ได้อยู่แล้วได้คำของสิทธิ์ (ไม่ใช่คำทางกู้ของ AE Sup)
  assert.notEqual(installmentActualActionError(rows[0], 'actual_submit', { id: 'U-AC', role: 'ac' }, { order, rows }), INSTALLMENT_ACTUAL_UNFROZEN);
  assert.equal(INSTALLMENT_ACTUAL_UNFROZEN, documentWorkflowError({ message: 'P0001: installment_actual_unfrozen' }).message, 'คำเดียวกับรหัสของฐาน');
  assert.equal(actualGateStatus(INSTALLMENT_ACTUAL_UNFROZEN), 409);
  assert.match(INSTALLMENT_ACTUAL_UNFROZEN, /‘นับงวด 1’ หรือ ‘นับงวดที่ค้าง’/, 'บอกปุ่มกู้ที่ตรึงงวด');
  // เลน/คิว: ไม่ชวนเจ้าของดีลยื่นงวดที่ยื่นไม่ได้
  assert.equal(nextSubmittableInstallment(order, rows), null);
  assert.equal(installmentActualReadyForOwner(order, rows, { userId: 'U-OWNER', thisMonth: '2026-10' }), false);
  // นับที่เหลือทั้งหมด: ปุ่มไม่ติดด่านนี้ — route ตรึงก่อนเรียก RPC (soInstallmentActualRoutes)
  assert.deepEqual(countRestBlocker(order, rows, sup), { visible: true, blocker: null });
  // ตรึงแล้ว = เดินตามปกติ · แถวที่ไม่พกคอลัมน์ frozenAt (คิวรีเลือกคอลัมน์เอง) = ถือว่าตรึง (ฐานกันอีกชั้น)
  const frozen = rows.map((r) => ({ ...r, frozenAt: '2026-10-26T03:00:00Z' }));
  assert.equal(installmentActualActionError(frozen[0], 'actual_submit', owner, { order, rows: frozen }), null);
  const bare = rows.map(({ frozenAt, ...r }) => r);
  assert.equal(installmentActualUnfrozen(bare), false);
  assert.equal(nextSubmittableInstallment(order, bare)?.id, 'I1');
  // คิวรีของป้ายเมนู/ทะเบียน SO พก frozenAt (ไม่งั้นเลนเจ้าของดีลนับงวดที่ยื่นไม่ได้)
  assert.match(code('app/api/nav/counts/route.js'), /"actualStatus", "actualSubmittedById", "actualApprovedVia", "frozenAt"/);
  assert.match(code('app/api/sales-planning/sales-orders/route.js'), /"actualStatus", "actualSubmittedById", "actualApprovedVia", "frozenAt"/);
});

test('รอบสี่: แผงงวด — งวดยังไม่ตรึง = ปุ่มกู้โชว์แม้ไม่มีงวดค้างให้นับ (โมดัล "ตรึงงวดชำระ") · ยื่น/อนุมัติดับ + เหตุ · route ตรึงก่อนนับที่เหลือทั้งหมด', () => {
  const panel = code(PANEL);
  assert.match(panel, /startLabel: seqs\.length \? `งวด \$\{seqs\.join\(", "\)\}` : actualUnfrozen \? "" : "งวด 1",/);
  assert.match(panel, /const unfrozenLock = actualUnfrozen && !row\.preview\s*&& \(row\.actualStatus === "submitted" \|\| installmentPreviousConfirmed\(row, saved\)\)\s*&& \(gate\(row, "actual_submit"\) === INSTALLMENT_ACTUAL_UNFROZEN \|\| gate\(row, "actual_approve"\) === INSTALLMENT_ACTUAL_UNFROZEN\);/);
  const freezeOnly = installmentActualStartPrompt({ startLabel: '', freezeFirst: true });
  assert.equal(freezeOnly.title, 'ตรึงงวดชำระ');
  assert.equal(freezeOnly.confirmLabel, 'ตรึงงวดชำระ');
  assert.ok(bullets(freezeOnly).every((l) => !/นับ Actual งวด|฿0/.test(l)), 'ไม่พูด "นับ Actual งวด 1 ฿0"');
  assert.ok(bullets(freezeOnly).some((l) => /Actual ของใบไม่เปลี่ยน/.test(l)));
  const rest = installmentActualCountRestLines({ count: 2, amountLabel: '฿100,000.00', totalLabel: '฿100,000.00', freezeFirst: true });
  assert.match(rest[0], /^ตรึงงวดชำระที่ยังไม่ตรึงก่อน/);
  assert.ok(installmentActualCountRestLines({ count: 2 }).every((l) => !/ตรึงงวด/.test(l)), 'ตรึงครบแล้ว = ไม่พูด');
  const route = code('app/api/sales-planning/sales-orders/[id]/route.js');
  const branch = slice(route, "if (action === 'actual_start' || action === 'actual_count_rest') {", "\n  if (action === 'restore')");
  assert.match(branch, /if \(live\.some\(\(row\) => !row\?\.frozenAt\)\) \{/, 'นับที่เหลือทั้งหมดก็ตรึงก่อน (ไม่มี !counting)');
  assert.doesNotMatch(branch, /!counting && live\.some/);
  assert.match(branch, /\.\.\.\(frozeInstallments \? \{ frozeInstallments: true \} : \{\}\),/);
});

/* 🐞 งวดที่ยกมาซึ่งบัญชีรับรองแล้ว (C1 ล้างช่อง Actual · ต้องยื่นใหม่) ถูกบอก "บัญชีรับรองเงินได้หลัง…อนุมัติ" ทั้งที่รับรองแล้ว */
test('รอบสี่: โมดัลยื่น/อนุมัติงวดที่บัญชีรับรองเงินแล้ว — บอกว่ารับรองแล้ว · ไม่สัญญาว่ารอบัญชี · งวดถัดไปยื่นได้ทันที', () => {
  const submit = bullets(installmentActualSubmitPrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00', slipStatus: 'confirmed' }));
  assert.ok(submit.some((l) => /^· งวดนี้บัญชีรับรองเงินแล้ว — อนุมัติแล้วนับ Actual ได้ทันที · ผู้ยื่นดึงคำขอกลับได้ก่อน AE Sup ตัดสิน$/.test(l)));
  assert.ok(submit.every((l) => !/บัญชีรับรองเงินได้หลัง|แจ้งสลิปงวดนี้ได้/.test(l)));
  const approve = bullets(installmentActualApprovePrompt({ label: 'งวดที่ 2', shareLabel: '฿33,000.00', slipStatus: 'confirmed', nextNeedsSubmit: true }));
  assert.ok(approve.some((l) => /^· งวดนี้บัญชีรับรองเงินแล้ว — งวดถัดไปยื่นขอนับได้ทันที$/.test(l)));
  assert.ok(approve.every((l) => !/บัญชีรับรองเงินได้หลัง|งวดถัดไปยื่นได้หลังบัญชีรับรองงวดนี้/.test(l)));
  const last = bullets(installmentActualApprovePrompt({ label: 'งวดที่ 3', slipStatus: 'confirmed', nextNeedsSubmit: false }));
  assert.ok(last.some((l) => /^· งวดนี้บัญชีรับรองเงินแล้ว$/.test(l)));
  // reported = คำเดิม (ธงเดิม slipReported ยังให้ผลเท่ากัน)
  assert.deepEqual(installmentActualSubmitPrompt({ label: 'x', slipStatus: 'reported' }), installmentActualSubmitPrompt({ label: 'x', slipReported: true }));
  assert.deepEqual(installmentActualApprovePrompt({ label: 'x', slipStatus: 'reported', nextNeedsSubmit: true }),
    installmentActualApprovePrompt({ label: 'x', slipReported: true, nextNeedsSubmit: true }));
});

/* 🐞 มติข้อ 10: Rev. ของใบที่กดนับที่เหลือทั้งหมด — แผ่น/ปุ่ม/ทักยังสัญญา "งวดถัดไป ยื่น → AE Sup อนุมัติ" ทั้งที่ไม่มีการยื่นรายงวดอีก */
test('รอบสี่ (มติข้อ 10): แผ่นรายงวด · ปุ่มยืนยัน · ทักหลังอนุมัติ · ทักปุ่มกู้ ของใบที่กดนับที่เหลือทั้งหมด ไม่สัญญาการยื่น/อนุมัติรายงวด', () => {
  const page = code(SO_PAGE);
  const choice = slice(page, 'function ActualModeChoice(', '\n}\n');
  assert.match(choice, /eligibility\?\.countRestDone\s*\? "ใบก่อนหน้ากดนับที่เหลือทั้งหมดแล้ว — งวดที่ยังไม่นับนับให้เดือนนี้ทั้งหมด · ไม่ต้องยื่นรายงวด \(มติข้อ 10\)"/);
  assert.match(page, /const APPROVE_CONFIRM_COUNT_REST_LABEL = "อนุมัติและนับ Actual ที่ค้างทั้งหมด";/);
  // ตัวทักสองตัวรันจริงจาก source (ไม่ใช่ regex ของข้อความ)
  const approveToast = approveInstallmentToastOf(page);
  const startToast = new Function(`${slice(page, 'const actualStartToast = ', '\n};\n')}\n};\nreturn actualStartToast;`)();
  const restToast = approveToast({ installmentActualCounted: { count: 2, seqs: [3, 4] } }, { countRestDone: true });
  assert.match(restToast, /ใบนี้นับทั้งก้อนต่อ ไม่ต้องยื่นรายงวด/);
  assert.doesNotMatch(restToast, /AE Sup อนุมัติ/);
  assert.equal(approveToast({ installmentActualCounted: { count: 2, seqs: [1, 3] } }, {}),
    'อนุมัติ SO แล้ว · นับ Actual งวด 1, 3 แล้ว — งวดถัดไปนับเมื่อ AE Sup อนุมัติแต่ละงวด', 'งวดที่นับจริง ไม่ใช่ "งวด 1" ตายตัว');
  assert.match(startToast({ counted: 1, countedSeqs: [4] }, true), /^นับ Actual งวด 4 แล้ว — ใบนี้นับทั้งก้อน ไม่ต้องยื่นรายงวด$/);
  assert.match(startToast({ counted: 1, countedSeqs: [1] }, false), /งวดถัดไปนับเมื่อ AE Sup อนุมัติงวด$/);
  assert.match(startToast({ counted: 0, frozeInstallments: true }), /^ตรึงงวดชำระแล้ว — ไม่มีงวดค้างให้นับ/);
  assert.match(startToast({ counted: 0 }), /^ไม่มีงวดค้างให้นับ/);
});

/* 🐞 บัญชีถอนคำรับรองงวดของใบรายงวด — งวดถัดไปยื่น/อนุมัตินับไม่ได้จนรับรองใหม่ (มติข้อ 2) แต่โมดัลไม่บอก */
test('รอบสี่: โมดัลถอนคำรับรองของใบรายงวดบอกว่างวดถัดไปติด · ใบที่กดนับที่เหลือทั้งหมด/ใบทั้งใบ/งวดถัดไปนับแล้ว = ไม่พูด', async () => {
  const { installmentUnconfirmOutcome } = await import('./salesOrderPayments.js');
  const order = { status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null };
  const r1 = { id: 'I1', seq: 1, amount: 53500, status: 'confirmed', actualStatus: 'approved', actualApprovedVia: 'so_approval' };
  const r2 = { id: 'I2', seq: 2, amount: 53500, status: 'pending', actualStatus: 'submitted' };
  assert.match(installmentUnconfirmOutcome(r1, [r1, r2], { order }), /งวดที่ 2 ที่ยื่นขอนับไว้ AE Sup อนุมัตินับ Actual ไม่ได้จนบัญชีรับรองงวดนี้ใหม่/);
  assert.match(installmentUnconfirmOutcome(r1, [r1, { ...r2, actualStatus: null }], { order }), /งวดที่ 2 ยื่นขอนับ Actual ไม่ได้จนบัญชีรับรองงวดนี้ใหม่/);
  const base = installmentUnconfirmOutcome(r1, [r1, r2]);
  assert.doesNotMatch(base, /งวดที่ 2/, 'ไม่ส่งใบ = ไม่รู้แบบการนับ');
  assert.equal(installmentUnconfirmOutcome(r1, [r1, r2], { order: { ...order, actualMode: 'order' } }), base, 'ใบทั้งใบ = คำเดิม');
  assert.equal(installmentUnconfirmOutcome(r1, [r1, { ...r2, actualStatus: 'approved' }], { order }), base, 'งวดถัดไปนับแล้ว = ไม่ติด');
  assert.equal(installmentUnconfirmOutcome(r1, [{ ...r1, actualApprovedVia: 'count_rest' }, r2], { order }), base,
    'ใบที่กดนับที่เหลือทั้งหมด (มติข้อ 10 นับให้เอง) = ไม่ติด');
  assert.equal(installmentUnconfirmOutcome(r1, [r1, r2], { order: { ...order, status: 'approval_revoked' } }), base);
  assert.match(code(PANEL), /installmentUnconfirmOutcome\(live\(unconfirmFor\.row\), saved, \{ serviceRounds: showCoverage, order \}\)/);
});

// ── review รอบห้า 27/10 ──────────────────────────────────────────────────────────────────────────────────────────
/* 🐞 ทักหลังอนุมัติ: ขั้นนับนับ 0 งวดได้ตามจริง (ใบ Rev. ที่งวด 1–2 นับไว้ก่อนย้อนการอนุมัติ — มติข้อ 7) แต่ทักเคยถอยไป
   "นับ Actual งวด 1 แล้ว" ตายตัว · นับครบทุกงวดแล้วยังสัญญา "งวดถัดไป" */
test('รอบห้า: ทักหลังอนุมัติแบบรายงวดไม่ถอยไป "งวด 1" ตายตัว — งวดที่เคยนับกลับมา · งวดถัดไปเฉพาะเมื่อยังเหลือ', () => {
  const page = code(SO_PAGE);
  assert.doesNotMatch(page, /APPROVE_INSTALLMENT_TOAST\b/, 'ไม่มีถ้อยคำ "งวด 1" ตายตัวให้ถอยไปแล้ว');
  const toast = approveInstallmentToastOf(page);
  const rev = [
    { id: 'I1', seq: 1, actualStatus: 'approved', actualApprovedVia: 'so_approval' },
    { id: 'I2', seq: 2, actualStatus: 'approved', actualApprovedVia: 'installment' },
    { id: 'I3', seq: 3, actualStatus: null },
  ];
  const back = toast({ installmentActualCounted: { count: 0, amount: 0, seqs: [] } }, { rows: rev });
  assert.equal(back, 'อนุมัติ SO แล้ว · งวด 1, 2 ที่เคยนับก่อนย้อนการอนุมัติกลับมาเป็น Actual เดือนนี้ — งวดถัดไปนับเมื่อ AE Sup อนุมัติแต่ละงวด');
  assert.doesNotMatch(back, /นับ Actual งวด 1 แล้ว/);
  // ทุกงวดนับไว้ก่อนย้อน = ไม่มี "งวดถัดไป"
  const all = toast({ installmentActualCounted: { count: 0, seqs: [] } }, { rows: rev.map((r) => ({ ...r, actualStatus: 'approved' })) });
  assert.equal(all, 'อนุมัติ SO แล้ว · งวด 1, 2, 3 ที่เคยนับก่อนย้อนการอนุมัติกลับมาเป็น Actual เดือนนี้');
  // นับใหม่ + กลับมา (งวด 3 รับรองเงินแล้วบนร่าง Rev.)
  assert.equal(toast({ installmentActualCounted: { count: 1, seqs: [3] } }, { rows: rev }),
    'อนุมัติ SO แล้ว · นับ Actual งวด 3 แล้ว · งวด 1, 2 ที่เคยนับก่อนย้อนการอนุมัติกลับมาเป็น Actual เดือนนี้');
  // ใบใหม่: งวดร่าง/ยังไม่มีงวด (ตั้งตอนอนุมัติ) = คำเดิมของงวดที่นับ
  const fresh = 'อนุมัติ SO แล้ว · นับ Actual งวด 1 แล้ว — งวดถัดไปนับเมื่อ AE Sup อนุมัติแต่ละงวด';
  assert.equal(toast({ installmentActualCounted: { count: 1, seqs: [1] } }, { rows: [{ seq: 1 }, { seq: 2 }] }), fresh);
  assert.equal(toast({ installmentActualCounted: { count: 1, seqs: [1] } }, { rows: [] }), fresh);
  // ขั้นนับล้ม = บอกแค่ว่าอนุมัติแล้ว (ทักเตือนแยก)
  assert.equal(toast({ installmentActualStartFailed: true }, { rows: rev }), 'อนุมัติ SO แล้ว — ยังไม่ได้นับ Actual งวด 1');
  assert.equal(toast({ installmentActualStartFailed: true, installmentActualAlreadyCounted: true }, { rows: rev }),
    'อนุมัติ SO แล้ว — งวดที่ค้างตอนอนุมัติยังไม่ได้นับ');
});

/* 🐞 มติข้อ 6: ใบงานบริการที่อนุมัติแบบรายงวดโดยข้ามการตั้งงานบริการ (mig 0404) / เปิดแก้หลังอนุมัติ (0396) — ทักพูด "นับ Actual แล้ว"
   (ทั้งใบ) และคำใต้สถานะ "ยอดถูกนับเป็น Actual แล้ว" ทับคำอธิบายรายงวด (นับแล้ว x/y · งวดที่ยื่นได้) จนงานบริการอนุมัติ */
test('รอบห้า (มติข้อ 6): ใบงานบริการแบบรายงวด — ทักไม่ใช่ "นับ Actual แล้ว" ทั้งใบ · คำใต้สถานะคงคำอธิบายรายงวด', async () => {
  const { SERVICE_DEFERRED_TEXT, SERVICE_REOPENED_TEXT } = await import('./serviceSetup.js');
  const { fmtDate, fmtNumber } = await import('../format.js');
  const page = code(SO_PAGE);
  const toast = approveInstallmentToastOf(page);
  const suffix = new Function('fmtNumber', 'SERVICE_DEFERRED_TEXT',
    `${slice(page, 'const approveServiceSuffix = ', ';\n')};\nreturn approveServiceSuffix;`)(fmtNumber, SERVICE_DEFERRED_TEXT);
  const deferredToast = toast({ installmentActualCounted: { count: 1, seqs: [1] } }, { rows: [] }) + suffix(true, 0);
  assert.notEqual(deferredToast, SERVICE_DEFERRED_TEXT.approvedToast);
  assert.doesNotMatch(deferredToast, /นับ Actual แล้ว/);
  assert.equal(deferredToast,
    'อนุมัติ SO แล้ว · นับ Actual งวด 1 แล้ว — งวดถัดไปนับเมื่อ AE Sup อนุมัติแต่ละงวด · ยังไม่ส่งงานให้ TS (ข้ามการตั้งงานบริการตอนยื่น)');
  assert.match(toast({ installmentActualCounted: { count: 1, seqs: [1] } }, {}) + suffix(false, 3), / · เปิดงานบริการ 3 โซนให้ TS$/);
  assert.equal(suffix(false, 0), '', 'ใบที่ไม่ใช่งานบริการ = ไม่ต่อท้าย');

  // คำใต้สถานะ — รันก้อนจริงของหน้า
  const block = slice(page, 'const backfillServiceWord = ', 'const jumpToIssue = ');
  const note = new Function('showBackfillPanel', 'setupView', 'instActual', 'order', 'status', 'SERVICE_REOPENED_TEXT',
    'SERVICE_DEFERRED_TEXT', 'fmtDate', `${block}\nreturn backfillActualNote;`);
  const order = { status: 'approved', approvedAt: '2026-10-08T04:00:00Z' };
  const status = { description: 'นับ Actual รายงวด — นับแล้ว 1/12 งวด ฿10,000.00 จาก ฿120,000.00 (ก่อน VAT) · งวดที่ 2 ยื่นขอนับได้แล้ว ที่แท็บการชำระ (“ยื่นขอนับงวดนี้”)' };
  const run = (view, inst = true) => note(true, view, inst, order, status, SERVICE_REOPENED_TEXT, SERVICE_DEFERRED_TEXT, fmtDate);
  assert.equal(run({ deferred: { stage: 'approved' } }), `${status.description} — การตั้งงานบริการทีหลังไม่เปลี่ยนยอดที่นับ`);
  assert.equal(run({ reopened: true }), `${status.description} — การแก้งานบริการไม่เปลี่ยนยอดที่นับ`);
  assert.equal(run({}), `${status.description} — การตั้งงานบริการย้อนหลังไม่เปลี่ยนยอดที่นับ`);
  // ใบทั้งใบ = ประโยคเดิมทุกตัวอักษร
  assert.equal(run({ deferred: { stage: 'approved' } }, false), SERVICE_DEFERRED_TEXT.actualNote(order.approvedAt));
  assert.equal(run({ reopened: true }, false), SERVICE_REOPENED_TEXT.actualNote(order.approvedAt));
  assert.equal(note(false, {}, true, order, status, SERVICE_REOPENED_TEXT, SERVICE_DEFERRED_TEXT, fmtDate), null);
  assert.match(page, /\{backfillActualNote \|\| status\.description\}/);
});

/* ── UAT 27/10 (จอจริงแบบอ่านอย่างเดียว) ─────────────────────────────────────────────────────────────────────
   ข้อ 1 · 8: สภาพพิเศษของใบรายงวดที่อนุมัติแล้ว — หัวใบ + บรรทัดสรุปของการ์ด + ประกาศของแผงบอกขั้นถัดไปคำเดียวกัน
   (เดิมใบที่ตรึงงวดไม่สำเร็จได้คำของงวดร่าง "ยอดยืนยันตอนใบอนุมัติ" และหัวใบบอก "งวดที่เหลือนับเมื่อ AE Sup อนุมัติแต่ละงวด" ทุกสภาพ) */
test('UAT 27/10: installmentActualNextStep — งวดไม่ตรึง · นับครบ · ใบนับทั้งก้อนที่มีงวดค้าง · ยังไม่มีงวด · ปกติ = null', () => {
  const order = { id: 'SOR-1', status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null };
  const open = (seq, over = {}) => ({ id: `I${seq}`, seq, amount: 50000, status: 'pending', actualStatus: null, frozenAt: 'x', ...over });
  const counted = (seq, over = {}) => open(seq, { status: 'confirmed', actualStatus: 'approved', actualAmount: 46728.97, actualApprovedVia: 'so_approval', ...over });
  // งวดไม่ตรึง — ป้ายปุ่มกู้ตัวเดียวกับการ์ด (งวด 1 ยังค้าง = "นับงวด 1" · งวด 1 นับแล้ว = "นับงวดที่ค้าง")
  const unfrozen = installmentActualNextStep(order, [open(1, { frozenAt: null }), open(2, { frozenAt: null })]);
  assert.equal(unfrozen.kind, 'unfrozen');
  assert.match(unfrozen.text, /^งวดชำระยังไม่ตรึง \(ตรึงไม่สำเร็จตอนอนุมัติ\) — ให้ AE Sup กด “นับงวด 1” ที่การ์ดการชำระ/);
  assert.doesNotMatch(unfrozen.text, /ยืนยันตอนใบอนุมัติ|อนุมัติแต่ละงวด/);
  assert.match(installmentActualNextStep(order, [counted(1, { frozenAt: null }), open(2, { frozenAt: null })]).text, /กด “นับงวดที่ค้าง”/);
  // ใบนับทั้งก้อน (มติข้อ 10) ที่มีงวดค้าง — ไม่มีการอนุมัติทีละงวดแล้ว
  const auto = installmentActualNextStep(order, [counted(1), counted(2, { actualApprovedVia: 'count_rest' }), open(3)]);
  assert.equal(auto.kind, 'auto');
  assert.match(auto.text, /กด “นับงวดที่ค้าง”/);
  assert.doesNotMatch(auto.text, /อนุมัติแต่ละงวด/);
  // นับครบ
  assert.deepEqual(installmentActualNextStep(order, [counted(1), counted(2)]), { kind: 'complete', text: 'นับ Actual ครบทุกงวดแล้ว' });
  assert.match(installmentActualNextStep(order, [counted(1), counted(2, { actualApprovedVia: 'count_rest' })]).text, /งวดที่เพิ่มทีหลังนับให้อัตโนมัติ/);
  // ยังไม่มีงวด (ตัวหยุดยอดล้มก่อนมีงวด)
  assert.equal(installmentActualNextStep(order, []).kind, 'no_rows');
  // ปกติ / ใบอื่น = null (ผู้เรียกพูดเรื่องยื่นทีละงวดเอง)
  assert.equal(installmentActualNextStep(order, [counted(1), open(2)]), null);
  assert.equal(installmentActualNextStep({ ...order, actualMode: 'order' }, [open(1, { frozenAt: null })]), null);
  assert.equal(installmentActualNextStep({ ...order, status: 'approval_revoked' }, [open(1, { frozenAt: null })]), null);
});

test('UAT 27/10 ข้อ 1: แผงงวดของใบที่งวดไม่ตรึง — หัวการ์ด/ประกาศบอกปุ่มกู้ ไม่ใช่คำของงวดร่าง · แผนเปลี่ยนบอกจังหวะของปุ่มกู้', () => {
  const panel = code(PANEL);
  assert.match(panel, /: isDraftPlan && actualUnfrozen\s*\? `งวดชำระยังไม่ตรึง\$\{single \? "" : ` · \$\{rows\.length\} งวด`\} — รอ AE Sup กด “\$\{actualRecoveryLabel\}”`/);
  assert.match(panel, /\{actualUnfrozen \? \(\s*<StatusNotice tone="warning">\s*\{`ใบนี้อนุมัติแล้ว แต่ตรึงงวดชำระไม่สำเร็จตอนอนุมัติ/);
  // คำของงวดร่างไม่ขึ้นคู่กับประกาศทางกู้ (ใบทั้งใบที่ตรึงล้มยังได้คำเดิม — ไม่มีปุ่มกู้บนแผงให้ชี้)
  assert.match(panel, /\{isDraftPlan && !historical && !pipelineLock \? \(\s*actualUnfrozen \? null : \(\s*<StatusNotice tone="info">\s*กรอกกำหนดชำระ/);
  assert.match(panel, /\$\{actualUnfrozen \? `ตอน AE Sup กด “\$\{actualRecoveryLabel\}”` : "ตอนใบอนุมัติ"\} ระบบจะตั้งงวดใหม่ตามแผนล่าสุด/);
  assert.match(panel, /const actualRecoveryLabel = actualUnfrozen \? installmentActualStartButtonLabel\(saved\) : "";/);
});

test('UAT 27/10 ข้อ 5 · 7: การ์ดสรุปของหน้าใบเรียงซ้อน + คู่ "ป้าย ฿ยอด" ไม่ขาดกลาง · หมายเหตุ "รอนับรายงวด" ของแดชบอร์ดขนาดเท่าหมายเหตุ', () => {
  const page = code(SO_PAGE);
  assert.match(page, /stack: amountKind === "actual" && instActual,/);
  assert.match(page, /\{keepPhrases\(instSummaryParts\.join\(" · "\), instSummaryParts\)\}/);
  const card = code('components/ui/DocumentControlPanel.js');
  assert.match(card, /row\.stack \? styles\.summaryStack : ""/);
  assert.match(read('components/ui/DocumentControlPanel.module.css'), /\.summaryRows > \.summaryStack \{\s*flex-direction: column;/);
  const shared = code('components/salesPlanning/dashboard/performance/shared.js');
  assert.match(shared, /export function InstRemainingAmount\(\{ amount, count, inline = false, className = "" \}\)/);
  assert.match(shared, /className=\{\[inline \? instStyles\.inline : instStyles\.sub, className\]\.filter\(Boolean\)\.join\(" "\)\}/);
});

// ── review รอบหก 27/10 ────────────────────────────────────────────────────────────────────────────────────────

test('รอบหก: โมดัลรับรอง — งวด so_approval ที่ปุ่มกู้ "นับงวด 1" นับทีหลัง ไม่อ้าง "ตอน AE Sup อนุมัติใบ" · คลิกอนุมัติ/Rev./ยกเงิน คงคำเดิม', () => {
  const APPROVED = '2026-09-30T05:00:00.000000+00:00';
  const so = (over = {}) => ({ id: 'I1', seq: 1, actualStatus: 'approved', actualApprovedVia: 'so_approval', actualApprovedAt: APPROVED, ...over });
  // คลิกอนุมัติใบ: route ส่งเวลาอนุมัติให้ RPC ⇒ เท่ากันพอดี (รูปสตริงต่างกันได้)
  assert.equal(installmentActualCountedLate(so(), APPROVED), false);
  assert.equal(installmentActualCountedLate(so({ actualApprovedAt: '2026-09-30T05:00:00Z' }), APPROVED), false);
  // ปุ่มกู้กดทีหลัง (RPC ลงเวลาที่กด)
  assert.equal(installmentActualCountedLate(so({ actualApprovedAt: '2026-10-27T04:44:00Z' }), APPROVED), true);
  assert.equal(installmentActualCountedLate(so({ actualApprovedAt: '2026-09-30T05:00:01Z' }), APPROVED), true, 'กดทันทีหลังขั้นนับล้มก็นับทีหลัง');
  // Rev. รับงวดที่นับแล้วมา (เวลาเก่ากว่าเวลาอนุมัติ Rev.) · ทางอื่น · ไม่รู้เวลา = ไม่ตัดสิน
  assert.equal(installmentActualCountedLate(so({ actualApprovedAt: '2026-08-01T00:00:00Z' }), APPROVED), false);
  assert.equal(installmentActualCountedLate(so({ actualApprovedVia: 'review', actualApprovedAt: '2026-10-27T04:44:00Z' }), APPROVED), false);
  assert.equal(installmentActualCountedLate(so({ actualStatus: 'submitted', actualApprovedAt: '2026-10-27T04:44:00Z' }), APPROVED), false);
  assert.equal(installmentActualCountedLate(so({ actualApprovedAt: '2026-10-27T04:44:00Z' }), null), false);
  assert.equal(installmentActualCountedLate(so({ actualApprovedAt: null }), APPROVED), false);

  const line = (over) => paymentConfirmPrompt({ label: 'งวดที่ 1', amount: '฿1.00', orderStatus: 'approved', actualMode: 'installment',
    actualApprovedVia: 'so_approval', ...over }).detail;
  assert.match(line({}), /งวดนี้นับไปแล้วตอน AE Sup อนุมัติใบ/, 'คลิกอนุมัติ = คำเดิม');
  const late = line({ actualCountedLate: true });
  assert.doesNotMatch(late, /ตอน AE Sup อนุมัติใบ/);
  assert.match(late, new RegExp(`งวดนี้นับไปแล้วหลังอนุมัติใบ ตอน AE Sup กด “${INSTALLMENT_ACTUAL_START_LABEL}”/“${INSTALLMENT_ACTUAL_START_LEFT_LABEL}”`),
    'ป้ายปุ่มตรงกับป้ายจริงของปุ่มกู้ (approvalPrompt import ค่าคงที่ไม่ได้)');
  // ทางอื่นไม่ถูกแตะแม้ส่งธงมา
  assert.match(line({ actualApprovedVia: 'review', actualCountedLate: true }), /ตอน AE Sup อนุมัติงวด/);
  assert.match(line({ actualApprovedVia: 'count_rest', actualCountedLate: true, actualAutoCounted: true }), /ระบบนับให้อัตโนมัติแล้ว/);
  // ใบทั้งใบ = คำเดิมทุกตัวอักษร
  assert.deepEqual(paymentConfirmPrompt({ label: 'ก', amount: '฿1.00', orderStatus: 'approved', actualCountedLate: true }),
    paymentConfirmPrompt({ label: 'ก', amount: '฿1.00', orderStatus: 'approved' }));

  // ต่อสาย: โมดัลรับรอง (หน้าใบ + ทะเบียน) และโมดัล "บันทึกการรับชำระ" ของบัญชีส่งเวลาอนุมัติใบ
  const dialog = code(DIALOG);
  assert.match(dialog, /actualMode = 'order', orderApprovedAt = null,/);
  assert.match(dialog, /actualCountedLate: installmentActualCountedLate\(row, orderApprovedAt \?\? row\?\.orderApprovedAt \?\? null\),/);
  assert.match(dialog, /orderApprovedAt: order\?\.approvedAt \?\? row\.orderApprovedAt \?\? null,/);
  assert.match(code(PANEL), /installmentConfirmPrompt\(\{[\s\S]*?orderApprovedAt: order\?\.approvedAt \?\? null,[\s\S]*?\}\)/);
  assert.match(code(FN_PAGE), /approvedAt: confirmFor\.orderApprovedAt,/);
  assert.match(code('lib/finance/paymentLedger.js'), /orderApprovedAt: order\.approvedAt \|\| null,/);
});

test('รอบหก: ตารางงวด — ไม่มีแถวไหนมีของในช่องปุ่ม = ไม่จองช่องเปล่า 192px ตรึงขวา (สถานะตรึงชิดขอบแทน · จอ ≤640 ไม่แตะ)', () => {
  const css = read('components/salesPlanning/SalesOrderPaymentPanel.module.css');
  const NONE = String.raw`\.table:not\(:has\(> tbody > tr > td\.actionCell > \*\)\)`;
  assert.match(css, new RegExp(`${NONE} > thead > tr > th\\.actionHead,\\s*${NONE} > tbody > tr > td\\.actionCell \\{\\s*width: 1%;\\s*min-width: 0;\\s*right: auto;\\s*\\}`));
  assert.match(css, new RegExp(`${NONE} > tbody > tr > td\\.actionCell \\{ position: static; \\}`));
  assert.match(css, new RegExp(`${NONE} > tbody > tr > td\\.statusCell,\\s*${NONE} > thead > tr > th\\.statusHead \\{ right: 0; \\}`));
  // จอ ≤640 ไม่ตรึงขวา — หัวสถานะของตารางที่ไม่มีปุ่มถอดซ้ำ (กฎ right: 0 หนักกว่าการถอดเดิม) · ไม่เพิ่มจุดตัดจอใหม่
  const mobile = css.slice(css.indexOf('@media (max-width: 640px) {'));
  assert.match(mobile, new RegExp(`^@media \\(max-width: 640px\\) \\{[^{}]*${NONE} > thead > tr > th\\.statusHead \\{ right: auto; \\}`));
  assert.doesNotMatch(css, /@media \(min-width: 641px\)/);
  // หัวช่องปุ่มต้องคง sticky แนวตั้ง (ไม่ตั้ง position ให้ th)
  assert.doesNotMatch(css, new RegExp(`${NONE} > thead > tr > th\\.actionHead \\{[^}]*position`));
  // ตัดสินจาก DOM: ช่องปุ่มวาดลูกเฉพาะปุ่มหลัก/ปุ่มที่ติดด่าน/เมนู (ไม่มีอะไร = ช่องว่างจริง)
  const panel = code(PANEL);
  const cell = slice(panel, '<td className={styles.actionCell}>', '</td>');
  assert.match(cell, /\{primary \? \(/);
  assert.match(cell, /\) : actualLock \? \(/);
  assert.match(cell, /\{menu\.length \? \(/);
  assert.equal((cell.match(/\) : null\}/g) || []).length, 2, 'สองก้อน — ไม่มีอย่างอื่นวาดลงช่องนี้');
});

test('รอบหก: GET อ่านงวดพลาด — ส่ง installmentsError ทุกใบ · หัวใบ/การ์ดไม่สั่ง "เริ่มติดตามการชำระ" · ไม่มีปุ่มเริ่ม · บอกว่าอ่านไม่ขึ้น', () => {
  const route = code('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(route, /installmentsError: installmentsError \? `อ่านงวดชำระไม่สำเร็จ: \$\{installmentsError\.message \|\| installmentsError\}` : null,\s*installments: historical/);
  const page = code(SO_PAGE);
  assert.match(page, /const instNextStep = instActual && order\.status === "approved" && !\(order\.installmentsError && !installments\.length\)\s*\? installmentActualNextStep\(order, installments\) : null;/);
  const panel = code(PANEL);
  assert.match(panel, /const installmentsReadError = !saved\.length && order\?\.installmentsError \? String\(order\.installmentsError\) : "";/);
  assert.match(panel, /: installmentsReadError \? \[\]\s*: \(historical \|\| movedAway \|\| cancelledPipeline \? \[\] : previewInstallments\(/);
  assert.match(panel, /const actualNextStep = instLive && !installmentsReadError \? installmentActualNextStep\(order, saved\) : null;/);
  assert.match(panel, /\? \(installmentsReadError \? "อ่านงวดชำระไม่สำเร็จ"/);
  assert.match(panel, /\{installmentsReadError \? \(\s*<StatusNotice tone="error">/);
  assert.match(panel, /\{isPreview && canStart && canTrackPayments && !historical && !installmentsReadError \? \(/);
  assert.match(panel, /const countRestGate = installmentsReadError && countRestBase\.visible\s*\? \{ visible: true, blocker: `\$\{installmentsReadError\} — รีเฟรชหน้าแล้วลองใหม่` \}/);
  // ⚠️ คำ no_rows ยังจริงกับใบที่อ่านขึ้นแต่ไม่มีงวด (ตัวหยุดยอดล้มก่อนมีงวด)
  const order = { id: 'S', status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null };
  assert.equal(installmentActualNextStep(order, []).kind, 'no_rows');
});

test('รอบหก: โมดัลยืนยันที่มี lead ยึดขอบบน — เพดานหักระยะบนออก (จอเตี้ยปุ่มไม่ตกจอ) · กล่องที่ไม่มี lead ไม่แตะ', () => {
  const css = read('app/globals.css');
  assert.match(css, /\.overlay > \.drawer\.confirm-dialog-anchored \{\s*align-self: flex-start;\s*margin-top: var\(--space-9\);\s*max-height: min\(90vh, calc\(100% - var\(--space-9\)\)\);\s*\}/);
  assert.match(code('components/ui/ConfirmDialog.js'), /className=\{lead \? "confirm-dialog-anchored" : ""\}/);
});
