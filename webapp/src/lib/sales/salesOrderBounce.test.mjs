// ── ใบตีกลับรอแก้ (เจ้าของ 24/11/2026 "ใบที่ตีกลับสำคัญพอ ๆ กับใบที่รออนุมัติ") ─────────────────────────────────────
// มติ (ถามทีละข้อ): การ์ด "ตีกลับ รอแก้" + กล่อง "ต้องทำตอนนี้ — ถูกตีกลับ รอคุณแก้" · นับทั้งสองแบบ
//   · ใบที่ AE Sup ตีกลับ → คนสร้างใบ · งวดที่บัญชีตีกลับ → คนแจ้งชำระงวดนั้น + เจ้าของดีลปัจจุบัน · ป้ายบนเมนูนับตาม
// ⭐ ยิงตัวตัดสินตัวจริง · ด่านซอร์สผูก route ทะเบียน + ป้ายบนเมนู + หน้าเข้ากับตัวเดียวกัน · ไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  installmentBounceWaitingOnMe, isSalesOrderWaitingOnMe, salesOrderBouncedToMe, salesOrderIdsWaitingOnMe,
} from './salesOrderWorkflow.js';
import { salesOrderBounced } from './salesOrderListFilter.js';
import { salesOrderBounceFixer, salesOrderBounceLine, salesOrderDocRejectText } from './salesOrderMoneyText.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ME = 'U-ME';
const order = (over = {}) => ({ id: 'SO1', status: 'approved', createdBy: 'U-AC', deal: { ownerId: 'U-AE' }, ...over });
const bounced = (over = {}) => ({ status: 'rejected', kind: 'normal', reportedById: 'U-AC', ...over });

test('เลนงวดตีกลับ: คนแจ้งชำระงวดนั้น หรือเจ้าของดีลปัจจุบัน · งวดสถานะอื่น/โมฆะ/ไม่ส่งงวด = ไม่นับ', () => {
  assert.equal(installmentBounceWaitingOnMe(order(), [bounced({ reportedById: ME })], { userId: ME }), true, 'คนแจ้งชำระ');
  assert.equal(installmentBounceWaitingOnMe(order({ deal: { ownerId: ME } }), [bounced()], { userId: ME }), true, 'เจ้าของดีล (AC แจ้งแทน)');
  assert.equal(installmentBounceWaitingOnMe(order(), [bounced()], { userId: ME }), false, 'คนอื่นแจ้ง · ดีลคนอื่น');
  assert.equal(installmentBounceWaitingOnMe(order(), [bounced({ reportedById: ME, status: 'reported' })], { userId: ME }), false, 'แจ้งใหม่แล้ว');
  assert.equal(installmentBounceWaitingOnMe(order({ status: 'cancelled' }), [bounced({ reportedById: ME })], { userId: ME }), false,
    'ใบยกเลิก = งวดโมฆะ ไม่ต้องตามเก็บ');
  assert.equal(installmentBounceWaitingOnMe(order({ status: 'revised' }), [bounced({ reportedById: ME })], { userId: ME }), false, 'ใบถูก Rev. ทับ');
  assert.equal(installmentBounceWaitingOnMe(order(), null, { userId: ME }), false, 'ไม่ส่งงวด = ไม่เดา');
  assert.equal(installmentBounceWaitingOnMe(order({ deal: { ownerId: '' } }), [bounced({ reportedById: '' })], { userId: '' }), false, 'ไม่รู้ว่าใครดู');
});

test('ธง _bouncedToMe: ใบที่ AE Sup ตีกลับ → คนสร้างใบเท่านั้น · งวดตีกลับ → เลนงวด', () => {
  assert.equal(salesOrderBouncedToMe(order({ status: 'rejected', createdBy: ME }), { userId: ME }), true);
  assert.equal(salesOrderBouncedToMe(order({ status: 'rejected', deal: { ownerId: ME } }), { userId: ME }), false,
    'ใบตีกลับเป็นงานของคนสร้าง (เลนเดิมของรอฉันลงมือ — ไม่เปลี่ยน)');
  assert.equal(salesOrderBouncedToMe(order({ status: 'pending_approval', createdBy: ME }), { userId: ME }), false);
  assert.equal(salesOrderBouncedToMe(order(), { userId: ME, installments: [bounced({ reportedById: ME })] }), true);
  assert.equal(salesOrderBouncedToMe(order(), { userId: ME, installments: [] }), false);
});

test('กล่องตีกลับเป็นชุดย่อยของ "รอฉันลงมือ" — ธงของทะเบียนและป้ายบนเมนูนับใบในกล่องครบ', () => {
  const cases = [
    [order({ status: 'rejected', createdBy: ME }), []],
    [order(), [bounced({ reportedById: ME })]],
    [order({ deal: { ownerId: ME } }), [bounced()]],
    [order(), [bounced()]],
    [order({ status: 'cancelled' }), [bounced({ reportedById: ME })]],
  ];
  for (const [row, installments] of cases) {
    if (!salesOrderBouncedToMe(row, { userId: ME, installments })) continue;
    assert.equal(isSalesOrderWaitingOnMe(row, { userId: ME, bounceInstallments: installments }), true, JSON.stringify(row));
  }
  // ป้ายบนเมนู: เลนงวดตีกลับนับใบละหนึ่ง (ใบเดียวกันอยู่หลายเลนได้)
  const rowA = { ...order({ id: 'A' }) };
  const rowB = { ...order({ id: 'B', deal: { ownerId: ME } }) };
  const byId = { A: [bounced({ reportedById: ME }), bounced({ reportedById: ME })], B: [bounced()] };
  const ids = salesOrderIdsWaitingOnMe({ bounceRows: [rowA, rowB, order({ id: 'C' })], bounceInstallmentsOf: (row) => byId[row.id] || [] },
    { userId: ME });
  assert.deepEqual([...ids].sort(), ['A', 'B']);
  assert.equal(salesOrderIdsWaitingOnMe({ bounceRows: [rowA] }, { userId: ME }).size, 0, 'ไม่ส่งงวด = ไม่นับ');
});

test('การ์ด "ตีกลับ รอแก้": ใบที่ AE Sup ตีกลับ หรือมีงวดบัญชีตีกลับ (ตัวนับของคอลัมน์งวด — ตัดงวดโมฆะแล้ว)', () => {
  assert.equal(salesOrderBounced({ status: 'rejected' }), true);
  assert.equal(salesOrderBounced({ status: 'approved', payment: { rejected: 1 } }), true);
  assert.equal(salesOrderBounced({ status: 'approved', payment: { rejected: 0, overdue: 2 } }), false);
  assert.equal(salesOrderBounced({ status: 'approved', payment: null }), false);
  assert.equal(salesOrderBounced(null), false);
});

test('คำของแถวในกล่อง: ใครตีกลับ + เหตุผล · ใบมาก่อนงวด · หลายงวดบอกจำนวน', () => {
  assert.equal(salesOrderDocRejectText({ status: 'rejected', rejectedByName: 'สมชาย', rejectionReason: 'ราคาไม่ตรง QT' }), 'ตีกลับโดย สมชาย: ราคาไม่ตรง QT');
  assert.equal(salesOrderDocRejectText({ status: 'rejected', rejectionReason: 'x' }), 'ตีกลับโดย ผู้อนุมัติ: x');
  assert.equal(salesOrderDocRejectText({ status: 'draft', rejectionReason: 'ค่าค้าง' }), null, 'ค่าค้างบนใบสถานะอื่นไม่พูด');
  assert.equal(salesOrderBounceLine({ status: 'rejected', rejectedByName: 'สมชาย', rejectionReason: 'ราคาไม่ตรง QT',
    money: { installments: [{ seq: 1, kind: 'rejected', rejectedReason: 'สลิป' }] } }), 'ตีกลับโดย สมชาย: ราคาไม่ตรง QT', 'แก้ใบก่อน');
  assert.equal(salesOrderBounceLine({ status: 'rejected', rejectedByName: 'สมชาย' }), 'ตีกลับโดย สมชาย');
  assert.equal(salesOrderBounceLine({ status: 'approved', money: { installments: [
    { seq: 1, kind: 'confirmed' }, { seq: 2, kind: 'rejected', rejectedReason: 'สลิปไม่ชัด' },
  ] } }), 'บัญชีตีกลับงวด 2: สลิปไม่ชัด');
  assert.equal(salesOrderBounceLine({ status: 'approved', money: { installments: [
    { seq: 2, kind: 'rejected', rejectedReason: 'สลิปไม่ชัด' }, { seq: 3, kind: 'rejected', rejectedReason: 'ยอดไม่ตรง' },
  ] } }), 'บัญชีตีกลับ 2 งวด · งวด 2: สลิปไม่ชัด');
  assert.equal(salesOrderBounceLine({ status: 'approved', money: { installments: [{ seq: 1, kind: 'rejected' }] } }), 'บัญชีตีกลับงวด 1');
  assert.equal(salesOrderBounceLine({ status: 'approved', money: { installments: [{ seq: 1, kind: 'pending' }] } }), null);
});

test('ด่านซอร์ส: ป้ายบนเมนูมีเลนงวดตีกลับ (งวด rejected → ใบ status + deal.ownerId) · อ่านไม่ขึ้น = โยน', () => {
  const nav = read('../../app/api/nav/counts/route.js');
  const job = nav.slice(nav.indexOf("attempt('salesOrders'"), nav.indexOf("attempt('scents'"));
  assert.match(job, /supabase\.from\('sales_order_installments'\)\.select\('id, "salesOrderId", status, kind, "reportedById"'\)\s*\.eq\('status', 'rejected'\)/);
  assert.match(job, /\.from\('sales_orders'\)\s*\.select\('id, status, deal:sales_deals\(ownerId\)'\)/);
  assert.match(job, /if \(bounceError\) throw bounceError;/);
  assert.match(job, /if \(bounceOrderError\) throw bounceOrderError;/);
  assert.match(job, /bounceRows: bounceOrders,\s*bounceInstallmentsOf: \(row\) => bounceInstallmentsByOrder\.get\(row\.id\) \|\| \[\],/);
});

test('ด่านซอร์ส: หน้าทะเบียน — การ์ดตีกลับข้างการ์ดรออนุมัติ · กล่องตีกลับใช้ธงของ server · เปลือกบัญชีไม่มีกล่อง', () => {
  const page = read('../../app/sales-planning/sales-orders/page.js');
  const strip = page.slice(page.indexOf('<SaMetricStrip>'), page.indexOf('</SaMetricStrip>'));
  assert.ok(strip.indexOf('pickCard("pending")') < strip.indexOf('pickCard("bounced")'), 'การ์ดตีกลับอยู่ถัดจากการ์ดรออนุมัติ');
  assert.ok(strip.indexOf('pickCard("bounced")') < strip.indexOf('pickCard("approved")'));
  assert.match(page, /const bounced = rows\.filter\(salesOrderBounced\);/, 'เลขบนการ์ด = ตัวตัดสินเดียวกับตัวกรองของการ์ด');
  /* ผู้ตรวจ (AE Sup · CM · CD · admin) เห็นกล่องตามงาน: ใบตีกลับทั้งขอบเขต (ชุดเดียวกับการ์ด) · คนอื่นเห็นเฉพาะใบที่รอตัวเองแก้ (ธงของ server) */
  assert.match(page, /const bounceReviewer = !financeShell && isSalesOrderReviewer\(role\);/);
  assert.match(page, /\(\) => \(financeShell \? \[\] : rows\.filter\(\(row\) => \(bounceReviewer \? salesOrderBounced\(row\) : row\._bouncedToMe\)\)\),\s*\[rows, financeShell, bounceReviewer\],/);
  assert.match(page, /title=\{bounceReviewer \? "ต้องตามตอนนี้ — ถูกตีกลับ รอทีมแก้" : "ต้องทำตอนนี้ — ถูกตีกลับ รอคุณแก้"\}/);
  assert.match(page, /bounceReviewer \? salesOrderBounceFixer\(o\) : null/, 'แถวของผู้ตรวจบอกคนที่ต้องแก้');
  assert.match(page, /const bounceHref = \(o\) => \(o\.status === "rejected" \? `\/sa\/sales-orders\/\$\{o\.id\}` : `\/sa\/sales-orders\/\$\{o\.id\}\?tab=payment`\);/,
    'งวดตีกลับพาไปแท็บการชำระ (ปุ่มแจ้งชำระใหม่อยู่ที่นั่น)');
  // ถอดตัวกรองการ์ดได้ทุกทาง: ชิป · ล้างของกล่องกรอง · เปิดชิปงานบริการ
  assert.match(page, /\{bouncedOnly && \(\s*<Button size="sm" onClick=\{\(\) => setBouncedOnly\(false\)\}>กรอง: ตีกลับ รอแก้ ×<\/Button>/);
  assert.match(page.slice(page.indexOf('onClear={() => {'), page.indexOf('groups={[')), /setBouncedOnly\(false\);/);
});

test('กล่องผู้ตรวจ: คนที่ต้องแก้ — ใบตีกลับ = คนสร้างใบ · งวดตีกลับ = เจ้าของดีล · ใบค่าสรรพสามิต = เจ้าของดีลต้นทาง', () => {
  assert.equal(salesOrderBounceFixer({ status: 'rejected', createdByName: 'AC ก', deal: { ownerName: 'AE ข' } }), 'รอ AC ก แก้');
  assert.equal(salesOrderBounceFixer({ status: 'rejected', deal: { ownerName: 'AE ข' } }), 'รอ AE ข แก้', 'ไม่รู้ชื่อคนสร้าง = เจ้าของดีล');
  assert.equal(salesOrderBounceFixer({ status: 'approved', createdByName: 'AC ก', deal: { ownerName: 'AE ข' } }), 'รอ AE ข แก้');
  assert.equal(salesOrderBounceFixer({ status: 'approved', deal: null, sourceDeal: { ownerName: 'AE ค' } }), 'รอ AE ค แก้');
  assert.equal(salesOrderBounceFixer({ status: 'approved', deal: null }), null, 'ไม่รู้ชื่อ = ไม่เดา');
  assert.equal(salesOrderBounceFixer(null), null);
});

test('ด่านซอร์ส: ป้ายบนเมนูของผู้ตรวจไม่นับใบตีกลับของทีม (มติ "เห็นกล่อง ป้ายไม่นับ") — เลนงวดตีกลับยังตัดสินด้วยคนแจ้ง/เจ้าของดีลเท่านั้น', () => {
  const wf = read('./salesOrderWorkflow.js');
  const fn = wf.slice(wf.indexOf('export function installmentBounceWaitingOnMe('), wf.indexOf('export function salesOrderBouncedToMe('));
  assert.doesNotMatch(fn, /reviewer|role/, 'ไม่มีเลนผู้ตรวจในเลนงวดตีกลับ');
});
