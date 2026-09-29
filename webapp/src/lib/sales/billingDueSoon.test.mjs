// ── กระดิ่ง "ครบกำหนดชำระ" (รุ่นสี่ · system-design §6 ช่วง 4a · มติเจ้าของ 28–29/09) ─────────────────────────────
// ⭐ ตรึงห้าเรื่อง:
//   1. ทุกงวดที่มีกำหนดชำระ 0..3 วัน ได้กระดิ่ง — มี/ไม่มีวันวางบิล · ขอใบแล้วก็ยังเตือน (ขอใบ ≠ ได้เงิน) · รอเหตุการณ์ = เงียบ
//   2. วันวางบิล = กำหนดชำระ และกระดิ่งวางบิลยิงอยู่ ⇒ ฝั่งขายได้กระดิ่งเดียว (แถววางบิลบอก "ครบกำหนดชำระวันเดียวกัน")
//      แต่แถวสรุป FN / `?due=soon` ยังนับงวดนั้น (หัวข้อ = แถวที่ลิงก์เปิดมาเจอ)
//   3. "ยังไม่มีวันวางบิล" ต่อท้ายเฉพาะลูกค้าที่ต้องวางบิลจริง — ไม่ต่อท้ายงวดที่ติ๊ก / รูปเดิม { credit:false } / ไม่ต้องวางบิล
//   4. ด่านระดับใบชุดเดียวกับกระดิ่งวางบิล (ใบยกเลิก · ร่างที่ QT ตาย · ใบย้อนหลังยังไม่อนุมัติ · สหมิตร · งวดร่าง · งวดยกมา)
//   5. สายไฟ: kind อยู่ในกระดิ่ง · cron มีบล็อก try ของตัวเอง กรองที่กำหนดชำระ · เลือก billingSkip ได้ก่อน/หลังรัน 0393
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_DUE_KIND, BILLING_DUE_SAME_DAY_TEXT, DUE_SOON_FN_HREF, DUE_SOON_FN_KIND, DUE_SOON_KIND, DUE_SOON_MISSING_BILLING_TEXT,
  billingDueAction, billingDueActionOpen, billingDueCandidates, billingDueNotice, billingDueNotices, dueSoonCandidates,
  dueSoonDedupeKey, dueSoonFnDedupeKey, dueSoonFnNotice, dueSoonNotice, dueSoonNotices,
} from '@/lib/sales/billingDueNotify';
import { BELL, DUE_REMIND_DAYS, LEDGER_HREF } from '@/lib/sales/billingRule';
import { SALES_ORDER_BELL_KINDS } from '@/lib/notifications';
import { splitNotificationAction } from '@/lib/notificationAction';

const TODAY = '2026-10-02'; // ศ. 2 ต.ค. 2026

/* กติกาของลูกค้า — รูปที่เก็บจริง (ตัวคิดอ่านเอง) */
const NONE = { v: 4, need: 'none' };
const CREDIT30 = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null };
const SAME_DAY = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null };
const LEGACY = { credit: false };

const order = (over = {}) => ({
  id: 'SOR-1', orderNumber: 'SO-26090230-0', status: 'approved', origin: 'pipeline', quotationId: 'QT-1',
  quotation: { id: 'QT-1', status: 'accepted', quoteNumber: 'QT-26090210-1' }, totalAmount: 500000,
  customerId: 'C-1', customerName: 'บริษัท ตัวอย่าง จำกัด', ownerId: 'U-AE', dealId: 'D-1', deal: { id: 'D-1', ownerId: 'U-AE' },
  ...over,
});
const inst = (over = {}) => ({
  id: 'SOI-1', salesOrderId: 'SOR-1', seq: 1, label: 'มัดจำ', amount: 38611.55, status: 'pending', kind: 'regular',
  frozenAt: '2026-09-20T03:00:00Z', refundedAt: null, billingDate: null, billingEvent: null, dueDate: '2026-10-04',
  billingRequestId: null, ...over,
});
const FN_DIR = new Map([
  ['F1', { id: 'F1', role: 'finance', department: 'FN', disabled: false }],
  ['F2', { id: 'F2', role: 'finance', department: 'FN', disabled: false }],
]);
const customers = (rule, arCode = 'AR-015') => new Map([['C-1', { id: 'C-1', arCode, name: 'บริษัท ตัวอย่าง จำกัด', billingRule: rule }]]);
const ctx = (over = {}) => ({
  todayIso: TODAY,
  ordersById: new Map([['SOR-1', order()]]),
  customersById: customers(CREDIT30),
  requestsById: new Map(),
  skipArCodes: ['AR-109'],
  ...over,
});
const pick = (rows, over) => dueSoonCandidates(rows, ctx(over)).map((c) => c.installment.id);

// ── 1. ทุกงวดที่มีกำหนดชำระ ─────────────────────────────────────────────────────────────────────────
test('หน้าต่าง 0..3 วันของกำหนดชำระ — วันนี้/อีก 3 วันเตือน · อีก 4 วัน/ผ่านไปแล้ว/ไม่มีกำหนดชำระ ไม่เตือน', () => {
  assert.equal(DUE_REMIND_DAYS, 3);
  assert.deepEqual(pick([inst({ dueDate: '2026-10-02' })]), ['SOI-1'], 'วันนี้');
  assert.deepEqual(pick([inst({ dueDate: '2026-10-05' })]), ['SOI-1'], 'อีก 3 วัน');
  assert.deepEqual(pick([inst({ dueDate: '2026-10-06' })]), [], 'อีก 4 วัน');
  assert.deepEqual(pick([inst({ dueDate: '2026-10-01' })]), [], 'เลยกำหนดแล้ว = ป้ายแดง ไม่ใช่กระดิ่งใหม่');
  assert.deepEqual(pick([inst({ dueDate: null })]), []);
});

test('⭐ ทุกลูกค้า ทุกงวดที่มีกำหนดชำระ — ไม่ต้องวางบิล · ยังไม่ระบุ · รูปเดิม · เครดิต 30 ที่วางบิลไปแล้ว', () => {
  for (const [why, rule] of [['ไม่ต้องวางบิล', NONE], ['ยังไม่ระบุ', null], ['รูปเดิม', LEGACY], ['เครดิต 30', CREDIT30]]) {
    assert.deepEqual(pick([inst()], { customersById: customers(rule) }), ['SOI-1'], why);
  }
  // เครดิต 30: วางบิลไปแล้วเดือนก่อน กำหนดชำระถึงแล้ว — กติกาเดิมไม่มีกระดิ่งก่อนเงินเข้าเลย (กรรมการทั้งสองชุดชี้)
  assert.deepEqual(pick([inst({ billingDate: '2026-09-02', dueDate: '2026-10-02' })]), ['SOI-1']);
});

test('🔴 ขอใบวางบิลแล้วยังเตือนครบกำหนด (ขอใบ ≠ ได้เงิน) — ต่างจากกระดิ่งวางบิลที่หยุด', () => {
  const sent = { requestsById: new Map([['RQ-1', { id: 'RQ-1', status: 'pending' }]]) };
  const row = inst({ billingDate: '2026-10-01', dueDate: '2026-10-03', billingRequestId: 'RQ-1' });
  assert.deepEqual(pick([row], sent), ['SOI-1']);
  assert.deepEqual(billingDueCandidates([row], ctx(sent)), []);
});

test('🔴 รอเหตุการณ์ = เงียบ แม้แถวเก่าจะมีกำหนดชำระค้าง · แจ้งชำระแล้ว/ยอด 0/งวดยกมา/งวดร่าง ไม่เตือน', () => {
  assert.deepEqual(pick([inst({ billingEvent: 'หลังส่งสินค้า' })]), []);
  for (const status of ['reported', 'confirmed', 'rejected']) assert.deepEqual(pick([inst({ status })]), [], status);
  assert.deepEqual(pick([inst({ amount: 0 })]), []);
  assert.deepEqual(pick([inst({ kind: 'opening' })]), []);
  assert.deepEqual(pick([inst({ frozenAt: null })]), []);
});

test('ด่านระดับใบชุดเดียวกับกระดิ่งวางบิล — ใบยกเลิก · ร่างที่ QT ถูกถอด Won · ใบย้อนหลังยังไม่อนุมัติ · ใบยอด 0 · สหมิตร', () => {
  const withOrder = (over) => ({ ordersById: new Map([['SOR-1', order(over)]]) });
  for (const status of ['cancelled', 'revised']) assert.deepEqual(pick([inst()], withOrder({ status })), [], status);
  assert.deepEqual(pick([inst()], withOrder({ status: 'draft', quotation: { id: 'QT-1', status: 'sent' } })), []);
  assert.deepEqual(pick([inst()], withOrder({ status: 'draft' })), ['SOI-1'], 'ร่าง Rev. ที่ QT ยัง Won (มติ D3)');
  assert.deepEqual(pick([inst()], withOrder({ origin: 'historical', status: 'pending_approval', quotationId: null, quotation: null })), []);
  assert.deepEqual(pick([inst()], withOrder({ totalAmount: 0 })), []);
  assert.deepEqual(pick([inst()], { customersById: customers(CREDIT30, 'AR-109') }), [], 'สหมิตร — เงินนอกระบบ');
  assert.deepEqual(pick([inst({ salesOrderId: 'SOR-X' })]), [], 'หาใบไม่เจอ');
});

test('ผลเรียงตามกำหนดชำระ แล้วเลขใบ แล้วลำดับงวด', () => {
  const rows = [
    inst({ id: 'B', seq: 2, dueDate: '2026-10-05' }),
    inst({ id: 'C', seq: 1, dueDate: '2026-10-03' }),
    inst({ id: 'A', seq: 1, dueDate: '2026-10-05' }),
  ];
  assert.deepEqual(pick(rows), ['C', 'A', 'B']);
});

// ── 2. รวมกับกระดิ่งวางบิลวันเดียวกัน ─────────────────────────────────────────────────────────────────
test('⭐ ชำระวันวางบิล (วันวางบิล = กำหนดชำระ) — ฝั่งขายได้กระดิ่งเดียว (วางบิล · ต่อท้าย "ครบกำหนดชำระวันเดียวกัน")', () => {
  const same = inst({ billingDate: '2026-10-04', dueDate: '2026-10-04' });
  const c = ctx({ customersById: customers(SAME_DAY) });
  const [candidate] = dueSoonCandidates([same], c);
  assert.equal(candidate.merged, true, 'อยู่ในชุดครบกำหนด (FN / ?due=soon) แต่ถูกรวมไว้ที่กระดิ่งวางบิล');
  const due = dueSoonNotices([same], { ...c, directory: FN_DIR });
  assert.deepEqual(due.sales, [], 'ฝั่งขายไม่ได้แถวครบกำหนดซ้ำ');
  assert.match(due.fn.title, /· 1 งวด /, 'แถวสรุป FN นับงวดนี้ (ชุดเดียวกับ ?due=soon)');
  const billing = billingDueNotices([same], { ...c, directory: FN_DIR });
  assert.equal(billing.sales.length, 1);
  assert.equal(billing.candidates[0].sameDayDue, true);
  assert.equal(billing.sales[0].title, `ถึงรอบวางบิล อา. 4 ต.ค. · SO-26090230-0 งวด 1 มัดจำ ฿38,611.55 · ${BILLING_DUE_SAME_DAY_TEXT}`);
});

test('ไม่รวมเมื่อกระดิ่งวางบิลไม่ยิง (ขอใบแล้ว) หรือคนละวัน — ได้กระดิ่งครบกำหนดของตัวเอง', () => {
  const sent = { requestsById: new Map([['RQ-1', { id: 'RQ-1', status: 'acknowledged' }]]) };
  const requested = inst({ billingDate: '2026-10-04', dueDate: '2026-10-04', billingRequestId: 'RQ-1' });
  const [a] = dueSoonCandidates([requested], ctx({ ...sent, customersById: customers(SAME_DAY) }));
  assert.equal(a.merged, false);
  const differ = inst({ billingDate: '2026-10-03', dueDate: '2026-10-05' });
  const [b] = dueSoonCandidates([differ], ctx());
  assert.equal(b.merged, false);
  assert.equal(dueSoonNotices([differ], { ...ctx(), directory: FN_DIR }).sales.length, 1);
  // แถววางบิลของงวดคนละวันไม่ต่อท้ายคำครบกำหนด
  assert.doesNotMatch(billingDueNotice({ installment: differ, order: order() }).title, /ครบกำหนด/);
});

// ── 3. คำต่อท้าย "ยังไม่มีวันวางบิล" ─────────────────────────────────────────────────────────────────
test('🔴 "ยังไม่มีวันวางบิล" เฉพาะลูกค้าที่ต้องวางบิลจริง — ไม่ต่อท้ายงวดที่ติ๊ก · รูปเดิม · ไม่ต้องวางบิล · ยังไม่ระบุ', () => {
  const missing = (rule, over = {}) => dueSoonCandidates([inst(over)], ctx({ customersById: customers(rule) }))[0].missingBilling;
  assert.equal(missing(CREDIT30), true);
  assert.equal(missing(CREDIT30, { billingSkip: true }), false, 'ติ๊ก "งวดนี้ไม่ต้องวางบิล"');
  assert.equal(missing(CREDIT30, { billingDate: '2026-09-04' }), false, 'มีวันวางบิลแล้ว');
  assert.equal(missing(LEGACY), false, 'รูปเดิม { credit:false } เท่ากับ prod');
  assert.equal(missing(NONE), false);
  assert.equal(missing(null), false);
});

test('แถวฝั่งขาย: หัวข้อ วัน·ใบ·งวด·ยอด (+ ยังไม่มีวันวางบิล) · ผู้รับ = เจ้าของดีล + เจ้าของใบ · แถวพาไปแท็บการชำระ ไม่มีปุ่ม', () => {
  const plain = dueSoonNotice({ installment: inst(), order: order(), customer: { arCode: 'AR-015' } });
  assert.equal(plain.title, 'ครบกำหนดชำระ อา. 4 ต.ค. · SO-26090230-0 งวด 1 มัดจำ ฿38,611.55');
  assert.equal(plain.body, 'AR-015 · บริษัท ตัวอย่าง จำกัด');
  assert.equal(plain.kind, DUE_SOON_KIND);
  assert.equal(plain.entityType, 'sales_order');
  assert.equal(plain.entityId, 'SOR-1');
  assert.equal(plain.href, '/sa/sales-orders/SOR-1?tab=payment');
  assert.ok(!splitNotificationAction(plain.href).actionHref, 'กระดิ่งครบกำหนดไม่ชวนขอใบวางบิล');
  assert.deepEqual(plain.userIds, ['U-AE']);
  assert.deepEqual(dueSoonNotice({ installment: inst(), order: order({ deal: { ownerId: 'U-AE2' } }) }).userIds, ['U-AE2', 'U-AE']);
  const nag = dueSoonNotice({ installment: inst(), order: order(), missingBilling: true });
  assert.match(nag.title, new RegExp(` · ${DUE_SOON_MISSING_BILLING_TEXT}$`));
  assert.equal(dueSoonNotice({ installment: inst({ dueDate: null }), order: order() }), null);
  assert.equal(dueSoonNotice({ installment: inst(), order: order({ ownerId: null, deal: null }) }), null);
  assert.equal(dueSoonNotice({ installment: inst(), order: order({ orderNumber: ' ' }) }), null);
});

test('กุญแจกันซ้ำ: ครั้งเดียวต่องวดต่อกำหนดชำระ (`due_soon:{id}:{dueDate}`) · FN ต่อวัน', () => {
  const a = dueSoonNotice({ installment: inst(), order: order() });
  assert.equal(a.dedupeKey, 'due_soon:SOI-1:2026-10-04');
  assert.equal(a.dedupeKey, dueSoonDedupeKey('SOI-1', '2026-10-04'));
  assert.notEqual(a.dedupeKey, dueSoonNotice({ installment: inst({ dueDate: '2026-10-05' }), order: order() }).dedupeKey);
  assert.equal(dueSoonFnDedupeKey(TODAY), 'due_soon_fn:2026-10-02');
  // ไม่ชนกุญแจของกระดิ่งวางบิล (คนละเรื่อง ยิงวันเดียวกันได้)
  assert.notEqual(a.dedupeKey, billingDueNotice({ installment: inst({ billingDate: '2026-10-04' }), order: order() }).dedupeKey);
});

test('แถว FN: "ครบกำหนดชำระใน 3 วัน · N งวด ฿X" → ทะเบียน `?due=soon` · บรรทัดรองไล่สองงวด + จำนวนงวดที่ยังไม่มีวันวางบิล', () => {
  const rows = [
    inst({ id: 'SOI-1', seq: 1, dueDate: '2026-10-03' }),
    inst({ id: 'SOI-2', seq: 2, label: '', dueDate: '2026-10-04', billingDate: '2026-09-04', amount: 100 }),
    inst({ id: 'SOI-3', seq: 3, label: '', dueDate: '2026-10-05', amount: 200 }),
  ];
  const { candidates, sales, fn } = dueSoonNotices(rows, { ...ctx(), directory: FN_DIR });
  assert.equal(candidates.length, 3);
  assert.equal(sales.length, 3);
  assert.equal(fn.kind, DUE_SOON_FN_KIND);
  assert.equal(fn.href, DUE_SOON_FN_HREF);
  assert.equal(fn.href, '/finance/payments?due=soon');
  assert.equal(fn.dedupeKey, 'due_soon_fn:2026-10-02');
  assert.equal(fn.title, 'ครบกำหนดชำระใน 3 วัน · 3 งวด ฿38,911.55');
  assert.equal(fn.body, 'SO-26090230-0 งวด 1 มัดจำ ฿38,611.55 · AR-015 · ครบกำหนด ส. 3 ต.ค.'
    + ' / SO-26090230-0 งวด 2 ฿100.00 · AR-015 · ครบกำหนด อา. 4 ต.ค. และอีก 1 งวด · ยังไม่มีวันวางบิล 2 งวด');
  assert.deepEqual(fn.userIds, ['F1', 'F2']);
  assert.equal(fn.entityId, 'SOR-1');
  // ไม่มีคนฝ่าย FN — ฝั่งขายยังได้ (cron รายงาน error ของฝั่ง FN แยก)
  const noFn = dueSoonNotices(rows, { ...ctx(), directory: new Map() });
  assert.equal(noFn.sales.length, 3);
  assert.equal(noFn.fn, null);
  assert.equal(dueSoonFnNotice([], { todayIso: TODAY, directory: FN_DIR }), null);
});

// ── 4. ปุ่มในแถวกระดิ่งวางบิล (รุ่นสี่) ──────────────────────────────────────────────────────────────
test('ปุ่ม "ขอใบวางบิลงวดนี้" ถาม `canRequestBilling` ตัวเดียวกับแผงงวด — งวดที่ติ๊ก/ลูกค้าไม่ต้องวางบิล (ไม่มีวัน) = ไม่มีปุ่ม', () => {
  const live = inst({ billingDate: '2026-10-04' });
  assert.equal(billingDueActionOpen(live), true);
  assert.equal(billingDueActionOpen(live, NONE), true, 'มีวันวางบิล = ข้อยกเว้น "งวดนี้ต้องวางบิล" ขอได้');
  assert.equal(billingDueActionOpen(inst({ billingDate: null, billingSkip: true })), false, 'ติ๊ก "งวดนี้ไม่ต้องวางบิล"');
  assert.equal(billingDueActionOpen(inst({ billingDate: null }), NONE), false, 'ลูกค้าไม่ต้องวางบิล วันวางบิลถูกล้างไปแล้ว');
  assert.equal(billingDueActionOpen(inst({ billingDate: null }), CREDIT30), true, 'ยังต้องวางบิล = ขอได้ (เหมือนแผงงวด)');
  assert.equal(billingDueAction(inst({ billingDate: null }), order(), { rule: NONE }), null);
  assert.ok(billingDueAction(live, order(), { rule: NONE }));
});

// ── 5. สายไฟ ─────────────────────────────────────────────────────────────────────────────────────────
test('kind ตรงกับตัวคิด · อยู่ในกระดิ่ง (SALES_ORDER_BELL_KINDS) · ลิงก์ของแถว FN ตรง LEDGER_HREF', () => {
  assert.equal(DUE_SOON_KIND, BELL.DUE_SOON);
  assert.equal(BILLING_DUE_KIND, BELL.BILLING_DUE);
  assert.equal(DUE_SOON_FN_HREF, LEDGER_HREF.dueSoon);
  for (const kind of [DUE_SOON_KIND, DUE_SOON_FN_KIND]) assert.ok(SALES_ORDER_BELL_KINDS.includes(kind), kind);
});

test('cron: บล็อก try ของตัวเอง · กรองที่กำหนดชำระ · เลือก billingSkip ได้ทั้งก่อน/หลังรัน 0393 · ลูกค้าพกกติกา · ข้ามสหมิตร', () => {
  const src = readFileSync(new URL('../../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  assert.match(src, /try \{\s*\n\s*results\.dueSoon = await notifyDueSoon\(supabase\);\s*\n\s*\} catch/);
  const block = src.slice(src.indexOf('async function notifyDueSoon'), src.indexOf('/* ⭐ เตือน "ถึงรอบวางบิล"'));
  assert.ok(block.length > 100, 'หา notifyDueSoon ไม่เจอ');
  assert.match(block, /const todayIso = businessDate\(\);/);
  assert.match(block, /const until = addDays\(todayIso, DUE_REMIND_DAYS\);/);
  // ⚠️ กรองที่กำหนดชำระ ไม่ใช่วันวางบิล — งวดเครดิต 30 ที่วางบิลไปแล้วเดือนก่อนต้องยังเจอ
  assert.equal((block.match(/\.gte\('dueDate', todayIso\)\s*\n\s*\.lte\('dueDate', until\)/g) || []).length, 2);
  assert.doesNotMatch(block, /\.gte\('billingDate'/);
  // ก่อนรัน 0393: select ชุดที่มี billingSkip พัง ⇒ ถอยไปชุดเดิม (ไม่ใช่ error ทั้งรอบ)
  assert.match(block, /"billingSkip"/);
  assert.match(block, /if \(billingV4SchemaError\(result\.error\)\) \{/);
  // ตัวคิดต้องเห็นวันวางบิล/เหตุการณ์/คำร้อง เพื่อตัดสินรวมกระดิ่ง · รอเหตุการณ์เงียบ
  for (const col of ['"billingDate"', '"billingEvent"', '"dueDate"', '"billingRequestId"', '"frozenAt"', 'amount', 'kind']) {
    assert.ok(block.includes(col), col);
  }
  assert.match(block, /loadBellContext\(supabase, rows, \{ withRule: true \}\)/);
  assert.match(block, /skipArCodes: \[SAHAMIT_AR_CODE\]/);
  assert.match(block, /if \(result\.error\) return \{ sent: 0, error: result\.error\.message \};/);
  assert.match(block, /if \(out\.error && !notifyError\)/);
  const loader = src.slice(src.indexOf('async function loadBellContext'), src.indexOf('async function notifyDueSoon'));
  assert.match(loader, /select\('id, "arCode", name, "nameEn", "billingRule"'\)/);
  assert.doesNotMatch(block, /toISOString\(\)\.slice/);
});
