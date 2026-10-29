// ผูกงวดอัตโนมัติตอนเปิดคำร้อง ("ขอใบวางบิลงวดนี้" · ขอเอกสารจากหน้า QT) — ด่าน (ตรรกะล้วน) + ตัวผูก (ฐานปลอม)
// ⭐ สิ่งที่ล็อก: ด่านตอบคำเดียวกับ PATCH `link` ทุกข้อที่ใช้ร่วมกัน · หลายคำร้องต่องวด (mig 0413 · มติ 28/10) ⇒ งวดที่มีคำร้องอยู่แล้ว
//   และงวดที่รับรองแล้วผูกได้ · เขียนที่ **แถวคำร้อง** แบบ CAS แล้วซิงก์ตัวชี้ · ตัวผูกไม่ throw เด็ดขาด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_LINK_RACE, billingInstallmentLinkError, billingLinkWarning, linkNewBillingRequest,
} from './billingInstallmentLink.js';
import {
  PIPELINE_CANCELLED_LOCK, installmentActionError, pipelineInstallmentLock,
} from '../sales/salesOrderPayments.js';
import { historicalInstallmentLock } from '../sales/historicalOrders.js';
import { BILLING_INSTALLMENT_SCHEMA_MISSING } from '../sales/installmentRequests.js';

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

test('ผูกได้: งวดรอชำระ/แจ้งชำระแล้ว/ถูกตีกลับ/รับรองแล้ว ของใบที่คำร้องอ้าง QT เดียวกัน', () => {
  assert.equal(decide(), null);
  for (const status of ['reported', 'rejected', 'confirmed']) {
    // ⭐ รับรองแล้วผูกได้ (ใบเสร็จหลังเงินเข้า · มติ 28/10 ข้อ 3 — ผู้ใช้เลือกงวดเอง)
    assert.equal(decide({ installment: { ...row, status } }), null, status);
  }
  // ใบยังไม่อนุมัติ (ร่างของ QT ที่ยัง Won) ผูกได้เหมือนการผูกเอง
  assert.equal(decide({ order: { ...order, status: 'draft' } }), null);
});

test('⭐ หลายคำร้องต่องวด (0413): งวดที่มีคำร้องอื่นอยู่แล้ว — ส่งแล้ว/ร่าง/ยกเลิก — ผูกเพิ่มได้', () => {
  assert.equal(decide({ installment: { ...row, billingRequestId: 'DR-old' } }), null);
});

test('คำร้องที่ขอจากหน้า QT (ไม่อ้างใบสั่งขาย) ผูกได้ · อ้างใบอื่นอยู่ = ไม่ผูก · หัวข้อผิด = ไม่ผูก', () => {
  assert.equal(decide({ request: { ...request, salesOrderId: null } }), null);
  assert.equal(decide({ request: { ...request, salesOrderId: 'SO-2' } }), 'งวดที่กดมาไม่อยู่ในใบสั่งขายที่คำร้องอ้าง');
  assert.equal(decide({ request: { ...request, kind: 'doc_request' } }), 'ผูกงวดได้เฉพาะคำร้องขอเอกสารการเงิน');
});

test('งวดต้องอยู่ในใบที่โหลดมา — ไม่พบ/อยู่ใบอื่น = ไม่ผูก', () => {
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
  const route = readFileSync('src/app/api/sales-planning/sales-orders/[id]/installments/route.js', 'utf8');
  assert.ok(route.includes("'ใบสั่งขายนี้ไม่ได้อ้างใบเสนอราคา — ผูกคำร้องขอเอกสารการเงินไม่ได้'"));
  assert.ok(route.includes("'คำร้องนี้เป็นของใบเสนอราคาคนละใบกับใบสั่งขายนี้'"));
});

test('เข้มกว่าการผูกเองสองข้อ: งวดยกมา · คืนเงินแล้ว', () => {
  assert.match(decide({ installment: { ...row, kind: 'opening' } }), /^งวดยกมา/);
  // คืนเงินแล้วสถานะยังเป็น confirmed — ต้องได้คำเรื่องคืนเงิน
  const refunded = { ...row, status: 'confirmed', refundedAt: '2026-09-20T03:00:00.000Z' };
  assert.match(decide({ installment: refunded }), /บันทึกคืนเงินแล้ว/);
});

/* ── ตัวผูก: ฐานปลอมที่ตอบตามตาราง + จดทุกคำสั่ง ────────────────────────────
   ⭐ builder เป็น thenable (supabase-js) — `await update().eq()` ได้ `{ data, error }` · `range()` คืนหน้าของ fetchAll */
function fakeDb({
  orderRow = { ...order, quotation: undefined, deal }, quotationRow = order.quotation,
  installment = row, requestAfter = { id: request.id }, linked = [{ id: request.id, installmentId: 'INS-1', createdAt: '2026-09-26T02:00:00Z' }],
  pointerRow = { id: 'INS-1', billingRequestId: null }, failOn = null, failWrite = null,
} = {}) {
  const calls = [];
  function builder(table) {
    const q = { table, op: 'select', filters: [], patch: null };
    calls.push(q);
    const fail = () => ({ data: null, error: { message: `boom ${table}` } });
    const chain = {
      select() { return chain; },
      update(patch) { q.op = 'update'; q.patch = patch; return chain; },
      eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
      is(col, val) { q.filters.push(['is', col, val]); return chain; },
      in(col, val) { q.filters.push(['in', col, val]); return chain; },
      order() { return chain; },
      async range() {
        if (failOn === table) return fail();
        if (table === 'dept_requests') return { data: linked, error: null };
        if (table === 'sales_order_installments') return { data: [pointerRow], error: null };
        return { data: [], error: null };
      },
      async maybeSingle() {
        if (failOn === table) return fail();
        if (table === 'sales_orders') return { data: orderRow, error: null };
        if (table === 'quotations') return { data: quotationRow, error: null };
        if (table === 'dept_requests') {
          if (failWrite) return { data: null, error: failWrite };
          return { data: requestAfter, error: null };
        }
        if (table === 'sales_order_installments') return { data: installment, error: null };
        return { data: null, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve(failOn === table ? fail() : { data: null, error: null }).then(resolve, reject);
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

test('ตัวผูก: ผูกสำเร็จ — เขียนแถวคำร้อง (CAS installmentId IS NULL) แล้วเขียนตัวชี้ของงวด', async () => {
  const db = fakeDb();
  const out = await linkNewBillingRequest(db, { user: ae, request, installmentId: 'INS-1' });
  assert.equal(out.warning, undefined);
  assert.equal(out.installment.id, 'INS-1');
  assert.equal(out.order.orderNumber, 'SO-26090001-0');
  const write = db.calls.find((c) => c.op === 'update' && c.table === 'dept_requests');
  assert.deepEqual(write.patch, { installmentId: 'INS-1', installmentSeq: 1 });
  assert.deepEqual(write.filters, [['eq', 'id', 'DR-new'], ['is', 'installmentId', null]]);
  // ตัวชี้ของงวด = คำร้องแรกที่ผูก (ตัวเขียนเดียว syncBillingPointers)
  const pointer = db.calls.find((c) => c.op === 'update' && c.table === 'sales_order_installments');
  assert.equal(pointer.patch.billingRequestId, 'DR-new');
  assert.deepEqual(out.pointers, [{ id: 'INS-1', before: null, after: 'DR-new' }]);
  // สถานะ QT ถูกโหลดมาให้ด่านร่างที่ QT ตาย
  assert.ok(db.calls.some((c) => c.table === 'quotations'));
});

test('ตัวผูก: คำร้องที่ขอจากหน้า QT (ไม่อ้างใบสั่งขาย) — เติมใบของงวดให้', async () => {
  const db = fakeDb();
  await linkNewBillingRequest(db, { user: ae, request: { ...request, salesOrderId: null }, installmentId: 'INS-1' });
  const write = db.calls.find((c) => c.op === 'update' && c.table === 'dept_requests');
  assert.deepEqual(write.patch, { installmentId: 'INS-1', installmentSeq: 1, salesOrderId: 'SO-1' });
});

test('ตัวผูก: งวดที่มีคำร้องอื่นอยู่แล้ว — ตัวชี้คงเป็นคำร้องแรก (ไม่ทับ)', async () => {
  const db = fakeDb({
    installment: { ...row, billingRequestId: 'DR-old' },
    pointerRow: { id: 'INS-1', billingRequestId: 'DR-old' },
    linked: [
      { id: 'DR-old', installmentId: 'INS-1', createdAt: '2026-09-01T00:00:00Z' },
      { id: request.id, installmentId: 'INS-1', createdAt: '2026-09-26T02:00:00Z' },
    ],
  });
  const out = await linkNewBillingRequest(db, { user: ae, request, installmentId: 'INS-1' });
  assert.equal(out.warning, undefined);
  assert.deepEqual(out.pointers, []);
  assert.ok(!db.calls.some((c) => c.op === 'update' && c.table === 'sales_order_installments'));
});

test('ตัวผูก: ด่านไม่ผ่าน = คำเตือน ไม่เขียน', async () => {
  const db = fakeDb({ installment: { ...row, kind: 'opening' } });
  const out = await quietly(() => linkNewBillingRequest(db, { user: ae, request, installmentId: 'INS-1' }));
  assert.match(out.warning, /^บันทึกร่างคำร้องแล้ว แต่ยังไม่ได้ผูกกับงวดชำระ — งวดยกมา/);
  assert.ok(!db.calls.some((c) => c.op === 'update'));
});

test('ตัวผูก: หัวข้อผิดตัดก่อนแตะฐาน', async () => {
  const db = fakeDb();
  const out = await quietly(() => linkNewBillingRequest(db, {
    user: ae, request: { ...request, kind: 'doc_request' }, installmentId: 'INS-1',
  }));
  assert.match(out.warning, /เฉพาะคำร้องขอเอกสารการเงิน/);
  assert.equal(db.calls.length, 0);
});

test('ตัวผูก: ไม่มีสิทธิ์เห็นใบ = คำไทย (ไม่ใช่ forbidden ดิบ) · งวดไม่พบ = ไม่ผูก', async () => {
  const out = await quietly(() => linkNewBillingRequest(fakeDb(), { user: otherAe, request, installmentId: 'INS-1' }));
  assert.equal(out.warning, billingLinkWarning('ไม่มีสิทธิ์ดูใบสั่งขายของงวดที่เลือก'));
  const missing = await quietly(() => linkNewBillingRequest(fakeDb({ orderRow: null }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.match(missing.warning, /ไม่พบใบสั่งขาย/);
  const noRow = await quietly(() => linkNewBillingRequest(fakeDb({ installment: null }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.match(noRow.warning, /งวดที่กดมาไม่อยู่ในใบสั่งขาย/);
});

test('ตัวผูก: อีกคำขอผูกคำร้องนี้แทรก (CAS ไม่โดน) = คำเตือน · ฐานยังไม่รัน 0413 = คำเตือนรอรันมิก', async () => {
  const raced = await quietly(() => linkNewBillingRequest(fakeDb({ requestAfter: null }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.ok(raced.warning.includes(BILLING_LINK_RACE));
  assert.equal(raced.installment, undefined);
  const premig = await quietly(() => linkNewBillingRequest(fakeDb({
    failWrite: { code: 'PGRST204', message: "Could not find the 'installmentId' column of 'dept_requests' in the schema cache" },
  }), { user: ae, request, installmentId: 'INS-1' }));
  assert.equal(premig.warning, billingLinkWarning(BILLING_INSTALLMENT_SCHEMA_MISSING));
});

test('ตัวผูกไม่ throw เด็ดขาด — ฐานพังทุกจุดได้คำเตือน (ใบร่างที่สร้างแล้วต้องตอบ 201)', async () => {
  for (const failOn of ['sales_orders', 'quotations', 'sales_order_installments']) {
    const out = await quietly(() => linkNewBillingRequest(fakeDb({ failOn }), {
      user: ae, request, installmentId: 'INS-1',
    }));
    assert.match(out.warning, /ยังไม่ได้ผูกกับงวดชำระ/, failOn);
    assert.equal(out.installment, undefined, failOn);
    // ข้อความดิบของฐานไม่หลุดถึงจอ
    assert.ok(!out.warning.includes('boom'), failOn);
  }
  // เขียนแถวคำร้องพัง (ไม่ใช่เรื่อง 0413) = คำเตือนระบบขัดข้อง
  const writeBroken = await quietly(() => linkNewBillingRequest(fakeDb({ failWrite: { code: '08006', message: 'boom' } }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.match(writeBroken.warning, /ระบบขัดข้องระหว่างผูกงวด/);
  // เขียนตัวชี้พัง = คำร้องผูกแล้ว (ความจริงอยู่ที่แถวคำร้อง) — ไม่เตือนผู้ใช้
  const pointerBroken = await quietly(() => linkNewBillingRequest(fakeDb({ failOn: 'never', pointerRow: undefined }), {
    user: ae, request, installmentId: 'INS-1',
  }));
  assert.equal(pointerBroken.warning, undefined);
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
  // ⭐ mig 0413: เลขงวดจากแผน QT ตอนยังไม่มีแถวงวด — ตรวจกับแผนจริงของ QT · มีแถวงวดแล้ว = ต้องเลือกงวดจริง
  assert.match(src, /const planRows = installmentsFromPaymentPlan\(qtRow\.paymentPlan, qtRow\.totalAmount\);/);
  assert.match(src, /เลือกงวดจากใบสั่งขาย/);
  assert.match(src, /\.\.\.\(installmentSeq \? \{ installmentSeq \} : \{\}\),/);
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
  /* งวด S5 (ใบยืนยันหน้างาน): id ของใบต้นทางไปทาง extra ตัวเดียวกัน ก่อนกิ่งงวดชำระ — กิ่งงวดชำระยังตรงตัวเดิม */
  /* ⭐ PR-2 (28/10): งวดที่ส่ง = ไทล์ที่เลือกอยู่ในฟอร์ม (ค่าในลิงก์เป็นแค่ค่าเติมของไทล์) · เปลี่ยนใบเสนอราคา = ไทล์ถูกล้าง
     ⇒ ไม่ต้องเทียบ SO/QT กับลิงก์อีก (เดิมเทียบเพื่อกันส่งงวดของใบที่ไม่ใช่ใบที่กดมา) */
  assert.match(src, /createRequestDraft\(\s*form, confirmData \? \{ confirmsRequestId: confirms \} : installmentExtra,?\s*\)/);
  assert.match(src, /const installmentPick = form\.kind === "billing_doc" \? form\.installmentPick \|\| null : null;/);
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
