// ── route ของ "นับ Actual ทั้งใบ / รายงวด" (mig 0412 · docs/so-installment-actual.md) — ต่อสายครบทุกทาง ──────────────────
//
// ⭐ สองชั้น (แพตเทิร์นเดียวกับ salesOrderServiceGates.test.mjs):
//   1) **รันก้อนซอร์สจริงของ route ด้วยของปลอมที่ฉีดเข้าไป** (AsyncFunction · ไม่มีฐาน · ไม่มี HTTP) — ด่านแบบการนับตอนอนุมัติ ·
//      ขั้นนับงวด 1 หลังอนุมัติ · ปุ่มระดับใบ (actual_start / actual_count_rest) · งานรายงวดของ /installments
//      ตัวตัดสินที่ใช้เป็นของจริงทั้งหมด (salesOrderActualMode · salesOrderPayments · salesOrderActualRoute) — ปลอมแค่ I/O
//   2) **ยามต้นทาง** (อ่าน source ตัดคอมเมนต์) — สิ่งที่พังเงียบได้: ลืมส่งแบบเข้าตัวห่อ · select ขาดคอลัมน์ · ป้ายบนเมนู/ทะเบียนลืมเลน
// ⚠️ เทสต์ห้ามต่อฐานจริง (AGENTS.md) — ทุก I/O ในไฟล์นี้เป็นของปลอม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTUAL_MODE_INSTALLMENT, INSTALLMENT_ACTUAL_ACTIONS, INSTALLMENT_ACTUAL_AUTO_NOTE, countRestBlocker, installmentActualReasonError,
  installmentActualShareAtApproval,
} from './salesOrderActualMode.js';
import {
  INSTALLMENT_ACTUAL_FREEZE_FAILED,
  actualGateStatus, actualModeApproveBlock, actualModeAuditText, actualStartBlocker, installmentActualAuditSummary,
  installmentActualCounted, installmentActualOrderAuditSummary, installmentActualStartOutcome, installmentActualStartRecovery,
  installmentCountAtFreeze, parseActualModeInput, installmentActualAutoCountAuditText, installmentActualAutoCountedAtCommit,
} from './salesOrderActualRoute.js';
import { replanAuditSummary, replanReasonError } from './installmentReplan.js';
import { carryAuditSummary } from './installmentCarry.js';
import {
  INSTALLMENT_STALE_MESSAGE, installmentActionError, installmentStale, pipelineInstallmentLock,
} from './salesOrderPayments.js';
import { historicalInstallmentLock, isHistoricalOrder } from './historicalOrders.js';
import { documentWorkflowError, workflowErrorMessage } from './documentWorkflowErrors.js';
import { salesOrderIdsWaitingOnMe } from './salesOrderWorkflow.js';
import { isSalesManager } from '../permissions.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = (rel) => readFileSync(join(SRC, rel), 'utf8');
const code = (rel) => raw(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  assert.ok(!to || end > start, `หา "${to}" ต่อจาก "${from}" ไม่เจอ`);
  return text.slice(start, end < 0 ? undefined : end);
}
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const msg = (code0) => workflowErrorMessage(code0);

const SO_ROUTE = 'app/api/sales-planning/sales-orders/[id]/route.js';
const INST_ROUTE = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';
const LIST_ROUTE = 'app/api/sales-planning/sales-orders/route.js';
const NAV_ROUTE = 'app/api/nav/counts/route.js';
const MIGRATION = '../supabase/migrations/0412_so_installment_actual.sql';

/* ตัวตอบของ lib/http (รูปเดียวกัน — import ตัวจริงไม่ได้เพราะลาก auth/supabase admin มาด้วย) */
const http = {
  ok: (data, status = 200) => Response.json(data, { status }),
  fail: (error, status = 400) => Response.json({ error }, { status }),
  badRequest: (m = 'bad request') => Response.json({ error: m }, { status: 400 }),
  notFound: (m = 'not found') => Response.json({ error: m }, { status: 404 }),
  forbidden: (m = 'forbidden') => Response.json({ error: m }, { status: 403 }),
};
const reply = async (res) => ({ status: res.status, body: await res.json() });

/* ฐานปลอมของ RPC — จด (ชื่อ, พารามิเตอร์) ทุกครั้ง · คืนตามที่ตั้งไว้ต่อชื่อ (ฟังก์ชันได้) */
function rpcDouble(answers = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({ name, params });
      const answer = answers[name];
      if (typeof answer === 'function') return answer(params);
      return answer || { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  };
}

// ── 0. คอลัมน์ทุกตัวที่ route เลือกมีอยู่ใน 0412 (check:columns ยิงฐานจริง — รันไม่ได้จนกว่าเจ้าของรันมิก) ─────────────────────
test('คอลัมน์ใหม่ที่ route เลือก/กรองมีใน 0412 ครบ', () => {
  const sql = raw(MIGRATION);
  for (const column of ['actualMode', 'actualCountedAmount', 'actualSubmittedAmount', 'actualStatus', 'actualSubmittedById',
    'actualSubmittedAt', 'actualApprovedAt', 'actualRejectedAt', 'actualAmount']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`), column);
  }
  for (const fn of ['approve_sales_order_with_actual_mode', 'start_sales_order_installment_actual',
    'sales_order_installment_actual_action', 'count_rest_sales_order_installment_actual']) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), fn);
  }
});

// ── 1. อนุมัติ: แบบการนับ + ด่านรายงวด (ก้อนซอร์สจริง) ──────────────────────────────────────────────────────
function approveModeBranch() {
  const source = raw(SO_ROUTE);
  const approve = source.indexOf("  if (action === 'approve') {");
  const from = source.indexOf('    const actualModeInput = parseActualModeInput(body.actualMode);', approve);
  const to = source.indexOf('    let setupCtx = null;', from);
  assert.ok(approve > 0 && from > approve && to > from, 'หาก้อนแบบการนับของการอนุมัติไม่เจอ');
  return new AsyncFunction('body', 'before', 'id', 'supabase', 'loadInstallments', 'fail', 'parseActualModeInput',
    'ACTUAL_MODE_INSTALLMENT', 'actualModeApproveBlock', 'installmentCountAtFreeze',
    `${source.slice(from, to)}\n    return { actualMode };`);
}
async function runApproveMode({ body, before, rows = [], readError = null }) {
  let reads = 0;
  const loadInstallments = async (supabase, id) => {
    reads += 1;
    assert.equal(id, before.id);
    if (readError) throw readError;
    return rows;
  };
  const out = await approveModeBranch()(body, before, before.id, {}, loadInstallments, http.fail, parseActualModeInput,
    ACTUAL_MODE_INSTALLMENT, actualModeApproveBlock, installmentCountAtFreeze);
  return { out, reads, res: out instanceof Response ? await reply(out) : null };
}
const PENDING_SO = {
  id: 'SOR-1', orderNumber: 'SO-26100001-0', status: 'pending_approval', origin: 'pipeline', totalAmount: 107000,
  quotation: { paymentPlan: { type: 'installment', installments: [{ label: 'มัดจำ', percent: 50 }, { label: 'ส่งของ', percent: 50 }] } },
};

test('อนุมัติ: ไม่ส่งแบบ = ทั้งใบ (ไม่อ่านงวด) · ค่าแปลก = 400 · รายงวดของใบสองงวดผ่าน', async () => {
  const none = await runApproveMode({ body: {}, before: PENDING_SO });
  assert.deepEqual([none.out, none.reads], [{ actualMode: 'order' }, 0]);
  const whole = await runApproveMode({ body: { actualMode: 'order' }, before: { ...PENDING_SO, totalAmount: 0 } });
  assert.deepEqual(whole.out, { actualMode: 'order' }, 'ใบยอด 0 อนุมัติทั้งใบได้ตามเดิม');
  const bad = await runApproveMode({ body: { actualMode: 'monthly' }, before: PENDING_SO });
  assert.deepEqual(bad.res, { status: 400, body: { error: msg('sales_order_actual_mode_invalid'), code: 'actual_mode_invalid' } });
  const ok = await runApproveMode({ body: { actualMode: 'installment' }, before: PENDING_SO });
  assert.deepEqual([ok.out, ok.reads], [{ actualMode: 'installment' }, 1]);
});

test('อนุมัติ: รายงวดนับงวดจากตัวหยุดยอด — แผนงวดเดียว/ใบยอด 0 = 409 · อ่านงวดพัง = 500 (ไม่เดาว่างวดเดียว)', async () => {
  const single = await runApproveMode({
    body: { actualMode: 'installment' }, before: { ...PENDING_SO, quotation: { paymentPlan: { type: 'full' } } },
  });
  assert.equal(single.res.status, 409);
  assert.equal(single.res.body.code, 'actual_mode_ineligible');
  assert.match(single.res.body.error, /งวดเดียว/);
  // แถวร่างที่บันทึกเงินไว้ไม่ถูกตั้งใหม่ ⇒ งวดเดียวค้าง = เลือกรายงวดไม่ได้ แม้แผนของ QT มีสองงวด
  const prepaid = await runApproveMode({
    body: { actualMode: 'installment' }, before: PENDING_SO,
    rows: [{ id: 'I1', seq: 1, status: 'pending', paidOn: '2026-10-01', evidence: [{ storagePath: 'x' }] }],
  });
  assert.equal(prepaid.res.status, 409);
  const zero = await runApproveMode({ body: { actualMode: 'installment' }, before: { ...PENDING_SO, totalAmount: 0 } });
  assert.equal(zero.res.status, 409);
  assert.match(zero.res.body.error, /0 บาท/);
  const broken = await runApproveMode({ body: { actualMode: 'installment' }, before: PENDING_SO, readError: new Error('boom') });
  assert.deepEqual(broken.res, { status: 500, body: { error: 'อ่านงวดชำระของใบไม่สำเร็จ: boom' } });
});

// ── 2. อนุมัติ: นับงวด 1 หลัง freeze (ก้อนซอร์สจริง) ───────────────────────────────────────────────────────────
function approveStartBranch() {
  const source = raw(SO_ROUTE);
  const approve = source.indexOf("  if (action === 'approve') {");
  const from = source.indexOf('    const appliedActualMode = ', approve);
  const to = source.indexOf("    await logThread('approve', { overrideReason });", from);
  assert.ok(from > approve && to > from, 'หาก้อนนับงวด 1 ของการอนุมัติไม่เจอ');
  const fn = new AsyncFunction('data', 'result', 'actualMode', 'supabase', 'user', 'id', 'ACTUAL_MODE_INSTALLMENT',
    'installmentActualStartOutcome', 'freezeFailed', 'installmentActualStartRecovery', 'loadInstallments',
    `${source.slice(from, to)}\n    return { appliedActualMode, actualCounted, installmentActualStartFailed, installmentActualNoRows,
      installmentActualAlreadyCounted };`);
  /* ผู้เรียกเดิมส่ง 8 ตัวแรก (ตัวที่ 8 เคยเป็น installmentActualCounted) — ก้อนจริงใช้ installmentActualStartOutcome + ธงตัวหยุดยอด
     + installmentActualStartRecovery (กิ่ง RPC ล้ม — อ่านงวดสดแล้วตัดสิน · review รอบสอง 26/10) */
  return (data, result, actualMode, supabase, user, id, MODE, _unused, freezeFailed = false) => fn(
    data, result, actualMode, supabase, user, id, MODE, installmentActualStartOutcome, freezeFailed, installmentActualStartRecovery,
    /* ตัวอ่านงวดของ route (loadInstallments) — จำลองด้วย `from()` ของตัวจำลองฐาน (supabase ไม่ throw: error = โยน) */
    async (db, orderId) => {
      if (typeof db?.from !== 'function') throw new Error('no reader');
      const { data: rows, error } = await db.from('sales_order_installments').select('*').eq('salesOrderId', orderId);
      if (error) throw error;
      return rows || [];
    });
}
/* ตัวจำลองฐานที่มีทั้ง rpc และการอ่านงวด (`from().select().eq()` — กิ่ง RPC ล้มอ่านงวดสด) */
function rpcAndRowsDouble(answers, rows, readError = null) {
  const db = rpcDouble(answers);
  db.reads = [];
  db.from = (table) => ({
    select: (columns) => ({
      eq: async (column, value) => {
        db.reads.push({ table, columns, column, value });
        return readError ? { data: null, error: readError } : { data: rows, error: null };
      },
    }),
  });
  return db;
}
const SUP = { id: 'U-SUP', name: 'ซุป', role: 'ae_supervisor' };
const STARTED = {
  before: [{ id: 'I1', seq: 1, actualStatus: null }, { id: 'I2', seq: 2, actualStatus: null }],
  after: [{ id: 'I1', seq: 1, actualStatus: 'approved', actualAmount: 50000 }, { id: 'I2', seq: 2, actualStatus: null }],
  counted: 1, countedIds: ['I1'],
};

test('อนุมัติ: ใบรายงวด (ตามแถวที่ตัวห่อคืน) เรียก start_sales_order_installment_actual · ใบทั้งใบไม่เรียก', async () => {
  const db = rpcDouble({ start_sales_order_installment_actual: { data: STARTED, error: null } });
  const out = await approveStartBranch()({ actualMode: 'installment' }, {}, 'installment', db, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.deepEqual(db.calls, [{
    name: 'start_sales_order_installment_actual',
    params: { p_order_id: 'SOR-1', p_actor_id: 'U-SUP', p_actor_name: 'ซุป', p_actor_role: 'ae_supervisor', p_counted_at: null },
  }]);
  assert.deepEqual(out, {
    appliedActualMode: 'installment', actualCounted: { count: 1, amount: 50000, seqs: [1] },
    installmentActualStartFailed: false, installmentActualNoRows: false, installmentActualAlreadyCounted: false,
  });
  /* 🐞 review รอบสอง 26/10 (เส้นเดือน): ส่งเวลาอนุมัติที่เพิ่ง commit ให้ RPC ลงเวลาของงวด 1 — อนุมัติ 23:59:59 สิ้นเดือน งวด 1 อยู่เดือนนั้น */
  const timed = rpcDouble({ start_sales_order_installment_actual: { data: STARTED, error: null } });
  await approveStartBranch()({ actualMode: 'installment', approvedAt: '2026-09-30T16:59:59.000Z' }, {}, 'installment', timed, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.equal(timed.calls[0].params.p_counted_at, '2026-09-30T16:59:59.000Z');

  const whole = rpcDouble();
  const wholeOut = await approveStartBranch()({ actualMode: 'order' }, {}, 'order', whole, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.deepEqual([whole.calls.length, wholeOut.actualCounted, wholeOut.installmentActualStartFailed], [0, null, false]);
  // ⭐ ฐานคือคนตัดสินสุดท้าย — คำขอบอกรายงวดแต่แถวที่คืนเป็นทั้งใบ = ไม่นับงวด
  const overruled = rpcDouble();
  await approveStartBranch()({ actualMode: 'order' }, {}, 'installment', overruled, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.equal(overruled.calls.length, 0);
});

test('อนุมัติ: ขั้นนับงวดล้ม (error ของฐาน หรือโยน) = อนุมัติยังสำเร็จ + ธง installmentActualStartFailed (ไม่ 500)', async () => {
  for (const answer of [
    { data: null, error: { message: 'installment_actual_forbidden' } },
    () => { throw new Error('network down'); },
  ]) {
    const db = rpcDouble({ start_sales_order_installment_actual: answer });
    const out = await approveStartBranch()({ actualMode: 'installment' }, {}, 'installment', db, SUP, 'SOR-1',
      ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
    assert.deepEqual([out.actualCounted, out.installmentActualStartFailed], [null, true]);
  }
  /* 🐞 review รอบสอง 26/10: RPC ล้มบนใบ Rev. ที่งวดยกมานับไว้แล้ว — อ่านงวดสด: ไม่เหลืออะไรให้ขั้นนี้นับ = สำเร็จ (ไม่ทัก "กด นับงวด 1"
     ที่ไม่มีปุ่ม) · เหลือ (งวดที่รับรองบนร่างยังไม่นับ) = ล้ม + บอกว่านับไปบางงวดแล้ว · อ่านไม่ขึ้น = ล้ม (ทางที่ปลอดภัย) */
  const throwing = { start_sales_order_installment_actual: () => { throw new Error('network down'); } };
  const revRows = [{ id: 'I1', seq: 1, amount: 53500, status: 'pending', actualStatus: 'approved' },
    { id: 'I2', seq: 2, amount: 53500, status: 'pending', actualStatus: null }];
  const done = rpcAndRowsDouble(throwing, revRows);
  const doneOut = await approveStartBranch()({ actualMode: 'installment' }, {}, 'installment', done, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.deepEqual([doneOut.installmentActualStartFailed, doneOut.installmentActualAlreadyCounted, doneOut.actualCounted],
    [false, true, { count: 0, amount: 0, seqs: [] }]);
  assert.deepEqual(done.reads, [{ table: 'sales_order_installments', columns: '*', column: 'salesOrderId', value: 'SOR-1' }]);
  assert.match(raw(SO_ROUTE), /try \{ liveRows = await loadInstallments\(supabase, id\); \} catch \{ liveRows = null; \}/,
    'อ่านงวดสดผ่านตัวอ่านกลาง (ใบเดียว · check:rowcap)');
  const left = rpcAndRowsDouble(throwing, [revRows[0], { ...revRows[1], status: 'confirmed' }]);
  const leftOut = await approveStartBranch()({ actualMode: 'installment' }, {}, 'installment', left, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.deepEqual([leftOut.installmentActualStartFailed, leftOut.installmentActualAlreadyCounted], [true, true]);
  const unread = rpcAndRowsDouble(throwing, null, { message: 'boom' });
  const unreadOut = await approveStartBranch()({ actualMode: 'installment' }, {}, 'installment', unread, SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, installmentActualCounted);
  assert.deepEqual([unreadOut.installmentActualStartFailed, unreadOut.installmentActualAlreadyCounted], [true, false]);
});

/* 🐞 review 26/10: ตัวหยุดยอด (best-effort) ล้ม ⇒ ใบรายงวดไม่มีงวด · RPC start นับ 0 **ไม่ error** — เคยตอบ installmentActualCounted {count:0}
   แล้วจอขึ้น "นับ Actual งวด 1 แล้ว" ทั้งที่ Actual = 0 · ตัดสินจาก `after` (ไม่ใช่ count — ใบ Rev. ที่งวด 1 นับมาแล้วนับ 0 ได้ตามจริง) */
test('อนุมัติ: RPC สำเร็จแต่ไม่มีงวดไหนนับ = installmentActualStartFailed (+ NoRows เมื่อใบยังไม่มีงวด) · ใบ Rev. ที่นับมาแล้วยังสำเร็จ', async () => {
  const run = async (started, freezeFailed = false) => approveStartBranch()({ actualMode: 'installment' }, {}, 'installment',
    rpcDouble({ start_sales_order_installment_actual: { data: started, error: null } }), SUP, 'SOR-1',
    ACTUAL_MODE_INSTALLMENT, null, freezeFailed);
  const noRows = await run({ before: [], after: [], counted: 0, countedIds: [] });
  assert.deepEqual([noRows.installmentActualStartFailed, noRows.installmentActualNoRows, noRows.actualCounted.count], [true, true, 0]);
  const nothingCounted = await run({ before: STARTED.before, after: STARTED.before, counted: 0, countedIds: [] });
  assert.deepEqual([nothingCounted.installmentActualStartFailed, nothingCounted.installmentActualNoRows], [true, false]);
  const revCarried = [{ id: 'I1', seq: 1, actualStatus: 'approved', actualAmount: 50000 }, { id: 'I2', seq: 2, actualStatus: null }];
  const rev = await run({ before: revCarried, after: revCarried, counted: 0, countedIds: [] });
  assert.deepEqual([rev.installmentActualStartFailed, rev.installmentActualNoRows, rev.actualCounted.count], [false, false, 0],
    'ใบ Rev.: งวด 1 นับมาแล้ว = สำเร็จ (ทักสำเร็จจริง)');

  assert.deepEqual(installmentActualStartOutcome(null), { counted: { count: 0, amount: 0, seqs: [] }, startFailed: true, noRows: true });
  assert.match(actualModeAuditText('installment', { startFailed: true, noRows: true }), /ใบยังไม่มีงวด ยังไม่ได้นับงวดแรก \(กด “เริ่มติดตามการชำระ” แล้ว “นับงวด 1”/);
  assert.match(actualModeAuditText('installment', { startFailed: true }), /นับงวดแรกไม่สำเร็จ \(กด “นับงวด 1”/);
});

/* 🐞 review รอบสาม 26/10: ตัวหยุดยอดล้ม (ล้มกลางทาง = งวดบางงวดไม่ตรึง) แล้วยังนับงวด 1 ⇒ งวดที่ไม่ตรึงแจ้งสลิปได้แค่ pending · บัญชีรับรอง
   ไม่ได้ · งวด 2 ยื่นไม่ได้ตลอดไป · จอบอกสำเร็จ · ปุ่มกู้หายเพราะงวด 1 นับแล้ว ⇒ ใบรายงวดที่ตรึงล้ม = ไม่นับ (ปุ่มกู้ตรึงก่อนนับ) */
test('อนุมัติ: ตัวหยุดยอดล้มบนใบรายงวด = ไม่ยิงขั้นนับ · ธงล้ม (+ NoRows) จากงวดสด · ใบ Rev. ที่ตรึง/นับครบแล้วยังสำเร็จ', async () => {
  const run = (rows, readError = null) => approveStartBranch()({ actualMode: 'installment' }, {}, 'installment',
    rpcAndRowsDouble({}, rows, readError), SUP, 'SOR-1', ACTUAL_MODE_INSTALLMENT, null, true);
  const partial = [{ id: 'I1', seq: 1, amount: 53500, status: 'pending', actualStatus: null, frozenAt: '2026-10-26T03:00:00Z' },
    { id: 'I2', seq: 2, amount: 53500, status: 'pending', actualStatus: null, frozenAt: null }];
  const half = await run(partial);
  assert.deepEqual([half.installmentActualStartFailed, half.installmentActualNoRows, half.actualCounted], [true, false, null]);
  const none = await run([]);
  assert.deepEqual([none.installmentActualStartFailed, none.installmentActualNoRows], [true, true]);
  const unread = await run(null, { message: 'boom' });
  assert.equal(unread.installmentActualStartFailed, true, 'อ่านไม่ขึ้น = ล้ม (ทางที่ปลอดภัย)');
  const rev = [{ id: 'I1', seq: 1, amount: 53500, status: 'pending', actualStatus: 'approved', frozenAt: 'x' },
    { id: 'I2', seq: 2, amount: 53500, status: 'pending', actualStatus: null, frozenAt: 'x' }];
  const revOut = await run(rev);
  assert.deepEqual([revOut.installmentActualStartFailed, revOut.installmentActualAlreadyCounted], [false, true]);
  for (const out of [half, none, unread, revOut]) assert.ok(out, 'ไม่โยน');
  assert.match(actualModeAuditText('installment', { startFailed: true, freezeFailed: true }), /ตรึงงวดชำระไม่สำเร็จ ยังไม่ได้นับ \(กด “นับงวด 1”/);
});

test('อนุมัติ (ยามต้นทาง): ส่งแบบเข้าตัวห่อ · นับงวดหลัง freeze ก่อน audit · สรุป audit + เธรดบอกแบบ · คำตอบพกผลของงวด', () => {
  const approve = slice(code(SO_ROUTE), "if (action === 'approve') {", "if (action === 'reject') {");
  const rpc = slice(approve, 'approveSalesOrderWithSignatureEvidence(supabase, {', '});');
  assert.match(rpc, /\bactualMode,/, 'ตัวห่อต้องได้แบบทุกครั้ง');
  const freeze = approve.indexOf('await freezeInstallments(supabase, {');
  const start = approve.indexOf("supabase.rpc('start_sales_order_installment_actual', {");
  const audit = approve.indexOf('await recordAudit({');
  assert.ok(freeze > 0 && start > freeze && audit > start, 'ลำดับ: freeze → นับงวด → audit');
  assert.match(approve, /\+ actualModeAuditText\(appliedActualMode, \{\s*counted: actualCounted, startFailed: installmentActualStartFailed, noRows: installmentActualNoRows,\s*alreadyCounted: installmentActualAlreadyCounted, freezeFailed,\s*\}\)/);
  assert.match(approve, /\.\.\.\(freezeFailed \? \{ installmentFreezeFailed: true \} : \{\}\),/, 'ตรึงล้ม = บอกจอ (ทักเตือนทางกู้)');
  assert.match(approve, /\} catch \(installmentError\) \{\s*freezeFailed = true;/, 'ตัวหยุดยอดล้ม = จดธงไว้ log คู่กับผลของขั้นนับ');
  assert.match(approve, /await logThread\('actual_start', \{ seqs: actualCounted\.seqs, amount: actualCounted\.amount \}\);/);
  assert.match(approve, /\? \{\s*installmentActualStartFailed: true,\s*\.\.\.\(installmentActualNoRows \? \{ installmentActualNoRows: true \} : \{\}\),\s*\.\.\.\(installmentActualAlreadyCounted \? \{ installmentActualAlreadyCounted: true \} : \{\}\),\s*\.\.\.\(freezeFailed \? \{ installmentFreezeFailed: true \} : \{\}\),\s*\}\s*: \{ installmentActualCounted: actualCounted \}/);
  assert.match(approve, /p_counted_at: data\?\.approvedAt \|\| null,/, 'ส่งเวลาอนุมัติใบให้ขั้นนับงวด 1 (เส้นเดือน)');
  // แบบตัดสินก่อนด่านงานบริการ (ก้อนนั้นรันแยกในยามของ 0392) และหลังด่านอนุมัติใบตัวเอง
  assert.ok(approve.indexOf('isSalesOrderSelfApproval(before, user.id)') < approve.indexOf('parseActualModeInput(body.actualMode)'));
  assert.ok(approve.indexOf('parseActualModeInput(body.actualMode)') < approve.indexOf('let setupCtx = null;'));
});

test('signatureEvidence: การอนุมัติใบทุกทางผ่านตัวห่อ approve_sales_order_with_actual_mode', () => {
  const lib = code('lib/admin/signatureEvidence.js');
  const fn = slice(lib, 'export function approveSalesOrderWithSignatureEvidence', '\n}\n');
  assert.match(fn, /approveWithEvidence\(supabase, 'approve_sales_order_with_actual_mode', \{/);
  assert.match(fn, /p_actual_mode: input\.actualMode \|\| 'order',/);
  assert.doesNotMatch(lib, /'approve_sales_order_with_signature_evidence_atomic'/, 'ตัวเดิมเรียกผ่านตัวห่อเท่านั้น');
});

// ── 3. หน้าใบ GET: แบบของใบก่อนหน้า (Rev.) ─────────────────────────────────────────────────────────────────────
test('GET ใบ: สายโซ่ Rev. พก actualMode/supersededById · คืน previousActualMode', () => {
  const load = slice(code(SO_ROUTE), 'async function loadOrder(', 'async function loadApproverSignature(');
  assert.match(load, /\.select\('id, orderNumber, revisionNo, status, orderDate, createdAt, "actualMode", "supersededById"'\)/);
  assert.match(load, /previousActualMode: previousActualModeOf\(order, revisionHistory \|\| \[\]\),/);
  // ใบ + งวดมาด้วย select('*') ⇒ คอลัมน์ใหม่ของ 0412 ถึงจอเอง
  assert.match(load, /\.select\('\*, lines:sales_order_lines\(\*\)'\)/);
});

// ── 4. ปุ่มระดับใบ: actual_start / actual_count_rest (ก้อนซอร์สจริง) ─────────────────────────────────────────────────
function orderActionBranch() {
  const source = raw(SO_ROUTE);
  const from = source.indexOf("  if (action === 'actual_start' || action === 'actual_count_rest') {");
  const to = source.indexOf("  if (action === 'restore') {", from);
  assert.ok(from > 0 && to > from, 'หาก้อนปุ่มระดับใบไม่เจอ');
  return new AsyncFunction('action', 'before', 'user', 'body', 'id', 'supabase', 'req', 'loadInstallments', 'countRestBlocker',
    'isSalesManager', 'actualStartBlocker', 'installmentActualReasonError', 'documentWorkflowError', 'installmentActualCounted',
    'logThread', 'recordAudit', 'installmentActualOrderAuditSummary', 'fail', 'badRequest', 'ok',
    'freezeInstallments', 'confirmationBorrowable', 'INSTALLMENT_ACTUAL_FREEZE_FAILED',
    `${source.slice(from, to)}\n  return 'FALLTHROUGH';`);
}
const APPROVED_SO = {
  id: 'SOR-1', orderNumber: 'SO-26100001-0', status: 'approved', origin: 'pipeline', actualMode: 'installment',
  supersededById: null, totalAmount: 107000, actualAmount: 100000, dealId: 'D-1',
};
const LIVE = [
  { id: 'I1', seq: 1, status: 'confirmed', actualStatus: 'approved', actualAmount: 50000, frozenAt: '2026-10-01T03:00:00Z' },
  { id: 'I2', seq: 2, status: 'pending', actualStatus: null, frozenAt: '2026-10-01T03:00:00Z' },
];
/* `freeze` = ตัวตรึงงวดปลอม (จด order/borrow · คืน rows ที่ตรึงแล้ว · `freezeError` = โยน) — review รอบสาม 26/10 */
async function runOrderAction({
  action, before = APPROVED_SO, user = SUP, body = {}, rows = LIVE, answers = {}, freezeError = null, borrow = true,
}) {
  const db = rpcDouble(answers);
  const audits = [];
  const threads = [];
  const freezes = [];
  let live = rows.map((r) => ({ ...r }));
  const freezeInstallments = async (supabase, input) => {
    freezes.push({ orderId: input.order?.id, borrowConfirmation: input.borrowConfirmation, rpcCallsBefore: db.calls.length });
    if (freezeError) throw freezeError;
    live = live.map((r) => ({ ...r, frozenAt: r.frozenAt || '2026-10-26T03:00:00Z' }));
    return { rows: live, frozen: true };
  };
  const out = await orderActionBranch()(action, before, user, body, before.id, db, { fake: 'req' },
    async () => live.map((r) => ({ ...r })), countRestBlocker, isSalesManager, actualStartBlocker, installmentActualReasonError,
    documentWorkflowError, installmentActualCounted, async (act, opts) => { threads.push({ act, opts }); },
    async (entry) => { audits.push(entry); }, installmentActualOrderAuditSummary, http.fail, http.badRequest, http.ok,
    freezeInstallments, async () => borrow, INSTALLMENT_ACTUAL_FREEZE_FAILED);
  return { out, db, audits, threads, freezes, res: out instanceof Response ? await reply(out) : null };
}
const COUNT_REST_RESULT = {
  before: LIVE,
  after: [LIVE[0], { ...LIVE[1], actualStatus: 'approved', actualAmount: 50000, actualApprovedVia: 'count_rest' }],
  counted: 1, countedAmount: 50000, reason: 'ลูกค้าจ่ายครบล่วงหน้าแล้ว',
};

test('นับที่เหลือทั้งหมด: ผู้อนุมัติ + เหตุผล → RPC → audit before/after + เธรด (มีเหตุผล) · คำตอบบอกยอดที่เพิ่งนับ', async () => {
  const reason = 'ลูกค้าจ่ายครบล่วงหน้าแล้ว';
  const run = await runOrderAction({
    action: 'actual_count_rest', body: { reason: `  ${reason} ` },
    answers: { count_rest_sales_order_installment_actual: { data: COUNT_REST_RESULT, error: null } },
  });
  assert.deepEqual(run.db.calls, [{
    name: 'count_rest_sales_order_installment_actual',
    params: { p_order_id: 'SOR-1', p_reason: reason, p_actor_id: 'U-SUP', p_actor_name: 'ซุป', p_actor_role: 'ae_supervisor' },
  }]);
  assert.equal(run.res.status, 200);
  assert.deepEqual([run.res.body.counted, run.res.body.countedAmount, run.res.body.countedSeqs], [1, 50000, [2]]);
  assert.equal(run.audits.length, 1);
  assert.equal(run.audits[0].entityType, 'sales_order_installments');
  assert.deepEqual(run.audits[0].before, { installments: LIVE });
  assert.equal(run.audits[0].after.reason, reason);
  assert.match(run.audits[0].summary, /^นับ Actual ที่เหลือทั้งหมดของ SO-26100001-0 — งวดที่ 2 /);
  assert.deepEqual(run.threads, [{ act: 'actual_count_rest', opts: { seqs: [2], amount: 50000, reason } }]);
});

test('นับที่เหลือทั้งหมด: ไม่ใช่ผู้อนุมัติ 403 · เหตุผลสั้น 400 · นับครบแล้ว 409 · ใบทั้งใบ 409 — ไม่ยิง RPC', async () => {
  const ae = await runOrderAction({ action: 'actual_count_rest', user: { id: 'U-AE', role: 'ae' }, body: { reason: 'x'.repeat(20) } });
  assert.deepEqual([ae.res.status, ae.res.body.error], [403, msg('installment_actual_forbidden')]);
  const short = await runOrderAction({ action: 'actual_count_rest', body: { reason: 'สั้น' } });
  assert.deepEqual([short.res.status, short.res.body.error], [400, msg('installment_actual_reason_required')]);
  const done = await runOrderAction({
    action: 'actual_count_rest', body: { reason: 'x'.repeat(20) }, rows: [LIVE[0]],
  });
  assert.deepEqual([done.res.status, done.res.body.error], [409, 'นับ Actual ครบทุกงวดแล้ว']);
  const whole = await runOrderAction({ action: 'actual_count_rest', before: { ...APPROVED_SO, actualMode: 'order' }, body: { reason: 'x'.repeat(20) } });
  assert.deepEqual([whole.res.status, whole.res.body.error], [409, msg('installment_actual_order_not_installment')]);
  for (const run of [ae, short, done, whole]) assert.equal(run.db.calls.length, 0);
});

test('นับงวด 1 (ทางกู้): ไม่มีอะไรให้นับ = 200 counted 0 ไม่ลงประวัติ · รหัสของฐาน → ไทย · ใบที่ย้อนอนุมัติไม่ยิง', async () => {
  const noop = await runOrderAction({
    action: 'actual_start',
    answers: { start_sales_order_installment_actual: { data: { before: LIVE, after: LIVE, counted: 0, countedIds: [] }, error: null } },
  });
  assert.deepEqual([noop.res.status, noop.res.body.counted, noop.audits.length, noop.threads.length], [200, 0, 0, 0]);
  assert.deepEqual(noop.db.calls[0].params, { p_order_id: 'SOR-1', p_actor_id: 'U-SUP', p_actor_name: 'ซุป', p_actor_role: 'ae_supervisor' });
  const raced = await runOrderAction({
    action: 'actual_start',
    answers: { start_sales_order_installment_actual: { data: null, error: { message: 'installment_actual_order_not_installment' } } },
  });
  assert.deepEqual([raced.res.status, raced.res.body.error], [409, msg('installment_actual_order_not_installment')]);
  const revoked = await runOrderAction({ action: 'actual_start', before: { ...APPROVED_SO, status: 'approval_revoked' } });
  assert.deepEqual([revoked.res.status, revoked.db.calls.length], [409, 0]);
  const other = await runOrderAction({ action: 'restore' });
  assert.equal(other.out, 'FALLTHROUGH', 'คำสั่งอื่นไหลผ่านก้อนนี้');
  assert.equal(noop.freezes.length, 0, 'งวดตรึงครบแล้ว = ไม่เรียกตัวตรึง');
});

/* 🐞 review รอบสาม 26/10: ทางกู้ "นับงวด 1" ต้องตรึงงวดที่ยังไม่ตรึงก่อนนับ — ตัวหยุดยอดล้มตอนอนุมัติ / งวดจากปุ่ม "เริ่มติดตามการชำระ"
   รุ่นก่อนบนใบที่อนุมัติแล้ว = frozenAt ว่าง ⇒ แจ้งสลิปค้าง pending · บัญชีรับรองไม่ได้ (CHECK draft_pending) · งวด 2 ยื่นไม่ได้ตลอดไป */
/* 🐞 review รอบสี่ 26/10: "นับที่เหลือทั้งหมด" ก็ต้องตรึงก่อน — เดิมข้าม (`!counting`) ⇒ นับทุกงวดที่ไม่ตรึง ⇒ เงินทุกงวดรับรองไม่ได้ และปุ่มกู้หาย
   (ไม่มีงวดค้างให้นับ) · ตอบ `frozeInstallments` ให้จอบอกว่าตรึงแล้วแม้นับ 0 */
test('นับงวด 1 (ทางกู้) + นับที่เหลือทั้งหมด: งวดยังไม่ตรึง = ตรึงก่อนนับ (ยืมสลิปตามกติกา MONEY-1) · ตรึงล้ม = 500 ไม่ยิง RPC', async () => {
  const unfrozen = [{ id: 'I1', seq: 1, status: 'pending', actualStatus: null, frozenAt: null },
    { id: 'I2', seq: 2, status: 'pending', actualStatus: null, frozenAt: null }];
  const started = { before: unfrozen, after: [{ ...unfrozen[0], actualStatus: 'approved', actualAmount: 50000 }, unfrozen[1]],
    counted: 1, countedIds: ['I1'] };
  const ok = await runOrderAction({ action: 'actual_start', rows: unfrozen, borrow: false,
    answers: { start_sales_order_installment_actual: { data: started, error: null } } });
  assert.equal(ok.res.status, 200);
  assert.deepEqual(ok.freezes, [{ orderId: 'SOR-1', borrowConfirmation: false, rpcCallsBefore: 0 }], 'ตรึงก่อน RPC · ส่งผลของ MONEY-1');
  assert.equal(ok.db.calls.length, 1);
  assert.equal(ok.audits.length, 1, 'นับได้ = ลงประวัติ');
  const broken = await runOrderAction({ action: 'actual_start', rows: unfrozen, freezeError: new Error('db down') });
  assert.equal(broken.res.status, 500);
  assert.ok(broken.res.body.error.startsWith(INSTALLMENT_ACTUAL_FREEZE_FAILED), broken.res.body.error);
  assert.deepEqual([broken.db.calls.length, broken.audits.length], [0, 0], 'ตรึงล้ม = ไม่นับ');
  assert.equal(ok.res.body.frozeInstallments, true, 'ตอบว่าตรึงงวดแล้ว');
  const rest = await runOrderAction({ action: 'actual_count_rest', rows: unfrozen, borrow: false, body: { reason: 'ลูกค้าจ่ายครบล่วงหน้าแล้ว' },
    answers: { count_rest_sales_order_installment_actual: { data: { before: unfrozen, after: unfrozen, counted: 0 }, error: null } } });
  assert.deepEqual(rest.freezes, [{ orderId: 'SOR-1', borrowConfirmation: false, rpcCallsBefore: 0 }], 'นับที่เหลือทั้งหมดตรึงก่อน RPC');
  assert.equal(rest.db.calls.length, 1);
  const restBroken = await runOrderAction({ action: 'actual_count_rest', rows: unfrozen, body: { reason: 'ลูกค้าจ่ายครบล่วงหน้าแล้ว' },
    freezeError: new Error('db down') });
  assert.equal(restBroken.res.status, 500);
  assert.ok(restBroken.res.body.error.startsWith(INSTALLMENT_ACTUAL_FREEZE_FAILED), restBroken.res.body.error);
  assert.deepEqual([restBroken.db.calls.length, restBroken.audits.length], [0, 0], 'ตรึงล้ม = ไม่นับ');
  // เหตุผลสั้น / ไม่ใช่ผู้อนุมัติ = ตีกลับก่อนตรึง (คำขอที่ถูกตีกลับไม่ตรึงอะไร)
  const short = await runOrderAction({ action: 'actual_count_rest', rows: unfrozen, body: { reason: 'สั้น' } });
  assert.deepEqual([short.res.status, short.freezes.length], [400, 0]);
  // งวดตรึงครบแล้ว = ไม่เรียกตัวตรึง · ไม่มีธง
  const frozen = unfrozen.map((r) => ({ ...r, frozenAt: '2026-10-26T03:00:00Z' }));
  const plain = await runOrderAction({ action: 'actual_count_rest', rows: frozen, body: { reason: 'ลูกค้าจ่ายครบล่วงหน้าแล้ว' },
    answers: { count_rest_sales_order_installment_actual: { data: { before: frozen, after: frozen, counted: 0 }, error: null } } });
  assert.deepEqual([plain.freezes.length, plain.res.body.frozeInstallments], [0, undefined]);
});

// ── 5. /installments: งานรายงวด (ฟังก์ชันจริงของ route ด้วยของปลอม) ────────────────────────────────────────────────
function installmentActualActionOf() {
  const source = raw(INST_ROUTE);
  const fn = slice(source, 'async function installmentActualAction(');
  return new Function('loadOrderForUser', 'loadInstallment', 'loadInstallments', 'installmentStale', 'INSTALLMENT_STALE_MESSAGE',
    'installmentActionError', 'historicalInstallmentLock', 'pipelineInstallmentLock', 'isHistoricalOrder', 'actualGateStatus',
    'installmentActualShareAtApproval', 'INSTALLMENT_ACTUAL_ACTIONS', 'documentWorkflowError', 'recordAudit',
    'installmentActualAuditSummary', 'appendDocumentEvent', 'notifyInstallmentActual', 'installmentsForScreen',
    'ok', 'fail', 'badRequest', 'notFound',
    `${fn}\nreturn installmentActualAction;`);
}
const ORDER = { ...APPROVED_SO, deal: { id: 'D-1', ownerId: 'U-AE' }, quotation: { paymentPlan: null } };
const ROWS = [
  { id: 'I1', salesOrderId: 'SOR-1', seq: 1, amount: 53500, status: 'confirmed', actualStatus: 'approved', actualAmount: 50000, updatedAt: 't1' },
  { id: 'I2', salesOrderId: 'SOR-1', seq: 2, amount: 53500, status: 'pending', actualStatus: null, updatedAt: 't2' },
];
async function runInstallmentAction({ action, body, user = { id: 'U-AE', name: 'เอ', role: 'ae' }, rows = ROWS, order = ORDER, answer }) {
  const db = rpcDouble({ sales_order_installment_actual_action: answer || ((params) => {
    const before = rows.find((r) => r.id === params.p_installment_id);
    return { data: { before, after: { ...before, actualStatus: 'submitted', actualSubmittedById: user.id, updatedAt: 't9' } }, error: null };
  }) });
  const audits = [];
  const threads = [];
  const bells = [];
  const handler = installmentActualActionOf()(
    async () => ({ order }),
    async (supabase, rowId) => rows.find((r) => r.id === rowId) || null,
    async () => rows.map((r) => ({ ...r })),
    installmentStale, INSTALLMENT_STALE_MESSAGE, installmentActionError, historicalInstallmentLock, pipelineInstallmentLock,
    isHistoricalOrder, actualGateStatus, installmentActualShareAtApproval, INSTALLMENT_ACTUAL_ACTIONS, documentWorkflowError,
    async (entry) => { audits.push(entry); }, installmentActualAuditSummary,
    async (supabase, event) => { threads.push(event); }, (supabase, event) => { bells.push(event); return true; },
    (o, list) => list, http.ok, http.fail, http.badRequest, http.notFound,
  );
  const res = await handler({ user, supabase: db, req: { fake: 'req' }, id: 'SOR-1', body, action });
  return { db, audits, threads, bells, res: await reply(res) };
}

test('/installments ยื่นงวด: เจ้าของดีล · งวดก่อนหน้ารับรองแล้ว → RPC (CAS แถวที่ด่านตัดสิน) → audit + เธรด + กระดิ่งพร้อมยอดประมาณ', async () => {
  const run = await runInstallmentAction({ action: 'actual_submit', body: { installmentId: 'I2', expectedUpdatedAt: 't2' } });
  assert.equal(run.res.status, 200);
  assert.deepEqual(run.db.calls, [{
    name: 'sales_order_installment_actual_action',
    params: {
      p_installment_id: 'I2', p_action: 'submit', p_reason: null, p_expected_updated_at: 't2',
      p_actor_id: 'U-AE', p_actor_name: 'เอ', p_actor_role: 'ae',
    },
  }]);
  assert.equal(run.audits.length, 1);
  assert.equal(run.audits[0].entityId, 'I2');
  assert.equal(run.audits[0].summary, 'ยื่นขอนับ Actual งวด 2 ของ SO-26100001-0');
  assert.deepEqual(run.threads.map((t) => [t.docType, t.action, t.opts]), [['sales_order', 'actual_submit', { seq: 2 }]]);
  assert.equal(run.bells.length, 1);
  assert.equal(run.bells[0].action, 'actual_submit');
  assert.equal(run.bells[0].estimate, 50000, 'ส่วนที่เหลือของงวดท้าย = actualAmount − นับแล้ว');
  assert.equal(run.res.body.installment.actualStatus, 'submitted');
});

test('/installments: ด่านตอบก่อน RPC ด้วยสถานะเดียวกับฐาน — ข้อมูลเก่า 409 · งวดก่อนยังไม่รับรอง 409 · อนุมัติงวดตัวเอง 403 · เหตุผลสั้น 400', async () => {
  const stale = await runInstallmentAction({ action: 'actual_submit', body: { installmentId: 'I2', expectedUpdatedAt: 'old' } });
  assert.deepEqual([stale.res.status, stale.res.body.error], [409, INSTALLMENT_STALE_MESSAGE]);

  const unconfirmed = [{ ...ROWS[0], status: 'reported' }, ROWS[1]];
  const early = await runInstallmentAction({ action: 'actual_submit', body: { installmentId: 'I2' }, rows: unconfirmed });
  assert.deepEqual([early.res.status, early.res.body.error], [409, msg('installment_actual_previous_unconfirmed')]);

  const submitted = [ROWS[0], { ...ROWS[1], actualStatus: 'submitted', actualSubmittedById: 'U-SUP', actualSubmittedAt: 't3' }];
  const self = await runInstallmentAction({
    action: 'actual_approve', body: { installmentId: 'I2' }, user: { id: 'U-SUP', role: 'ae_supervisor' }, rows: submitted,
  });
  assert.deepEqual([self.res.status, self.res.body.error], [403, msg('installment_actual_self_approval')]);

  const short = await runInstallmentAction({
    action: 'actual_reject', body: { installmentId: 'I2', reason: 'ไม่' }, user: { id: 'U-CM', role: 'commercial_manager' }, rows: submitted,
  });
  assert.deepEqual([short.res.status, short.res.body.error], [400, msg('installment_actual_reason_required')]);

  const stranger = await runInstallmentAction({ action: 'actual_submit', body: { installmentId: 'I2' }, user: { id: 'U-X', role: 'ae' } });
  assert.deepEqual([stranger.res.status, stranger.res.body.error], [403, msg('installment_actual_forbidden')]);

  const whole = await runInstallmentAction({ action: 'actual_submit', body: { installmentId: 'I2' }, order: { ...ORDER, actualMode: 'order' } });
  assert.deepEqual([whole.res.status, whole.res.body.error], [409, msg('installment_actual_order_not_installment')]);

  for (const run of [stale, early, self, short, stranger, whole]) {
    assert.deepEqual([run.db.calls.length, run.audits.length, run.threads.length, run.bells.length], [0, 0, 0, 0]);
  }
});

test('/installments: ไม่ระบุงวด 400 · งวดของใบอื่น 404 · ฐานตีกลับ (แข่งกับอีกหน้าต่าง) = รหัส → ไทย ไม่ลงประวัติ', async () => {
  const missing = await runInstallmentAction({ action: 'actual_submit', body: {} });
  assert.deepEqual([missing.res.status, missing.res.body.error], [400, 'ไม่ได้ระบุงวดที่ต้องการ']);
  const foreign = await runInstallmentAction({
    action: 'actual_submit', body: { installmentId: 'IX' }, rows: [...ROWS, { ...ROWS[1], id: 'IX', salesOrderId: 'SOR-9' }],
  });
  assert.equal(foreign.res.status, 404);
  const raced = await runInstallmentAction({
    action: 'actual_submit', body: { installmentId: 'I2' }, answer: { data: null, error: { message: 'installment_actual_stale' } },
  });
  assert.deepEqual([raced.res.status, raced.res.body.error], [409, msg('installment_actual_stale')]);
  assert.deepEqual([raced.audits.length, raced.threads.length, raced.bells.length], [0, 0, 0]);
});

test('/installments อนุมัติงวด: ผู้อนุมัติคนอื่น → RPC approve · เธรดบอกยอดก่อน VAT ที่ฐานตรึง · กระดิ่งถึงผู้ยื่น', async () => {
  const submitted = [ROWS[0], { ...ROWS[1], actualStatus: 'submitted', actualSubmittedById: 'U-AE', actualSubmittedAt: 't3' }];
  const run = await runInstallmentAction({
    action: 'actual_approve', body: { installmentId: 'I2' }, user: { id: 'U-SUP', name: 'ซุป', role: 'ae_supervisor' }, rows: submitted,
    answer: (params) => ({
      data: { before: submitted[1], after: { ...submitted[1], actualStatus: 'approved', actualAmount: 50000, actualApprovedAt: 't4' } },
      error: params.p_action === 'approve' ? null : { message: 'wrong action' },
    }),
  });
  assert.equal(run.res.status, 200);
  assert.equal(run.db.calls[0].params.p_action, 'approve');
  assert.deepEqual(run.threads[0].opts, { seq: 2, amount: 50000 });
  assert.match(run.audits[0].summary, /^อนุมัตินับ Actual งวด 2 ของ SO-26100001-0 /);
  assert.equal(run.bells[0].before.actualSubmittedById, 'U-AE');
  assert.equal(run.bells[0].estimate, null);
});

test('/installments (ยามต้นทาง): คำสั่ง actual_* แยกก่อนด่าน installmentId ของ PATCH · PATCH เดิมส่งใบเข้าด่าน (บัญชีรับรอง/แจ้งสลิป)', () => {
  const route = code(INST_ROUTE);
  const patch = slice(route, 'export const PATCH', 'async function installmentActualAction(');
  const dispatch = patch.indexOf('if (Object.hasOwn(INSTALLMENT_ACTUAL_ACTIONS, action)) {');
  assert.ok(dispatch > 0 && dispatch < patch.indexOf("const installmentId = String(body.installmentId || '').trim();"));
  const gate = slice(patch, 'installmentActionError(row, action, user, {', '});');
  assert.match(gate, /order, dealOwnerId: order\.deal\?\.ownerId \?\? null,/);
  // ทางเขียนทางเดียวของงานรายงวด = RPC (ห้าม UPDATE ช่อง actual* ตรง)
  const fn = slice(route, 'async function installmentActualAction(');
  assert.match(fn, /supabase\.rpc\('sales_order_installment_actual_action', \{/);
  assert.doesNotMatch(fn, /updateInstallment\(|\.update\(/);
});

// ── 6. ทะเบียนใบสั่งขาย + ป้ายบนเมนู: เลนนับ Actual รายงวด ─────────────────────────────────────────────────────────
test('ทะเบียนใบสั่งขาย: งวดของรายการพกช่องของเลน (ถอยเป็นชุด 0378 ก่อนรัน 0412) · จำนวนงวดที่ยื่นรอ', () => {
  const list = code(LIST_ROUTE);
  const loader = slice(list, 'async function loadListInstallments(', '\n}\n');
  const first = loader.indexOf('.select(\'id, salesOrderId, seq, status, kind, "dueDate", "coversFrom", "coversTo", "taxInvoiceNo", "refundedAt", "actualStatus", "actualSubmittedById", "actualApprovedVia", "frozenAt"\')');
  const fallback = loader.indexOf('.select(\'salesOrderId, status, kind, "dueDate", "coversFrom", "coversTo", "taxInvoiceNo", "refundedAt"\')');
  assert.ok(first > 0 && fallback > first, 'ชุดของ 0412 ก่อน · ถอยเป็นชุดของ 0378');
  assert.match(loader, /if \(withActual\.error\?\.code !== '42703'\) return withActual;/);
  assert.match(list, /actualSubmittedCount: \(actualInstallmentsOf\(row\) \|\| \[\]\)\.filter\(\(r\) => r\.actualStatus === 'submitted'\)\.length/);
});

test('ป้ายบนเมนู: เลนใบรายงวดพก deal.ownerId · งวดซอยก้อน + โยน error · ป้อน helper ตัวเดียวกับทะเบียน', () => {
  const job = slice(code(NAV_ROUTE), "attempt('salesOrders'", "attempt('projectCloses'");
  assert.match(job, /const actualLane = can\(user\.role, 'salesplan:view'\)\s*\? fetchAllResult\(\(\) => pipelineRowsOnly\(supabase\.from\('sales_orders'\)\.select\('id, status, origin, "actualMode", "supersededById", deal:sales_deals\(ownerId\)'\)\)\s*\.eq\('status', 'approved'\)\.eq\('actualMode', 'installment'\)\.is\('supersededById', null\)/);
  assert.match(job, /if \(actualError\) throw actualError;/);
  /* 🐞 review 26/10: ต้องมี "dueDate" — ขาด = เลนเจ้าของดีลนับงวดที่ยังไม่ถึงกำหนด (ป้าย ≠ "รอฉัน" ของทะเบียน) */
  assert.match(job, /fetchInChunks\(actualIds, \(chunk\) => fetchAllResult\(\(\) => supabase\s*\.from\('sales_order_installments'\)\s*\.select\('id, "salesOrderId", seq, status, "dueDate", "actualStatus", "actualSubmittedById", "actualApprovedVia", "frozenAt"'\)\s*\.in\('salesOrderId', chunk\)/);
  assert.match(job, /if \(actualInstallmentError\) throw actualInstallmentError;/);
  assert.match(job, /actualRows: actualOrders,\s*actualInstallmentsOf: \(row\) => actualInstallmentsByOrder\.get\(row\.id\) \|\| \[\],/);
});

test('ป้ายบัญชี (payments): ตัวตัดสินเดียวกับทะเบียน (ledgerInConfirmQueue) — ตัดงวดที่ติดด่านนับ Actual + แถวที่ทะเบียนไม่โชว์', () => {
  const job = slice(code(NAV_ROUTE), "attempt('payments'", "if (can(user.role, 'mgmt:view'))");
  /* 🐞 UAT FN 27/10 ข้อ 2: head-count เดิม (reported − ก้อนที่ติดด่าน) ได้ 27 · ทะเบียนเห็น 21 (ใบยอด 0 · งวดโมฆะ · งวดยังไม่ตรึง)
     ⇒ ดึงงวด reported พร้อมใบ แล้วถามตัวตัดสินของทะเบียน · ใบยกเลิกไม่ติดด่าน (installmentActualPaymentGated — รับรองแล้วคืนเงินได้) */
  assert.match(job, /fetchAllResult\(\(\) => supabase\s*\.from\('sales_order_installments'\)\s*\.select\('id, status, kind, "frozenAt", "actualStatus", so:sales_orders!inner\(id, status, origin, "totalAmount", "actualMode"\)'\)\s*\.eq\('status', 'reported'\)\s*\.not\('frozenAt', 'is', null\)\s*\.order\('id', \{ ascending: true \}\)\)/);
  assert.match(job, /if \(paymentError\) throw paymentError;/);
  assert.match(job, /return \(data \|\| \[\]\)\.filter\(\(row\) => ledgerInConfirmQueue\(row, row\.so\)\)\.length;/);
});

test('ตัวตัดสินของป้าย (แถวรูปเดียวกับที่ตัวนับเลือก): ผู้อนุมัติเห็นงวดที่คนอื่นยื่น · เจ้าของดีลเห็นงวดที่ยื่นได้', () => {
  const order = { id: 'SOR-1', status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null, deal: { ownerId: 'U-AE' } };
  const submitted = [
    { id: 'I1', seq: 1, status: 'confirmed', actualStatus: 'approved', actualSubmittedById: null },
    { id: 'I2', seq: 2, status: 'pending', actualStatus: 'submitted', actualSubmittedById: 'U-AE' },
  ];
  const lanes = (rows) => ({ actualRows: [order], actualInstallmentsOf: () => rows });
  assert.equal(salesOrderIdsWaitingOnMe(lanes(submitted), { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' }).size, 1);
  assert.equal(salesOrderIdsWaitingOnMe(lanes(submitted), { userId: 'U-AE', reviewer: false, role: 'ae' }).size, 0, 'ยื่นแล้ว = รอผู้อนุมัติ');
  const ready = [submitted[0], { ...submitted[1], actualStatus: null, actualSubmittedById: null }];
  assert.equal(salesOrderIdsWaitingOnMe(lanes(ready), { userId: 'U-AE', reviewer: false, role: 'ae' }).size, 1);
  assert.equal(salesOrderIdsWaitingOnMe(lanes(ready), { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' }).size, 0);
  // ใบที่ย้อนอนุมัติแล้ว (ค่าค้างเป็นรายงวด) ไม่ใช่งานของใคร
  assert.equal(salesOrderIdsWaitingOnMe({ actualRows: [{ ...order, status: 'approval_revoked' }], actualInstallmentsOf: () => submitted },
    { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' }).size, 0);
});

/* 🐞 review 26/10: แถวรูปเดียวกับ select ของป้าย (มี dueDate) — เลนเจ้าของดีลนับเฉพาะงวดที่ถึงเดือนครบกำหนด (= `_waitingOnMe` ของทะเบียน)
   · เลนผู้อนุมัตินับเฉพาะงวดที่อนุมัติได้ตอนนี้ (งวดก่อนหน้ารับรองครบ — บัญชีถอนคำรับรองงวดก่อน = ไม่ใช่งานของผู้อนุมัติ) */
test('ตัวตัดสินของป้าย: งวดที่ยังไม่ถึงกำหนดไม่นับให้เจ้าของดีล · งวดที่อนุมัติไม่ได้ (งวดก่อนถูกถอนคำรับรอง) ไม่นับให้ผู้อนุมัติ', () => {
  const order = { id: 'SOR-1', status: 'approved', origin: 'pipeline', actualMode: 'installment', supersededById: null, deal: { ownerId: 'U-AE' } };
  const lanes = (rows) => ({ actualRows: [order], actualInstallmentsOf: () => rows });
  const AE = { userId: 'U-AE', reviewer: false, role: 'ae' };
  const SUPV = { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' };
  const first = { id: 'I1', seq: 1, status: 'confirmed', dueDate: '2026-10-05', actualStatus: 'approved', actualSubmittedById: null };
  const next = (over) => [first, { id: 'I2', seq: 2, status: 'pending', dueDate: '2099-11-05', actualStatus: null, actualSubmittedById: null, ...over }];
  assert.equal(salesOrderIdsWaitingOnMe(lanes(next()), AE).size, 0, 'งวด 2 ครบกำหนดอนาคต = ยังไม่ใช่งานของเดือนนี้');
  assert.equal(salesOrderIdsWaitingOnMe(lanes(next({ dueDate: '2020-01-05' })), AE).size, 1, 'เลยกำหนด = นับ');
  assert.equal(salesOrderIdsWaitingOnMe(lanes(next({ dueDate: null })), AE).size, 1, 'ไม่มีวันครบกำหนด = นับ');
  assert.equal(salesOrderIdsWaitingOnMe(lanes(next({ actualStatus: 'rejected', actualRejectedReason: 'แก้ยอดงวดนี้ก่อน' })), AE).size, 1, 'ตีกลับ = นับเสมอ');

  const submitted = next({ actualStatus: 'submitted', actualSubmittedById: 'U-AE' });
  assert.equal(salesOrderIdsWaitingOnMe(lanes(submitted), SUPV).size, 1);
  const unconfirmed = [{ ...first, status: 'reported' }, submitted[1]];
  assert.equal(salesOrderIdsWaitingOnMe(lanes(unconfirmed), SUPV).size, 0, 'งวดก่อนถูกถอนคำรับรอง = อนุมัติไม่ได้ ⇒ ไม่อยู่ในป้าย/คิว');
});

// ── 7. select ของจออื่นที่คิดยอด Actual จากแถวใบ ───────────────────────────────────────────────────────────────
test('หน้าโครงการ/ใบเสนอราคา: แถวใบพก actualMode + cache สองช่อง (ตัวกลาง salesOrderActual · splitSalesOrderAmounts)', () => {
  for (const rel of ['app/api/pm/projects/[id]/route.js', 'app/api/sales-planning/quotations/[id]/route.js']) {
    const route = code(rel);
    const select = route.slice(route.indexOf(".from('sales_orders')"), route.indexOf("')", route.indexOf('.select(', route.indexOf(".from('sales_orders')"))));
    for (const column of ['origin', '"actualMode"', '"actualCountedAmount"', '"actualSubmittedAmount"']) {
      assert.ok(select.includes(column), `${rel} ขาด ${column}`);
    }
  }
});

/* 🐞 review รอบสาม 26/10: "เริ่มติดตามการชำระ" บนใบที่อนุมัติแล้ว (ทางกู้หลังตัวหยุดยอดล้ม · ใบเก่าก่อน B-4) เคยได้งวดแบบร่าง (frozenAt ว่าง)
   ⇒ แจ้งสลิปค้าง pending · บัญชีรับรองไม่ได้ · ใบรายงวดยื่นงวด 2 ไม่ได้ตลอดไป ⇒ ใบที่อนุมัติแล้วตรึงทันทีด้วยตัวเดียวกับการอนุมัติ */
test('POST /installments (เริ่มติดตามการชำระ): ใบที่อนุมัติแล้ว = ตรึงทันที (ยืมสลิปตามกติกา MONEY-1) · ใบร่าง = งวดร่างตามเดิม', async () => {
  const source = raw(INST_ROUTE);
  const post = source.slice(source.indexOf('export const POST = withUser('));
  const from = post.indexOf('    let rows;');
  const to = post.indexOf("    if (!rows.length) return badRequest(");
  assert.ok(from > 0 && to > from, 'หาก้อนสร้างงวดของ POST ไม่เจอ');
  const block = new AsyncFunction('order', 'user', 'supabase', 'loadInstallments', 'freezeInstallments', 'confirmationBorrowable',
    'ensureInstallments', `${post.slice(from, to)}\n    return { rows, created };`);
  const run = async (order, existing = []) => {
    const calls = [];
    const out = await block(order, SUP, {}, async () => existing,
      async (db, input) => { calls.push(['freeze', input.order.id, input.borrowConfirmation]); return { rows: [{ id: 'N1', frozenAt: 'now' }] }; },
      async () => false,
      async (db, input) => { calls.push(['ensure', input.order.id, input.frozenAt ?? null]); return { rows: [{ id: 'D1', frozenAt: null }], created: true }; });
    return { out, calls };
  };
  const approved = await run({ ...APPROVED_SO });
  assert.deepEqual(approved.calls, [['freeze', 'SOR-1', false]]);
  assert.deepEqual(approved.out, { rows: [{ id: 'N1', frozenAt: 'now' }], created: true });
  const already = await run({ ...APPROVED_SO }, [{ id: 'X1', frozenAt: null }]);
  assert.equal(already.out.created, false, 'มีแถวอยู่แล้ว (ตรึงให้) ≠ สร้างใหม่');
  const draft = await run({ ...APPROVED_SO, status: 'draft' });
  assert.deepEqual(draft.calls, [['ensure', 'SOR-1', null]], 'ใบร่าง: งวดร่าง (ตรึงตอนอนุมัติ)');
  assert.match(code(INST_ROUTE), /confirmationBorrowable, ensureInstallments, freezeInstallments,/);
});

/* 🐞 review รอบห้า 27/10 (มติข้อ 10): trigger นับอัตโนมัติของ 0412 เป็นแบบเลื่อน (ทำงานตอน COMMIT) ⇒ `after` ที่ RPC ปรับแผน/ยกเงินเข้าคืน
   ถ่ายก่อนนับ — audit เคยลงภาพนั้นตรง ๆ: งวดที่ฐาน commit เป็น approved via count_rest (บางครั้งมียอด) ถูกบันทึกว่า "ยังไม่นับ"
   ⇒ route อ่านงวดสดหลัง RPC แล้วลง audit ด้วยสถานะที่ commit จริง + บอกงวดที่ฐานนับเอง · อ่านพลาด = ยังลง audit ด้วยภาพของ RPC */
const REST_NOTE = 'ลูกค้าขอปิดยอดทั้งก้อนก่อนเงินเข้า';
const RPC_AFTER = [
  { id: 'R1', seq: 1, amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'so_approval', actualNote: null },
  { id: 'R2', seq: 2, amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'count_rest', actualNote: REST_NOTE },
  { id: 'R3', seq: 3, amount: 42800, actualStatus: 'approved', actualAmount: 40000, actualApprovedVia: 'count_rest', actualNote: REST_NOTE },
  { id: 'R4', seq: 4, amount: 10700, actualStatus: null, actualAmount: null, actualApprovedVia: null, actualNote: null },
];
/* รูปที่ trigger §5f เขียนตอน COMMIT (via count_rest + ข้อความอัตโนมัติ = INSTALLMENT_ACTUAL_AUTO_NOTE) */
const AUTO_R4 = { actualStatus: 'approved', actualAmount: 10000, actualApprovedVia: 'count_rest', actualNote: INSTALLMENT_ACTUAL_AUTO_NOTE };
const COMMITTED = RPC_AFTER.map((r) => (r.id === 'R4' ? { ...r, ...AUTO_R4 } : { ...r }));

function installmentsWholeOrderFn(name, end, params) {
  const source = raw(INST_ROUTE);
  const helper = slice(source, 'async function loadCommittedInstallments(', '\n/* สิทธิ์ **อ่าน**');
  const fn = slice(source, `async function ${name}(`, end);
  return new Function(...params, `${helper}\n${fn}\nreturn ${name};`);
}

async function runReplan({ committedError = null, rpcAfter = RPC_AFTER, committed = COMMITTED } = {}) {
  const reads = [];
  const audits = [];
  const before = rpcAfter.filter((r) => r.id !== 'R4');
  const fn = installmentsWholeOrderFn('replanOrderInstallments', '\n/* ── ยกเงินค้าง', [
    'isSalesOrderReviewer', 'forbidden', 'loadOrderForUser', 'loadInstallments', 'installmentReplanBlocker', 'fail',
    'replanReasonError', 'badRequest', 'replanStale', 'REPLAN_STALE_MESSAGE', 'buildReplanRows', 'orderHasServiceRounds',
    'replanInstallments', 'installmentActualAutoCountedAtCommit', 'recordAudit', 'replanAuditSummary',
    'installmentActualAutoCountAuditText', 'ok', 'installmentsForScreen',
  ])(
    isSalesManager, http.forbidden, async () => ({ order: { ...APPROVED_SO, orderNumber: 'SO-1' } }),
    async () => {
      reads.push('read');
      if (reads.length === 1) return before.map((r) => ({ ...r }));
      if (committedError) throw committedError;
      return committed.map((r) => ({ ...r }));
    },
    () => ({ blocker: null }), http.fail, replanReasonError, http.badRequest, () => false, 'stale',
    () => ({ rows: rpcAfter }), () => false,
    async () => ({ before: before.map((r) => ({ ...r })), after: rpcAfter.map((r) => ({ ...r })) }),
    installmentActualAutoCountedAtCommit, async (entry) => { audits.push(entry); }, replanAuditSummary,
    installmentActualAutoCountAuditText, http.ok, (order, rows) => rows,
  );
  const res = await fn({ user: SUP, supabase: {}, req: null, id: 'SOR-1', body: { reason: 'ลูกค้าขอเพิ่มงวดที่สี่', rows: [], expected: [] } });
  return { res: await reply(res), audits, reads };
}

test('ปรับแผน (มติข้อ 10): audit ลงงวดที่ commit จริง (ฐานนับงวดใหม่ให้ตอน COMMIT) + สรุปบอกงวด/ยอดที่นับเอง · อ่านสดพลาด = ลงภาพของ RPC', async () => {
  const { res, audits, reads } = await runReplan();
  assert.equal(res.status, 200);
  assert.equal(reads.length, 2, 'อ่านงวดสดครั้งเดียวหลัง RPC — ใช้ทั้ง audit และคำตอบ');
  assert.equal(audits.length, 1);
  const [audit] = audits;
  assert.equal(audit.after.installments.find((r) => r.id === 'R4').actualStatus, 'approved', 'สถานะที่ commit จริง ไม่ใช่ภาพก่อน COMMIT');
  assert.equal(audit.after.rpcAfter.find((r) => r.id === 'R4').actualStatus, null, 'ภาพของ RPC เก็บไว้คู่กัน');
  assert.match(audit.summary, /\(Actual เปลี่ยนเฉพาะงวดที่ระบบนับอัตโนมัติ\)/);
  assert.match(audit.summary, / · ระบบนับ Actual อัตโนมัติ \(มติข้อ 10\) งวดที่ 4 ฿10,000\.00 \(ก่อน VAT\)$/);
  assert.equal(res.body.installments.find((r) => r.id === 'R4').actualStatus, 'approved');
  const broken = await runReplan({ committedError: new Error('db down') });
  assert.equal(broken.audits.length, 1, 'อ่านสดพลาด = ยังลงประวัติ');
  assert.equal(broken.audits[0].after.afterSource, 'rpc');
  assert.match(broken.audits[0].summary, /\(Actual ไม่เปลี่ยน\): ลูกค้าขอเพิ่มงวดที่สี่$/);
});

/* 🐞 review รอบห้า (ตัวแก้รอบห้า) 27/10: การอ่านสดหลัง RPC เป็นคำขอแยก ⇒ ผู้เขียนคนอื่นที่รอล็อกใบ commit แทรกก่อนอ่านได้ — AE Sup อีกคน
   อนุมัติงวดที่ยื่นค้าง (งวดที่ยื่นล็อกจากปรับแผน updatedAt ไม่ขยับ CAS จึงผ่าน · พิสูจน์บน PGlite) · ตัวเทียบเดิมนับทุกแถวที่กลายเป็น
   approved ⇒ สรุป audit ยกการอนุมัติของคนให้ "ระบบนับ Actual อัตโนมัติ (มติข้อ 10)" บนใบที่ไม่เคยกดนับที่เหลือทั้งหมด */
test('ปรับแผน (มติข้อ 10): AE Sup อีกคนอนุมัติงวดแทรกก่อนอ่านสด — ไม่ถูกยกให้ "ระบบนับ Actual อัตโนมัติ" · สรุป "Actual ไม่เปลี่ยน" · ภาพ commit ยังเก็บครบ', async () => {
  // ใบรายงวดที่ไม่เคยกดนับที่เหลือทั้งหมด: งวด 1 นับตอนอนุมัติใบ · งวด 2 ฝ่ายขายยื่นค้าง · งวด 3 เปิด (ปรับแผนเลื่อนวัน)
  const rpcAfter = [
    { id: 'R1', seq: 1, amount: 32100, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'so_approval', actualNote: null },
    { id: 'R2', seq: 2, amount: 32100, actualStatus: 'submitted', actualAmount: null, actualApprovedVia: null, actualNote: null },
    { id: 'R3', seq: 3, amount: 42800, actualStatus: null, actualAmount: null, actualApprovedVia: null, actualNote: null },
    { id: 'R4', seq: 4, amount: 0, actualStatus: null, actualAmount: null, actualApprovedVia: null, actualNote: null },
  ];
  const committed = rpcAfter.map((r) => (r.id === 'R2'
    ? { ...r, actualStatus: 'approved', actualAmount: 30000, actualApprovedVia: 'review', actualApprovedByName: 'AE Sup คนที่สอง' }
    : { ...r }));
  const unit = installmentActualAutoCountedAtCommit(rpcAfter, committed);
  assert.deepEqual(unit, { count: 0, amount: 0, seqs: [] }, 'การอนุมัติของคน ≠ งวดที่ฐานนับเอง');
  assert.equal(installmentActualAutoCountAuditText(unit), '');
  const { res, audits } = await runReplan({ rpcAfter, committed });
  assert.equal(res.status, 200);
  assert.equal(audits.length, 1);
  const [audit] = audits;
  assert.match(audit.summary, /\(Actual ไม่เปลี่ยน\): ลูกค้าขอเพิ่มงวดที่สี่$/, 'สรุปคำเดิมทุกตัวอักษร — ไม่ต่อท้าย "ระบบนับ Actual อัตโนมัติ"');
  assert.doesNotMatch(audit.summary, /ระบบนับ Actual อัตโนมัติ/);
  const r2 = audit.after.installments.find((r) => r.id === 'R2');
  assert.deepEqual([r2.actualStatus, r2.actualApprovedVia, r2.actualApprovedByName], ['approved', 'review', 'AE Sup คนที่สอง'],
    'ภาพที่ commit จริงยังลง after.installments ครบ (ผู้อนุมัติตัวจริง)');
});

test('ตัวเทียบงวดที่ฐานนับเอง: นับเฉพาะรูปที่ trigger §5f เขียน · ใบที่ภาพ RPC ไม่มีงวด via count_rest = ว่างเสมอ', () => {
  // ใบที่กดนับที่เหลือทั้งหมดแล้ว — ฐานนับงวด 4 เอง + คนอื่นแทรก: อนุมัติงวด (review) · "นับที่เหลือทั้งหมด" ด้วยเหตุผลของคน
  const rpcAfter = [...RPC_AFTER,
    { id: 'R5', seq: 5, amount: 5350, actualStatus: 'submitted', actualAmount: null, actualApprovedVia: null, actualNote: null },
    { id: 'R6', seq: 6, amount: 5350, actualStatus: null, actualAmount: null, actualApprovedVia: null, actualNote: null }];
  const committed = rpcAfter.map((r) => {
    if (r.id === 'R4') return { ...r, ...AUTO_R4 };
    if (r.id === 'R5') return { ...r, actualStatus: 'approved', actualAmount: 5000, actualApprovedVia: 'review' };
    if (r.id === 'R6') return { ...r, actualStatus: 'approved', actualAmount: 5000, actualApprovedVia: 'count_rest', actualNote: 'กดนับที่เหลือทั้งหมดแทรกเข้ามา' };
    return { ...r };
  });
  assert.deepEqual(installmentActualAutoCountedAtCommit(rpcAfter, committed), { count: 1, amount: 10000, seqs: [4] },
    'เฉพาะแถวรูปของ trigger (via count_rest + ข้อความอัตโนมัติ) — ไม่รวม review / count_rest ที่คนกด');
  // ใบที่ไม่เคยกดนับที่เหลือทั้งหมด (ภาพของ RPC ไม่มีงวด via count_rest) — trigger ไม่มีผู้ตัดสิน ⇒ ว่าง แม้แถวสดจะมีรูปอัตโนมัติ
  const plain = RPC_AFTER.map((r) => (r.actualApprovedVia === 'count_rest' ? { ...r, actualApprovedVia: 'review', actualNote: null } : { ...r }));
  const plainCommitted = plain.map((r) => (r.id === 'R4' ? { ...r, ...AUTO_R4 } : { ...r }));
  assert.deepEqual(installmentActualAutoCountedAtCommit(plain, plainCommitted), { count: 0, amount: 0, seqs: [] });
  // อินพุตเพี้ยน (อ่านไม่ขึ้น/ไม่ใช่อาเรย์) = ว่าง ไม่โยน
  assert.deepEqual(installmentActualAutoCountedAtCommit(RPC_AFTER, null), { count: 0, amount: 0, seqs: [] });
  assert.deepEqual(installmentActualAutoCountedAtCommit(null, COMMITTED), { count: 0, amount: 0, seqs: [] });
});

test('ยกเงินเข้า (มติข้อ 10): audit ใบปลายทางลงงวดที่ commit จริง + สรุปบอกงวดที่ฐานนับเอง', async () => {
  const audits = [];
  let reads = 0;
  const fn = installmentsWholeOrderFn('carryIntoOrder', '\n/* PATCH — เดินสถานะ', [
    'canCarryInstallments', 'forbidden', 'CARRY_FORBIDDEN', 'loadOrderForUser', 'badRequest', 'loadScoped', 'carrySourceError',
    'fail', 'loadInstallments', 'carryBlocker', 'carrySourcesFrom', 'replanReasonError', 'carryStale', 'CARRY_STALE_MESSAGE',
    'applyCarryIn', 'carryInstallments', 'installmentActualAutoCountedAtCommit', 'carryAuditSummary',
    'installmentActualAutoCountAuditText', 'recordAudit', 'ok', 'installmentsForScreen',
  ])(
    () => true, http.forbidden, 'no', async () => ({ order: { ...APPROVED_SO, orderNumber: 'SO-2' } }), http.badRequest,
    async () => ({ row: { id: 'SRC', orderNumber: 'SO-X' } }), () => null, http.fail,
    async (db, orderId) => {
      reads += 1;
      if (orderId === 'SRC') return [{ id: 'R4', seq: 1, amount: 10700, status: 'confirmed' }];
      return reads === 1 ? RPC_AFTER.slice(0, 3) : COMMITTED.map((r) => ({ ...r }));
    },
    () => ({ blocker: null }), () => [], replanReasonError, () => false, 'stale', () => ({ rows: RPC_AFTER }),
    async () => ({ before: RPC_AFTER.slice(0, 3), after: RPC_AFTER.map((r) => ({ ...r })), carried: { count: 1, amount: 10700, confirmedCount: 1 } }),
    installmentActualAutoCountedAtCommit, carryAuditSummary, installmentActualAutoCountAuditText,
    async (entry) => { audits.push(entry); }, http.ok, (order, rows) => rows,
  );
  const res = await reply(await fn({ user: SUP, supabase: {}, req: null, id: 'SOR-1',
    body: { sourceOrderId: 'SRC', installmentIds: ['R4'], expected: [], reason: 'ยกเงินจากใบที่ยกเลิกแล้ว' } }));
  assert.equal(res.status, 200);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].after.installments.find((r) => r.id === 'R4').actualStatus, 'approved');
  assert.equal(audits[0].after.rpcAfter.find((r) => r.id === 'R4').actualStatus, null);
  assert.match(audits[0].summary, / · ระบบนับ Actual อัตโนมัติ \(มติข้อ 10\) งวดที่ 4 ฿10,000\.00 \(ก่อน VAT\)$/);
  // ไม่มีงวดที่ฐานนับเอง = สรุปคำเดิมทุกตัวอักษร
  assert.equal(installmentActualAutoCountAuditText(installmentActualAutoCountedAtCommit(RPC_AFTER, RPC_AFTER)), '');
});
