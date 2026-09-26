import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_DUE_FN_HREF, BILLING_DUE_FN_KIND, BILLING_DUE_KIND,
  billingDueCandidates, billingDueDedupeKey, billingDueFnDedupeKey, billingDueFnNotice, billingDueNotice,
  billingDueNotices, billingDueRecipients, financeRecipientIds, installmentBillingRequested, installmentName,
} from '@/lib/sales/billingDueNotify';
import { SALES_ORDER_BELL_KINDS } from '@/lib/notifications';
import { splitNotificationAction } from '@/lib/notificationAction';

/* ── กระดิ่ง "ถึงรอบวางบิล" (กำหนดวางบิล · mig 0389 · มติเจ้าของ 25–26/09) ──────────────────
   ตัวอย่างตามม็อก E: วันนี้ ศ. 2 ต.ค. 2026 · SO-26080050-0 งวด 1 มัดจำ ฿51,385.68 ของ AR-267 วางบิล จ. 5 ต.ค. */

const TODAY = '2026-10-02';

const order = (over = {}) => ({
  id: 'SOR-50',
  orderNumber: 'SO-26080050-0',
  status: 'approved',
  origin: 'pipeline',
  quotationId: 'QT-50',
  quotation: { id: 'QT-50', status: 'accepted', quoteNumber: 'QT-26080049-1' },
  totalAmount: 102771.36,
  customerId: 'C-267',
  customerName: 'บริษัท เจอร์นัล แล็บ จำกัด',
  ownerId: 'U-AE',
  dealId: 'D-1',
  deal: { id: 'D-1', ownerId: 'U-AE' },
  ...over,
});
const inst = (over = {}) => ({
  id: 'SOI-1',
  salesOrderId: 'SOR-50',
  seq: 1,
  label: 'มัดจำ',
  amount: 51385.68,
  status: 'pending',
  kind: 'regular',
  frozenAt: '2026-08-20T03:00:00Z',
  refundedAt: null,
  billingDate: '2026-10-05',
  billingEvent: null,
  billingRequestId: null,
  ...over,
});
const CUSTOMERS = new Map([
  ['C-267', { id: 'C-267', arCode: 'AR-267' }],
  ['C-109', { id: 'C-109', arCode: 'AR-109' }],
]);
const FN_DIR = new Map([
  ['F1', { id: 'F1', role: 'finance', department: 'FN', disabled: false }],
  ['F2', { id: 'F2', role: 'finance', department: 'FN', disabled: false }],
]);
const ctx = (over = {}) => ({
  todayIso: TODAY,
  ordersById: new Map([['SOR-50', order()]]),
  customersById: CUSTOMERS,
  requestsById: new Map(),
  skipArCodes: ['AR-109'],
  ...over,
});
const pick = (rows, over) => billingDueCandidates(rows, ctx(over)).map((c) => c.installment.id);

/* ── ตัวคัดงวด ─────────────────────────────────────────────────────────── */

test('หน้าต่าง 0..3 วัน: วันนี้และอีก 3 วันเตือน · อีก 4 วันยังไม่เตือน · ผ่านไปแล้วไม่เตือน (เลยรอบ = ป้าย ไม่ใช่กระดิ่ง)', () => {
  assert.deepEqual(pick([inst({ billingDate: '2026-10-02' })]), ['SOI-1'], 'วันนี้');
  assert.deepEqual(pick([inst({ billingDate: '2026-10-05' })]), ['SOI-1'], 'อีก 3 วัน');
  assert.deepEqual(pick([inst({ billingDate: '2026-10-06' })]), [], 'อีก 4 วัน');
  assert.deepEqual(pick([inst({ billingDate: '2026-10-01' })]), [], 'เลยรอบแล้ว');
  // ไม่มีวันวางบิล (ลูกค้าไม่มีรอบ · งวดรอเหตุการณ์) = ไม่มีอะไรให้เตือน
  assert.deepEqual(pick([inst({ billingDate: null })]), []);
  assert.deepEqual(pick([inst({ billingDate: null, billingEvent: 'หลังส่งสินค้า' })]), []);
});

/* ⚠️ cron วิ่งแค่ จ–ศ — วันวางบิลวันอังคารมีช่วงเตือนเริ่มวันเสาร์ ⇒ กฎ "วันนี้ = วันวางบิล − 3" จะไม่เคยยิง */
test('ช่วงเตือนที่เริ่มวันหยุดสุดสัปดาห์ยังจับได้ในเช้าวันทำการถัดไป', () => {
  const tuesday = inst({ billingDate: '2026-10-06' });
  assert.deepEqual(pick([tuesday], { todayIso: '2026-10-05' }), ['SOI-1'], 'จันทร์ก่อนวางบิลวันอังคาร');
});

test('ขอใบวางบิลแล้ว (คำร้องส่งแล้ว) = ไม่เตือน · แต่คำร้องที่ถูกยกเลิก/หาไม่เจอ = ลิงก์ตาย ต้องเตือนต่อ', () => {
  const linked = inst({ billingRequestId: 'RQ-1' });
  const withRequest = (status) => ({ requestsById: new Map([['RQ-1', { id: 'RQ-1', status }]]) });
  for (const status of ['pending', 'acknowledged', 'answered', 'closed']) {
    assert.deepEqual(pick([linked], withRequest(status)), [], status);
  }
  // ยกเลิกคำร้องไม่ล้างลิงก์บนงวด — ถ้าดูแค่ว่ามี id งวดนี้จะเงียบถาวร
  assert.deepEqual(pick([linked], withRequest('cancelled')), ['SOI-1']);
  assert.deepEqual(pick([linked], { requestsById: new Map() }), ['SOI-1'], 'คำร้องถูกลบไปพร้อมดีล');
  assert.equal(installmentBillingRequested({ billingRequestId: '  ' }, new Map()), false);
});

/* 🔴 รีวิว 26/09 — ปุ่ม "ขอใบวางบิลงวดนี้" ผูกงวดตั้งแต่บันทึกร่าง (billingInstallmentLink.js) · ร่างไม่มีเลข RQ และ FN ไม่เห็น
   ⇒ นับร่างว่าขอแล้ว = SA บันทึกแล้วไม่ส่ง กระดิ่งทั้งฝั่งขายและฝั่ง FN เงียบ ทั้งที่ไม่มีใครกำลังออกใบให้ */
test('🔴 คำร้องที่ยังเป็นร่าง (ผูกแล้วแต่ยังไม่ส่ง) = ยังไม่ขอ — ต้องเตือนต่อทั้งฝั่งขายและฝั่ง FN', () => {
  const linked = inst({ billingRequestId: 'RQ-1' });
  const draft = new Map([['RQ-1', { id: 'RQ-1', status: 'draft' }]]);
  assert.deepEqual(pick([linked], { requestsById: draft }), ['SOI-1']);
  assert.equal(installmentBillingRequested(linked, draft), false);
  assert.equal(installmentBillingRequested(linked, new Map([['RQ-1', { id: 'RQ-1', status: 'pending' }]])), true);
  const { sales, fn } = billingDueNotices([linked], { ...ctx({ requestsById: draft }), directory: FN_DIR });
  assert.equal(sales.length, 1);
  assert.match(fn.title, /· 1 งวด /);
});

test('ยอด ฿0 ไม่เตือน — ทั้งงวดยอด 0 และใบยอด 0', () => {
  assert.deepEqual(pick([inst({ amount: 0 })]), []);
  assert.deepEqual(pick([inst()], { ordersById: new Map([['SOR-50', order({ totalAmount: 0 })]]) }), []);
});

test('งวดยกมาของใบย้อนหลังไม่เตือน (มติ 10: ไม่มีวันวางบิล)', () => {
  assert.deepEqual(pick([inst({ kind: 'opening' })]), []);
});

test('แจ้งชำระแล้ว/รับรองแล้ว/ตีกลับ/คืนเงิน ไม่เตือน — เฉพาะ pending', () => {
  for (const status of ['reported', 'confirmed', 'rejected']) {
    assert.deepEqual(pick([inst({ status })]), [], status);
  }
  assert.deepEqual(pick([inst({ refundedAt: '2026-09-30T00:00:00Z' })]), [], 'คืนเงินแล้ว');
});

test('งวดร่าง (ยังไม่ตรึงยอด) ไม่เตือน — ทะเบียนการชำระก็ไม่แสดง', () => {
  assert.deepEqual(pick([inst({ frozenAt: null })]), []);
});

test('ใบยกเลิก/ถูกออก Rev. ทับ ไม่เตือน · ย้อนอนุมัติรอ Rev. ยังเตือน (มติ D3 ไม่หยุดรับเงิน)', () => {
  const withOrder = (over) => ({ ordersById: new Map([['SOR-50', order(over)]]) });
  for (const status of ['cancelled', 'revised']) {
    assert.deepEqual(pick([inst()], withOrder({ status })), [], status);
  }
  assert.deepEqual(pick([inst()], withOrder({ status: 'approval_revoked' })), ['SOI-1']);
  assert.deepEqual(pick([inst({ salesOrderId: 'SOR-missing' })]), [], 'หาใบไม่เจอ = ไม่เตือน');
});

/* 🔴 รีวิว 26/09 — 0376 ย้ายงวดที่ตรึงแล้วทั้งแถวไปใบ Rev. ซึ่งเกิดเป็น **ร่าง** (ใบเดิมเป็น revised) · ทะเบียน FN ยังแสดงงวดเหล่านั้น
   และมติ D3 ให้รับเงินต่อระหว่างร่าง Rev. ⇒ ลิสต์สถานะ approved/approval_revoked ทำให้ทุกงวดหลุดจากกระดิ่งตั้งแต่ออก Rev. จนอนุมัติ
   ⭐ ตัดสินด้วยด่านงวดตัวเดียวกับแผง/API (`pipelineInstallmentLock` · `historicalInstallmentLock`) */
test('🔴 ร่าง Rev. ที่ QT ยัง Won อยู่ = เตือน (งวดย้ายมาทั้งแถว · มติ D3) · ร่างที่ QT ถูกถอด Won แล้ว = ไม่เตือน', () => {
  const withOrder = (over) => ({ ordersById: new Map([['SOR-50', order(over)]]) });
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    assert.deepEqual(pick([inst()], withOrder({ status, orderNumber: 'SO-26080050-1' })), ['SOI-1'], `Rev. ${status}`);
    // ร่างที่ถูกกู้คืนหลังยกเลิกแล้ว QT ถูกถอด Won — งวดตรึงยอดค้างจากตอนเคยอนุมัติ แต่ใบยื่นอนุมัติไม่ได้อีกแล้ว
    const deadQuote = { id: 'QT-50', status: 'sent', quoteNumber: 'QT-26080049-1' };
    assert.deepEqual(pick([inst()], withOrder({ status, quotation: deadQuote })), [], `ร่างกู้คืน ${status}`);
  }
  // ไม่รู้สถานะ QT = ด่านไม่ตัดสิน (ไม่เดาว่า QT ตาย) — แบบเดียวกับแผงงวด
  assert.deepEqual(pick([inst()], withOrder({ status: 'draft', quotation: null })), ['SOI-1']);
});

test('ใบย้อนหลัง: เตือนเฉพาะใบที่อนุมัติแล้ว (historicalInstallmentLock) — ร่าง/รออนุมัติ/ยกเลิก ไม่เตือน', () => {
  const withOrder = (over) => ({ ordersById: new Map([['SOR-50', order({ origin: 'historical', quotationId: null, quotation: null, ...over })]]) });
  assert.deepEqual(pick([inst()], withOrder({ status: 'approved' })), ['SOI-1']);
  for (const status of ['draft', 'pending_approval', 'rejected', 'cancelled']) {
    assert.deepEqual(pick([inst()], withOrder({ status })), [], status);
  }
});

test('ลูกค้าสหมิตร (AR-109) ไม่เตือน — เงินเก็บนอกระบบ', () => {
  const sahamit = new Map([['SOR-50', order({ customerId: 'C-109' })]]);
  assert.deepEqual(pick([inst()], { ordersById: sahamit }), []);
  // ผู้เรียกไม่ส่งรหัสที่ต้องข้าม = ไม่ข้ามใคร (ตัวคัดไม่ฝังรหัสลูกค้าเอง)
  assert.deepEqual(pick([inst()], { ordersById: sahamit, skipArCodes: [] }), ['SOI-1']);
});

test('ผลเรียงตามวันวางบิล แล้วเลขใบ แล้วลำดับงวด', () => {
  const rows = [
    inst({ id: 'B', seq: 2, billingDate: '2026-10-05' }),
    inst({ id: 'C', seq: 1, billingDate: '2026-10-03' }),
    inst({ id: 'A', seq: 1, billingDate: '2026-10-05' }),
  ];
  assert.deepEqual(pick(rows), ['C', 'A', 'B']);
});

/* ── ผู้รับ ──────────────────────────────────────────────────────────────── */

test('ผู้รับฝั่งขาย = เจ้าของดีล + เจ้าของใบ ตัดซ้ำ ตัดค่าว่าง', () => {
  assert.deepEqual(billingDueRecipients(order()), ['U-AE'], 'คนเดียวกัน = แถวเดียว');
  assert.deepEqual(billingDueRecipients(order({ deal: { ownerId: 'U-AE2' } })), ['U-AE2', 'U-AE'], 'ดีลย้ายมือหลังอนุมัติ');
  assert.deepEqual(billingDueRecipients(order({ deal: null })), ['U-AE'], 'ใบที่ไม่มีดีล');
  assert.deepEqual(billingDueRecipients(order({ deal: null, ownerId: null })), []);
});

test('ผู้รับฝั่งขาย: ตัดเฉพาะคนที่ปิดบัญชีแล้ว — ทะเบียนผู้ใช้ไม่รู้จัก ≠ ปิดบัญชี', () => {
  const directory = new Map([['U-AE', { id: 'U-AE', disabled: true }], ['U-AE2', { id: 'U-AE2', disabled: false }]]);
  assert.deepEqual(billingDueRecipients(order({ deal: { ownerId: 'U-AE2' } }), { directory }), ['U-AE2']);
  assert.deepEqual(billingDueRecipients(order({ ownerId: 'U-X', deal: null }), { directory }), ['U-X']);
});

test('🔴 ผู้รับฝั่ง FN = ทุกคนในฝ่าย FN ที่ยังเปิดบัญชี (ข้อยกเว้นมติ 14 ตามคำสั่งเจ้าของ 26/09) — ไม่รวม admin', () => {
  const directory = new Map([
    ['F1', { id: 'F1', role: 'finance', department: 'FN', disabled: false }],
    ['F2', { id: 'F2', role: 'finance', department: null, disabled: false }], // ฝ่ายตกจาก role
    ['F3', { id: 'F3', role: 'finance', department: 'FN', disabled: true }],
    ['A1', { id: 'A1', role: 'admin', department: 'AD', disabled: false }],
    // `departmentOf` อ่าน app_metadata.department ก่อน role — admin ที่ตั้งฝ่ายเป็น FN ต้องยังไม่ได้แถว FN
    ['A2', { id: 'A2', role: 'admin', department: 'FN', disabled: false }],
    ['S1', { id: 'S1', role: 'ae', department: 'SA', disabled: false }],
  ]);
  assert.deepEqual(financeRecipientIds(directory), ['F1', 'F2']);
  assert.deepEqual(financeRecipientIds(new Map()), []);
  assert.deepEqual(financeRecipientIds(null), []);
});

/* ── ข้อความ ─────────────────────────────────────────────────────────────── */

test('แถวฝั่งขายตรงม็อก E: หัวข้อ วัน·ใบ·งวด·ยอด · บรรทัดรอง รหัส·ชื่อลูกค้า · ลิงก์แท็บการชำระ', () => {
  const notice = billingDueNotice({ installment: inst(), order: order(), customer: CUSTOMERS.get('C-267') });
  assert.equal(notice.title, 'ถึงรอบวางบิล จ. 5 ต.ค. · SO-26080050-0 งวด 1 มัดจำ ฿51,385.68');
  assert.equal(notice.body, 'AR-267 · บริษัท เจอร์นัล แล็บ จำกัด');
  assert.equal(notice.kind, BILLING_DUE_KIND);
  assert.equal(notice.entityType, 'sales_order');
  assert.equal(notice.entityId, 'SOR-50', 'ผูกกับใบ ไม่ใช่งวด — ลบใบแล้วแถวกระดิ่งถูกกวาดตาม');
  // แถวพาไปแท็บการชำระเหมือนเดิม — ลิงก์ของปุ่ม "ขอใบวางบิลงวดนี้" ฝังท้าย (API แกะออก · billingDueAction.test.mjs)
  assert.equal(splitNotificationAction(notice.href).href, '/sa/sales-orders/SOR-50?tab=payment');
  assert.deepEqual(notice.userIds, ['U-AE']);
});

test('กุญแจกันซ้ำ: ครั้งเดียวต่องวดต่อวันวางบิล — แก้วันวางบิลแล้วเตือนได้อีกครั้ง', () => {
  const a = billingDueNotice({ installment: inst(), order: order() });
  const b = billingDueNotice({ installment: inst({ billingDate: '2026-10-04' }), order: order() });
  assert.equal(a.dedupeKey, 'billing_due:SOI-1:2026-10-05');
  assert.equal(a.dedupeKey, billingDueDedupeKey('SOI-1', '2026-10-05'));
  assert.notEqual(a.dedupeKey, b.dedupeKey);
});

test('ไม่มีผู้รับ / ไม่มีเลขใบ / ไม่มีวันวางบิล = null ไม่ใช่แถวว่าง', () => {
  assert.equal(billingDueNotice({ installment: inst(), order: order({ ownerId: null, deal: null }) }), null);
  assert.equal(billingDueNotice({ installment: inst(), order: order({ orderNumber: ' ' }) }), null);
  assert.equal(billingDueNotice({ installment: inst({ billingDate: null }), order: order() }), null);
});

test('ชื่องวด: เงื่อนไขที่แค่ซ้ำเลขงวดตัดทิ้ง · ไม่มีเลขงวด = "งวดชำระ" · ชื่อยาวถูกย่อ', () => {
  assert.equal(installmentName({ seq: 1, label: 'มัดจำ' }), 'งวด 1 มัดจำ');
  assert.equal(installmentName({ seq: 2, label: 'งวดที่ 2' }), 'งวด 2');
  assert.equal(installmentName({ seq: 2, label: 'งวด 2' }), 'งวด 2');
  assert.equal(installmentName({ seq: 3, label: 'งวดที่ 2' }), 'งวด 3 งวดที่ 2', 'เลขไม่ตรงงวด = ไม่ใช่ของซ้ำ');
  // คำนำหน้าที่ซ้ำเลขงวดตัดทิ้งแม้มีคำต่อท้าย — ไม่งั้นได้ "งวด 1 งวดที่ 1 มัดจำ 50%"
  assert.equal(installmentName({ seq: 1, label: 'งวดที่ 1 มัดจำ 50%' }), 'งวด 1 มัดจำ 50%');
  assert.equal(installmentName({ seq: 1, label: 'งวด 1: มัดจำ' }), 'งวด 1 มัดจำ');
  assert.equal(installmentName({ seq: 1, label: 'งวดที่ 10' }), 'งวด 1 งวดที่ 10', 'งวดที่ 10 ไม่ใช่ของซ้ำของงวด 1');
  assert.equal(installmentName({ label: 'มัดจำ' }), 'งวดชำระ มัดจำ');
  const long = installmentName({ seq: 1, label: 'ก'.repeat(80) });
  assert.ok(long.length <= 'งวด 1 '.length + 40 && long.endsWith('…'));
});

test('บรรทัดรองไม่มีรหัสลูกค้า = ชื่ออย่างเดียว · ไม่มีอะไรเลย = null', () => {
  assert.equal(billingDueNotice({ installment: inst(), order: order() }).body, 'บริษัท เจอร์นัล แล็บ จำกัด');
  assert.equal(billingDueNotice({ installment: inst(), order: order({ customerName: '' }) }).body, null);
});

test('สำเนาชื่อบนใบว่าง = ชื่อจากทะเบียน (ไทยก่อน ไม่มีค่อยอังกฤษ)', () => {
  const blank = order({ customerName: '' });
  assert.equal(billingDueNotice({ installment: inst(), order: blank, customer: { arCode: 'AR-267', name: '', nameEn: 'Journal Lab Co., Ltd.' } }).body,
    'AR-267 · Journal Lab Co., Ltd.');
  assert.equal(billingDueNotice({ installment: inst(), order: blank, customer: { arCode: 'AR-267', name: 'เจอร์นัล แล็บ', nameEn: 'Journal Lab' } }).body,
    'AR-267 · เจอร์นัล แล็บ');
});

test('แถว FN ตรงม็อก E: วันละแถว "ถึงรอบวางบิลใน 3 วัน · 2 งวด ฿63,690.68" → ทะเบียนที่กรองไว้แล้ว', () => {
  const other = order({
    id: 'SOR-918', orderNumber: 'SO-26090918-0', customerId: 'C-9903', customerName: 'บริษัท ค. ค้าปลีก จำกัด',
  });
  const candidates = [
    { installment: inst({ id: 'SOI-2', salesOrderId: 'SOR-918', seq: 2, label: 'งวดที่ 2', amount: 12305 }), order: other, customer: { arCode: 'AR-9903' } },
    { installment: inst(), order: order(), customer: CUSTOMERS.get('C-267') },
  ];
  const notice = billingDueFnNotice(candidates, { todayIso: TODAY, directory: FN_DIR });
  assert.equal(notice.title, 'ถึงรอบวางบิลใน 3 วัน · 2 งวด ฿63,690.68');
  // ยอดรายงวดอยู่บนทุกบรรทัด (ม็อก E) — หัวข้อมีแค่ยอดรวม
  assert.equal(notice.body,
    'SO-26080050-0 งวด 1 มัดจำ ฿51,385.68 · AR-267 · วางบิล จ. 5 ต.ค. / SO-26090918-0 งวด 2 ฿12,305.00 · AR-9903 · วางบิล จ. 5 ต.ค.');
  assert.equal(notice.kind, BILLING_DUE_FN_KIND);
  assert.equal(notice.href, BILLING_DUE_FN_HREF);
  // รอบสอง 26/09: ชุดของกระดิ่งเป๊ะ (เดิม `?billing=7d` กว้างกว่าหัวข้อ) — ทะเบียนฝั่งนั้นดู paymentLedgerBillingSoon.test.mjs
  assert.equal(notice.href, '/finance/payments?billing=soon');
  assert.equal(notice.dedupeKey, 'billing_due_fn:2026-10-02');
  assert.equal(notice.dedupeKey, billingDueFnDedupeKey(TODAY));
  assert.deepEqual(notice.userIds, ['F1', 'F2']);
  assert.equal(notice.entityId, 'SOR-50', 'ผูกกับใบของงวดที่วางบิลเร็วสุด');
});

/* กระดิ่งตัดบรรทัดรองที่ 2 บรรทัด (NotificationBell.module.css) ⇒ ไล่แค่ 2 งวด · จำนวนทั้งหมดอยู่บนหัวข้อ */
test('แถว FN เกิน 2 งวด ต่อด้วย "และอีก n งวด" · ไม่มีงวด/ไม่มีคนฝ่าย FN = null', () => {
  const many = [1, 2, 3, 4, 5].map((seq) => ({
    installment: inst({ id: `SOI-${seq}`, seq, label: '', amount: 100 }), order: order(), customer: null,
  }));
  const notice = billingDueFnNotice(many, { todayIso: TODAY, directory: FN_DIR });
  assert.match(notice.title, /· 5 งวด ฿500\.00$/);
  assert.match(notice.body, / และอีก 3 งวด$/);
  assert.equal(notice.body.split(' / ').length, 2);
  assert.equal(billingDueFnNotice([], { todayIso: TODAY, directory: FN_DIR }), null);
  assert.equal(billingDueFnNotice(many, { todayIso: TODAY, directory: new Map() }), null);
});

test('ทั้งรอบ: หนึ่งแถวต่องวดฝั่งขาย + หนึ่งแถวสรุปฝั่ง FN จากงวดชุดเดียวกัน', () => {
  const rows = [
    inst(),
    inst({ id: 'SOI-2', seq: 2, label: 'งวดสุดท้าย', billingDate: '2026-10-04' }),
    inst({ id: 'SOI-3', seq: 3, billingDate: '2026-11-05' }), // นอกหน้าต่าง
    inst({ id: 'SOI-4', seq: 4, billingRequestId: 'RQ-9' }),  // ขอใบแล้ว
  ];
  const { candidates, sales, fn } = billingDueNotices(rows, {
    ...ctx({ requestsById: new Map([['RQ-9', { id: 'RQ-9', status: 'acknowledged' }]]) }),
    directory: FN_DIR,
  });
  assert.deepEqual(candidates.map((c) => c.installment.id), ['SOI-2', 'SOI-1']);
  assert.deepEqual(sales.map((n) => n.dedupeKey), ['billing_due:SOI-2:2026-10-04', 'billing_due:SOI-1:2026-10-05']);
  assert.match(fn.title, /· 2 งวด /);
  // ไม่มีคนฝ่าย FN — ฝั่งขายต้องยังได้ (cron รายงาน error ของฝั่ง FN แยก)
  const noFn = billingDueNotices(rows, { ...ctx(), directory: new Map() });
  assert.equal(noFn.sales.length, 3);
  assert.equal(noFn.fn, null);
});

/* ── สายไฟ ───────────────────────────────────────────────────────────────── */

test('ทั้งสอง kind อยู่ในกระดิ่ง (SALES_ORDER_BELL_KINDS) — ไม่งั้นแถวไปโผล่แค่หน้าเต็ม', () => {
  assert.ok(SALES_ORDER_BELL_KINDS.includes(BILLING_DUE_KIND));
  assert.ok(SALES_ORDER_BELL_KINDS.includes(BILLING_DUE_FN_KIND));
});

test('cron ยิงจาก daily-digest ในบล็อก try ของตัวเอง · วันนี้จากนาฬิกาไทย · ข้ามสหมิตรด้วยค่าคงที่บ้านเดียว', () => {
  const src = readFileSync(new URL('../../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  assert.match(src, /try \{\s*\n\s*results\.billingDue = await notifyBillingDue\(supabase\);\s*\n\s*\} catch/);
  const block = src.slice(src.indexOf('async function notifyBillingDue'), src.indexOf('export async function GET'));
  assert.match(block, /const todayIso = businessDate\(\);/);
  assert.match(block, /skipArCodes: \[SAHAMIT_AR_CODE\]/);
  // ด่านงวดต้องได้วัตถุดิบครบ — ขาด `origin` = ใบย้อนหลังถูกถามเป็นใบ pipeline · ขาด QT = ร่างที่ใช้ต่อไม่ได้ถูกเตือน
  assert.match(block, /from\('sales_orders'\)\s*\n\s*\.select\('[^']*\borigin\b[^']*"quotationId"[^']*'\)/);
  assert.match(block, /from\('quotations'\)\.select\('id, status, "quoteNumber"'\)/);
  assert.match(block, /quotation: quoteById\.get\(o\.quotationId\) \|\| null/);
  // notifyUsers ไม่ throw — error ของมันต้องขึ้นในผลของรอบ ไม่ใช่ sent: 0 เงียบ ๆ
  assert.match(block, /if \(result\.error && !notifyError\)/);
  // supabase ไม่ throw — คอลัมน์ยังไม่มี (ก่อนรัน 0389) ต้องเป็น error ไม่ใช่ "ไม่มีงวดถึงรอบ"
  assert.match(block, /if \(error\) \{/);
  assert.match(block, /42703/);
  assert.doesNotMatch(block, /toISOString\(\)\.slice/);
});
