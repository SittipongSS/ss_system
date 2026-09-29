// ── กำหนดวางบิลรอบสอง (มติเจ้าของ 26/09) — จอ SO ─────────────────────────────────────────────────────────────
// สามเรื่อง:
//   1. "กำหนดชำระ" บนหัวใบ SO + บรรทัด "กำหนด …" / การเรียงของรายการ SO อ่านจาก **งวด** (installmentsNextDue)
//      ไม่ใช่ `sales_orders.paymentDueDate` ค่าตาย (SO-26080050-0 หัวใบ 05/09 ทั้งที่งวดบอก 25 ต.ค.)
//   2. ชื่องวดสั้นห้ามแตกบรรทัด ("งวด / สุดท้าย" ตอนคอลัมน์วันวางบิลกว้าง)
//   3. "จัดวันใหม่ตามรอบปัจจุบัน…" — ตัวคิด `planRedate` บนแผง (ร่างลงตาราง → schedule-many) · คำร้องสดชุดเดียวกับป้าย
//      ⚠️ action `redate-billing` ของ route **ถอดแล้ว** (รุ่นสี่ §7.5 · 410) — ตัวตรวจแผน/ตัวเขียนฝั่ง server ถูกลบ
//      ลูกค้าเปลี่ยนกติกา = จอ "งวดที่วันจะเปลี่ยน" (customerRuleChange.test.mjs)
// + ยามต้นทาง (อ่าน source): route/จอ/หน้าใบ ต่อสายครบ — พิสูจน์แค่ "โค้ดนี้ยังอยู่ตรงนี้" (ตัดคอมเมนต์ก่อน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  billingRequestedIds, installmentActionError, installmentScheduleAllowed, installmentsNextDue, paymentRollup,
  salesOrderPaymentCell,
} from './salesOrderPayments.js';
import { planRedate } from './billingRule.js';

// ── 1. กำหนดชำระถัดไปจากงวด ─────────────────────────────────────────────────────────────────────────
test('installmentsNextDue: วันใกล้สุดของงวดที่ยังไม่รับรอง (รวมเลยกำหนด · รวม reported) · ไม่มี = null', () => {
  const rows = [
    { id: 'a', status: 'confirmed', dueDate: '2026-08-01' },
    { id: 'b', status: 'reported', dueDate: '2026-09-10' },
    { id: 'c', status: 'pending', dueDate: '2026-10-25' },
    { id: 'd', status: 'pending', dueDate: null },
  ];
  assert.equal(installmentsNextDue(rows), '2026-09-10', 'แจ้งแล้วแต่บัญชียังไม่รับรอง = เงินยังไม่เข้า (กติกาเดียวกับ "เลยกำหนด")');
  assert.equal(installmentsNextDue([rows[0], rows[3]]), null, 'รับรองครบ/ไม่มีงวดที่มีวัน = ขีด');
  assert.equal(installmentsNextDue([]), null);
  assert.equal(installmentsNextDue(null), null);
  assert.equal(paymentRollup(rows, '2026-09-26').nextDue, '2026-09-10', 'แผงงวดกับหัวใบตัวเดียวกัน');
});

test('🔴 salesOrderPaymentCell.nextDue: ตัวเดียวกับหัวใบ · งวดโมฆะของใบยกเลิกไม่นับ · ยังไม่เริ่มติดตาม = null (ไม่ถอยไปอ่าน paymentDueDate)', () => {
  const plan = { type: 'installment', installments: [{ label: 'ก', percent: 50 }, { label: 'ข', percent: 50 }] };
  const rows = [
    { id: 'c', seq: 1, status: 'confirmed', amount: 500, dueDate: '2026-08-05' },
    { id: 'p', seq: 2, status: 'pending', amount: 500, dueDate: '2026-10-25' },
  ];
  assert.equal(salesOrderPaymentCell(rows, plan, '2026-09-26', 1000, 'approved').nextDue, '2026-10-25');
  assert.equal(salesOrderPaymentCell([{ ...rows[0] }, { ...rows[1], status: 'reported' }], plan, '2026-09-26', 1000, 'approved').nextDue,
    '2026-10-25');
  // ใบยกเลิก: งวดรอชำระเป็นโมฆะ ⇒ ไม่มีวันให้ตาม
  assert.equal(salesOrderPaymentCell(rows, plan, '2026-09-26', 1000, 'cancelled').nextDue, null);
  // ใบที่ยังไม่มีงวดจริง (แผน QT) — ไม่มีวัน
  const untracked = salesOrderPaymentCell([], plan, '2026-09-26', 1000, 'approved');
  assert.equal(untracked.tracked, false);
  assert.equal(untracked.nextDue, null);
});

// ── 3. จัดวันใหม่ตามรอบปัจจุบัน ─────────────────────────────────────────────────────────────────────
// ลูกค้าเปลี่ยนจาก "วางบิลวันที่ 20" เป็น "วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25" (เดือนเดียวกัน) · วันนี้ 26 ก.ย. 2026
const RULE = { billing: { mode: 'monthly', day: 5 }, payment: { mode: 'monthly', day: 25, monthOffset: 0 } };
const TODAY = '2026-09-26';
const REQUESTS = new Map([
  ['RQ-L', { id: 'RQ-L', status: 'pending' }],
  ['RQ-D', { id: 'RQ-D', status: 'draft' }],
  ['RQ-C', { id: 'RQ-C', status: 'cancelled' }],
]);
const rows = () => [
  { id: 'I1', seq: 1, status: 'pending', billingDate: '2026-09-20', dueDate: '2026-10-25', updatedAt: 't1' },
  { id: 'I2', seq: 2, status: 'pending', billingDate: '2026-10-20', dueDate: '2026-11-25', updatedAt: 't2' },
  // ขอใบวางบิลแล้ว (คำร้องส่งถึงบัญชี) — บัญชีออกใบตามวันเดิมไปแล้ว ห้ามย้ายเงียบ ๆ
  { id: 'I3', seq: 3, status: 'pending', billingDate: '2026-11-20', dueDate: '2026-12-25', billingRequestId: 'RQ-L', updatedAt: 't3' },
  { id: 'I4', seq: 4, status: 'pending', billingDate: null, dueDate: null, billingRequestId: 'RQ-D', updatedAt: 't4' },
];
const requested = (list = rows(), requests = REQUESTS) => billingRequestedIds(list, requests);

test('billingRequestedIds: คำร้องที่ส่งถึงบัญชีและยังไม่ยกเลิกเท่านั้น — ร่าง/ยกเลิก/หาไม่เจอ = ยังไม่ขอ (billingRequestLive)', () => {
  const list = [
    { id: 'A', billingRequestId: 'RQ-L' },
    { id: 'B', billingRequestId: 'RQ-D' },
    { id: 'C', billingRequestId: 'RQ-C' },
    { id: 'D', billingRequestId: 'RQ-GONE' },
    { id: 'E', billingRequestId: null },
  ];
  assert.deepEqual([...billingRequestedIds(list, REQUESTS)], ['A']);
  assert.deepEqual([...billingRequestedIds(list, new Map())], []);
  assert.deepEqual([...billingRequestedIds(null)], []);
});

test('🔴 ใบที่มีวันนี้ (มีแต่กำหนดชำระ — 0389 ไม่เติมย้อนหลัง) ยังมีวันเดิมให้แทน · ใบที่ว่างทั้งสองช่องไม่มี (ปุ่มจัดใหม่ไม่ซ้ำกับเติมตามรอบ)', () => {
  // SO-26080050-0: SA กรอกวันวางบิล (5 ก.ย.) ลงกำหนดชำระ ⇒ แดง "เลยกำหนด" · เติมตามรอบคงวันนี้ไว้ (keptDue) — จัดใหม่ต้องแทนได้
  const legacy = [
    { id: 'L1', seq: 1, status: 'pending', billingDate: null, dueDate: '2026-09-05', updatedAt: 't1' },
    { id: 'L2', seq: 2, status: 'pending', billingDate: null, dueDate: '2026-10-05', updatedAt: 't2' },
  ];
  const plan = planRedate(RULE, legacy, TODAY, { requestedIds: requested(legacy) }).rows;
  assert.deepEqual(plan.map((r) => [r.id, r.prevBillingDate, r.billingDate, r.prevDueDate, r.dueDate]), [
    ['L1', null, '2026-10-05', '2026-09-05', '2026-10-25'],
    ['L2', null, '2026-11-05', '2026-10-05', '2026-11-25'],
  ]);
  assert.equal(plan.some((r) => r.prevBillingDate), false, 'เงื่อนไขเดิม (วันวางบิลเดิมอย่างเดียว) = ปุ่มหายจากใบนี้');
  assert.equal(plan.some((r) => r.prevBillingDate || r.prevDueDate), true, 'เงื่อนไขของแผง: มีวันเดิมให้แทน = ปุ่มขึ้น');
  const blank = legacy.map((r) => ({ ...r, dueDate: null }));
  const blankPlan = planRedate(RULE, blank, TODAY, { requestedIds: requested(blank) }).rows;
  assert.equal(blankPlan.length, 2);
  assert.equal(blankPlan.some((r) => r.prevBillingDate || r.prevDueDate), false, 'ว่างทั้งใบ = งานของ "เติมตามรอบ" ปุ่มเดียว');
});

test('installmentScheduleAllowed = ด่านสิทธิ์ของ schedule ตัวเดียว (ฝ่ายขายแก้ใบได้ · ฝ่ายบัญชี) — ปุ่มระดับใบไม่มีสิทธิ์ = ไม่วาด', () => {
  const row = { id: 'I1', status: 'pending' };
  const people = [
    [{ id: 'sa', role: 'ae' }, true],
    [{ id: 'fn', role: 'finance', department: 'FN' }, true],
    [{ id: 'pc', role: 'pc', department: 'PC' }, false],
    [{ id: 'x', role: 'finance', department: 'SA' }, false],
  ];
  for (const [user, allowed] of people) {
    assert.equal(installmentScheduleAllowed(user), allowed, user.id);
    assert.equal(!installmentActionError(row, 'schedule', user), allowed, `ด่าน schedule ต้องตอบตรงกัน: ${user.id}`);
  }
});

// ── ยามต้นทาง ────────────────────────────────────────────────────────────────────────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}
const ROUTE = 'app/api/sales-planning/sales-orders/[id]/installments/route.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const SO_PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const SO_LIST = 'app/sales-planning/sales-orders/page.js';
const FILL = 'components/salesPlanning/installmentDates/InstallmentDateFill.js';
const EDITOR = 'components/salesPlanning/installmentDates/InstallmentDateEditor.js';
const CHROME = 'components/salesPlanning/installmentDates/InstallmentDateChrome.js';
const DRAFTS = 'lib/sales/installmentDateDrafts.js';

test('route งวด: redate-billing ถอดแล้ว (410) · ตัวอ่านคำร้องของทางเขียนวันงวดอยู่ที่ installmentScheduleServer ตัวเดียว (อ่านสดแบบโยน)', () => {
  const route = code(ROUTE);
  const patch = slice(route, 'export const PATCH');
  const retired = patch.indexOf('if (RETIRED_BILLING_ACTIONS.includes(action)) return fail(RETIRED_BILLING_MESSAGE, 410);');
  assert.ok(retired > 0 && retired < patch.indexOf('if (!installmentId) return badRequest('),
    'แท็บเก่าได้ 410 "โหลดหน้าใหม่" — ไม่ใช่ 400 ที่ชี้ทางผิด');
  assert.doesNotMatch(route, /async function (redateBillingDates|loadBillingRequestedIds|loadCustomerBillingRule)\(/,
    'ตัวอ่านย้ายไป lib ตัวเดียว — route งวด · PATCH กติกาลูกค้า · redate อ่านคำร้องชุดเดียวกัน');
  assert.match(route, /import \{ billingSkipReady, loadBillingRequestedIds, loadScheduleRule \} from '@\/lib\/sales\/installmentScheduleServer';/);
  const loader = slice(code('lib/sales/installmentScheduleServer.js'), 'export async function loadBillingRequestedIds(', '\n}\n');
  assert.match(loader, /\.from\('dept_requests'\)\.select\('id, status'\)\.in\('id', chunk\)\.eq\('kind', 'billing_doc'\)\s*\.order\('id', \{ ascending: true \}\)/,
    'ชุดคำร้องเดียวกับที่หน้าใบโหลดให้แผง (billing_doc) — ไม่งั้นแผนจอกับ server ต่างกันถาวร');
  assert.doesNotMatch(loader, /\.neq\('status'/, 'คำร้องที่ยกเลิกต้องอ่านมาให้ตัวตัดสินเห็น');
  assert.match(loader, /fetchInChunks\(ids, \(chunk\) => fetchAllResult\(/, 'ไล่หน้า + ซอยก้อน (rowcap · URL 16 KB)');
  assert.match(loader, /if \(error\) throw error;/, 'อ่านคำร้องพลาด ≠ ยังไม่ขอ');
  assert.match(loader, /return billingRequestedIds\(rows, new Map\(/);
});

test('แผงงวด: จัดวันใหม่ย้ายเข้าแผงเติมของโหมดตั้งวัน (สวิตช์ "จัดใหม่งวดที่มีวันแล้วด้วย") · คำร้องชุดเดียวกับป้าย · ทับกำหนดชำระต้องบอก · แก้รายงวดยังอยู่', () => {
  const panel = code(PANEL);
  const fill = code(FILL);
  const drafts = code(DRAFTS);
  // งวดที่ขอใบวางบิลแล้ว = ล็อกในโหมด (ตัดสินด้วย billingRequestLive ชุดเดียวกับป้าย) ⇒ ตัวคิดเห็นเป็นสถานะ 'locked' ไม่ถูกแตะ
  assert.match(panel, /const requestedIds = billingRequestedIds\(saved, requestById\);/);
  assert.match(panel, /requested: requestedIds\.has\(row\.id\),/);
  assert.match(drafts, /status: isLocked\(row\) \? 'locked' : \(row\.status \|\| 'pending'\),/);
  assert.match(drafts, /\? planRedate\(rule, rows, todayIso, \{ roundIndex: option\.roundIndex \?\? null \}\)/,
    'สวิตช์จัดใหม่ของลูกค้ามีรอบ = planRedate (ผลการอ่านรุ่นสี่ตัวเดียว · งวดที่ติ๊กไม่ต้องวางบิลส่งเป็นล็อก)');
  assert.match(drafts, /if \(includeDated\) return inputRows\.filter\(\(row\) => installmentBillingRedatable\(row\) && !roundsSkip\(row\)\);/);
  // ปุ่มบนการ์ด + โมดัล "จัดวันใหม่ตามรอบปัจจุบัน…" ถอดแล้ว — จอไม่เรียก redate-billing
  assert.doesNotMatch(panel, /จัดวันใหม่ตามรอบปัจจุบัน…|onRedateBilling|redate-billing|planRedate\(/);
  assert.match(fill, /role="switch" aria-checked=\{includeDated\}/);
  assert.match(fill, /จัดใหม่งวดที่มีวันแล้วด้วย \(\{dated\} งวด\)/);
  assert.match(fill, /mode\.applyFill\(\{ includeDated: !includeDated, choice: null \}, null\)/, 'สลับสวิตช์ = ย้อนร่างกลับฐาน ไม่ซ้อนผลเก่า');
  // กำหนดชำระใหม่แทนวันเดิม — ป้ายแดง/ด่านนัดช่างอ่านช่องนี้ ⇒ บอกทั้งในตัวแก้ (ทันทีใต้ช่อง) และบนแถบบันทึก (นับงวด)
  assert.match(code(EDITOR), /ทับกำหนดชำระเดิม \$\{formatBillingDate\(saved\.dueDate\)\} — ป้ายเลยกำหนดและด่านนัดช่างนับจากวันใหม่ทันที/);
  assert.match(code(CHROME), /แทนกำหนดชำระเดิม \{replaced\} งวด — ป้ายเลยกำหนดและด่านนัดช่างนับจากวันใหม่ทันทีที่บันทึก/);
  assert.match(code(CHROME), /<Button tone="primary" disabled=\{mode\.busy \|\| Boolean\(mode\.saveBlocker\)\} onClick=\{mode\.save\}>/,
    'ปุ่มยืนยันเดียว (navy) · ดับเมื่อเกินเพดานงวดต่อครั้งของ route พร้อมเหตุ');
  // มติ 26/09: วันที่ระบบแนะนำต้องแก้เองได้เสมอ — ตัวแก้มี "วันอื่น" + ช่องกำหนดชำระที่แก้ได้เสมอ · เมนูแถวพาเข้าโหมด
  assert.match(panel, /id: "dates", icon: CalendarClock, label: "ตั้งวันงวด",/);
  assert.match(code(DRAFTS), /round: 'ตามรอบ', other: 'วันอื่น', follow: 'ต่อจากงวดก่อน'/);
  assert.match(code(EDITOR), /label: VIEW_LABELS\[value\],/);
  assert.match(code(EDITOR), /<DateInput weekday value=\{v\.dueDate\}/);
  // ชื่องวดสั้นไม่แตกบรรทัด
  assert.match(panel, /<InstallmentLabel label=\{row\.label\} \/>/);
  assert.match(panel, /text\.length <= LABEL_NOWRAP_MAX\s*\? <strong className=\{styles\.nowrap\}>/);
  const page = code(SO_PAGE);
  assert.match(page, /json: \{ action: "schedule-many", rows \}/);
  assert.doesNotMatch(page, /action: "redate-billing"|onRedateBilling/);
});

test('🔴 หัวใบ + รายการ SO: กำหนดชำระมาจากงวด (nextDue) — ไม่อ่าน paymentDueDate ค่าตายบนจอ', () => {
  const page = code(SO_PAGE);
  assert.match(page, /label: "กำหนดชำระ",\s*value: paymentSummary\.nextDue \? fmtDate\(paymentSummary\.nextDue\) : NA,/);
  assert.doesNotMatch(page, /fmtDate\(order\.paymentDueDate\)/);
  const list = code(SO_LIST);
  assert.match(list, /const aDue = a\.payment\?\.nextDue \|\| null;/);
  assert.match(list, /const bDue = b\.payment\?\.nextDue \|\| null;/);
  assert.match(list, /กำหนด \{row\.payment\?\.nextDue \? fmtDate\(row\.payment\.nextDue\) : NA\}/);
  assert.doesNotMatch(list, /paymentDueDate/);
});
