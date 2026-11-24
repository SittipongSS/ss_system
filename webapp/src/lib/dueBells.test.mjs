// ── งวด 3 วันกำหนด: กระดิ่ง "เลยกำหนด" สี่เรื่อง (มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §11) ──────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DUE_BELL_LOOKBACK_DAYS, dueBellFresh, dueNewlyLate, previousWeekday } from '@/lib/dueState';
import {
  OVERDUE_FN_HREF, OVERDUE_FN_KIND, OVERDUE_KIND, overdueCandidates, overdueDedupeKey, overdueNotices,
} from '@/lib/sales/billingDueNotify';
import { REQUEST_OVERDUE_KIND, requestOverdueNotices } from '@/lib/requests/dueBell';
import { TASK_OVERDUE_KIND, taskOverdueNotices } from '@/lib/pm/taskDueBell';
import { renewalNotices } from '@/lib/service/renewalNotify';
import { NOTIFICATION_BOXES, SALES_ORDER_BELL_KINDS } from '@/lib/notifications';

const TUE = '2026-11-24';
const MON = '2026-11-23';

/* ── ตัวกลาง ─────────────────────────────────────────────────────────────────── */

test('หน้าต่างกระดิ่ง: เลย 1..7 วันเท่านั้น — วันครบเองยังไม่เลย · เลยเกิน 7 วันไม่ยิงย้อน (มติ 24/11/2026)', () => {
  assert.equal(DUE_BELL_LOOKBACK_DAYS, 7);
  assert.equal(dueBellFresh(TUE, TUE), false, 'ครบวันนี้ยังไม่เลย');
  assert.equal(dueBellFresh('2026-11-23', TUE), true, 'เลย 1 วัน');
  assert.equal(dueBellFresh('2026-11-17', TUE), true, 'เลย 7 วัน');
  assert.equal(dueBellFresh('2026-11-16', TUE), false, 'เลย 8 วัน = ของเก่า ไม่ยิงย้อน');
  assert.equal(dueBellFresh(null, TUE), false);
});

test('"เพิ่งเลยตั้งแต่เช้าที่แล้ว" — จันทร์รวมศุกร์–อาทิตย์ · อังคารคือเมื่อวานวันเดียว (แถว FN นับงวดละเช้าเดียว)', () => {
  assert.equal(previousWeekday(MON), '2026-11-20');
  assert.equal(previousWeekday(TUE), '2026-11-23');
  assert.deepEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map((d) => dueNewlyLate(d, MON)),
    [false, true, true, true, false]);
  assert.deepEqual(['2026-11-22', '2026-11-23', '2026-11-24'].map((d) => dueNewlyLate(d, TUE)), [false, true, false]);
});

/* ── งวดชำระ ─────────────────────────────────────────────────────────────────── */

const order = (over = {}) => ({
  id: 'SOR-1', orderNumber: 'SO-26100001-0', status: 'approved', origin: 'pipeline',
  quotationId: 'QT-1', quotation: { id: 'QT-1', status: 'accepted' }, totalAmount: 100000,
  customerId: 'C-1', customerName: 'บริษัท ก จำกัด', ownerId: 'U-SO', dealId: 'D-1', deal: { id: 'D-1', ownerId: 'U-AE' },
  ...over,
});
const inst = (over = {}) => ({
  id: 'SOI-1', salesOrderId: 'SOR-1', seq: 2, label: 'งวดสุดท้าย', amount: 50000, status: 'pending', kind: 'regular',
  frozenAt: '2026-10-01T03:00:00Z', refundedAt: null, paidOn: null, billingDate: '2026-11-15', billingEvent: null,
  dueDate: '2026-11-23', ...over,
});
const CUSTOMERS = new Map([['C-1', { id: 'C-1', arCode: 'AR-001' }], ['C-109', { id: 'C-109', arCode: 'AR-109' }]]);
const DIRECTORY = new Map([
  ['F1', { id: 'F1', role: 'finance', department: 'FN', disabled: false }],
  ['U-AE', { id: 'U-AE', role: 'sales', disabled: false }],
]);
const moneyCtx = (over = {}) => ({
  todayIso: TUE, ordersById: new Map([['SOR-1', order()]]), customersById: CUSTOMERS, skipArCodes: ['AR-109'], directory: DIRECTORY, ...over,
});

test('งวดเลยกำหนด: ตัวตัดสินเดียวกับป้ายแดง — จ่ายแล้ว/รอเหตุการณ์/งวดร่าง/รับรองแล้ว ไม่ยิง', () => {
  const pick = (rows, over) => overdueCandidates(rows, moneyCtx(over)).map((c) => c.installment.id);
  assert.deepEqual(pick([inst()]), ['SOI-1']);
  assert.deepEqual(pick([inst({ paidOn: '2026-11-23' })]), [], 'ลูกค้าแจ้งจ่ายแล้ว');
  assert.deepEqual(pick([inst({ paidOn: '2026-11-23', status: 'rejected' })]), ['SOI-1'], 'บัญชีตีกลับ = ยังไม่จ่าย');
  assert.deepEqual(pick([inst({ billingEvent: 'before_delivery', billingDate: null })]), [], 'งวดรอเหตุการณ์');
  assert.deepEqual(pick([inst({ frozenAt: null })]), [], 'งวดร่าง');
  assert.deepEqual(pick([inst({ status: 'confirmed' })]), []);
  assert.deepEqual(pick([inst({ dueDate: TUE })]), [], 'ครบวันนี้ = กระดิ่งครบกำหนด ไม่ใช่เลยกำหนด');
  assert.deepEqual(pick([inst({ dueDate: '2026-11-10' })]), [], 'เลยเกิน 7 วัน ไม่ยิงย้อน');
  assert.deepEqual(pick([inst()], { ordersById: new Map([['SOR-1', order({ customerId: 'C-109' })]]) }), [], 'สหมิตร (เงินนอกระบบ)');
  assert.deepEqual(pick([inst()], { ordersById: new Map([['SOR-1', order({ status: 'cancelled' })]]) }), [], 'ใบยกเลิก');
});

test('งวดเลยกำหนด: ขาย = เจ้าของดีล + เจ้าของใบ ครั้งเดียวต่องวดต่อกำหนดชำระ · FN แถวสรุปเฉพาะงวดที่เพิ่งเลย', () => {
  const { sales, fn } = overdueNotices([inst(), inst({ id: 'SOI-2', seq: 1, dueDate: '2026-11-20', amount: 1000 })], moneyCtx());
  assert.equal(sales.length, 2);
  const [first] = sales;
  assert.deepEqual(first.userIds, ['U-AE', 'U-SO']);
  assert.equal(first.kind, OVERDUE_KIND);
  assert.match(first.title, /^เลยกำหนดชำระ 4 วัน · SO-26100001-0 งวด 1/);
  assert.equal(sales[1].dedupeKey, overdueDedupeKey('SOI-1', '2026-11-23'));
  assert.notEqual(overdueDedupeKey('SOI-1', '2026-11-23'), overdueDedupeKey('SOI-1', '2026-11-30'), 'แก้กำหนดชำระแล้วเลยอีก = เตือนใหม่');
  assert.equal(sales[1].href, '/sa/sales-orders/SOR-1?tab=payment');
  // FN: อังคาร = เพิ่งเลยเมื่อวาน (23/11) งวดเดียว · งวดที่เลยตั้งแต่ 20/11 ถูกนับไปแล้วเช้าวันจันทร์
  assert.equal(fn.kind, OVERDUE_FN_KIND);
  assert.deepEqual(fn.userIds, ['F1']);
  assert.match(fn.title, /^เลยกำหนดชำระใหม่ · 1 งวด/);
  assert.equal(fn.href, OVERDUE_FN_HREF);
  assert.equal(overdueNotices([inst({ dueDate: '2026-11-20' })], moneyCtx()).fn, null, 'ไม่มีงวดเพิ่งเลย = ไม่มีแถว FN');
});

test('kind ใหม่ของงวดเลยกำหนดอยู่ในกระดิ่ง · ลิงก์ FN ตรงตัวกรองของทะเบียน', () => {
  assert.ok(SALES_ORDER_BELL_KINDS.includes(OVERDUE_KIND));
  assert.ok(SALES_ORDER_BELL_KINDS.includes(OVERDUE_FN_KIND));
  const page = readFileSync('src/app/finance/payments/page.js', 'utf8');
  assert.match(page, /params\.get\("overdue"\) === "1"/, 'ทะเบียนต้องอ่าน ?overdue=1');
});

/* ── คำร้อง ──────────────────────────────────────────────────────────────────── */

const request = (over = {}) => ({
  id: 'RQ-1', docNo: 'RQ-SD-26110001', title: 'ขอพัฒนากลิ่น', kind: 'scent_dev', status: 'acknowledged',
  committedDueDate: '2026-11-21', assigneeId: 'U-RD', assigneeName: 'RD หนึ่ง', acknowledgedById: 'U-HEAD',
  requestedById: 'U-AE', items: [{ id: 'I1', requestId: 'RQ-1', createdAt: '2026-11-01T03:00:00Z', ackAt: '2026-11-02T03:00:00Z' }],
  ...over,
});

test('คำร้องเลยวันรับปาก: ส่งผู้ถือใบคนเดียว (มอบหมาย › คนกดรับ) · ผู้ขอไม่ได้', () => {
  const [notice] = requestOverdueNotices([request()], { todayIso: TUE });
  assert.deepEqual(notice.userIds, ['U-RD']);
  assert.equal(notice.kind, REQUEST_OVERDUE_KIND);
  assert.equal(notice.entityType, 'dept_request');
  assert.match(notice.title, /^คำร้องเลยกำหนด 3 วัน · RQ-SD-26110001/);
  assert.equal(notice.dedupeKey, 'request_overdue:RQ-1:2026-11-21');
  assert.equal(notice.href, '/requests/RQ-1');
  const [ack] = requestOverdueNotices([request({ assigneeId: null, assigneeName: '' })], { todayIso: TUE });
  assert.deepEqual(ack.userIds, ['U-HEAD'], 'ยังไม่มอบหมาย = คนที่กดรับเรื่อง');
});

test('คำร้อง: ไม่มีวันรับปาก · ไม่มีผู้ถือใบ · บัญชีปิด · เลยเกิน 7 วัน = ไม่ยิง · ใบประเมินพาไปจอฝ่ายบริการ', () => {
  assert.deepEqual(requestOverdueNotices([request({ committedDueDate: null })], { todayIso: TUE }), []);
  assert.deepEqual(requestOverdueNotices([request({ assigneeId: null, assigneeName: '', acknowledgedById: null })], { todayIso: TUE }), []);
  assert.deepEqual(requestOverdueNotices([request()], { todayIso: TUE, directory: new Map([['U-RD', { disabled: true }]]) }), []);
  assert.deepEqual(requestOverdueNotices([request({ committedDueDate: '2026-11-10' })], { todayIso: TUE }), []);
  const [survey] = requestOverdueNotices([request({ kind: 'site_survey', committedResultDate: '2026-11-21' })], { todayIso: TUE });
  assert.equal(survey.href, '/service/surveys/RQ-1');
});

test('คำร้อง: ตาผู้ขอไม่ยิง — ตัวตัดสินเดียวกับคิว (`requestDueOwed`)', () => {
  // ตัดคอมเมนต์ก่อน — หัวไฟล์เล่าว่าทำไมใบประเมินไม่ใช้ committedDueDate (คำอธิบาย ไม่ใช่โค้ดที่อ่านค่า)
  const src = readFileSync('src/lib/requests/dueBell.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(src, /requestDueOwed\(request\)/);
  assert.doesNotMatch(src, /committedDueDate/, 'ห้ามอ่านวันรับปากดิบ — ต้องผ่าน requestDueOwed (ตา · รอบแก้ · ใบจบ)');
});

/* 🐞 รีวิว 24/11/2026 ก่อน cron เช้าแรก: ใบประเมินพื้นที่ `committedDueDate` = **วันนัดเข้าพื้นที่** · กำหนดของใบคือวันส่งผล */
test('ใบประเมินพื้นที่: นับวันส่งผลที่ TS รับปาก ไม่ใช่วันนัด — วันนัดผ่านแล้วแต่ผลยังไม่ถึงกำหนด = ไม่ยิง', () => {
  const survey = (over) => request({ kind: 'site_survey', docNo: 'RQ-SV-26110001', committedDueDate: '2026-11-23', ...over });
  assert.deepEqual(requestOverdueNotices([survey({ committedResultDate: '2026-11-27' })], { todayIso: TUE }), [],
    'นัด 23/11 ส่งผล 27/11 · วันนี้ 24/11 = ยังไม่เลย');
  assert.deepEqual(requestOverdueNotices([survey({ committedResultDate: null })], { todayIso: TUE }), [],
    'ยังไม่แจ้งวันส่งผล = ไม่ยิง (ไม่ถอยไปวันนัด)');
  const [late] = requestOverdueNotices([survey({ committedResultDate: '2026-11-22' })], { todayIso: TUE });
  assert.equal(late.dedupeKey, 'request_overdue:RQ-1:2026-11-22');
  assert.match(late.title, /^คำร้องเลยกำหนด 2 วัน · RQ-SV-26110001/);
  assert.match(late.body, /รับปากส่งผล/);
  assert.equal(late.href, '/service/surveys/RQ-1');
});

test('คำร้อง: โหลดแถวของใบไม่ขึ้น (ไม่มี items) = ตัดสินตาไม่ได้ ⇒ ไม่ยิง (ไม่เดาว่าเป็นตาฝ่าย)', () => {
  const { items: _items, ...bare } = request();
  assert.deepEqual(requestOverdueNotices([bare], { todayIso: TUE }), []);
  const cron = readFileSync('src/app/api/cron/daily-digest/route.js', 'utf8');
  assert.match(cron, /committedResultDate/, 'หน้าต่างของ cron ต้องดึงใบประเมินตามวันส่งผลด้วย');
  assert.match(cron, /โหลดแถวของคำร้องไม่สำเร็จ/, 'โหลดแถวพังต้องขึ้นเป็น error ของรอบ');
  assert.match(cron, /status\.is\.null,status\.neq\.Completed/, 'งานที่ status ว่างยังไม่เสร็จ — .neq ตัด NULL ทิ้ง');
});

/* ── งานของฉัน ───────────────────────────────────────────────────────────────── */

const task = (over = {}) => ({ id: 'T-1', title: 'โทรตามลูกค้า', status: 'In Progress', dueDate: '2026-11-22', ownerId: 'U-LEAD', assigneeId: 'U-AE', proxyBy: null, ...over });

test('งานเลยกำหนด: ผู้รับผิดชอบคนเดียว (ดึงมาทำแทน › มอบหมาย › เจ้าของ) · รอคนอื่น/เสร็จ/เลยเกิน 7 วัน ไม่ยิง', () => {
  const [notice] = taskOverdueNotices([task()], { todayIso: TUE });
  assert.deepEqual(notice.userIds, ['U-AE']);
  assert.equal(notice.kind, TASK_OVERDUE_KIND);
  assert.equal(notice.entityType, 'personal_task');
  assert.equal(notice.dedupeKey, 'task_overdue:T-1:2026-11-22');
  assert.match(notice.title, /^งานเลยกำหนด 2 วัน · โทรตามลูกค้า/);
  assert.deepEqual(taskOverdueNotices([task({ proxyBy: 'U-X' })], { todayIso: TUE })[0].userIds, ['U-X']);
  assert.deepEqual(taskOverdueNotices([task({ assigneeId: null })], { todayIso: TUE })[0].userIds, ['U-LEAD']);
  assert.deepEqual(taskOverdueNotices([task({ status: 'Blocked' })], { todayIso: TUE }), [], 'รอคนอื่น = ม่วงบนจอ ไม่ใช่แดง');
  assert.deepEqual(taskOverdueNotices([task({ status: 'Completed' })], { todayIso: TUE }), []);
  assert.deepEqual(taskOverdueNotices([task({ dueDate: '2026-11-01' })], { todayIso: TUE }), []);
  assert.deepEqual(taskOverdueNotices([task({ dueDate: TUE })], { todayIso: TUE }), [], 'ครบวันนี้ยังไม่เลย');
});

test('kind งานเลยกำหนดอยู่ในกระดิ่ง (งานไม่อยู่ใน entityTypes — ต้องเข้าทาง kinds)', () => {
  assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(TASK_OVERDUE_KIND));
  assert.ok(!NOTIFICATION_BOXES.bell.entityTypes.includes('personal_task'));
});

/* ── ต่อรอบบริการ ──────────────────────────────────────────────────────────────── */

const renewal = (over = {}) => ({
  siteId: 'ST1', site: { name: 'ไซต์ A' }, endDate: '2026-11-20', daysLeft: -4, state: 'expired',
  deal: { ownerId: 'U-AE' }, followup: null, ...over,
});

test('ต่อรอบบริการ: "หมดแล้ว" ใช้กุญแจของตัวเอง (เดิมชนกับ "ใกล้หมด" จนไม่เคยมา) · ไม่ยิงย้อนไซต์ที่หมดเกิน 7 วัน', () => {
  const [expired] = renewalNotices([renewal()]);
  assert.equal(expired.dedupeKey, 'renewal_expired:ST1:2026-11-20');
  assert.match(expired.title, /หมดแล้ว/);
  const [soon] = renewalNotices([renewal({ state: 'due_soon', daysLeft: 10, endDate: '2026-12-04' })]);
  assert.equal(soon.dedupeKey, 'renewal:ST1:2026-12-04', 'กุญแจใกล้หมดคงรูปเดิม — แถวที่ยิงไปแล้วไม่เด้งซ้ำ');
  assert.deepEqual(renewalNotices([renewal({ daysLeft: -8, endDate: '2026-11-16' })]), [], 'หมดมานาน = ดูจากทะเบียน');
  assert.equal(renewalNotices([renewal({ daysLeft: -7, endDate: '2026-11-17' })]).length, 1);
});

test('ต่อรอบบริการ: เจ้าของดีลที่ปิดบัญชีแล้วไม่ได้กระดิ่ง · ไม่รู้จัก ≠ ปิดบัญชี', () => {
  assert.deepEqual(renewalNotices([renewal()], { directory: new Map([['U-AE', { disabled: true }]]) }), []);
  assert.equal(renewalNotices([renewal()], { directory: new Map() }).length, 1);
});

test('ต่อรอบบริการ: กวาดจาก cron ไม่ใช่ตอนเปิดทะเบียน (GET ไม่เขียนข้อมูลแล้ว)', () => {
  const route = readFileSync('src/app/api/sales-planning/renewals/route.js', 'utf8');
  assert.doesNotMatch(route, /sweepRenewalNotices|sendRenewalNotices|notifyUsers/);
  const cron = readFileSync('src/app/api/cron/daily-digest/route.js', 'utf8');
  for (const step of ['notifyInstallmentOverdue', 'notifyRequestOverdue', 'notifyTaskOverdue', 'notifyRenewals']) {
    assert.match(cron, new RegExp(`results\\.\\w+ = await ${step}\\(supabase\\)`), `cron ต้องเรียก ${step}`);
  }
  assert.match(cron, /loadRenewalContext\(supabase, null\)/, 'cron เห็นทุกไซต์ (ไม่ตัดขอบเขตของใคร)');
});
