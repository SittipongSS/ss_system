// ── ทะเบียนการชำระ × ใบ "Actual รายงวด" (mig 0412 · docs/so-installment-actual.md) ─────────────────────────────────
// ⭐ งวดของใบรายงวดที่ AE Sup ยังไม่อนุมัตินับ **บัญชีรับรองไม่ได้** (trigger ของงวด · installment_actual_not_approved)
//   ⇒ ไม่ใช่งานของบัญชีตอนนี้: ไม่อยู่ในคิว "รอคุณรับรอง" · ตัวนับ "รอรับรอง n งวด" ของก้อนใบไม่นับ · ปุ่มรับรองบอกเหตุ
// ⚠️ ใบทั้งใบ (ทุกใบวันนี้) ต้องได้ผลเดิมทุกตัวอักษร
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEDGER_STATUS, LEDGER_STATUS_KEYS, filterLedger, groupLedgerBuckets, groupLedgerByOrder, groupNote, ledgerAwaitsConfirm, ledgerFacetTally,
  ledgerHeld, ledgerHeldSummary, ledgerInConfirmQueue, ledgerIncludes, ledgerRow, ledgerRowLock, ledgerStatusKey, ledgerSummary,
  pendingConfirmations, stampActualHold,
} from './paymentLedger.js';
import { workflowErrorMessage } from '../sales/documentWorkflowErrors.js';
import { INSTALLMENT_ACTUAL_REVOKED_LOCK, installmentActualLockReason } from '../sales/salesOrderActualMode.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const BLOCKED = workflowErrorMessage('installment_actual_not_approved');
const ORDER = {
  id: 'SOR-1', orderNumber: 'SO-26100001-0', status: 'approved', origin: 'pipeline', totalAmount: 107000,
  financeStatus: 'pending', actualMode: 'installment',
};
const inst = (seq, over = {}) => ({
  id: `I${seq}`, salesOrderId: 'SOR-1', seq, amount: 35666.67, status: 'pending', frozenAt: '2026-10-26T03:00:00.000Z', ...over,
});
const row = (installment, order = ORDER) => ledgerRow({ installment, order, quotation: { status: 'accepted' }, customer: null, todayIso: '2026-10-26' });

test('ledgerRow พกช่องของแบบการนับ · งวดที่ยังไม่อนุมัตินับ = actualAwaitingApproval · ใบทั้งใบ = false เสมอ', () => {
  const waiting = row(inst(2, { status: 'reported', reportedAt: '2026-10-26T04:00:00.000Z' }));
  assert.equal(waiting.actualMode, 'installment');
  assert.equal(waiting.actualStatus, null);
  assert.equal(waiting.actualAmount, null);
  assert.equal(waiting.actualAwaitingApproval, true);

  const counted = row(inst(1, {
    status: 'reported', actualStatus: 'approved', actualAmount: 33000, actualApprovedAt: '2026-10-26T03:00:00.000Z',
  }));
  assert.equal(counted.actualStatus, 'approved');
  assert.equal(counted.actualAmount, 33000);
  // โมดัลรับรองบอกเดือนที่นับจากค่านี้ (installmentActualMonth)
  assert.equal(counted.actualApprovedAt, '2026-10-26T03:00:00.000Z');
  assert.equal(counted.actualAwaitingApproval, false);
  assert.equal(waiting.actualApprovedAt, null);

  const whole = row(inst(2, { status: 'reported' }), { ...ORDER, actualMode: 'order' });
  assert.equal(whole.actualMode, 'order');
  assert.equal(whole.actualAwaitingApproval, false);
  // ไม่มีคอลัมน์ (route รุ่นก่อน/ฐานก่อน 0412) = ทั้งใบ
  const legacy = row(inst(2, { status: 'reported' }), { ...ORDER, actualMode: undefined });
  assert.equal(legacy.actualMode, 'order');
  assert.equal(legacy.actualAwaitingApproval, false);
});

test('คิว "รอคุณรับรอง" ตัดงวดที่ติดด่าน · ตัวนับ awaiting ของก้อนใบนับชุดเดียวกัน', () => {
  const rows = [
    row(inst(1, { status: 'reported', actualStatus: 'approved', actualAmount: 33000 })),
    row(inst(2, { status: 'reported' })),
    row(inst(3, { status: 'pending' })),
  ];
  assert.deepEqual(pendingConfirmations(rows).map((r) => r.id), ['I1']);
  assert.deepEqual(rows.map(ledgerAwaitsConfirm), [true, false, false]);
  const [group] = groupLedgerByOrder(rows);
  assert.equal(group.awaiting, 1);
  // ใบทั้งใบ: งวดที่แจ้งแล้วทุกงวดอยู่ในคิวเหมือนเดิม
  const whole = [row(inst(1, { status: 'reported' }), { ...ORDER, actualMode: 'order' }), row(inst(2, { status: 'reported' }), { ...ORDER, actualMode: 'order' })];
  assert.equal(pendingConfirmations(whole).length, 2);
});

test('ledgerRowLock: รับรอง/บันทึกรับชำระของงวดที่ติดด่าน = ข้อความของ trigger · ใบกำกับไม่ติด · ล็อกทั้งใบชนะก่อน', () => {
  /* review รอบสาม 26/10: เหตุตามสถานะการนับ (ตัวเดียวกับแผงงวด) — ยื่นแล้ว = ข้อความของ trigger (รอ AE Sup) · ยังไม่มีใครยื่น = รอฝ่ายขายยื่น
     (เดิมตอบ "รอ AE Sup อนุมัติ" ทุกงวด ทั้งที่ AE Sup ไม่มีอะไรในคิว) */
  const waiting = row(inst(2, { status: 'reported', actualStatus: 'submitted', actualSubmittedAt: '2026-10-20T03:00:00Z' }));
  assert.equal(ledgerRowLock(waiting, 'confirm'), BLOCKED);
  assert.equal(ledgerRowLock(waiting, 'report'), BLOCKED);
  const unsubmitted = row(inst(2, { status: 'reported' }));
  for (const action of ['confirm', 'report']) {
    assert.match(ledgerRowLock(unsubmitted, action), /รอฝ่ายขายยื่นขอนับ/);
    assert.doesNotMatch(ledgerRowLock(unsubmitted, action), /^งวดนี้ยังไม่ได้อนุมัตินับ Actual — รอ AE Sup/);
  }
  assert.equal(ledgerRowLock(waiting, 'tax-invoice'), null);
  assert.equal(ledgerRowLock(waiting, 'reject'), null, 'ตีกลับสลิปผิดต้องถอยได้เสมอ');
  assert.equal(ledgerRowLock(row(inst(1, { status: 'reported', actualStatus: 'approved', actualAmount: 1 })), 'confirm'), null);
  const revised = row(inst(2, { status: 'reported' }), { ...ORDER, status: 'revised', supersededById: 'SOR-2' });
  assert.match(ledgerRowLock(revised, 'confirm'), /ย้ายไป/, 'ใบที่ถูกออก Rev. ทับ = ข้อความล็อกทั้งใบ');
  /* 🐞 review รอบสอง 26/10: ใบที่ย้อนอนุมัติ — ด่านยังติด แต่ "รอ AE Sup อนุมัติ" ไม่มีวันเกิด (RPC ต้องใบ approved) ⇒ บอกทางออก Rev. */
  const revoked = row(inst(2, { status: 'reported' }), { ...ORDER, status: 'approval_revoked' });
  assert.equal(revoked.actualAwaitingApproval, true, 'ใบย้อนอนุมัติยังติดด่าน (งวดรอย้ายไปใบ Rev.)');
  for (const action of ['confirm', 'report']) {
    assert.equal(ledgerRowLock(revoked, action), INSTALLMENT_ACTUAL_REVOKED_LOCK);
    assert.doesNotMatch(ledgerRowLock(revoked, action), /รอ AE Sup อนุมัติ/);
  }
  assert.equal(installmentActualLockReason(revoked, { status: revoked.orderStatus }), INSTALLMENT_ACTUAL_REVOKED_LOCK, 'คิวของหน้าทะเบียนใช้คำเดียวกัน');
  const page = code('app/finance/payments/page.js');
  assert.match(page, /installmentActualLockReason\(row, \{ status: row\.orderStatus \}\)/);
  // ใบที่ย้อนอนุมัติในแถบรายใบ = เหตุของตัวเอง (installmentActualHold 'revoked') ไม่ใช่ตัวนับแยกบนหน้า
  assert.equal(ledgerHeldSummary([revoked]).orders[0].rows[0].kind, 'revoked');
  assert.equal(ledgerHeldSummary([revoked]).orders[0].rows[0].short, 'รอเจ้าของดีลออก Rev.');
});

test('route ทะเบียนเลือก "actualMode" ของใบมาให้ ledgerRow (ขาด = ทุกใบเป็นทั้งใบ ปุ่มเปิดแล้วไปตายที่ฐาน)', () => {
  const route = code('app/api/finance/payments/route.js');
  const select = route.slice(route.indexOf(".from('sales_orders')"), route.indexOf('.in(', route.indexOf(".from('sales_orders')")));
  assert.match(select, /"actualMode"/);
  // งวดมาด้วย select('*') ⇒ ช่อง actual* ของงวดถึง ledgerRow เอง
  assert.match(route, /\.from\('sales_order_installments'\)\.select\('\*'\)/);
});

/* ── UAT FN 27/10 (อ่านอย่างเดียว · ทะเบียนการชำระ) ─────────────────────────────────────────────────────────────── */
const COUNTED = { actualStatus: 'approved', actualAmount: 33333.33, actualApprovedAt: '2026-10-26T03:00:00.000Z', actualApprovedVia: 'so_approval' };
const SLIP = { status: 'reported', reportedAt: '2026-10-26T04:00:00.000Z', paidOn: '2026-10-26' };
/* ภาพของ F2a: งวด 1 นับแล้วแต่บัญชีถอนคำรับรอง (กลับเป็นรอตรวจ) · งวด 2 ยื่นค้าง · งวด 3 แจ้งสลิปก่อนนับ */
const f2a = () => stampActualHold([
  row(inst(1, { ...SLIP, ...COUNTED })),
  row(inst(2, { ...SLIP, actualStatus: 'submitted', actualSubmittedAt: '2026-10-27T03:00:00.000Z' })),
  row(inst(3, { ...SLIP })),
]);

test('ข้อ 3: งวดที่ยื่นแล้วแต่งวดก่อนหน้ายังไม่รับรอง = งานของบัญชีเอง (รับรองงวดก่อน) — ไม่ใช่ "รอ AE Sup" ที่ AE Sup กดไม่ได้', () => {
  const rows = f2a();
  assert.deepEqual(rows[1].actualPreviousOpen, { seq: 1, status: 'reported', counted: true, actualStatus: 'approved' }, 'ประทับจากชุดก่อนกรอง');
  const lock = ledgerRowLock(rows[1], 'confirm');
  assert.match(lock, /^งวด 1 ยังไม่ได้รับรองเงิน — บัญชีรับรองเงินงวด 1 ก่อน AE Sup จึงอนุมัติงวดนี้ได้/);
  assert.doesNotMatch(lock, /รอ AE Sup อนุมัติ/);
  // ยังไม่ยื่น + งวดก่อนหน้ายังไม่รับรอง = รองวดก่อน แล้วฝ่ายขายยื่น (ไม่ใช่ "รอฝ่ายขายยื่น" เฉย ๆ ที่ยื่นไม่ได้)
  assert.match(ledgerRowLock(rows[2], 'confirm'), /^งวด 1 ยังไม่ได้รับรองเงิน — บัญชีรับรองเงินงวด 1 ก่อน ฝ่ายขายจึงยื่นขอนับงวดนี้ได้/);
  // กรองแล้วงวด 1 หลุดจากชุด — เหตุยังชี้งวด 1 (ค่าประทับมากับแถว)
  const onlyHeld = filterLedger(rows, { status: ['held'] });
  assert.deepEqual(onlyHeld.map((r) => r.seq), [2, 3]);
  assert.match(ledgerRowLock(onlyHeld[0], 'confirm'), /บัญชีรับรองเงินงวด 1 ก่อน/);
  // งวดก่อนหน้ายังไม่แจ้งชำระ = ฝ่ายขายแจ้งสลิปงวดนั้นก่อน · งวดก่อนหน้ารับรองครบ + ยื่นแล้ว = รอ AE Sup (ข้อความของ trigger)
  const unpaid = stampActualHold([row(inst(1, { ...COUNTED })), row(inst(2, { ...SLIP, actualStatus: 'submitted' }))]);
  assert.match(ledgerRowLock(unpaid[1], 'confirm'), /^งวด 1 ยังไม่ได้รับรองเงิน — ฝ่ายขายแจ้งสลิปงวด 1 และบัญชีรับรองก่อน/);
  const ready = stampActualHold([row(inst(1, { ...COUNTED, status: 'confirmed' })), row(inst(2, { ...SLIP, actualStatus: 'submitted' }))]);
  assert.equal(ledgerRowLock(ready[1], 'confirm'), BLOCKED);
  assert.match(BLOCKED, /รอ AE Sup อนุมัตินับงวดนี้ก่อน/, 'ไม่ใช่ "อนุมัติงวดก่อน" (อ่านเป็นงวดก่อนหน้าได้)');
  // ใบกด "นับที่เหลือทั้งหมด" แล้ว (มติข้อ 10) — แถวพก actualApprovedVia ⇒ ไม่ใช่ "รอฝ่ายขายยื่น"
  const rest = stampActualHold([row(inst(1, { ...COUNTED, actualApprovedVia: 'count_rest', status: 'confirmed' })), row(inst(2, { ...SLIP }))]);
  assert.match(ledgerRowLock(rest[1], 'confirm'), /นับงวดที่ค้าง/);
});

test('ข้อ 2: สถานะ "held" แยกงวดที่ติดด่านออกจาก reported — ป้ายบนเมนู = การ์ด "รอบัญชีรับรอง" = คิว = `?status=reported`', () => {
  const rows = f2a();
  assert.deepEqual(rows.map(ledgerStatusKey), ['reported', 'held', 'held']);
  assert.ok(LEDGER_STATUS_KEYS.includes('held'));
  assert.equal(LEDGER_STATUS.held.label, 'รอนับ Actual');
  const reported = filterLedger(rows, { status: ['reported'] });
  assert.deepEqual(reported.map((r) => r.seq), [1]);
  assert.deepEqual(pendingConfirmations(rows).map((r) => r.seq), reported.map((r) => r.seq));
  const facet = ledgerFacetTally(rows, { status: ['pending'] });
  assert.equal(facet.awaiting.count, reported.length, 'เลขการ์ด = แถวหลังกด');
  assert.equal(facet.held.count, 2, 'แถบงวดที่ติดด่านไม่ขึ้นกับตัวกรองสถานะที่ค้าง');
  const sum = ledgerSummary(rows);
  assert.equal(sum.awaitingCount, 1);
  assert.equal(sum.heldCount, 2);
  // ไฟล์ Excel พูดเหมือนจอ
  assert.deepEqual(rows.map((r) => r.statusLabel), ['รอบัญชีตรวจ', 'รอนับ Actual', 'รอนับ Actual']);
  // ป้ายบนเมนูถามตัวตัดสินเดียวกันจากงวดดิบ + ใบ
  const raw = [
    inst(1, { ...SLIP, ...COUNTED }), inst(2, { ...SLIP, actualStatus: 'submitted' }), inst(3, { ...SLIP }),
  ];
  assert.deepEqual(raw.map((i) => ledgerInConfirmQueue(i, ORDER)), rows.map(ledgerAwaitsConfirm));
});

test('ข้อ 2: ป้ายบนเมนูตัดแถวที่ทะเบียนไม่โชว์ — ใบยอด 0 (สลิป ฿0 ค้าง) · งวดยังไม่ตรึง · งวดโมฆะ (ledgerIncludes ตัวเดียวกับ route)', () => {
  const whole = { ...ORDER, actualMode: 'order' };
  const slip = inst(1, { ...SLIP, amount: 0 });
  assert.equal(ledgerInConfirmQueue(slip, whole), true);
  assert.equal(ledgerInConfirmQueue(slip, { ...whole, totalAmount: 0 }), false, 'ใบยอด 0 (paymentNotRequired)');
  assert.equal(ledgerIncludes(slip, { ...whole, totalAmount: 0 }), false);
  assert.equal(ledgerInConfirmQueue({ ...slip, frozenAt: null }, whole), false, 'งวดร่าง');
  assert.equal(ledgerInConfirmQueue({ ...slip, kind: 'opening' }, { ...whole, origin: 'historical', status: 'cancelled' }), false, 'งวดยกมาของใบที่ยกเลิก = โมฆะ');
  assert.equal(ledgerInConfirmQueue(slip, null), false);
  const nav = code('app/api/nav/counts/route.js');
  const job = nav.slice(nav.indexOf("attempt('payments'"), nav.indexOf("// งานจากที่ประชุม"));
  assert.match(job, /\.filter\(\(row\) => ledgerInConfirmQueue\(row, row\.so\)\)\.length/);
  const route = code('app/api/finance/payments/route.js');
  assert.match(route, /if \(!ledgerIncludes\(installment, order\)\) return null;/);
  // ลิงก์ของป้ายเปิดตัวกรองที่นับชุดเดียวกัน
  assert.match(code('config/menuRegistry.js'), /countHref: '\/finance\/payments\?status=reported'/);
});

test('ข้อ 1: ก้อนใบที่มีงวดติดด่าน = "รอนับ Actual n งวด" + เหตุรายงวด · ถังของตัวเอง (ไม่ตก "รอลูกค้าชำระ")', () => {
  const held = filterLedger(f2a(), { status: ['held'] });
  const [group] = groupLedgerByOrder(held);
  const note = groupNote(group);
  assert.equal(note.label, 'รอนับ Actual 2 งวด');
  assert.match(note.title, /^งวด 2: งวด 1 ยังไม่ได้รับรองเงิน/);
  assert.match(note.title, /\nงวด 3: /);
  const [bucket] = groupLedgerBuckets([group], 'state');
  assert.equal(bucket.label, 'รอนับ Actual');
  // ใบที่ไม่มีงวดติดด่านยังเป็นคำเดิม
  const whole = groupLedgerByOrder([row(inst(1, { status: 'pending' }), { ...ORDER, actualMode: 'order' })]);
  assert.deepEqual(groupNote(whole[0]), { label: 'รอลูกค้าชำระ', tone: 'neutral' });
});

test('ข้อ 1 + 5: แถบรายใบบอกเลขที่ใบ + เหตุของงวดนั้นเอง — งวดแรก/แถวที่ไม่มีงวดก่อนค้าง ไม่ถูกอ้างว่า "ยื่นได้หลังรับรองงวดก่อนหน้า"', () => {
  const first = stampActualHold([row(inst(1, { ...SLIP })), row(inst(2))]);
  const summary = ledgerHeldSummary(first);
  assert.equal(summary.count, 1);
  assert.equal(summary.orders[0].orderNumber, 'SO-26100001-0');
  assert.equal(summary.orders[0].orderId, 'SOR-1');
  const [only] = summary.orders[0].rows;
  assert.equal(only.kind, 'unsubmitted');
  assert.equal(only.short, 'รอฝ่ายขายยื่นขอนับงวดนี้');
  assert.doesNotMatch(only.text, /งวดก่อน/);
  const all = ledgerHeldSummary(f2a());
  assert.deepEqual(all.kinds, { prev_confirm: 2 });
  assert.deepEqual(all.orders[0].rows.map((r) => r.short), ['รอบัญชีรับรองงวด 1 ก่อน', 'รอบัญชีรับรองงวด 1 ก่อน']);
  const page = code('app/finance/payments/page.js');
  assert.doesNotMatch(page, /ยื่นได้หลังบัญชีรับรองงวดก่อนหน้าของใบเดียวกัน/);
  assert.match(page, /href=\{`\/sa\/sales-orders\/\$\{order\.orderId\}\?tab=payment`\}/);
  assert.match(page, /const held = facetTally\?\.held \|\| \{ count: 0, amount: 0, kinds: \{\}, orders: \[\] \};/);
  assert.match(page, /onClick=\{\(\) => setFilter\("status", LEDGER_HELD\)\}>ดูในทะเบียน<\/Button>/);
});

/* 🐞 review รอบหก 27/10: งวด 3 จ่ายก่อนอนุมัติใบ (อนุมัติย้ายเป็น reported ยังไม่นับ) ขณะที่งวด 2 ยังไม่แจ้ง/บัญชีตีกลับ และยังไม่นับ —
   แถบ/ปุ่มรับรองของบัญชีเคยบอก "ฝ่ายขายแจ้งสลิปงวด 2" ซึ่งติดด่าน REPORT_BLOCKED ⇒ ก้าวแรกคือยื่นขอนับงวด 2 (ยื่นแล้ว = AE Sup อนุมัติ) */
test('รอบหก: งวดก่อนหน้ายังไม่นับและยังไม่แจ้งชำระ — แถบรายใบ/ปุ่มรับรองบอก "ยื่นขอนับงวดนั้น" ไม่ใช่ "แจ้งสลิป" ที่ติดด่าน', () => {
  for (const prev of [{ status: 'pending' }, { status: 'rejected', rejectedReason: 'สลิปไม่ชัด' }]) {
    const rows = stampActualHold([
      row(inst(1, { ...SLIP, status: 'confirmed', ...COUNTED })),
      row(inst(2, prev)),
      row(inst(3, { ...SLIP })),
    ]);
    assert.deepEqual(rows[2].actualPreviousOpen, { seq: 2, status: prev.status, counted: false, actualStatus: null });
    const lock = ledgerRowLock(rows[2], 'confirm');
    assert.match(lock, /^งวด 2 ยังไม่ได้รับรองเงิน — ฝ่ายขายยื่นขอนับงวด 2 → AE Sup อนุมัติ → ฝ่ายขายแจ้งสลิป และบัญชีรับรองก่อน/);
    assert.doesNotMatch(lock, /— ฝ่ายขายแจ้งสลิปงวด 2/);
    const summary = ledgerHeldSummary(filterLedger(rows, { status: ['held'] }));
    assert.deepEqual(summary.kinds, { prev_submit: 1 });
    assert.equal(summary.orders[0].rows[0].short, 'รองวด 2 ยื่นขอนับก่อน');
    assert.equal(summary.orders[0].rows[0].text, lock);
    const [group] = groupLedgerByOrder(filterLedger(rows, { status: ['held'] }));
    assert.match(groupNote(group).title, /^งวด 3: งวด 2 ยังไม่ได้รับรองเงิน — ฝ่ายขายยื่นขอนับงวด 2/);
  }
  // งวด 2 ยื่นแล้ว = รอ AE Sup อนุมัติงวด 2
  const sent = stampActualHold([
    row(inst(1, { ...SLIP, status: 'confirmed', ...COUNTED })),
    row(inst(2, { actualStatus: 'submitted', actualSubmittedAt: '2026-10-27T03:00:00.000Z' })),
    row(inst(3, { ...SLIP })),
  ]);
  assert.match(ledgerRowLock(sent[2], 'confirm'), /^งวด 2 ยังไม่ได้รับรองเงิน — AE Sup อนุมัตินับงวด 2 แล้วฝ่ายขายแจ้งสลิปและบัญชีรับรองก่อน/);
  assert.equal(ledgerHeldSummary(sent).orders[0].rows[0].short, 'รอ AE Sup อนุมัติงวด 2 ก่อน');
});

test('ledgerHeld คู่ตรงข้ามของ ledgerAwaitsConfirm ในงวด reported', () => {
  for (const r of f2a()) assert.equal(ledgerHeld(r), r.status === 'reported' && !ledgerAwaitsConfirm(r));
});
