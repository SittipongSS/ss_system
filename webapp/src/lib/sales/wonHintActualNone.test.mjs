// คำใต้การ์ด "มูลค่าปิดจริง (Won)" ของหน้าดีล กับใบ "ไม่นับ Actual" (mig 0439 · มติเจ้าของ 20/11/2026)
//
// 🐞 ตรวจ 23/11: ดีลที่มีแต่ใบอนุมัติแบบ "ไม่นับ Actual" ขึ้น "คาดการณ์ ฿X · ยังไม่มีใบสั่งขายที่ยื่น" — ผิด เพราะใบอนุมัติแล้ว
//    · splitSalesOrderAmounts นับใบไม่นับแยกไว้ที่ `noneCount` (ไม่อยู่ใน actualCount) แต่หน้าดีลไม่ได้ส่งต่อให้ wonDealForecastHint
//    · แดชบอร์ดตัดสินถูกอยู่แล้ว (wonMonth ของดีลมีค่า ⇒ isWonAwaitingSo = false) ⇒ สองจอพูดไม่ตรงกัน
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney } from '../format.js';
import { WON_HINT_KINDS, wonDealForecastHint } from './dealAmountDisplay.js';
import { splitSalesOrderAmounts } from './salesOrderWorkflow.js';
import { isWonAwaitingSo } from './dashboardMetrics.js';

const NONE_SO = {
  id: 'so-none', origin: 'pipeline', status: 'approved', actualMode: 'none',
  actualAmount: 120000, totalAmount: 128400, actualNoneReason: 'ตัวอย่างฟรีให้ลูกค้าทดลอง ไม่นับยอดขาย',
};
const ORDER_SO = { id: 'so-order', origin: 'pipeline', status: 'approved', actualMode: 'order', actualAmount: 200000, totalAmount: 214000 };
const PENDING_SO = { id: 'so-pending', origin: 'pipeline', status: 'pending_approval', actualMode: 'order', actualAmount: 50000, totalAmount: 53500 };

const hintFor = (orders, forecast) => {
  const split = splitSalesOrderAmounts(orders);
  return wonDealForecastHint({
    forecast,
    actual: split.actual,
    actualCount: split.actualCount,
    pendingApproval: split.pendingApproval,
    pendingApprovalCount: split.pendingApprovalCount,
    instRemaining: split.instRemaining,
    noneCount: split.noneCount,
  });
};

test('ดีลที่มีแต่ใบอนุมัติแบบไม่นับ Actual: บอกว่าใบอนุมัติแล้วแบบไม่นับ — ไม่ใช่ "ยังไม่มีใบสั่งขายที่ยื่น"', () => {
  const hint = hintFor([NONE_SO], 120000);
  assert.equal(hint.kind, WON_HINT_KINDS.ACTUAL_NONE);
  assert.equal(hint.gap, null);
  assert.equal(hint.text, `คาดการณ์ ${fmtMoney(120000)} · ใบสั่งขายอนุมัติแบบไม่นับ Actual`);
  assert.doesNotMatch(hint.text, /ยังไม่มีใบสั่งขาย|ต่าง/);
  // เปิดจอ 23/11: การ์ดแคบตัด "ไม่นับ / Actual" คนละบรรทัด ⇒ วลีต้องอยู่ใน keep (ผู้วาดห่อด้วย keepPhrases)
  assert.deepEqual(hint.keep, [`คาดการณ์ ${fmtMoney(120000)}`, 'ไม่นับ Actual']);
  for (const phrase of hint.keep) assert.ok(hint.text.includes(phrase));
});

test('ใบไม่นับหลายใบ: บอกจำนวนใบ', () => {
  const hint = hintFor([NONE_SO, { ...NONE_SO, id: 'so-none-2' }], 240000);
  assert.equal(hint.kind, WON_HINT_KINDS.ACTUAL_NONE);
  assert.equal(hint.text, `คาดการณ์ ${fmtMoney(240000)} · ใบสั่งขายอนุมัติแบบไม่นับ Actual 2 ใบ`);
  assert.deepEqual(hint.keep.slice(-1), ['ไม่นับ Actual 2 ใบ']);
});

test('ตรงกับแดชบอร์ด: ดีลที่มีแต่ใบไม่นับไม่อยู่ในกอง "Won รอยื่น SO"', () => {
  // cache ที่ sync_sales_order_actual ของ 0439 เขียน: wonValue ไม่รวมใบไม่นับ · wonMonth = เดือนอนุมัติใบ (ทุกแบบ)
  const deal = { stage: 'won', projectValue: 120000, wonValue: 0, metadata: { actualSource: 'sale_order', wonMonth: '2026-11' } };
  assert.equal(isWonAwaitingSo(deal), false);
  assert.notEqual(hintFor([NONE_SO], 120000).kind, WON_HINT_KINDS.AWAITING_SO);
});

test('ใบนับ Actual + ใบไม่นับในดีลเดียว: ส่วนต่างคิดจาก Actual ตามเดิม + บอกว่ามีใบไม่นับ', () => {
  const hint = hintFor([ORDER_SO, NONE_SO], 320000);
  assert.equal(hint.kind, WON_HINT_KINDS.ACTUAL);
  assert.equal(hint.gap, 120000);
  assert.equal(hint.text, `คาดการณ์ ${fmtMoney(320000)} · ต่าง ${fmtMoney(120000)} · ไม่นับ Actual 1 ใบ`);
  assert.deepEqual(hint.keep, ['ไม่นับ Actual 1 ใบ']);
});

test('ใบไม่นับ + ใบรออนุมัติ: คำ "ต่างเมื่ออนุมัติครบ" ตามเดิม + บอกว่ามีใบไม่นับ', () => {
  const hint = hintFor([NONE_SO, PENDING_SO], 50000);
  assert.equal(hint.kind, WON_HINT_KINDS.WHEN_APPROVED);
  assert.equal(hint.text, 'ตรงกับคาดการณ์เมื่ออนุมัติครบ · ไม่นับ Actual 1 ใบ');
});

test('ใบรายงวดที่ยังมีงวดรอนับ + ใบไม่นับ: ท่อน "ไม่นับ Actual n ใบ" อยู่ใน keep ด้วย (ไม่ขาดกลางวลี)', () => {
  const installment = {
    id: 'so-inst', origin: 'pipeline', status: 'approved', actualMode: 'installment',
    actualAmount: 90000, totalAmount: 96300, actualCountedAmount: 30000, actualSubmittedAmount: 0,
  };
  const hint = hintFor([installment, NONE_SO], 90000);
  assert.equal(hint.kind, WON_HINT_KINDS.INSTALLMENT);
  assert.deepEqual(hint.keep.slice(-1), ['ไม่นับ Actual 1 ใบ']);
  assert.match(hint.text, / · ไม่นับ Actual 1 ใบ$/);
});

test('ไม่ส่ง noneCount (ผู้เรียกเดิม) = คำเดิมทุกตัวอักษร', () => {
  assert.equal(
    wonDealForecastHint({ forecast: 120000, actual: 0, actualCount: 0 }).text,
    `คาดการณ์ ${fmtMoney(120000)} · ยังไม่มีใบสั่งขายที่ยื่น`,
  );
  assert.equal(wonDealForecastHint({ forecast: 300000, actual: 200000, actualCount: 1 }).text, `คาดการณ์ ${fmtMoney(300000)} · ต่าง ${fmtMoney(100000)}`);
  assert.equal(wonDealForecastHint({ forecast: 300000, actual: 200000, actualCount: 1 }).keep, undefined);
});
