// ── ตัวต่อสายของ route "นับ Actual ทั้งใบ / รายงวด" (mig 0412 · docs/so-installment-actual.md) ─────────────────────────
// ⭐ ตรรกะล้วน — ทุกข้อในไฟล์นี้เทสต์ได้โดยไม่ต้องมีฐาน
// 🔴 installmentCountAtFreeze ต้องให้จำนวนเท่ากับที่ freezeInstallments ตัวจริงทิ้งไว้ทุกกิ่ง ⇒ เทียบกับตัวจริงบนฐานจำลองในหน่วยความจำ
//   (ด่าน "รายงวดต้องมี ≥ 2 งวด" ตัดสินก่อนอนุมัติจากตัวเลขนี้ — ผิดเมื่อไร ใบงวดเดียวเลือกรายงวดได้ หรือใบสองงวดเลือกไม่ได้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  actualGateStatus, actualModeApproveBlock, actualModeAuditText, actualStartBlocker, installmentActualAuditSummary,
  installmentActualCounted, installmentActualOrderAuditSummary, installmentActualStartRecovery, installmentCountAtFreeze,
  parseActualModeInput, previousActualModeOf, revokeActualDropText,
} from './salesOrderActualRoute.js';
import { installmentActualStartButtonLabel, installmentActualStartPending } from './salesOrderActualMode.js';
import { freezeInstallments } from './salesOrderInstallmentsStore.js';
import { workflowErrorMessage } from './documentWorkflowErrors.js';

const TABLE = 'sales_order_installments';
const msg = (code) => workflowErrorMessage(code);

const TWO = { type: 'installment', installments: [{ label: 'มัดจำ', percent: 50 }, { label: 'ก่อนส่งของ', percent: 50 }] };
const THREE = {
  type: 'installment',
  installments: [{ label: 'ก', percent: 50 }, { label: 'ข', percent: 25 }, { label: 'ค', percent: 25 }],
};

// ── แบบจากคำขอ ────────────────────────────────────────────────────────────────────────────────
test('parseActualModeInput: ไม่ส่ง/ว่าง = ทั้งใบ · สองค่าที่รู้จักผ่าน · ค่าอื่นปฏิเสธด้วยข้อความของฐาน', () => {
  for (const value of [undefined, null, '']) assert.deepEqual(parseActualModeInput(value), { ok: true, mode: 'order' });
  assert.deepEqual(parseActualModeInput('order'), { ok: true, mode: 'order' });
  assert.deepEqual(parseActualModeInput(' installment '), { ok: true, mode: 'installment' });
  for (const bad of ['INSTALLMENT', 'whole', 1, true, {}, []]) {
    assert.deepEqual(parseActualModeInput(bad), { ok: false, error: msg('sales_order_actual_mode_invalid') }, String(bad));
  }
});

// ── จำนวนงวดหลังหยุดยอด — คู่กับ freezeInstallments ทุกกิ่ง ─────────────────────────────────────────────
/* ฐานจำลองในหน่วยความจำ: เฉพาะคำสั่งที่ freezeInstallments/ensureInstallments ใช้ (select→eq→order · delete→in ·
   insert→select · update→eq [→select→maybeSingle]) */
function memoryDb(seed = []) {
  const rows = seed.map((row) => ({ ...row }));
  return {
    rows,
    from(name) {
      assert.equal(name, TABLE);
      return {
        select: () => ({
          eq: (col, value) => ({
            order: async () => ({
              data: rows.filter((r) => r[col] === value).sort((a, b) => a.seq - b.seq).map((r) => ({ ...r })),
              error: null,
            }),
          }),
        }),
        delete: () => ({
          in: async (col, ids) => {
            for (const id of ids) {
              const at = rows.findIndex((r) => r[col] === id);
              if (at >= 0) rows.splice(at, 1);
            }
            return { error: null };
          },
        }),
        insert: (payload) => {
          const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
          rows.push(...list);
          return { select: async () => ({ data: list.map((r) => ({ ...r })), error: null }) };
        },
        update: (patch) => ({
          eq: (col, value) => {
            const apply = () => {
              const row = rows.find((r) => r[col] === value);
              if (row) Object.assign(row, patch);
              return row ? { ...row } : null;
            };
            return {
              then: (resolve, reject) => Promise.resolve().then(() => { apply(); return { error: null }; }).then(resolve, reject),
              select: () => ({ maybeSingle: async () => ({ data: apply(), error: null }) }),
            };
          },
        }),
      };
    },
  };
}

const draftRow = (seq, over = {}) => ({
  id: `SOI-${seq}`, salesOrderId: 'SOR-1', seq, amount: 100, percent: 10, status: 'pending', evidence: [], ...over,
});
const frozenRow = (seq, over = {}) => draftRow(seq, { frozenAt: '2026-09-01T00:00:00.000Z', ...over });

const SCENARIOS = [
  ['ไม่มีแถว · แผน 2 งวด → ตั้งตามแผน', [], TWO, 1000],
  ['ไม่มีแถว · ไม่มีแผน (เต็มจำนวน) → 1 งวด', [], null, 1000],
  ['ไม่มีแถว · ใบยอด 0 → ไม่มีงวด', [], TWO, 0],
  ['ร่าง 1 แถว · แผน 2 งวด → ตั้งใหม่ 2', [draftRow(1)], TWO, 1000],
  ['ร่าง 3 แถว · แผน 2 งวด → ตั้งใหม่ 2', [draftRow(1), draftRow(2), draftRow(3)], TWO, 1000],
  ['ร่าง 2 แถว · แผน 2 งวด → ทับรายแถว 2', [draftRow(1), draftRow(2)], TWO, 1000],
  ['ร่าง 1 แถวที่บันทึกเงินไว้ · แผน 3 งวด → ไม่ตั้งใหม่ 1',
    [draftRow(1, { paidOn: '2026-09-01', evidence: [{ storagePath: 'x' }] })], THREE, 1000],
  ['ร่าง 1 แถวที่มีใบกำกับ · แผน 3 งวด → ไม่ตั้งใหม่ 1', [draftRow(1, { taxInvoiceNo: 'IV-1' })], THREE, 1000],
  ['ตรึงบางแถว (Rev.) 2 แถว · แผน 3 งวด → คงชุดเดิม 2', [frozenRow(1), draftRow(2)], THREE, 1000],
  ['ตรึงทั้งชุด 1 แถว · แผน 2 งวด → อนุมัติซ้ำ 1', [frozenRow(1)], TWO, 1000],
  ['ตรึงทั้งชุด 3 แถว · แผน 2 งวด → คงชุดเดิม 3', [frozenRow(1), frozenRow(2), frozenRow(3)], TWO, 1000],
];

for (const [label, seed, plan, totalAmount] of SCENARIOS) {
  test(`installmentCountAtFreeze = freezeInstallments ตัวจริง: ${label}`, async () => {
    const db = memoryDb(seed);
    const order = { id: 'SOR-1', totalAmount, quotation: { paymentPlan: plan } };
    await freezeInstallments(db, { order, user: { id: 'U1' }, now: '2026-10-26T03:00:00.000Z', borrowConfirmation: false });
    const actual = db.rows.filter((r) => r.salesOrderId === 'SOR-1').length;
    assert.equal(installmentCountAtFreeze(seed, { plan, totalAmount }), actual);
  });
}

test('installmentCountAtFreeze ทนของเสีย — ไม่ใช่อาร์เรย์/แถว null', () => {
  assert.equal(installmentCountAtFreeze(null, { plan: TWO, totalAmount: 1000 }), 2);
  assert.equal(installmentCountAtFreeze([null, draftRow(1), draftRow(2)], { plan: TWO, totalAmount: 1000 }), 2);
});

// ── ด่านเลือกรายงวดตอนอนุมัติ ─────────────────────────────────────────────────────────────────
test('actualModeApproveBlock: ทั้งใบผ่านเสมอ · รายงวดถามตัวตัดสินเดียวกับโมดัล (pipeline · ยอด > 0 · ≥ 2 งวด)', () => {
  const pipeline = { id: 'SO-1', origin: 'pipeline', totalAmount: 107000 };
  assert.equal(actualModeApproveBlock(pipeline, 'order', { installmentCount: 0 }), null);
  assert.equal(actualModeApproveBlock({ ...pipeline, totalAmount: 0 }, 'order'), null, 'ใบยอด 0 อนุมัติแบบทั้งใบได้ตามเดิม');
  assert.equal(actualModeApproveBlock(pipeline, 'installment', { installmentCount: 2 }), null);
  assert.match(actualModeApproveBlock(pipeline, 'installment', { installmentCount: 1 }), /งวดเดียว/);
  assert.match(actualModeApproveBlock({ ...pipeline, totalAmount: 0 }, 'installment', { installmentCount: 2 }), /0 บาท/);
  assert.match(actualModeApproveBlock({ ...pipeline, origin: 'historical' }, 'installment', { installmentCount: 3 }), /ย้อนหลัง/);
});

// ── แบบของใบก่อนหน้า (Rev.) ──────────────────────────────────────────────────────────────────────
test('previousActualModeOf: ใบที่ supersededById ชี้มาที่ใบนี้ · ไม่ใช่ Rev. = null', () => {
  const history = [
    { id: 'SO-B', supersededById: null, actualMode: 'order' },
    { id: 'SO-A', supersededById: 'SO-B', actualMode: 'installment' },
  ];
  assert.equal(previousActualModeOf({ id: 'SO-B' }, history), 'installment');
  assert.equal(previousActualModeOf({ id: 'SO-A' }, history), null, 'ใบแรกของสายไม่มีใบก่อนหน้า');
  assert.equal(previousActualModeOf({ id: 'SO-B' }, [{ id: 'SO-A', supersededById: 'SO-B' }]), 'order', 'ไม่มีคอลัมน์ = ทั้งใบ');
  assert.equal(previousActualModeOf(null, history), null);
  assert.equal(previousActualModeOf({ id: 'SO-B' }, null), null);
});

// ── ปุ่ม "นับงวด 1" ─────────────────────────────────────────────────────────────────────────────
test('actualStartBlocker: ลำดับเดียวกับ RPC — ผู้อนุมัติ → ใบอนุมัติอยู่ (pipeline · ไม่ถูกแทน) → แบบรายงวด', () => {
  const order = { id: 'SO-1', origin: 'pipeline', status: 'approved', actualMode: 'installment', supersededById: null };
  const sup = { id: 'U-SUP', role: 'ae_supervisor' };
  assert.equal(actualStartBlocker(order, sup), null);
  assert.deepEqual(actualStartBlocker(order, { id: 'U-AE', role: 'ae' }), { status: 403, error: msg('installment_actual_forbidden') });
  for (const bad of [{ status: 'approval_revoked' }, { supersededById: 'SO-2' }, { origin: 'historical' }]) {
    assert.deepEqual(actualStartBlocker({ ...order, ...bad }, sup), { status: 409, error: msg('installment_actual_order_not_approved') });
  }
  assert.deepEqual(actualStartBlocker({ ...order, actualMode: 'order' }, sup),
    { status: 409, error: msg('installment_actual_order_not_installment') });
});

// ── สถานะ HTTP ของข้อความด่าน = สถานะของรหัสเดียวกันที่ฐานตอบ ─────────────────────────────────────────────
test('actualGateStatus: ข้อความของ 0412 ได้สถานะเดียวกับรหัสของฐาน · ข้อความอื่น = 400 (พฤติกรรมเดิมของ PATCH งวด)', () => {
  assert.equal(actualGateStatus(msg('installment_actual_forbidden')), 403);
  assert.equal(actualGateStatus(msg('installment_actual_self_approval')), 403);
  assert.equal(actualGateStatus(msg('installment_actual_reason_required')), 400);
  assert.equal(actualGateStatus(msg('installment_actual_not_found')), 404);
  for (const code of ['installment_actual_bad_state', 'installment_actual_previous_unconfirmed',
    'installment_actual_order_not_installment', 'installment_actual_order_not_approved', 'installment_actual_stale',
    'installment_actual_not_approved']) {
    assert.equal(actualGateStatus(msg(code)), 409, code);
  }
  assert.equal(actualGateStatus('งวดของใบนี้ย้ายไป SO-2 แล้ว'), 400);
  assert.equal(actualGateStatus(undefined), 400);
});

// ── งวดที่ RPC เพิ่งนับ ─────────────────────────────────────────────────────────────────────────
test('installmentActualCounted: เฉพาะงวดที่เพิ่งกลายเป็น approved · ยอดบวกเป็นสตางค์ · เรียงเลขงวด', () => {
  const result = {
    before: [
      { id: 'I1', seq: 1, actualStatus: null },
      { id: 'I2', seq: 2, actualStatus: 'approved', actualAmount: 31152.64 },
      { id: 'I3', seq: 3, actualStatus: 'submitted' },
    ],
    after: [
      { id: 'I3', seq: 3, actualStatus: 'approved', actualAmount: 31152.66 },
      { id: 'I1', seq: 1, actualStatus: 'approved', actualAmount: 31152.64 },
      { id: 'I2', seq: 2, actualStatus: 'approved', actualAmount: 31152.64 },
    ],
  };
  assert.deepEqual(installmentActualCounted(result), { count: 2, amount: 62305.3, seqs: [1, 3] });
  assert.deepEqual(installmentActualCounted({ before: [], after: [] }), { count: 0, amount: 0, seqs: [] });
  assert.deepEqual(installmentActualCounted(null), { count: 0, amount: 0, seqs: [] });
  // 0.1 + 0.2 ของ float = 0.30000000000000004 — บวกเป็นสตางค์ต้องได้ 0.3 พอดี
  const tiny = installmentActualCounted({ before: [], after: [
    { id: 'a', seq: 1, actualStatus: 'approved', actualAmount: 0.1 },
    { id: 'b', seq: 2, actualStatus: 'approved', actualAmount: 0.2 },
  ] });
  assert.equal(tiny.amount, 0.3);
});

// ── ข้อความ audit ────────────────────────────────────────────────────────────────────────────
test('actualModeAuditText: บอกแบบเสมอ · รายงวดบอกงวดที่นับทันที · ขั้นนับล้มบอกทางกู้', () => {
  assert.equal(actualModeAuditText('order'), ' · นับ Actual ทั้งใบ');
  assert.equal(actualModeAuditText(undefined), ' · นับ Actual ทั้งใบ');
  assert.match(actualModeAuditText('installment', { counted: { count: 1, amount: 33000, seqs: [1] } }),
    /^ · นับ Actual รายงวด — นับทันที งวดที่ 1 .*33,000\.00 \(ก่อน VAT\)$/);
  assert.match(actualModeAuditText('installment', { startFailed: true }), /นับงวดแรกไม่สำเร็จ.*นับงวด 1/);
  assert.match(actualModeAuditText('installment', { counted: { count: 0, amount: 0, seqs: [] } }), /ไม่มีงวดให้นับทันที/);
});

test('สรุป audit ของงานรายงวด: เลขงวด + เลขที่ใบ · อนุมัติบอกยอด · ตีกลับบอกเหตุผล', () => {
  const order = { id: 'SOR-1', orderNumber: 'SO-26100001-0' };
  const row = { id: 'I2', seq: 2 };
  assert.equal(installmentActualAuditSummary('actual_submit', { order, row }), 'ยื่นขอนับ Actual งวด 2 ของ SO-26100001-0');
  assert.equal(installmentActualAuditSummary('actual_withdraw', { order, row }), 'ดึงคำขอนับ Actual กลับ งวด 2 ของ SO-26100001-0');
  assert.match(installmentActualAuditSummary('actual_approve', { order, row, after: { actualAmount: 1005000 } }),
    /^อนุมัตินับ Actual งวด 2 ของ SO-26100001-0 .*1,005,000\.00 \(ก่อน VAT\)$/);
  assert.equal(installmentActualAuditSummary('actual_reject', { order, row, reason: 'ยังไม่ได้ส่งของงวดนี้' }),
    'ตีกลับคำขอนับ Actual งวด 2 ของ SO-26100001-0: ยังไม่ได้ส่งของงวดนี้');
  const counted = { count: 2, amount: 66000, seqs: [2, 3] };
  assert.match(installmentActualOrderAuditSummary('actual_count_rest', { order, counted, reason: 'ลูกค้าจ่ายครบล่วงหน้า' }),
    /^นับ Actual ที่เหลือทั้งหมดของ SO-26100001-0 — งวดที่ 2, 3 .*66,000\.00 \(ก่อน VAT\): ลูกค้าจ่ายครบล่วงหน้า$/);
  assert.match(installmentActualOrderAuditSummary('actual_start', { order, counted: { count: 1, amount: 33000, seqs: [1] } }),
    /^นับ Actual งวดที่ค้างของ SO-26100001-0 \(ทางกู้หลังอนุมัติ\) — งวดที่ 1 /);
});

/* 🐞 review รอบสอง 26/10: ขั้นนับตอนอนุมัติ throw บนใบ Rev. ที่งวดยกมานับไว้แล้ว — เดิมทัก "ยังนับงวด 1 ไม่สำเร็จ กด ‘นับงวด 1’"
   ทั้งที่งวด 1 นับแล้วและปุ่มนั้นซ่อน (ปุ่มโชว์เฉพาะใบที่ยังไม่มีงวดไหนนับ) ⇒ route อ่านงวดสดแล้วตัดสินด้วยกติกาเดียวกับปุ่ม */
test('installmentActualStartRecovery: RPC ล้มแต่ไม่เหลืออะไรให้นับ = สำเร็จ · เหลือ = ล้ม (บอกว่านับไปบางงวดแล้ว) · อ่านไม่ขึ้น/ไม่มีงวด', () => {
  const counted = (seq, extra = {}) => ({ id: `I-${seq}`, seq, amount: 10700, status: 'pending', actualStatus: 'approved', ...extra });
  const open = (seq, extra = {}) => ({ id: `I-${seq}`, seq, amount: 10700, status: 'pending', actualStatus: null, ...extra });
  // ใบ Rev. ที่งวด 1–2 ยกมานับแล้ว งวด 3 ยังไม่ยื่น = ขั้นนี้ไม่มีอะไรต้องนับ
  assert.deepEqual(installmentActualStartRecovery([counted(1), counted(2), open(3)]),
    { startFailed: false, noRows: false, alreadyCounted: true, leftToCount: 0, counted: { count: 0, amount: 0, seqs: [] } });
  // ใบ Rev. ที่งวด 3 บัญชีรับรองบนร่าง (ยังไม่นับ) = ขั้นนี้ยังค้าง → ล้มจริง แต่บอกว่านับไปแล้วบางงวด
  const left = installmentActualStartRecovery([counted(1), open(2), open(3, { status: 'confirmed' })]);
  assert.deepEqual([left.startFailed, left.alreadyCounted, left.leftToCount], [true, true, 1]);
  // ใบใหม่ล้มตั้งแต่ยังไม่นับอะไร = ล้มแบบเดิม (ปุ่ม "นับงวด 1")
  assert.deepEqual(installmentActualStartRecovery([open(1), open(2)]),
    { startFailed: true, noRows: false, alreadyCounted: false, leftToCount: 1, counted: null });
  assert.deepEqual(installmentActualStartRecovery([]).noRows, true);
  assert.deepEqual(installmentActualStartRecovery(null),
    { startFailed: true, noRows: false, alreadyCounted: false, leftToCount: null, counted: null }, 'อ่านไม่ขึ้น = ล้ม (ทางที่ปลอดภัย)');
  // งวดที่ยกเงินเข้ามา (ต้องยื่น-อนุมัติในใบนี้ · 0412 C1) ไม่ใช่งานค้างของขั้นนี้
  const carried = open(2, { status: 'confirmed', movedFrom: [{ reason: 'carry', salesOrderId: 'SO-X' }] });
  assert.equal(installmentActualStartRecovery([counted(1), carried]).startFailed, false);
  assert.deepEqual(installmentActualStartPending([counted(1), carried]), []);
  const revised = open(2, { status: 'confirmed', movedFrom: [{ reason: 'carry' }, { reason: 'revision' }] });
  assert.deepEqual(installmentActualStartPending([counted(1), revised]).map((r) => r.seq), [2], 'ย้ายมากับ Rev. หลังยก = งานค้างตามเดิม');
  // ป้ายปุ่มกู้: งวดเลขน้อยสุดยังค้าง = "นับงวด 1" · ไม่งั้น = "นับงวดที่ค้าง"
  assert.equal(installmentActualStartButtonLabel([open(1), open(2)]), 'นับงวด 1');
  assert.equal(installmentActualStartButtonLabel([counted(1), open(2, { status: 'confirmed' })]), 'นับงวดที่ค้าง');
  assert.match(actualModeAuditText('installment', { startFailed: true, alreadyCounted: true }), /นับงวดที่ค้าง/);
  assert.doesNotMatch(actualModeAuditText('installment', { startFailed: true, alreadyCounted: true }), /นับงวด 1/);
});

/* 🐞 review รอบสอง 26/10: audit ของการย้อนอนุมัติใบรายงวดเคยบอกยอดเต็มหลุด ทั้งที่หลุดแค่ส่วนที่นับแล้ว */
test('revokeActualDropText: ใบทั้งใบ = ยอดเต็ม (คำเดิม) · ใบรายงวด = ยอดที่นับแล้วจากยอดเต็ม', () => {
  const base = { status: 'approved', origin: 'pipeline', actualAmount: 100000, actualCountedAmount: 33000 };
  assert.equal(revokeActualDropText({ ...base, actualMode: 'order' }), '฿100,000.00 บาท', 'ใบทั้งใบ = คำเดิมทุกตัวอักษร');
  assert.equal(revokeActualDropText({ ...base, actualMode: 'installment' }), 'รายงวด นับแล้ว ฿33,000.00 จาก ฿100,000.00');
  assert.equal(revokeActualDropText({ ...base, actualMode: 'installment', actualCountedAmount: 0 }),
    'รายงวด นับแล้ว ฿0.00 จาก ฿100,000.00');
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /summary: `ย้อนการอนุมัติ \$\{before\.orderNumber\} \(Actual \$\{revokeActualDropText\(before\)\} หลุดจากยอด\): \$\{reason\}`/);
});
