// แท็บงานของหน้างานบัญชี (รื้อ PR-4a) — แท็บ = ชุดค่าตัวกรองเดิม · เลขบนแท็บ = แถวหลังกด · ปุ่มงานถัดไป · ชุดใบรอปิด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEDGER_WORK_KEYS, LEDGER_WORK_PRESETS, LEDGER_WORK_TABS,
  ledgerNextAction, ledgerWorkCount, ledgerWorkParams, ledgerWorkTab, ledgerWorkTally,
} from './ledgerWork.js';
import { filterLedger } from './paymentLedger.js';
import { financeCloseIdsOf } from './financeCloseQueue.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const row = (over) => ({ id: 'I', orderId: 'SOR-1', orderNumber: 'SO-1', seq: 1, amount: 100, status: 'pending', ...over });
const ROWS = [
  row({ id: 'a1', orderId: 'A', seq: 1, status: 'confirmed', taxInvoiceNo: 'IV-1' }),
  row({ id: 'a2', orderId: 'A', seq: 2, status: 'confirmed', taxInvoiceNo: 'IV-2' }),
  row({ id: 'b1', orderId: 'B', seq: 1, status: 'reported', amount: 200 }),
  row({ id: 'b2', orderId: 'B', seq: 2, status: 'reported', amount: 300, actualAwaitingApproval: true }),
  row({ id: 'c1', orderId: 'C', seq: 1, status: 'confirmed' }),
  row({ id: 'c2', orderId: 'C', seq: 2, status: 'pending', overdue: true }),
  row({ id: 'd1', orderId: 'D', seq: 1, status: 'rejected' }),
  row({ id: 'e1', orderId: 'E', seq: 1, status: 'confirmed', taxInvoiceNo: 'IV-9', orderStatus: 'cancelled', stranded: true }),
];
const CLOSE = new Set(['A']);

test('แท็บ = ชุดค่าตัวกรองเดิม: ป้ายบนเมนู ?status=reported ลงแท็บรอตรวจ · ผสมกันเอง = ไม่มีแท็บติด', () => {
  assert.equal(ledgerWorkTab({}), 'all');
  assert.equal(ledgerWorkTab({ status: ['reported'] }), 'review');
  assert.equal(ledgerWorkTab({ status: ['rejected'] }), 'rejected');
  assert.equal(ledgerWorkTab({ taxInvoice: 'missing' }), 'invoice');
  assert.equal(ledgerWorkTab({ overdue: true }), 'overdue');
  assert.equal(ledgerWorkTab({ close: true }), 'close');
  assert.equal(ledgerWorkTab({ stranded: true }), 'stranded');
  assert.equal(ledgerWorkTab({ status: ['reported'], overdue: true }), null, 'การ์ดเลยกำหนดซ้อนแท็บรอตรวจ');
  assert.equal(ledgerWorkTab({ status: ['pending'] }), null);
  assert.equal(ledgerWorkTab({ taxInvoice: 'issued' }), null);
  // ทุกแท็บบนแถบมีชุดค่า · ชุดค่าตัดสินกลับเป็นแท็บเดิม (กดแล้วแท็บนั้นติด)
  for (const tab of LEDGER_WORK_TABS) {
    const sp = ledgerWorkParams(new URLSearchParams(), tab.key);
    const parsed = {
      status: sp.get('status') ? sp.get('status').split(',') : [], taxInvoice: sp.get('taxInvoice') || '',
      overdue: sp.get('overdue') === '1', close: sp.get('close') === '1', stranded: sp.get('stranded') === '1',
    };
    assert.equal(ledgerWorkTab(parsed), tab.key, tab.key);
  }
});

test('กดแท็บ: ล้างคีย์ของแท็บทุกตัว แล้วตั้งชุดของแท็บนั้น · คำค้น/สาย/มุมมองคงไว้', () => {
  const sp = ledgerWorkParams(new URLSearchParams('status=pending,reported&overdue=1&taxInvoice=missing&stranded=1&q=AR-1&line=service&group=customer'), 'close');
  assert.equal(sp.toString(), 'q=AR-1&line=service&group=customer&close=1');
  assert.equal(ledgerWorkParams(new URLSearchParams('close=1&q=x'), 'all').toString(), 'q=x');
  assert.deepEqual([...LEDGER_WORK_KEYS].sort(), ['close', 'overdue', 'status', 'stranded', 'taxInvoice']);
  assert.ok(!('stranded' in Object.fromEntries(LEDGER_WORK_TABS.map((t) => [t.key, 1]))), 'เงินค้างไม่ใช่แท็บถาวร (มติ "แถบโผล่เมื่อมี")');
  assert.deepEqual(LEDGER_WORK_PRESETS.stranded, { stranded: '1' });
});

test('เลขบนแท็บ = แถวที่เห็นหลังกด (ถอดคีย์ของแท็บออกก่อนนับ · ตัวกรองอื่นคงไว้)', () => {
  const filters = { status: ['reported'], overdueOnly: true, closeOrderIds: CLOSE };
  const tally = ledgerWorkTally(ROWS, filters);
  for (const [key, preset] of [
    ['review', { status: ['reported'] }], ['invoice', { taxInvoice: 'missing' }], ['close', { close: true }],
    ['overdue', { overdueOnly: true }], ['rejected', { status: ['rejected'] }], ['stranded', { stranded: true }], ['all', {}],
  ]) {
    const after = filterLedger(ROWS, { closeOrderIds: CLOSE, ...preset });
    assert.equal(tally[key].count, after.length, `${key}: งวด`);
    assert.equal(tally[key].orders, new Set(after.map((r) => r.orderId)).size, `${key}: ใบ`);
  }
  assert.equal(tally.review.count, 1, 'งวดที่ติดด่านนับ Actual ไม่ใช่งานรอตรวจ (เลขเดียวกับป้ายบนเมนู)');
  assert.equal(tally.review.amount, 200);
  assert.equal(tally.close.orders, 1);
  assert.equal(tally.invoice.count, 3, 'ใบกำกับค้าง = แจ้งแล้ว/รับรองแล้วแต่ยังไม่มีเลข (b1 · b2 · c1 — เกณฑ์เดียวกับคิวเดิม) · ใบยกเลิกที่มีใบแล้วไม่นับ');
  // ตัวกรองอื่น (คำค้น) ยังตัดเลขบนแท็บ
  assert.equal(ledgerWorkTally(ROWS, { q: 'zzz', closeOrderIds: CLOSE }).all.count, 0);
  // หน่วยตามแท็บ: รายงวดนับงวด · รอปิด/ทั้งหมดนับใบ · ยังไม่โหลด = null
  assert.equal(ledgerWorkCount(tally, 'review'), 1);
  assert.equal(ledgerWorkCount(tally, 'close'), 1);
  assert.equal(ledgerWorkCount(tally, 'all'), 5);
  assert.equal(ledgerWorkCount(null, 'review'), null);
});

test('filterLedger: close ต้องมีชุดใบ (ไม่ส่ง = ไม่มีใบไหนผ่าน) · stranded อ่านธงของแถว', () => {
  assert.deepEqual(filterLedger(ROWS, { close: true, closeOrderIds: CLOSE }).map((r) => r.id), ['a1', 'a2']);
  assert.deepEqual(filterLedger(ROWS, { close: true }), []);
  assert.deepEqual(filterLedger(ROWS, { stranded: true }).map((r) => r.id), ['e1']);
});

test('ปุ่มงานถัดไป: เงินค้าง → รอตรวจ → ใบกำกับ → ปิดใบ · แท็บที่เลือกขึ้นก่อน · งวดติดด่านไม่ใช่งานตรวจ', () => {
  const group = (orderId) => ({ orderId, rows: ROWS.filter((r) => r.orderId === orderId) });
  assert.deepEqual(ledgerNextAction(group('B')), { kind: 'review', label: 'ตรวจงวด 1', seq: 1 });
  assert.deepEqual(ledgerNextAction({ rows: [ROWS[3]] }), { kind: 'invoice', label: 'ใบกำกับ งวด 2', seq: 2 },
    'งวดที่ติดด่านนับ Actual — ไม่ใช่งานตรวจ (บัญชีรับรองไม่ได้) แต่ใบกำกับยังบันทึกได้');
  assert.equal(ledgerNextAction({ rows: [{ ...ROWS[3], taxInvoiceNo: 'IV-3' }] }), null);
  assert.deepEqual(ledgerNextAction(group('C')), { kind: 'invoice', label: 'ใบกำกับ งวด 1', seq: 1 });
  assert.deepEqual(ledgerNextAction(group('C'), { tab: 'overdue' }), { kind: 'overdue', label: 'ดูงวด 2', seq: 2 });
  assert.deepEqual(ledgerNextAction(group('A'), { closing: true }), { kind: 'close', label: 'ปิดใบ', seq: null });
  assert.equal(ledgerNextAction(group('A'), { closing: true, canClose: false }), null, 'ไม่มีสิทธิ์ปิดใบ = ไม่โชว์');
  assert.equal(ledgerNextAction(group('A')), null);
  assert.deepEqual(ledgerNextAction(group('E')), { kind: 'stranded', label: 'จัดการเงินค้าง', seq: 1 });
  assert.deepEqual(ledgerNextAction(group('D'), { tab: 'rejected' }), { kind: 'rejected', label: 'ดูงวด 1', seq: 1 });
  assert.equal(ledgerNextAction(group('D')), null, 'ตีกลับเป็นงานของฝ่ายขาย');
});

test('ชุดใบรอปิด: ตัวตัดสินเดียวกับป้ายบนเมนู (awaitsFinanceReview — ใบ + งวดทุกงวด)', () => {
  const orders = [
    { id: 'A', status: 'approved', financeStatus: 'pending', totalAmount: 200 },
    { id: 'B', status: 'approved', financeStatus: 'pending', totalAmount: 500 },
    { id: 'Z', status: 'approved', financeStatus: 'pending', totalAmount: 0 },
    { id: 'N', status: 'approved', financeStatus: 'pending', totalAmount: 100 },
  ];
  const installments = [
    { salesOrderId: 'A', status: 'confirmed' }, { salesOrderId: 'A', status: 'confirmed' },
    { salesOrderId: 'B', status: 'confirmed' }, { salesOrderId: 'B', status: 'reported' },
  ];
  assert.deepEqual([...financeCloseIdsOf(orders, installments)], ['A'], 'B ยังไม่ครบ · Z ยอด 0 · N ไม่มีงวด');
});

test('ต่อสาย: route ส่ง workTally + closeOrderIds · หน้าอ่านแท็บจากตัวตัดสิน · ปิดใบเรียก finance_approve ของหน้าใบ', () => {
  const route = code('app/api/finance/payments/route.js');
  assert.match(route, /const closeOrderIds = await loadFinanceCloseIds\(supabase\);/);
  assert.match(route, /close: url\.searchParams\.get\('close'\) === '1',/);
  assert.match(route, /stranded: url\.searchParams\.get\('stranded'\) === '1',/);
  assert.match(route, /const workTally = ledgerWorkTally\(all, filters\);/);
  assert.ok(route.indexOf('loadFinanceCloseIds(supabase)') < route.indexOf('filterLedger(all, filters)'), 'ชุดใบรอปิดต้องมาก่อนกรอง');
  const page = code('app/finance/payments/page.js');
  assert.match(page, /const workTab = ledgerWorkTab\(\{ status: statusFilter, taxInvoice, overdue, close, stranded \}\);/);
  assert.match(page, /workTally: body\.workTally \|\| null,/);
  assert.match(page, /const sp = ledgerWorkParams\(params, key\);/);
  assert.match(page, /body: JSON\.stringify\(\{ action: "finance_approve" \}\),/);
  assert.match(page, /apiFetch\(`\/api\/sales-planning\/sales-orders\/\$\{closeFor\.orderId\}`/);
  // ปุ่มปิดใบ = ไม่มีสิทธิ์ไม่โชว์ (ด่านเดียวกับปุ่มบนหน้าใบ)
  assert.match(page, /const canClose = canConfirmPayment\(\{ \.\.\.capUser, department \}\);/);
  assert.match(page, /ledgerNextAction\(group, \{ tab: workTab, closing: closeIds\.has\(group\.orderId\), canClose \}\)/);
  // แผงคิวเดิมถอดแล้ว — ไม่มีสองที่ให้กดรับรอง
  assert.doesNotMatch(page, /pendingConfirmations|pendingTaxInvoices|pendingStranded/);
});
