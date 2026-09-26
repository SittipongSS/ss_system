// ── ปุ่ม "ขอใบวางบิลงวดนี้" ในแถวกระดิ่ง "ถึงรอบวางบิล" (กำหนดวางบิล รอบสอง · 26/09 · มติเจ้าของ ข้อ 5) ───────────
// ⭐ ตรึงสามเรื่อง:
//   1. แถวฝั่งขายพกลิงก์ปุ่ม = ลิงก์เดียวกับปุ่มในแผงงวด (billingRequestHref) · ใบที่ไม่อ้าง QT ไม่มีปุ่ม
//   2. API แกะลิงก์ออกจาก `href` ทุกแถว แล้วตัดสินปุ่มจาก **งวด + ใบสดตอนเปิดกล่อง** — ผูกคำร้องแล้ว (ทุกสถานะ) /
//      จบแล้ว / หาไม่เจอ / อ่านพลาด / ใบยกเลิก·ถูกออก Rev. ทับ·ร่างที่ QT ตาย·ใบย้อนหลังที่ยังไม่อนุมัติ = ไม่มีปุ่ม
//      (ปุ่มที่ขึ้นผิดจังหวะ = คำร้องซ้ำ/คำร้องของใบตาย) · ลิงก์ของปุ่ม **ประกอบใหม่จากค่าสด** (ใบของงวด · ยอด · วันวางบิล)
//   3. กระดิ่งวาดปุ่มนอกลิงก์ของแถว โทนรอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_DUE_ACTION_LABEL, BILLING_DUE_KIND, billingDueAction, billingDueActionInstallmentId, billingDueActionOpen,
  billingDueNotice,
} from '@/lib/sales/billingDueNotify';
import { billingRequestHref } from '@/lib/sales/billingRequestHref';
import { splitNotificationAction } from '@/lib/notificationAction';
import { attachNotificationActions } from '@/lib/notifications';

const order = (over = {}) => ({
  id: 'SOR-50', orderNumber: 'SO-26080050-0', status: 'approved', origin: 'pipeline', quotationId: 'QT-50',
  totalAmount: 102771.36, customerName: 'บริษัท เจอร์นัล แล็บ จำกัด', ownerId: 'U-AE', deal: { ownerId: 'U-AE' }, ...over,
});
const inst = (over = {}) => ({
  id: 'SOI-1', salesOrderId: 'SOR-50', seq: 1, label: 'มัดจำ', amount: 51385.68, status: 'pending', kind: 'regular',
  frozenAt: '2026-08-20T03:00:00Z', refundedAt: null, billingDate: '2026-10-05', billingRequestId: null, ...over,
});

// ── 1. ตอนยิง ─────────────────────────────────────────────────────────────────────────────────────
test('แถวฝั่งขายพกลิงก์ปุ่ม = ลิงก์ของแผงงวด (billingRequestHref) · แถวยังพาไปแท็บการชำระ', () => {
  const notice = billingDueNotice({ installment: inst(), order: order() });
  const { href, actionHref } = splitNotificationAction(notice.href);
  assert.equal(href, '/sa/sales-orders/SOR-50?tab=payment');
  assert.equal(actionHref, billingRequestHref(order(), inst()));
  assert.equal(billingDueActionInstallmentId(actionHref), 'SOI-1');
  assert.equal(BILLING_DUE_ACTION_LABEL, 'ขอใบวางบิลงวดนี้');
});

test('ใบที่ไม่อ้างใบเสนอราคา (ใบย้อนหลัง) ไม่มีปุ่ม — คำร้องขอเอกสารการเงินต้องอ้าง QT', () => {
  const notice = billingDueNotice({ installment: inst(), order: order({ quotationId: null }) });
  assert.equal(notice.href, '/sa/sales-orders/SOR-50?tab=payment');
});

// ── 2. ตัวตัดสินล้วน ──────────────────────────────────────────────────────────────────────────────
test('ชั้นงวด: ปุ่มขึ้นเมื่องวดยังรอเงินและยังไม่ผูกคำร้อง · ผูกแล้วทุกสถานะ (รวมร่าง/ลิงก์ตาย) = ซ่อน — ตรงกับ `!billingRequestId` ของแผงงวด', () => {
  assert.equal(billingDueActionOpen(inst()), true);
  // เลยรอบไปแล้วก็ยังขอได้ (ปุ่มไม่ผูกกับหน้าต่างเตือน 0..3 วัน)
  assert.equal(billingDueActionOpen(inst({ billingDate: '2026-09-01' })), true);
  assert.equal(billingDueActionOpen(inst({ status: 'rejected' })), true, 'ตีกลับ = ยังต้องเก็บเงิน');
  assert.equal(billingDueActionOpen(inst({ billingRequestId: 'RQ-9' })), false);
  for (const status of ['reported', 'confirmed']) assert.equal(billingDueActionOpen(inst({ status })), false, status);
  assert.equal(billingDueActionOpen(inst({ status: 'confirmed', refundedAt: '2026-09-20T00:00:00Z' })), false);
  assert.equal(billingDueActionOpen(inst({ kind: 'opening' })), false, 'งวดยกมาไม่มีรอบวางบิล');
  assert.equal(billingDueActionOpen(null), false, 'งวดหาไม่เจอ (ลบใบ/ปรับแผน)');
  assert.equal(billingDueActionOpen(undefined), false);
  assert.equal(billingDueActionInstallmentId('/requests/new?kind=billing_doc'), '');
  assert.equal(billingDueActionInstallmentId(''), '');
});

test('ชั้นใบ: ล็อกทั้งใบตัวเดียวกับ `link` ของแผงงวด + ใบต้องอ้าง QT + ต้องเป็นใบที่งวดอยู่ตอนนี้', () => {
  assert.deepEqual(billingDueAction(inst(), order()), { href: billingRequestHref(order(), inst()), label: 'ขอใบวางบิลงวดนี้' });
  // ร่าง Rev. (มติ D3) · ย้อนอนุมัติรอออก Rev. = ยังขอได้ (แผงก็เปิด)
  assert.ok(billingDueAction(inst({ salesOrderId: 'SOR-51' }), order({ id: 'SOR-51', status: 'draft' })));
  assert.ok(billingDueAction(inst(), order({ status: 'approval_revoked' })));
  for (const [why, o] of [
    ['ใบยกเลิก', order({ status: 'cancelled' })],
    ['ใบถูกออก Rev. ทับ', order({ status: 'revised' })],
    ['ร่างที่ QT ถูกถอด Won', order({ status: 'draft', quotation: { status: 'sent', quoteNumber: 'QT-50' } })],
    ['ใบย้อนหลังที่ยังไม่อนุมัติ', order({ origin: 'historical', status: 'pending_approval' })],
    ['ใบไม่อ้าง QT', order({ quotationId: null })],
    ['ไม่รู้จักใบ', null],
    ['ใบไม่ใช่บ้านปัจจุบันของงวด', order({ id: 'SOR-OLD' })],
  ]) assert.equal(billingDueAction(inst(), o), null, why);
  // ชั้นงวดยังต้องผ่านก่อน
  assert.equal(billingDueAction(inst({ billingRequestId: 'RQ-9' }), order()), null);
  assert.equal(billingDueAction(null, order()), null);
});

// ── 3. ตอนอ่านกล่อง (API) ──────────────────────────────────────────────────────────────────────────
/* ฐานปลอมรายตาราง — `results[table]` = `{ data, error }` หรือ Error (throw) · ตารางที่ไม่ได้ให้ = ว่าง */
function stub(results = {}) {
  const calls = [];
  const from = (table) => {
    calls.push(['from', table]);
    const chain = {
      select: (cols) => { calls.push(['select', table, cols]); return chain; },
      in: (col, ids) => { calls.push(['in', table, col, ids]); return chain; },
      limit: async (n) => {
        calls.push(['limit', table, n]);
        const result = results[table] ?? { data: [], error: null };
        if (result instanceof Error) throw result;
        return result;
      },
    };
    return chain;
  };
  return { calls, supabase: { from } };
}
const liveRow = (over = {}) => ({
  id: 'SOI-1', salesOrderId: 'SOR-50', amount: 51385.68, status: 'pending', kind: 'regular', refundedAt: null,
  billingDate: '2026-10-05', billingRequestId: null, ...over,
});
const liveOrder = (over = {}) => ({ id: 'SOR-50', status: 'approved', origin: 'pipeline', quotationId: 'QT-50', ...over });
const QT = { id: 'QT-50', status: 'accepted', quoteNumber: 'QT-26080050-1' };
const notif = (id, installment, over = {}) => ({
  id, kind: BILLING_DUE_KIND, ...billingDueNotice({ installment, order: order() }), ...over,
});
const ok = (data) => ({ data, error: null });

test('🔴 แกะลิงก์ออกทุกแถว · ปุ่มขึ้นเฉพาะงวดที่ยังขอได้ (อ่านงวด → ใบ → QT ครั้งเดียวต่อหน้า)', async () => {
  const rows = [
    notif('N1', inst()),
    notif('N2', inst({ id: 'SOI-2', seq: 2 })), // ผูกคำร้องไปแล้วหลังกระดิ่งยิง
    notif('N3', inst({ id: 'SOI-3', seq: 3 })), // ถูกลบ/ปรับแผน — หาไม่เจอ
    notif('N4', inst({ id: 'SOI-4', seq: 4 })), // แจ้งชำระแล้ว
    { id: 'N5', kind: 'task_assign', href: '/pm/tasks/T-1' },
  ];
  const { calls, supabase } = stub({
    sales_order_installments: ok([
      liveRow(),
      liveRow({ id: 'SOI-2', billingRequestId: 'RQ-9' }),
      liveRow({ id: 'SOI-4', status: 'reported' }),
    ]),
    sales_orders: ok([liveOrder()]),
    quotations: ok([QT]),
  });
  const out = await attachNotificationActions(supabase, rows);
  assert.deepEqual(out.map((r) => r.href), [
    '/sa/sales-orders/SOR-50?tab=payment', '/sa/sales-orders/SOR-50?tab=payment',
    '/sa/sales-orders/SOR-50?tab=payment', '/sa/sales-orders/SOR-50?tab=payment', '/pm/tasks/T-1',
  ]);
  assert.deepEqual(out.map((r) => Boolean(r.action)), [true, false, false, false, false]);
  assert.deepEqual(out[0].action, { href: billingRequestHref(liveOrder(), liveRow()), label: 'ขอใบวางบิลงวดนี้' });
  // สาม query ตามลำดับ · เฉพาะช่องที่ตัวตัดสิน/ตัวประกอบลิงก์อ่าน · เพดานเท่าจำนวน id
  assert.deepEqual(calls.filter(([op]) => op === 'from').map(([, table]) => table),
    ['sales_order_installments', 'sales_orders', 'quotations']);
  assert.deepEqual(calls.filter(([op]) => op === 'in').map(([, table, col, ids]) => [table, col, ids]), [
    ['sales_order_installments', 'id', ['SOI-1', 'SOI-2', 'SOI-3', 'SOI-4']],
    ['sales_orders', 'id', ['SOR-50']],
    ['quotations', 'id', ['QT-50']],
  ]);
  assert.deepEqual(calls.filter(([op]) => op === 'limit').map(([, table, n]) => [table, n]),
    [['sales_order_installments', 4], ['sales_orders', 1], ['quotations', 1]]);
  const select = Object.fromEntries(calls.filter(([op]) => op === 'select').map(([, table, cols]) => [table, cols]));
  for (const col of ['"salesOrderId"', 'amount', '"billingDate"', '"billingRequestId"']) {
    assert.ok(select.sales_order_installments.includes(col), col);
  }
  assert.equal(select.sales_orders, 'id, status, origin, "quotationId"');
  assert.equal(select.quotations, 'id, status, "quoteNumber"');
});

test('🔴 งวดย้ายไปร่าง Rev. หลังกระดิ่งยิง (0376 · id เดิม) — ปุ่มชี้ร่าง Rev. ไม่ใช่ใบที่ถูกทับ', async () => {
  // แถวยิงตอนงวดอยู่ SOR-50 · ตอนนี้งวดเดียวกันอยู่ร่าง Rev. SOR-50R (วันวางบิลเดิม ⇒ dedupeKey เดิม ไม่มีแถวใหม่)
  const { calls, supabase } = stub({
    sales_order_installments: ok([liveRow({ salesOrderId: 'SOR-50R' })]),
    sales_orders: ok([liveOrder({ id: 'SOR-50R', status: 'draft' })]),
    quotations: ok([QT]),
  });
  const [row] = await attachNotificationActions(supabase, [notif('N1', inst())]);
  assert.equal(row.href, '/sa/sales-orders/SOR-50?tab=payment', 'แถวยังพาไปที่เดิม (หน้าใบเก่าบอกว่างวดย้ายไปไหน)');
  const params = new URL(row.action.href, 'http://x').searchParams;
  assert.equal(params.get('salesOrderId'), 'SOR-50R');
  assert.equal(params.get('returnTo'), '/sales-planning/sales-orders/SOR-50R');
  assert.equal(params.get('installmentId'), 'SOI-1');
  // ใบที่อ่านคือใบของงวดสด ไม่ใช่ใบที่ลิงก์เก่าอ้าง
  assert.deepEqual(calls.find(([op, table]) => op === 'in' && table === 'sales_orders'), ['in', 'sales_orders', 'id', ['SOR-50R']]);
});

test('🔴 ใบถูกยกเลิก/ถูกออก Rev. ทับหลังกระดิ่งยิง = ไม่มีปุ่ม (งวดยังรอเงินก็ตาม)', async () => {
  for (const status of ['cancelled', 'revised']) {
    const { supabase } = stub({
      sales_order_installments: ok([liveRow()]),
      sales_orders: ok([liveOrder({ status })]),
      quotations: ok([QT]),
    });
    const [row] = await attachNotificationActions(supabase, [notif('N1', inst())]);
    assert.equal(row.action, null, status);
    assert.equal(row.href, '/sa/sales-orders/SOR-50?tab=payment');
  }
});

test('ร่างที่ QT ถูกถอด Won (กู้คืนจากการยกเลิก) = ไม่มีปุ่ม — สถานะ QT อ่านสดมาให้ด่านของใบ', async () => {
  const { supabase } = stub({
    sales_order_installments: ok([liveRow()]),
    sales_orders: ok([liveOrder({ status: 'draft' })]),
    quotations: ok([{ ...QT, status: 'sent' }]),
  });
  const [row] = await attachNotificationActions(supabase, [notif('N1', inst())]);
  assert.equal(row.action, null);
});

test('🔴 จัดวันใหม่/ปรับแผนหลังกระดิ่งยิง — ปุ่มเติมวันวางบิลและยอด **สด** ไม่ใช่ของเช้าที่ยิง', async () => {
  const { supabase } = stub({
    sales_order_installments: ok([liveRow({ billingDate: '2026-10-25', amount: 30000 })]),
    sales_orders: ok([liveOrder()]),
    quotations: ok([QT]),
  });
  const fired = notif('N1', inst()); // ยิงตอนวันวางบิล 5 ต.ค. ยอด 51,385.68
  assert.equal(new URL(splitNotificationAction(fired.href).actionHref, 'http://x').searchParams.get('requiredDate'), '2026-10-05');
  const [row] = await attachNotificationActions(supabase, [fired]);
  const params = new URL(row.action.href, 'http://x').searchParams;
  assert.equal(params.get('requiredDate'), '2026-10-25');
  assert.equal(params.get('billAmount'), '30000');
  // วันวางบิลถูกล้าง (ย้ายไปรอเหตุการณ์) = ยังขอได้ แต่ไม่เติมวันเก่า
  const cleared = stub({
    sales_order_installments: ok([liveRow({ billingDate: null })]), sales_orders: ok([liveOrder()]), quotations: ok([QT]),
  });
  const [noDate] = await attachNotificationActions(cleared.supabase, [notif('N1', inst())]);
  assert.equal(new URL(noDate.action.href, 'http://x').searchParams.has('requiredDate'), false);
});

test('ไม่มีแถวที่มีปุ่ม = ไม่แตะฐาน · แถวเดิมไม่เปลี่ยน href', async () => {
  const { calls, supabase } = stub();
  const out = await attachNotificationActions(supabase, [{ id: 'N1', kind: 'task_assign', href: '/pm/tasks/T-1' }]);
  assert.equal(calls.length, 0);
  assert.deepEqual(out, [{ id: 'N1', kind: 'task_assign', href: '/pm/tasks/T-1', action: null }]);
  assert.deepEqual(await attachNotificationActions(supabase, []), []);
});

test('งวดหาไม่เจอทั้งหน้า = ไม่อ่านใบ/QT ต่อ · ใบหาไม่เจอ = ไม่มีปุ่ม', async () => {
  const none = stub({ sales_order_installments: ok([]) });
  const [a] = await attachNotificationActions(none.supabase, [notif('N1', inst())]);
  assert.equal(a.action, null);
  assert.deepEqual(none.calls.filter(([op]) => op === 'from').map(([, table]) => table), ['sales_order_installments']);
  const orphan = stub({ sales_order_installments: ok([liveRow()]), sales_orders: ok([]) });
  const [b] = await attachNotificationActions(orphan.supabase, [notif('N1', inst())]);
  assert.equal(b.action, null);
});

test('🔴 อ่านงวด/ใบ/QT พลาด (error / throw) = ไม่มีปุ่ม แต่แถวยังอยู่ครบ — ห้ามพังกล่องทั้งกล่อง', async () => {
  const good = { sales_order_installments: ok([liveRow()]), sales_orders: ok([liveOrder()]), quotations: ok([QT]) };
  for (const table of Object.keys(good)) {
    for (const failure of [{ data: null, error: { message: 'boom' } }, new Error('network')]) {
      const { supabase } = stub({ ...good, [table]: failure });
      const out = await attachNotificationActions(supabase, [notif('N1', inst())]);
      assert.equal(out.length, 1);
      assert.equal(out[0].href, '/sa/sales-orders/SOR-50?tab=payment');
      assert.equal(out[0].action, null, `${table} ${failure instanceof Error ? 'throw' : 'error'}`);
    }
  }
});

test('ปุ่มขึ้นเฉพาะชนิดที่รู้จัก — ลิงก์ปุ่มในแถวชนิดอื่นถูกถอดทิ้งเฉย ๆ', async () => {
  const { calls, supabase } = stub();
  const foreign = { ...notif('N1', inst()), kind: 'sales_order_billing_due_fn' };
  const out = await attachNotificationActions(supabase, [foreign]);
  assert.equal(out[0].href, '/sa/sales-orders/SOR-50?tab=payment');
  assert.equal(out[0].action, null);
  assert.equal(calls.length, 0);
});

// ── 4. จอ ─────────────────────────────────────────────────────────────────────────────────────────
test('กระดิ่งวาดปุ่มจาก `action` ของ API · นอกลิงก์ของแถว · โทนรอง (ไม่ใช่ navy/terracotta)', () => {
  const src = readFileSync(new URL('../../components/notifications/NotificationBell.js', import.meta.url), 'utf8');
  const at = src.indexOf('n.action?.href');
  assert.ok(at > 0, 'กระดิ่งไม่วาดปุ่มในแถว');
  const linkClose = src.lastIndexOf('</Link>', at);
  assert.ok(linkClose > 0 && linkClose < at, 'ปุ่มต้องอยู่หลังลิงก์ของแถวปิดแล้ว (ลิงก์ซ้อนลิงก์ไม่ได้)');
  const button = src.slice(at, src.indexOf('</Button>', at));
  assert.match(button, /href=\{n\.action\.href\}/);
  assert.match(button, /tone="neutral" variant="outline"/);
  assert.doesNotMatch(button, /tone="(primary|accent)"/);
  assert.match(button, /\{n\.action\.label\}/);
});

test('API กล่องแจ้งเตือนส่งแถวผ่านตัวแกะก่อนถึงจอ (listNotificationPage)', () => {
  const lib = readFileSync(new URL('../notifications.js', import.meta.url), 'utf8');
  const page = lib.slice(lib.indexOf('export async function listNotificationPage'), lib.indexOf('export async function attachNotificationActions'));
  assert.match(page, /items: await attachNotificationActions\(supabase, items\),/);
});
