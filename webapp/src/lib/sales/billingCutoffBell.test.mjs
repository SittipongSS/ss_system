// ── v5 ปฏิทินรายปี: กระดิ่งเช้าวันตัดรอบ + ขอปฏิทินปีหน้า (มติเจ้าของ 29/09 · spec v5 · contract §3–§4) ──────────────────
// ⭐ ตรึงห้าเรื่อง:
//   1. วันตัดรอบ — `next` เช้าวันทำงานก่อนเส้นตาย · `today` เช้าวันสุดท้าย · งวดที่ยังรอวางบิลของรอบ (ขอใบแล้ว/แจ้งชำระแล้ว/รอบอื่น
//      ไม่อยู่) · ข้อความของตัวคิดทุกตัวอักษร (เครดิต 0 พูดเวลา · เครดิต N ไม่พูด · เส้นตายตรงเสาร์ = เตือนวันศุกร์)
//   2. ผู้รับ + รูปแถว — ฝ่ายขายหนึ่งแถวต่อใบต่อรอบ (เจ้าของดีล + เจ้าของใบ) · FN หนึ่งแถวต่อเส้นตาย (รวมทุกลูกค้า) → ทะเบียน
//      `?billing=cutoff&on=` · กุญแจกันซ้ำ · ใบที่รอแค่งวดเดียวมีปุ่ม "ขอใบวางบิลงวดนี้"
//   3. ไม่มีกระดิ่ง — ลูกค้าไม่ต้องวางบิล (แม้งวดยกเว้นมีวันวางบิล) · ไม่มีรอบจ่าย · ยังไม่ระบุ · ปีที่ยังไม่มีปฏิทิน · สหมิตร · ใบตาย
//   4. ขอปฏิทินปีหน้า — มีเมตตา จ. 23 พ.ย. 2026 · กุญแจรายสัปดาห์ · หยุดเมื่อมีปี 2027 · ผู้รับ = ฝ่ายขายทีมที่ดูแล + FN
//   5. สายไฟ — kind อยู่ในกระดิ่ง · cron มีบล็อก try ของตัวเอง · ตัวแกะปุ่มรู้จักชนิดใหม่
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_CUTOFF_FN_KIND, BILLING_CUTOFF_KIND, BILLING_CUTOFF_LOOKAHEAD_DAYS, BILLING_CUTOFF_LOOKBACK_DAYS,
  BILLING_CUTOFF_UNREQUESTED_TEXT, CALENDAR_MISSING_ENTITY_TYPE, CALENDAR_MISSING_KIND, billingCutoffDedupeKey,
  billingCutoffFnDedupeKey, billingCutoffFnNotice, billingCutoffGroups, billingCutoffNotice, billingCutoffNotices,
  billingCutoffOnIndex, billingDueActionInstallmentId, calendarMissingNotice, calendarMissingNotices,
  calendarMissingRecipients,
} from '@/lib/sales/billingDueNotify';
import { BELL, LEDGER_HREF } from '@/lib/sales/billingRule';
import { CUSTOMER_BELL_KINDS, NOTIFICATION_BOXES, SALES_ORDER_BELL_KINDS, attachNotificationActions } from '@/lib/notifications';
import { splitNotificationAction } from '@/lib/notificationAction';
import { billingRequestHref } from '@/lib/sales/billingRequestHref';

/* ═══ มีเมตตา (AR-281) — ปฏิทิน 2026 ถอดจากรูปจริง (calendar-v3/brief.md §1 · ชุดเดียวกับ §14 ของตัวคิด) ═════════════ */
const MEEMETTA_TABLE = [
  [1, 9, 15, 22, 30], [2, 6, 16, 19, 27], [3, 6, 16, 23, 31], [4, 2, 16, 22, 30],
  [5, 8, 15, 21, 29], [6, 8, 15, 22, 30], [7, 8, 15, 23, 30], [8, 10, 17, 21, 31],
  [9, 8, 15, 22, 30], [10, 8, 15, 21, 30], [11, 9, 16, 20, 30], [12, 8, 15, 22, 30],
];
const d26 = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MEEMETTA_2026 = MEEMETTA_TABLE.flatMap(([m, c1, p1, c2, p2]) => [{ cutoff: d26(m, c1), pay: d26(m, p1) }, { cutoff: d26(m, c2), pay: d26(m, p2) }]);
const meemetta = (creditDays, years = { 2026: { runs: MEEMETTA_2026 } }) => ({
  v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays, runs: { kind: 'calendar', cutoffTime: '16:00', years },
});
const WITH_2027 = { 2026: { runs: MEEMETTA_2026 }, 2027: { runs: [{ cutoff: '2027-01-08', pay: '2027-01-15' }, { cutoff: '2027-12-22', pay: '2027-12-30' }] } };
const NONE = { v: 4, need: 'none' };
const CREDIT30_NO_RUNS = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null };
const HOLIDAYS = new Set(['2026-10-13', '2026-10-23', '2026-12-07', '2026-12-10', '2026-12-31']);
const MEE = 'บริษัท มีเมตตา จำกัด';

const order = (id, over = {}) => ({
  id, orderNumber: `SO-${id}`, status: 'approved', origin: 'pipeline', quotationId: `QT-${id}`,
  quotation: { id: `QT-${id}`, status: 'accepted', quoteNumber: `QT-${id}` }, totalAmount: 500000,
  customerId: 'C-281', customerName: MEE, ownerId: 'U-OWN', dealId: 'D-1', deal: { id: 'D-1', ownerId: 'U-AE' }, ...over,
});
const inst = (id, salesOrderId, over = {}) => ({
  id, salesOrderId, seq: 1, label: '', amount: 1000, status: 'pending', kind: 'regular', frozenAt: '2026-09-20T03:00:00Z',
  refundedAt: null, billingDate: '2026-10-21', billingEvent: null, dueDate: null, billingRequestId: null, ...over,
});
const customer = (rule, over = {}) => ({ id: 'C-281', arCode: 'AR-281', name: MEE, nameEn: '', billingRule: rule, teams: ['ODM'], ...over });
const DIR = new Map([
  ['F1', { id: 'F1', role: 'finance', department: 'FN', disabled: false }],
  ['F2', { id: 'F2', role: 'finance', department: 'FN', disabled: false }],
  ['AE-ODM', { id: 'AE-ODM', role: 'ae', teams: ['ODM'], disabled: false }],
  ['SAE-ODM', { id: 'SAE-ODM', role: 'senior_ae', teams: ['ODM'], disabled: false }],
  ['AE-KA', { id: 'AE-KA', role: 'ae', teams: ['KA'], disabled: false }],
  ['VIEW-ODM', { id: 'VIEW-ODM', role: 'viewer', teams: ['ODM'], disabled: false }],
  ['OFF-ODM', { id: 'OFF-ODM', role: 'ae', teams: ['ODM'], disabled: true }],
  ['ADMIN', { id: 'ADMIN', role: 'admin', teams: ['ODM'], disabled: false }],
]);

/* โลกหนึ่งเช้า: ลูกค้ามีเมตตา เครดิต 0 · SO-A รอสองงวด · SO-B งวดที่ขอใบแล้ว/ร่าง/แจ้งชำระ/รอบถัดไป */
const ROWS = [
  inst('a1', 'A', { seq: 1, amount: 1000 }),
  inst('a2', 'A', { seq: 2, amount: 2000, billingDate: '2026-10-15' }), // เลยวันวางบิลแต่ยังไม่ขอ = ยังรอรอบ 21 ต.ค.
  inst('b1', 'B', { seq: 1, amount: 400, billingRequestId: 'RQ-SENT' }), // ขอใบแล้ว = หลุดรอบ
  inst('b2', 'B', { seq: 2, amount: 300, billingRequestId: 'RQ-DRAFT' }), // ร่าง = ยังไม่ขอ
  inst('b3', 'B', { seq: 3, amount: 999, status: 'reported' }), // แจ้งชำระแล้ว
  inst('b4', 'B', { seq: 4, amount: 777, billingDate: '2026-11-09' }), // รอบ 9 พ.ย.
];
const ctx = (over = {}) => ({
  todayIso: '2026-10-20', // อ. — เส้นตาย พ. 21 ต.ค. ⇒ จังหวะ next
  ordersById: new Map([['A', order('A')], ['B', order('B')]]),
  customersById: new Map([['C-281', customer(meemetta(0))]]),
  requestsById: new Map([['RQ-SENT', { id: 'RQ-SENT', status: 'pending' }], ['RQ-DRAFT', { id: 'RQ-DRAFT', status: 'draft' }]]),
  skipArCodes: ['AR-109'],
  holidays: HOLIDAYS,
  directory: DIR,
  ...over,
});
const ids = (groups) => groups.flatMap((g) => g.items.map((i) => i.installment.id)).sort();

// ── 1. วันตัดรอบ ─────────────────────────────────────────────────────────────────────────────────────────
test('⭐ เช้าวันทำงานก่อนเส้นตาย (next) — งวดที่ยังรอวางบิลของรอบ · ขอใบแล้ว/แจ้งชำระ/รอบอื่นไม่อยู่ · ข้อความของตัวคิด', () => {
  const groups = billingCutoffGroups(ROWS, ctx());
  assert.equal(groups.length, 1);
  const [g] = groups;
  assert.deepEqual([g.deadline, g.when, g.fireOn, g.cutoffKind, g.customerName], ['2026-10-21', 'next', '2026-10-20', 'cutoffDay', MEE]);
  assert.equal(g.text, `พรุ่งนี้ (พ. 21 ต.ค.) เป็นวันตัดรอบของ ${MEE} — ส่งเอกสารก่อน 16:00 น.`);
  assert.deepEqual(ids(groups), ['a1', 'a2', 'b2']);
  // เช้าวันสุดท้าย = จังหวะ today (แถวใหม่ กุญแจต่าง) · วันก่อนหน้านั้น = ยังไม่เตือน
  const today = billingCutoffGroups(ROWS, ctx({ todayIso: '2026-10-21' }));
  assert.deepEqual([today[0].when, today[0].text], ['today', `วันนี้เป็นวันตัดรอบของ ${MEE} — ส่งเอกสารก่อน 16:00 น.`]);
  assert.deepEqual(billingCutoffGroups(ROWS, ctx({ todayIso: '2026-10-19' })), []);
});

test('ฝั่งขาย: หนึ่งแถวต่อใบต่อรอบ · หัวข้อ = ประโยคของตัวคิด · บรรทัดรองไล่งวด · ผู้รับ = เจ้าของดีล + เจ้าของใบ · กุญแจ ใบ×เส้นตาย×จังหวะ', () => {
  const { sales, fn, candidates } = billingCutoffNotices(ROWS, ctx());
  assert.equal(candidates.length, 3);
  assert.deepEqual(sales.map((n) => n.entityId), ['A', 'B']);
  const [a, b] = sales;
  assert.equal(a.kind, BILLING_CUTOFF_KIND);
  assert.equal(a.entityType, 'sales_order');
  assert.equal(a.title, `พรุ่งนี้ (พ. 21 ต.ค.) เป็นวันตัดรอบของ ${MEE} — ส่งเอกสารก่อน 16:00 น.`);
  assert.equal(a.body, `SO-A งวด 1 ฿1,000.00 / งวด 2 ฿2,000.00 · ${BILLING_CUTOFF_UNREQUESTED_TEXT}`);
  assert.deepEqual(a.userIds, ['U-AE', 'U-OWN']);
  assert.equal(a.dedupeKey, 'billing_cutoff:A:2026-10-21:next');
  assert.equal(a.dedupeKey, billingCutoffDedupeKey('A', '2026-10-21', 'next'));
  // สองงวด = ไม่มีปุ่ม (ปุ่มเดียวผูกได้งวดเดียว) · งวดเดียว = ปุ่มลิงก์เดียวกับแผงงวด
  assert.equal(a.href, '/sa/sales-orders/A?tab=payment');
  const split = splitNotificationAction(b.href);
  assert.equal(split.href, '/sa/sales-orders/B?tab=payment');
  assert.equal(split.actionHref, billingRequestHref(order('B'), ROWS[3]));
  assert.equal(billingDueActionInstallmentId(split.actionHref), 'b2');
  // เช้าวันสุดท้ายได้แถวใหม่ (กุญแจต่าง) — ไม่ถูกกลืนโดยแถวเมื่อวาน
  assert.equal(billingCutoffNotices(ROWS, ctx({ todayIso: '2026-10-21' })).sales[0].dedupeKey, 'billing_cutoff:A:2026-10-21:today');
  // ไม่มีเจ้าของ = ไม่มีแถวฝั่งขาย (FN ยังได้)
  const orphan = billingCutoffNotices(ROWS, ctx({ ordersById: new Map([['A', order('A', { ownerId: null, deal: null })], ['B', order('B')]]) }));
  assert.deepEqual(orphan.sales.map((n) => n.entityId), ['B']);
  assert.equal(orphan.fn.length, 1);
  assert.equal(fn.length, 1);
});

test('⭐ FN: หนึ่งแถวต่อเส้นตาย → `?billing=cutoff&on=` · หัวข้อนับทุกงวดของเส้นตายนั้น (รวมทุกลูกค้า) · กุญแจ เส้นตาย×จังหวะ', () => {
  const second = customer(meemetta(0), { id: 'C-015', arCode: 'AR-015', name: 'บริษัท ตัวอย่าง จำกัด' });
  const rows = [...ROWS, inst('c1', 'C', { amount: 5000 })];
  const c = ctx({
    ordersById: new Map([['A', order('A')], ['B', order('B')], ['C', order('C', { customerId: 'C-015', customerName: 'บริษัท ตัวอย่าง จำกัด' })]]),
    customersById: new Map([['C-281', customer(meemetta(0))], ['C-015', second]]),
  });
  const { fn, sales } = billingCutoffNotices(rows, c);
  assert.equal(sales.length, 3);
  assert.equal(fn.length, 1);
  const [row] = fn;
  assert.equal(row.kind, BILLING_CUTOFF_FN_KIND);
  assert.equal(row.href, '/finance/payments?billing=cutoff&on=2026-10-21');
  assert.equal(row.href, LEDGER_HREF.cutoff('2026-10-21'));
  assert.equal(row.dedupeKey, billingCutoffFnDedupeKey('2026-10-21', 'next'));
  assert.equal(row.title, `วางบิลให้ทันรอบภายใน พ. 21 ต.ค. · 4 งวด ฿8,300.00 · ${BILLING_CUTOFF_UNREQUESTED_TEXT}`);
  assert.equal(row.body, 'AR-015 1 งวด / AR-281 3 งวด');
  assert.deepEqual(row.userIds, ['F1', 'F2']);
  // ลูกค้ารายเดียว = บรรทัดรองเป็นประโยคของตัวคิด (มีเวลาตัดรอบ)
  assert.equal(billingCutoffNotices(ROWS, ctx()).fn[0].body, `พรุ่งนี้ (พ. 21 ต.ค.) เป็นวันตัดรอบของ ${MEE} — ส่งเอกสารก่อน 16:00 น.`);
  // ไม่มีคนฝ่าย FN = ไม่มีแถวสรุป (cron รายงาน error) · ฝั่งขายยังได้
  const noFn = billingCutoffNotices(ROWS, ctx({ directory: new Map([['X', { id: 'X', role: 'ae' }]]) }));
  assert.deepEqual(noFn.fn, []);
  assert.equal(noFn.sales.length, 2);
  // กลุ่มคนละเส้นตายรวมแถวเดียวไม่ได้ (ลิงก์เดียวชี้ได้วันเดียว)
  const groups = billingCutoffGroups(ROWS, ctx());
  assert.equal(billingCutoffFnNotice([groups[0], { ...groups[0], deadline: '2026-10-22' }], { directory: DIR }), null);
});

test('เครดิต 30: "วันสุดท้ายที่วางบิล … แล้วทันรอบจ่าย" ไม่พูดเวลา · เส้นตายตรงเสาร์ = เตือนวันศุกร์ · ลิงก์ = เส้นตาย (ไม่ใช่วันยิง)', () => {
  const c = ctx({ todayIso: '2026-10-09', customersById: new Map([['C-281', customer(meemetta(30))]]) });
  const rows = [inst('s1', 'A', { billingDate: '2026-10-09', dueDate: '2026-11-16' })];
  const { sales, fn } = billingCutoffNotices(rows, c);
  assert.match(sales[0].title, /^วันนี้เป็นวันทำการสุดท้ายที่วางบิล บริษัท มีเมตตา จำกัด แล้วทันรอบจ่าย .* \(วันสุดท้ายจริง ส\. 10 ต\.ค\. ตรงวันเสาร์\)$/);
  assert.doesNotMatch(sales[0].title, /16:00/);
  assert.equal(fn[0].href, '/finance/payments?billing=cutoff&on=2026-10-10');
  assert.match(fn[0].title, /^วางบิลให้ทันรอบภายใน ส\. 10 ต\.ค\. · 1 งวด /);
});

// ── 3. ไม่มีกระดิ่ง ────────────────────────────────────────────────────────────────────────────────────
test('🔴 ไม่มีกระดิ่งวันตัดรอบ — ไม่ต้องวางบิล (แม้งวดยกเว้นมีวันวางบิล) · ไม่มีรอบจ่าย · ยังไม่ระบุ · ปีที่ยังไม่มีปฏิทิน · สหมิตร · ใบตาย · งวดร่าง', () => {
  const only = (over, rows = [inst('x', 'A')]) => ids(billingCutoffGroups(rows, ctx(over)));
  const rule = (r) => ({ customersById: new Map([['C-281', customer(r)]]) });
  assert.deepEqual(only(rule(NONE)), [], 'ลูกค้าไม่ต้องวางบิล — ไม่มีรอบจ่าย');
  assert.deepEqual(only(rule(CREDIT30_NO_RUNS)), [], 'มีเครดิตแต่ไม่มีรอบจ่าย');
  assert.deepEqual(only(rule(null)), [], 'ยังไม่ระบุ');
  assert.deepEqual(only({ customersById: new Map() }), [], 'หาลูกค้าไม่เจอ');
  // วันวางบิลตกปีที่ยังไม่มีปฏิทิน (22 ธ.ค. คือรอบสุดท้ายของ 2026) — ไม่ยิงทั้งวันก่อนและวันนั้น (Q3 หยุดรอปฏิทินใหม่)
  for (const day of ['2026-12-30', '2027-01-07', '2027-01-08']) {
    assert.deepEqual(only({ todayIso: day }, [inst('gap', 'A', { billingDate: '2026-12-23' })]), [], day);
  }
  // มีปี 2027 แล้ว = ยิงตามรอบ 8 ม.ค.
  assert.deepEqual(only({ todayIso: '2027-01-07', ...rule(meemetta(0, WITH_2027)) }, [inst('gap', 'A', { billingDate: '2026-12-23' })]), ['gap']);
  assert.deepEqual(only({ customersById: new Map([['C-281', customer(meemetta(0), { arCode: 'AR-109' })]]) }), [], 'สหมิตร — เงินนอกระบบ');
  for (const status of ['cancelled', 'revised']) {
    assert.deepEqual(only({ ordersById: new Map([['A', order('A', { status })]]) }), [], status);
  }
  assert.deepEqual(only({}, [inst('x', 'A', { frozenAt: null })]), [], 'งวดร่าง');
  assert.deepEqual(only({}, [inst('x', 'A', { kind: 'opening' })]), [], 'งวดยกมา');
  assert.deepEqual(only({}, [inst('x', 'A', { amount: 0 })]), [], 'ยอด 0');
  assert.deepEqual(only({}, [inst('x', 'A', { billingDate: null, billingEvent: 'ก่อนส่งสินค้า' })]), [], 'รอเหตุการณ์');
});

test('ธงทะเบียน (`billingCutoffOnIndex`) = ชุดที่หัวข้อแถว FN นับ ในเช้าที่ยิง — และไม่ขึ้นกับวันนี้', () => {
  const { fn } = billingCutoffNotices(ROWS, ctx());
  const index = billingCutoffOnIndex(ROWS, ctx());
  const on = [...index.entries()].filter(([, day]) => day === '2026-10-21').map(([id]) => id).sort();
  assert.deepEqual(on, ['a1', 'a2', 'b2']);
  assert.match(fn[0].title, new RegExp(`· ${on.length} งวด `));
  // b4 (รอบ 9 พ.ย.) มีธงของเส้นตายตัวเอง · ขอใบแล้ว/แจ้งชำระแล้ว = ไม่มีธง
  assert.equal(index.get('b4'), '2026-11-09');
  assert.equal(index.has('b1'), false);
  assert.equal(index.has('b3'), false);
  // เปิดลิงก์วันหลังก็ได้ชุดเดียวกัน (ธงไม่ใช่ "ยิงวันนี้")
  assert.deepEqual([...billingCutoffOnIndex(ROWS, ctx({ todayIso: '2026-10-25' })).keys()].sort(), [...index.keys()].sort());
  // ด่านใบชุดเดียวกับกระดิ่ง — สหมิตร/ใบยกเลิก ไม่มีธง
  assert.equal(billingCutoffOnIndex(ROWS, ctx({ ordersById: new Map([['A', order('A', { status: 'cancelled' })], ['B', order('B')]]) })).has('a1'), false);
});

test('ตัวคัดไม่ต้องมีวันหยุด — ไม่ส่ง = นับแค่เสาร์/อาทิตย์ (ยังยิงได้)', () => {
  assert.equal(billingCutoffGroups(ROWS, ctx({ holidays: null })).length, 1);
  assert.equal(billingCutoffNotice({ group: null, order: order('A'), items: [] }), null);
});

// ── 4. ขอปฏิทินปีหน้า ────────────────────────────────────────────────────────────────────────────────
test('⭐ ขอปฏิทินปีหน้า — มีเมตตา 2026: แถวแรก จ. 23 พ.ย. · กุญแจรายสัปดาห์ · ไม่ยิงวันอาทิตย์/วันหยุด · หยุดเมื่อมีปี 2027', () => {
  for (const credit of [0, 30]) {
    const cus = customer(meemetta(credit));
    const at = (day) => calendarMissingNotice({ customer: cus, todayIso: day, holidays: HOLIDAYS, directory: DIR });
    assert.equal(at('2026-11-20'), null, `เครดิต ${credit}: ก่อนช่วงเตือน`);
    assert.equal(at('2026-11-22'), null, 'อาทิตย์');
    const first = at('2026-11-23');
    assert.equal(first.kind, CALENDAR_MISSING_KIND);
    assert.equal(first.entityType, CALENDAR_MISSING_ENTITY_TYPE);
    assert.equal(first.entityType, 'customer');
    assert.equal(first.entityId, 'C-281');
    assert.equal(first.dedupeKey, 'billing_calendar_missing:C-281:2027-01:2026-11-22');
    assert.equal(first.title, `ขอปฏิทินวางบิลปี 2027 ของ ${MEE} — ปฏิทินที่มีใช้ได้ถึงวันตัดรอบ อ. 22 ธ.ค. 2026`);
    assert.equal(first.body, 'AR-281 · ขอปฏิทิน 2027 จากลูกค้าแล้วใส่ที่การ์ดกำหนดวางบิล — งวดที่ตกช่วงที่ยังไม่มีปฏิทิน ระบบไม่คิดกำหนดชำระให้ (ใส่วันเองได้)');
    assert.equal(first.href, '/database/customers/C-281#billing-rule');
    assert.equal(first.href, LEDGER_HREF.calendar('C-281'));
    assert.equal(at('2026-11-27').dedupeKey, first.dedupeKey, 'สัปดาห์เดียวกัน = แถวเดียว');
    assert.equal(at('2026-11-30').dedupeKey, 'billing_calendar_missing:C-281:2027-01:2026-11-29', 'สัปดาห์ถัดไป = แถวใหม่');
    assert.equal(at('2026-12-07'), null, 'วันหยุดในระบบ');
    const done = customer(meemetta(credit, WITH_2027));
    assert.equal(calendarMissingNotice({ customer: done, todayIso: '2026-11-23', holidays: HOLIDAYS, directory: DIR }), null, 'มีปี 2027 แล้ว');
  }
});

test('ผู้รับขอปฏิทิน = ฝ่ายขายทีมที่ดูแลที่แก้กำหนดวางบิลได้ + FN · ไม่รวมทีมอื่น/ผู้ดูอย่างเดียว/ปิดบัญชี/admin · ลูกค้าไม่มีทีม = FN เท่านั้น', () => {
  assert.deepEqual(calendarMissingRecipients(customer(meemetta(0)), DIR).sort(), ['AE-ODM', 'F1', 'F2', 'SAE-ODM']);
  assert.deepEqual(calendarMissingRecipients(customer(meemetta(0), { teams: [], team: null }), DIR).sort(), ['F1', 'F2'],
    'ลูกค้าไร้ทีม — ด่านแก้เปิดให้ทุกคนที่ถือ customers:edit ⇒ ห้ามส่งหาฝ่ายขายทั้งบริษัท');
  assert.deepEqual(calendarMissingRecipients(customer(meemetta(0), { teams: undefined, team: 'KA' }), DIR).sort(), ['AE-KA', 'F1', 'F2'], 'คอลัมน์ team เดี่ยว (ข้อมูลเก่า)');
  assert.deepEqual(calendarMissingRecipients(customer(meemetta(0)), new Map()), []);
});

test('รอบเช้าขอปฏิทิน — ข้ามลูกค้าปิดใช้งาน/สหมิตร · นับลูกค้าที่ถึงช่วงแต่ไม่มีผู้รับ (cron รายงาน error)', () => {
  const list = [
    customer(meemetta(0)),
    customer(meemetta(0), { id: 'C-OFF', arCode: 'AR-900', isActive: false }),
    customer(meemetta(0), { id: 'C-SAHA', arCode: 'AR-109' }),
    customer(meemetta(0, WITH_2027), { id: 'C-DONE', arCode: 'AR-777' }),
    customer(meemetta(0), { id: 'C-LONE', arCode: 'AR-555', teams: [] }),
  ];
  const out = calendarMissingNotices(list, { todayIso: '2026-11-23', holidays: HOLIDAYS, directory: DIR, skipArCodes: ['AR-109'] });
  assert.deepEqual(out.notices.map((n) => n.entityId), ['C-281', 'C-LONE']);
  assert.deepEqual([out.due, out.unrouted], [2, 0]);
  const nobody = calendarMissingNotices(list, { todayIso: '2026-11-23', holidays: HOLIDAYS, directory: new Map(), skipArCodes: ['AR-109'] });
  assert.deepEqual([nobody.notices.length, nobody.due, nobody.unrouted], [0, 2, 2]);
  assert.equal(calendarMissingNotices(list, { todayIso: '2026-11-22', holidays: HOLIDAYS, directory: DIR }).due, 0, 'อาทิตย์ = ไม่มีใครถึงคิว');
});

// ── 5. สายไฟ ─────────────────────────────────────────────────────────────────────────────────────────
test('kind ตรงตัวคิด · อยู่ในกระดิ่ง (ใบสั่งขาย/ลูกค้า) · ลูกค้าเข้าทาง kinds ไม่ใช่ทั้ง entity', () => {
  assert.equal(BILLING_CUTOFF_KIND, BELL.BILLING_CUTOFF);
  assert.equal(CALENDAR_MISSING_KIND, BELL.CALENDAR_MISSING);
  for (const kind of [BILLING_CUTOFF_KIND, BILLING_CUTOFF_FN_KIND]) assert.ok(SALES_ORDER_BELL_KINDS.includes(kind), kind);
  assert.ok(CUSTOMER_BELL_KINDS.includes(CALENDAR_MISSING_KIND));
  for (const kind of [BILLING_CUTOFF_KIND, BILLING_CUTOFF_FN_KIND, CALENDAR_MISSING_KIND]) {
    assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(kind), `${kind} หลุดจากกระดิ่ง`);
  }
  assert.equal(NOTIFICATION_BOXES.bell.entityTypes.includes('customer'), false);
  assert.ok(BILLING_CUTOFF_LOOKBACK_DAYS >= 62 && BILLING_CUTOFF_LOOKAHEAD_DAYS >= 14, 'หน้าต่าง query ต้องครอบรอบติดกันและวันหยุดยาว');
});

test('cron: สองเรื่องใหม่มีบล็อก try ของตัวเอง · วันนี้จากนาฬิกาไทย · ลูกค้าพกกติกา · วันหยุดของเรา · ข้ามสหมิตร · อ่านพังเป็น error', () => {
  const src = readFileSync(new URL('../../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  assert.match(src, /try \{\s*\n\s*results\.billingCutoff = await notifyBillingCutoff\(supabase\);\s*\n\s*\} catch/);
  assert.match(src, /try \{\s*\n\s*results\.calendarMissing = await notifyCalendarMissing\(supabase\);\s*\n\s*\} catch/);
  const fn = (name) => {
    const start = src.indexOf(`async function ${name}(`);
    assert.ok(start > 0, name);
    return src.slice(start, src.indexOf('\n}\n', start));
  };
  const cutoff = fn('notifyBillingCutoff');
  assert.match(cutoff, /const todayIso = businessDate\(\);/);
  assert.match(cutoff, /addDays\(todayIso, -BILLING_CUTOFF_LOOKBACK_DAYS\)/);
  assert.match(cutoff, /addDays\(todayIso, BILLING_CUTOFF_LOOKAHEAD_DAYS\)/);
  assert.equal((cutoff.match(/\.gte\('billingDate', from\)\s*\n\s*\.lte\('billingDate', until\)/g) || []).length, 2);
  assert.match(cutoff, /"billingSkip"/);
  assert.match(cutoff, /if \(billingV4SchemaError\(result\.error\)\) \{/);
  assert.match(cutoff, /if \(result\.error\) return \{ sent: 0, error: result\.error\.message \};/);
  assert.match(cutoff, /loadBellContext\(supabase, rows, \{ withRule: true \}\)/);
  assert.match(cutoff, /holidaySet\(\)/);
  assert.match(cutoff, /skipArCodes: \[SAHAMIT_AR_CODE\]/);
  assert.match(cutoff, /if \(out\.error && !notifyError\)/);
  assert.match(cutoff, /if \(!fn\.length\) errors\.push/);
  const calendar = fn('notifyCalendarMissing');
  assert.match(calendar, /const todayIso = businessDate\(\);/);
  assert.match(calendar, /\.select\('id, "arCode", name, "nameEn", team, teams, "isActive", "billingRule"'\)/);
  assert.match(calendar, /\.eq\('billingRule->runs->>kind', 'calendar'\)/);
  assert.match(calendar, /fetchAllResult\(\(\) => supabase/);
  assert.match(calendar, /\.order\('id', \{ ascending: true \}\)/);
  assert.match(calendar, /if \(error\) return \{ sent: 0, error: error\.message \};/);
  assert.match(calendar, /skipArCodes: \[SAHAMIT_AR_CODE\]/);
  assert.match(calendar, /if \(unrouted\) errors\.push/);
  for (const block of [cutoff, calendar]) assert.doesNotMatch(block, /toISOString\(\)\.slice/);
});

/* ฐานปลอมของตัวแกะปุ่ม (ทรงเดียวกับ billingDueAction.test.mjs) */
function stub(results = {}) {
  const from = (table) => {
    const chain = {
      select: () => chain,
      in: () => chain,
      limit: async () => results[table] ?? { data: [], error: null },
    };
    return chain;
  };
  return { from };
}

test('ตัวแกะปุ่มรู้จักกระดิ่งวันตัดรอบ — ใบที่รอแค่งวดเดียวได้ปุ่ม "ขอใบวางบิลงวดนี้" จากงวด/ใบสด · หลายงวดไม่มีปุ่ม', async () => {
  const { sales } = billingCutoffNotices(ROWS, ctx({ requestsById: new Map([['RQ-SENT', { id: 'RQ-SENT', status: 'pending' }]]) }));
  const rows = sales.map((notice, i) => ({ id: `N${i}`, kind: notice.kind, href: notice.href }));
  const live = {
    sales_order_installments: { data: [{ ...ROWS[3], billingRequestId: null }], error: null },
    sales_orders: { data: [{ id: 'B', status: 'approved', origin: 'pipeline', quotationId: 'QT-B', customerId: 'C-281' }], error: null },
    quotations: { data: [{ id: 'QT-B', status: 'accepted', quoteNumber: 'QT-B' }], error: null },
    customers: { data: [{ id: 'C-281', billingRule: meemetta(0) }], error: null },
  };
  const out = await attachNotificationActions(stub(live), rows);
  assert.deepEqual(out.map((r) => r.href), ['/sa/sales-orders/A?tab=payment', '/sa/sales-orders/B?tab=payment']);
  assert.equal(out[0].action, null, 'สองงวด = ไม่มีปุ่ม');
  assert.equal(out[1].action?.label, 'ขอใบวางบิลงวดนี้');
  assert.equal(new URL(out[1].action.href, 'http://x').searchParams.get('installmentId'), 'b2');
});
