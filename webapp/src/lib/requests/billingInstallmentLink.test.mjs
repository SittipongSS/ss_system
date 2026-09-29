// ผูกงวดอัตโนมัติตอนเปิดคำร้องจาก "ขอใบวางบิลงวดนี้" — ด่าน (ตรรกะล้วน) + ตัวผูก (ฐานปลอม)
// ⭐ สิ่งที่ล็อก: ด่านตอบคำเดียวกับ PATCH `link` ทุกข้อที่ใช้ร่วมกัน · เข้มกว่าสามข้อตามข้อกำหนด ·
//   ตัวผูกไม่ throw เด็ดขาด (ผูกไม่ได้ต้องไม่ล้มการเปิดใบ) · เขียนแบบมี optimistic lock
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_LINK_MANUAL_HINT, billingInstallmentLinkError, billingLinkDead, billingLinkWarning, linkNewBillingRequest,
} from './billingInstallmentLink.js';
import { billingRequestAlive } from '../finance/paymentLedger.js';
import {
  INSTALLMENT_STALE_MESSAGE, PIPELINE_CANCELLED_LOCK, installmentActionError, pipelineInstallmentLock,
} from '../sales/salesOrderPayments.js';
import { historicalInstallmentLock } from '../sales/historicalOrders.js';

const ae = { id: 'u-ae', role: 'ae', teams: ['KA'] };
const otherAe = { id: 'u-other', role: 'ae', teams: ['KA'] };
const fn = { id: 'u-fn', role: 'finance' };
const deal = { id: 'D-1', team: 'KA', ownerId: 'u-ae' };
const order = {
  id: 'SO-1', dealId: 'D-1', quotationId: 'QT-1', status: 'approved', origin: 'pipeline',
  orderNumber: 'SO-26090001-0', quotation: { id: 'QT-1', status: 'accepted', quoteNumber: 'QT-26090001-0' },
};
const row = {
  id: 'INS-1', salesOrderId: 'SO-1', seq: 1, kind: 'regular', status: 'pending',
  billingRequestId: null, refundedAt: null, updatedAt: '2026-09-26T01:00:00.000Z',
};
const request = { id: 'DR-new', kind: 'billing_doc', quotationId: 'QT-1', salesOrderId: 'SO-1' };
const decide = (over = {}) => billingInstallmentLinkError({
  installment: row, order, request, user: ae, ...over,
});

test('ผูกได้: งวดรอชำระ/แจ้งชำระแล้ว/ถูกตีกลับ ของใบที่คำร้องอ้าง QT เดียวกัน', () => {
  assert.equal(decide(), null);
  assert.equal(decide({ installment: { ...row, status: 'reported' } }), null);
  assert.equal(decide({ installment: { ...row, status: 'rejected' } }), null);
  // ใบยังไม่อนุมัติ (ร่างของ QT ที่ยัง Won) ผูกได้เหมือนการผูกเอง
  assert.equal(decide({ order: { ...order, status: 'draft' } }), null);
});

test('หัวข้อผิด หรือคำร้องไม่อ้างใบสั่งขาย = ไม่ผูก', () => {
  assert.match(decide({ request: { ...request, kind: 'doc_request' } }), /เฉพาะคำร้องขอเอกสารการเงินที่อ้างใบสั่งขาย/);
  assert.match(decide({ request: { ...request, salesOrderId: null } }), /เฉพาะคำร้องขอเอกสารการเงินที่อ้างใบสั่งขาย/);
});

test('งวดต้องอยู่ในใบที่คำร้องอ้างตอนบันทึก — ไม่พบ/อยู่ใบอื่น = ไม่ผูก', () => {
  const miss = 'งวดที่กดมาไม่อยู่ในใบสั่งขายที่คำร้องอ้าง';
  assert.equal(decide({ installment: null }), miss);
  assert.equal(decide({ installment: { ...row, salesOrderId: 'SO-2' } }), miss);
});

test('สิทธิ์ + ล็อกทั้งใบ = คำเดียวกับ PATCH `link` (installmentActionError ตัวจริง)', () => {
  // บัญชีไม่มี salesplan:edit — ผูกเองก็ไม่ได้
  assert.equal(decide({ user: fn }), 'ไม่มีสิทธิ์แก้การผูกคำร้อง');
  const parity = (o) => installmentActionError(row, 'link', ae, {
    billingRequestId: request.id, orderLock: historicalInstallmentLock(o) || pipelineInstallmentLock(o, 'link'),
  });
  const cancelled = { ...order, status: 'cancelled' };
  assert.equal(decide({ order: cancelled }), PIPELINE_CANCELLED_LOCK);
  assert.equal(decide({ order: cancelled }), parity(cancelled));
  const revised = { ...order, status: 'revised', supersededById: 'SO-1R' };
  assert.match(decide({ order: revised }), /ย้ายไป/);
  assert.equal(decide({ order: revised }), parity(revised));
  // ร่างที่ QT ถูกถอด Won แล้ว — ต้องมีสถานะ QT ติดมากับใบ (ตัวผูกโหลดให้)
  const deadDraft = { ...order, status: 'draft', quotation: { status: 'approved', quoteNumber: 'QT-26090001-0' } };
  assert.match(decide({ order: deadDraft }), /ไม่ได้เป็น Won แล้ว/);
  const historicalDraft = { ...order, origin: 'historical', status: 'draft' };
  assert.equal(decide({ order: historicalDraft }), historicalInstallmentLock(historicalDraft));
});

test('ใบเสนอราคาต้องเป็นใบเดียวกัน — ข้อความตรงกับ PATCH `link`', () => {
  assert.equal(decide({ order: { ...order, quotationId: null } }),
    'ใบสั่งขายนี้ไม่ได้อ้างใบเสนอราคา — ผูกคำร้องขอเอกสารการเงินไม่ได้');
  assert.equal(decide({ request: { ...request, quotationId: 'QT-9' } }),
    'คำร้องนี้เป็นของใบเสนอราคาคนละใบกับใบสั่งขายนี้');
});

test('เข้มกว่าการผูกเอง: งวดยกมา · ผูกใบอื่นอยู่ · คืนเงินแล้ว · รับรองแล้ว', () => {
  assert.match(decide({ installment: { ...row, kind: 'opening' } }), /^งวดยกมา/);
  // ไม่ทับคำร้องที่ผูกไว้ก่อน — ทับ = ใบเดิมหลุดจากงวดเงียบ ๆ · ไม่ได้โหลดคำร้องเดิมมา = ถือว่ายังมีชีวิต
  assert.match(decide({ installment: { ...row, seq: 2, billingRequestId: 'DR-old' } }), /งวดที่ 2 ผูกคำร้องอื่นไว้แล้ว/);
  // คืนเงินแล้วสถานะยังเป็น confirmed — ต้องได้คำเรื่องคืนเงิน ไม่ใช่ "รับรองแล้ว"
  const refunded = { ...row, status: 'confirmed', refundedAt: '2026-09-20T03:00:00.000Z' };
  assert.match(decide({ installment: refunded }), /บันทึกคืนเงินแล้ว/);
  const confirmed = decide({ installment: { ...row, status: 'confirmed' } });
  assert.match(confirmed, /รับรองการชำระแล้ว/);
  // การผูกเองยังรับงวดที่รับรองแล้ว (ใบเสร็จ) ⇒ คำเตือนต้องชี้ทางนั้น
  assert.ok(confirmed.includes(BILLING_LINK_MANUAL_HINT));
});

test('ลิงก์ตาย (คำร้องถูกลบ/ยกเลิก/ปฏิเสธ) ทับได้ · ลิงก์ที่ยังมีชีวิต/ไม่รู้สถานะ = ไม่ทับ', () => {
  const linked = { ...row, seq: 2, billingRequestId: 'DR-old' };
  const withLinked = (linkedRequest) => decide({ installment: linked, linkedRequest });
  // ตาย — ข้อกำหนด "ขอแล้ว" ไม่นับลิงก์พวกนี้ ⇒ ทางอัตโนมัติต้องไม่ตอบ "ผูกไว้แล้ว"
  assert.equal(withLinked(null), null, 'คำร้องถูกลบ');
  assert.equal(withLinked({ id: 'DR-old', status: 'cancelled' }), null);
  assert.equal(withLinked({ id: 'DR-old', status: 'rejected' }), null);
  // ยังมีชีวิต — ไม่ทับ
  for (const status of ['submitted', 'in_progress', 'done']) {
    assert.match(withLinked({ id: 'DR-old', status }), /งวดที่ 2 ผูกคำร้องอื่นไว้แล้ว/, status);
  }
  // ไม่ได้โหลดมา (undefined) หรือโหลดผิดใบ = ไม่รู้ ⇒ ไม่ทับ
  assert.match(withLinked(undefined), /ผูกคำร้องอื่นไว้แล้ว/);
  assert.match(withLinked({ id: 'DR-other', status: 'cancelled' }), /ผูกคำร้องอื่นไว้แล้ว/);
  // ลิงก์ตายไม่ปลดด่านอื่น — งวดที่รับรองแล้วยังไม่ผูกให้
  assert.match(decide({ installment: { ...linked, status: 'confirmed' }, linkedRequest: null }), /รับรองการชำระแล้ว/);
});

test('ลิงก์ตาย = กติกาเดียวกับทะเบียนบัญชี (billingRequestAlive) — ไม่มีรายการสถานะของตัวเอง', () => {
  const linked = { billingRequestId: 'DR-old' };
  for (const status of ['draft', 'submitted', 'cancelled', 'rejected', 'done']) {
    const request = { id: 'DR-old', status };
    assert.equal(billingLinkDead(linked, request), !billingRequestAlive(request), status);
  }
  assert.equal(billingLinkDead(linked, null), !billingRequestAlive(null));
  // งวดไม่มีลิงก์ = ไม่มีอะไรให้ทับ
  assert.equal(billingLinkDead({ billingRequestId: null }, null), false);
  const src = readFileSync('src/lib/requests/billingInstallmentLink.js', 'utf8');
  assert.match(src, /import \{ billingRequestAlive \} from '@\/lib\/finance\/paymentLedger'/);
  assert.doesNotMatch(src, /\['cancelled', 'rejected'\]/, 'ห้ามเขียนรายการสถานะตายเอง');
});

/* ── ตัวผูก: ฐานปลอมที่ตอบตามตาราง + จดทุกคำสั่ง ──────────────────────────── */
function fakeDb({
  orderRow = { ...order, quotation: undefined, deal }, quotationRow = order.quotation,
  installment = row, updated = { ...row, billingRequestId: request.id, updatedAt: '2026-09-26T02:00:00.000Z' },
  linkedRow = null, failOn = null,
} = {}) {
  const calls = [];
  function builder(table) {
    const q = { table, op: 'select', filters: [], patch: null };
    calls.push(q);
    const chain = {
      select() { return chain; },
      update(patch) { q.op = 'update'; q.patch = patch; return chain; },
      eq(col, val) { q.filters.push([col, val]); return chain; },
      async maybeSingle() {
        if (failOn === table) return { data: null, error: { message: `boom ${table}` } };
        if (table === 'sales_orders') return { data: orderRow, error: null };
        if (table === 'quotations') return { data: quotationRow, error: null };
        if (table === 'dept_requests') return { data: linkedRow, error: null };
        if (table === 'sales_order_installments') {
          return { data: q.op === 'update' ? updated : installment, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  }
  return { calls, from: (table) => builder(table) };
}
const quietly = async (fn) => {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try { return await fn(); } finally { console.warn = warn; console.error = error; }
};

test('ตัวผูก: ไม่ได้ขอให้ผูก = ไม่แตะฐานเลย', async () => {
  const db = fakeDb();
  assert.deepEqual(await linkNewBillingRequest(db, { user: ae, request, installmentId: '' }), {});
  assert.deepEqual(await linkNewBillingRequest(db, { user: ae, request, installmentId: '   ' }), {});
  assert.equal(db.calls.length, 0);
});

test('ตัวผูก: ผูกสำเร็จ — เขียนแค่ billingRequestId แบบมี optimistic lock แล้วคืน before/after ให้ลง audit', async () => {
  const db = fakeDb();
  const out = await linkNewBillingRequest(db, { user: ae, request, installmentId: 'INS-1' });
  assert.equal(out.warning, undefined);
  assert.equal(out.before.id, 'INS-1');
  assert.equal(out.after.billingRequestId, 'DR-new');
  assert.equal(out.order.orderNumber, 'SO-26090001-0');
  const write = db.calls.find((c) => c.op === 'update');
  assert.equal(write.table, 'sales_order_installments');
  assert.deepEqual(Object.keys(write.patch).sort(), ['billingRequestId', 'updatedAt']);
  assert.deepEqual(write.filters, [['id', 'INS-1'], ['updatedAt', row.updatedAt]]);
  // สถานะ QT ถูกโหลดมาให้ด่านร่างที่ QT ตาย
  assert.ok(db.calls.some((c) => c.table === 'quotations'));
  // งวดว่างอยู่แล้ว — ไม่ต้องไปอ่านคำร้องเดิม และไม่มีอะไรถูกทับ
  assert.ok(!db.calls.some((c) => c.table === 'dept_requests'));
  assert.equal(out.replaced, null);
});

test('ตัวผูก: ลิงก์เดิมตาย (ยกเลิก/ลบ) = ผูกทับ แล้วบอก id เดิมให้ลงสรุป audit', async () => {
  const linked = { ...row, billingRequestId: 'DR-old' };
  const cancelled = fakeDb({ installment: linked, linkedRow: { id: 'DR-old', status: 'cancelled', docNo: 'RQ-26090001' } });
  const out = await linkNewBillingRequest(cancelled, { user: ae, request, installmentId: 'INS-1' });
  assert.equal(out.warning, undefined);
  assert.equal(out.after.billingRequestId, 'DR-new');
  assert.equal(out.before.billingRequestId, 'DR-old', 'before ทั้งแถวเก็บ id เดิมไว้ให้ audit');
  assert.deepEqual(out.replaced, { id: 'DR-old', docNo: 'RQ-26090001', status: 'cancelled' });
  const read = cancelled.calls.find((c) => c.table === 'dept_requests');
  assert.deepEqual(read.filters, [['id', 'DR-old']]);
  // เขียนยังมี optimistic lock — มีคนผูกใบจริงทับระหว่างทาง = ไม่ทับซ้ำ
  assert.deepEqual(cancelled.calls.find((c) => c.op === 'update').filters, [['id', 'INS-1'], ['updatedAt', row.updatedAt]]);

  const deleted = await linkNewBillingRequest(fakeDb({ installment: linked, linkedRow: null }), {
    user: ae, request, installmentId: 'INS-1',
  });
  assert.deepEqual(deleted.replaced, { id: 'DR-old', docNo: null, status: null });
});

test('ตัวผูก: ลิงก์เดิมยังมีชีวิต = คำเตือน ไม่เขียน', async () => {
  const db = fakeDb({ installment: { ...row, billingRequestId: 'DR-old' }, linkedRow: { id: 'DR-old', status: 'submitted' } });
  const out = await quietly(() => linkNewBillingRequest(db, { user: ae, request, installmentId: 'INS-1' }));
  assert.match(out.warning, /ผูกคำร้องอื่นไว้แล้ว/);
  assert.ok(!db.calls.some((c) => c.op === 'update'));
});

test('ตัวผูก: ด่านไม่ผ่าน = คำเตือน ไม่เขียน', async () => {
  const db = fakeDb({ installment: { ...row, status: 'confirmed' } });
  const out = await quietly(() => linkNewBillingRequest(db, { user: ae, request, installmentId: 'INS-1' }));
  assert.match(out.warning, /^บันทึกร่างคำร้องแล้ว แต่ยังไม่ได้ผูกกับงวดชำระ — งวดนี้บัญชีรับรองการชำระแล้ว/);
  assert.ok(!db.calls.some((c) => c.op === 'update'));
});

test('ตัวผูก: หัวข้อผิดตัดก่อนแตะฐาน', async () => {
  const db = fakeDb();
  const out = await quietly(() => linkNewBillingRequest(db, {
    user: ae, request: { ...request, kind: 'doc_request' }, installmentId: 'INS-1',
  }));
  assert.match(out.warning, /เฉพาะคำร้องขอเอกสารการเงินที่อ้างใบสั่งขาย/);
  assert.equal(db.calls.length, 0);
});

test('ตัวผูก: ไม่มีสิทธิ์เห็นใบ = คำไทย (ไม่ใช่ forbidden ดิบ)', async () => {
  const out = await quietly(() => linkNewBillingRequest(fakeDb(), { user: otherAe, request, installmentId: 'INS-1' }));
  assert.equal(out.warning, billingLinkWarning('ไม่มีสิทธิ์ดูใบสั่งขายที่คำร้องอ้าง'));
  const missing = await quietly(() => linkNewBillingRequest(fakeDb({ orderRow: null }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.match(missing.warning, /ไม่พบใบสั่งขาย/);
});

test('ตัวผูก: อีกหน้าต่างแก้งวดแทรก (เขียนแล้วไม่มีแถวโดน) = คำเตือน stale', async () => {
  const out = await quietly(() => linkNewBillingRequest(fakeDb({ updated: null }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.ok(out.warning.includes(INSTALLMENT_STALE_MESSAGE));
  assert.equal(out.after, undefined);
});

test('ตัวผูกไม่ throw เด็ดขาด — ฐานพังทุกจุดได้คำเตือน (ใบร่างที่สร้างแล้วต้องตอบ 201)', async () => {
  for (const failOn of ['sales_orders', 'quotations', 'sales_order_installments', 'dept_requests']) {
    // งวดมีลิงก์ค้าง ⇒ ต้องอ่านคำร้องเดิม — อ่านพลาดห้ามเดาว่าตายแล้วทับ
    const installment = failOn === 'dept_requests' ? { ...row, billingRequestId: 'DR-old' } : row;
    const out = await quietly(() => linkNewBillingRequest(fakeDb({ failOn, installment }), {
      user: ae, request, installmentId: 'INS-1',
    }));
    assert.match(out.warning, /ยังไม่ได้ผูกกับงวดชำระ/, failOn);
    assert.equal(out.after, undefined, failOn);
    // ข้อความดิบของฐานไม่หลุดถึงจอ
    assert.ok(!out.warning.includes('boom'), failOn);
  }
  const broken = { from() { throw new Error('client gone'); } };
  const out = await quietly(() => linkNewBillingRequest(broken, { user: ae, request, installmentId: 'INS-1' }));
  assert.match(out.warning, /ระบบขัดข้องระหว่างผูกงวด/);
});

/* ── ต่อสายที่ route/จอ (ยามรูปของโค้ด — รีโปไม่มีตัวรัน route/React) ─────────────────── */

test('POST เปิดคำร้อง: ผูกหลังบรรทัดลงครบ · ก่อน findRequest · ผูกไม่ได้ตอบ 201 + _warning', () => {
  const src = readFileSync('src/app/api/sa/requests/route.js', 'utf8');
  const items = src.indexOf("from('dept_request_items').insert(itemRows)");
  const link = src.indexOf('linkNewBillingRequest(supabase');
  const created = src.indexOf('const created = await findRequest(supabase, requestId)');
  assert.ok(items > 0 && link > items && created > link, 'ลำดับ: บรรทัด → ผูกงวด → findRequest');
  assert.match(src, /installmentId: body\.linkInstallmentId/);
  // ด่านของตัวผูกต้องได้ SO ที่คำร้องเก็บจริง (บรีฟกลิ่น หรืออ้างอิงเพิ่มของขอเอกสาร)
  assert.match(src, /salesOrderId: salesOrderId \|\| optionalSalesOrderId/);
  assert.match(src, /link\.warning \? \{ \.\.\.created, _warning: link\.warning \} : created, \{ status: 201 \}/);
});

test('/requests/new: requiredDate เติมช่องวันที่ต้องการรับงาน · installmentId ส่งทาง extra ของ createRequestDraft', () => {
  const src = readFileSync('src/app/requests/new/page.js', 'utf8');
  assert.match(src, /requestedDueDate: prefillDueDate\(searchParams\.get\("requiredDate"\)\)/);
  // วันที่ผ่านไปแล้วไม่เติม — "วันนี้" จากนาฬิกาไทย
  assert.match(src, /iso && iso >= businessDate\(\) \? iso : ""/);
  /* วันที่ต้องมีจริงบนปฏิทิน — Date.parse('2026-02-30') ของ V8 ปัดเป็น 2 มี.ค. แล้วผ่าน ⇒ 500 ดิบตอน insert
     ⇒ ต้องประกอบวันกลับแล้วเทียบ (ห้ามถอยไปใช้ Date.parse เป็นด่าน) */
  assert.doesNotMatch(src, /isNaN\(Date\.parse\(/);
  assert.match(src, /date\.getUTCFullYear\(\) === year && date\.getUTCMonth\(\) === month - 1 && date\.getUTCDate\(\) === day/);
  assert.match(src, /createRequestDraft\(\s*form, linksInstallment \? \{ linkInstallmentId \} : \{\},?\s*\)/);
  // ท้ายแผงสัญญาว่าจะผูกเฉพาะตอน SO **และ QT** ยังเป็นใบที่กดมา (เปลี่ยน QT แล้ว server ตีกลับ)
  assert.match(src, /form\.salesOrderId === defaults\.salesOrderId\s*&& form\.quotationId === defaults\.quotationId/);
  // วันที่มากับลิงก์แต่ผ่านไปแล้ว = รายการความพร้อมบอกเหตุ ไม่ปล่อยช่องว่างเงียบ
  assert.match(src, /droppedDueDate && c\.tab === "due" && c\.label === dueLabel/);
});

test('createRequestDraft ส่งคำเตือนของ 201 ต่อให้จอ — ไม่งั้นผูกงวดไม่ได้แล้วเงียบ', () => {
  const src = readFileSync('src/lib/master/requestCreate.js', 'utf8');
  assert.match(src, /import \{ responseWarningText \} from '@\/lib\/apiWarnings'/);
  const body = src.slice(src.indexOf('export async function createRequestDraft'));
  const fnEnd = body.indexOf('\n}\n');
  assert.match(body.slice(0, fnEnd), /return \{ id: created\.id, error: null, warning: responseWarningText\(created\) \|\| null \}/);
  // จอเป็นคนอ่าน — และทักโทนเตือนผ่านถาดกลาง (ไม่หายตอน router.push)
  const page = readFileSync('src/app/requests/new/page.js', 'utf8');
  assert.match(page, /const \{ id, error, warning \} = await createRequestDraft\(/);
  assert.match(page, /if \(warning\) notifyToast\.warning\(warning, RESPONSE_WARNING_TOAST\)/);
});
