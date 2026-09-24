// ── ยกเลิกสัญญาที่ลงนามแล้ว — สิทธิ์ของผู้อนุมัติ (มติเจ้าของ 24/09/2026) ─────────────────────
//
// ⭐ *"ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ"* — **เพิ่ม** สิทธิ์ให้คนที่ทำให้สัญญาเป็น signed ได้
//    (`canApproveExternalContract` = admin · CD · CM · AE Sup) ยกเลิกสัญญาที่ลงนามแล้วได้ทุกชนิด
//    ⚠️ ไม่ถอดสิทธิ์เดิมของใคร — `canCancelContract` (ร่าง · รอลงนาม · รอหัวหน้ารับรอง) เหมือนเดิมทุกตัวอักษร
// ⭐ มติเพิ่ม 24/09: งานบริการ **หยุดตั้งแต่วันที่ยกเลิก** (นัดวันนั้นที่ยังไม่ปิดงานติดด่านด้วย) ·
//    บันทึกเพิ่มเติมที่ยังไม่ยกเลิกถูกยกเลิกตาม · โมดัลบอกใบสั่งขายที่ผูกอยู่
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  canCancelContract,
  contractCancelDate,
  contractCancelledAfterSigning,
  contractEndDate,
  contractInForce,
  showSignedCancel,
  signedCancelEffects,
  signedCancelError,
} from './contracts.js';
import { buildContractLifecycle } from './contractLifecycle.js';
import { contractLinkable } from './serviceContractLink.js';
import { contractQuotationNotice } from './contractQuotationState.js';
import { replanPromptFacts } from './installmentReplan.js';
import { LINKED_SERVICE_ORDER_DEAD_STATUSES, loadLinkedServiceOrders, loadSignedCancelContext } from './contractSignedCancel.js';

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROLE = (role) => ({ id: `U-${role}`, role, name: role });
const APPROVERS = ['admin', 'commercial_director', 'commercial_manager', 'ae_supervisor'].map(ROLE);
const OTHERS = ['ac_supervisor', 'senior_ae', 'senior_ac', 'ae', 'ac', 'finance', 'ts_manager', 'viewer'].map(ROLE);
const AE_SUP = ROLE('ae_supervisor');

const SO_ID = 'SOR-H0123456789abcdef';
const signed = (extra = {}) => ({
  id: 'CTR-1', kind: 'service', source: 'generated', status: 'signed', contractNo: 'CT-SR-26080001-0',
  effectiveDate: '2026-01-01', expiryDate: '2026-12-31', approvedAt: '2026-01-02T03:00:00Z', ...extra,
});
const substitute = (extra = {}) => signed({
  source: 'external', externalDocKind: 'paper_contract', metadata: { historicalSalesOrderId: SO_ID }, ...extra,
});
const historicalSo = (status) => ({ id: SO_ID, orderNumber: 'SO-26090001-0', status, origin: 'historical' });
const SOS = [{ id: 'SO1', orderNumber: 'SO-26080011-0', status: 'approved' }, { id: 'SO2', orderNumber: 'SO-26080012-1', status: 'approved' }];

/* ── ใครยกเลิกได้ ─────────────────────────────────────────────────────────── */
test('⭐ ยกเลิกสัญญาที่ลงนามแล้วได้เฉพาะผู้อนุมัติ (admin · CD · CM · AE Sup) — ทุกชนิดสัญญา', () => {
  for (const kind of ['service', 'scent_design', 'manufacturing']) {
    for (const user of APPROVERS) {
      assert.equal(showSignedCancel(signed({ kind }), user), true, `${kind} ${user.role}`);
      assert.equal(signedCancelError(signed({ kind }), user), null, `${kind} ${user.role}`);
    }
    for (const user of OTHERS) {
      assert.equal(showSignedCancel(signed({ kind }), user), false, `${kind} ${user.role}`);
      assert.match(signedCancelError(signed({ kind }), user), /AE Supervisor/, `${kind} ${user.role}`);
    }
  }
});

test('ทางนี้ยกเลิกได้เฉพาะใบที่ลงนามแล้ว · ทางเดิมของร่าง/รอลงนาม/รอรับรองไม่ขยับ', () => {
  for (const status of ['draft', 'awaiting_signature', 'awaiting_approval', 'revised', 'cancelled']) {
    assert.equal(showSignedCancel(signed({ status }), AE_SUP), false, status);
    assert.ok(signedCancelError(signed({ status }), AE_SUP), status);
  }
  // ⚠️ สิทธิ์เดิมไม่ถูกถอด และไม่ถูกขยายเงียบ ๆ (ด่านใหม่แยกตัว ไม่ใช่แก้ canCancelContract)
  assert.equal(canCancelContract({ status: 'signed' }), false);
  for (const status of ['draft', 'awaiting_signature', 'awaiting_approval']) {
    assert.equal(canCancelContract({ status }), true, status);
  }
});

test('🔴 เอกสารแทนสัญญาที่ใบสั่งขายย้อนหลังของมันยังมีชีวิต — ยกเลิกที่ใบสั่งขาย ไม่ใช่ที่นี่', () => {
  for (const status of ['approved', 'pending_approval', 'draft']) {
    const message = signedCancelError(substitute(), AE_SUP, { linkedOrder: historicalSo(status) });
    assert.match(message, /SO-26090001-0/, status);
    assert.match(message, /ยกเลิกใบ/, status);
  }
  // ⭐ ใบกำพร้า (ใบสั่งขายยกเลิก/หายไปแล้ว — ค้าง signed เพราะใบอื่นยังผูกอยู่) ยกเลิกได้
  assert.equal(signedCancelError(substitute(), AE_SUP, { linkedOrder: historicalSo('cancelled') }), null);
  assert.equal(signedCancelError(substitute(), AE_SUP, { linkedOrder: null }), null);
  assert.equal(signedCancelError(substitute(), AE_SUP, { linkedOrder: { ...historicalSo('approved'), id: 'OTHER' } }), null);
  // ใบ external ทั่วไป (ไม่ใช่เอกสารแทนสัญญา) ยกเลิกได้ตามปกติ
  assert.equal(signedCancelError(signed({ source: 'external', externalDocKind: 'customer_po' }), AE_SUP), null);
  // หน้าสัญญาไม่ส่ง linkedOrder มา = อ่านจาก GET (`linkedHistoricalOrder`)
  assert.match(signedCancelError(substitute({ linkedHistoricalOrder: historicalSo('approved') }), AE_SUP), /SO-26090001-0/);
});

/* ── วันจบของสัญญาที่ถูกยกเลิกหลังลงนาม ─────────────────────────────────── */
test('ยกเลิกหลังลงนาม = approvedAt + cancelledAt · วันยกเลิกนับตามนาฬิกาไทย', () => {
  const cancelled = signed({ status: 'cancelled', cancelledAt: '2026-09-24T18:30:00Z' });
  assert.equal(contractCancelledAfterSigning(cancelled), true);
  // 18:30Z = 01:30 ของวันที่ 25 เวลาไทย
  assert.equal(contractCancelDate(cancelled), '2026-09-25');
  // ไม่เคยมีผล (ยกเลิกตอนร่าง/รอลงนาม) — ไม่มี approvedAt
  assert.equal(contractCancelledAfterSigning(signed({ status: 'cancelled', approvedAt: null, cancelledAt: '2026-09-24T03:00:00Z' })), false);
  assert.equal(contractCancelDate(signed()), null);
  assert.equal(contractCancelledAfterSigning(signed({ status: 'cancelled', cancelledAt: 'ไม่ใช่วันที่' })), false);
  // ⚠️ ยังไม่ "มีผล" และยังผูกกับใบใหม่ไม่ได้
  assert.equal(contractInForce(cancelled), false);
  assert.equal(contractLinkable(cancelled), false);
});

test('วันจบ = วันที่ยกเลิก หรือวันหมดอายุถ้ามาก่อน · ใบอื่นเป็นวันหมดอายุตามเดิม', () => {
  const at = (cancelledAt, expiryDate = '2026-12-31') => signed({ status: 'cancelled', cancelledAt, expiryDate });
  assert.equal(contractEndDate(at('2026-09-24T03:00:00Z')), '2026-09-24');
  assert.equal(contractEndDate(at('2026-09-24T03:00:00Z', '2026-06-30')), '2026-06-30');
  assert.equal(contractEndDate(at('2026-09-24T03:00:00Z', null)), '2026-09-24');
  assert.equal(contractEndDate(signed()), '2026-12-31');
  assert.equal(contractEndDate(signed({ expiryDate: null })), null);
  assert.equal(contractEndDate({ expiryDate: ' 2026-10-01 ' }), '2026-10-01');
  assert.equal(contractEndDate({ expiryDate: 'เร็ว ๆ นี้' }), null);
  assert.equal(contractEndDate(null), null);
});

/* ── การ์ดจัดการ ────────────────────────────────────────────────────────── */
const lifecycleFor = (options = {}) => buildContractLifecycle({
  canEdit: true, signedCancel: { linkedServiceOrders: SOS, liveAddenda: 1 }, ...options,
});
const entry = (record, user, options) => lifecycleFor(options).available(record, user).find((e) => e.id === 'cancel-signed');

test('ปุ่ม "ยกเลิกสัญญาที่ลงนามแล้ว" โผล่เฉพาะผู้อนุมัติ · ปุ่มยกเลิกเดิมยังไม่โผล่บนใบลงนามแล้ว', () => {
  for (const user of APPROVERS) {
    const found = entry(signed(), user);
    assert.ok(found, user.role);
    assert.equal(found.disabled, false, user.role);
    assert.equal(found.slot, 'danger');
  }
  for (const user of OTHERS) assert.equal(entry(signed(), user), undefined, user.role);
  assert.equal(entry(signed(), AE_SUP, { canEdit: false }), undefined, 'ไม่มีสิทธิ์แก้ = ไม่โผล่');
  const ids = lifecycleFor().available(signed(), AE_SUP).map((e) => e.id);
  assert.ok(!ids.includes('cancel'));
  // ร่าง/รอลงนามยังเป็นปุ่มเดิม ไม่ใช่ปุ่มใหม่
  const draftIds = lifecycleFor().available(signed({ status: 'awaiting_signature' }), AE_SUP).map((e) => e.id);
  assert.ok(draftIds.includes('cancel'));
  assert.ok(!draftIds.includes('cancel-signed'));
});

test('ติดด่าน = โชว์จางพร้อมเหตุ (เอกสารแทนสัญญาของใบที่ยังมีชีวิต · ยังโหลดใบสั่งขายที่ผูกไม่ครบ)', () => {
  const locked = entry(substitute(), AE_SUP, { linkedOrder: historicalSo('approved') });
  assert.equal(locked.disabled, true);
  assert.match(locked.disabledReason, /SO-26090001-0/);
  const unknown = entry(signed(), AE_SUP, { signedCancel: null });
  assert.equal(unknown.disabled, true);
  assert.match(unknown.disabledReason, /ใบสั่งขายที่ผูก/);
});

test('โมดัลบอกผล: ใบสั่งขายที่ผูก · นัดตั้งแต่วันยกเลิกติดด่าน · ย้อนไม่ได้ · ต้องกรอกเหตุผล', () => {
  const transition = lifecycleFor().get('cancel-signed');
  assert.equal(transition.reason, 'required');
  assert.equal(transition.reasonPolicy.minLength, 10);
  assert.equal(transition.reasonPolicy.confirmLabel, 'ยกเลิกสัญญา');
  assert.match(transition.confirm.title, /ยกเลิกสัญญาที่ลงนามแล้ว/);
  const detail = transition.reasonPolicy.detail;
  assert.match(detail, /ย้อนกลับเองไม่ได้/);
  assert.match(detail, /SO-26080011-0, SO-26080012-1/);
  assert.match(detail, /ตั้งแต่วันนี้/);
  assert.match(detail, /งดบริการ/);
  assert.match(detail, /บันทึกเพิ่มเติม 1 ฉบับ/);
  assert.match(detail, /Actual ไม่เปลี่ยน/);
});

test('ผลของการยกเลิกพูดตามของจริงของใบ — ไม่มีใบสั่งขาย · ใบ external · เอกสารแทนสัญญากำพร้า · ดีลภาชนะ', () => {
  const none = signedCancelEffects({ contract: signed(), linkedServiceOrders: [], liveAddenda: 0 }).join('\n');
  assert.match(none, /ไม่มีใบสั่งขายผูกสัญญานี้/);
  assert.doesNotMatch(none, /บันทึกเพิ่มเติม/);
  assert.match(none, /ลายน้ำ “ยกเลิก”/);
  assert.match(none, /ใบเสนอราคาที่อนุมัติ/);
  const external = signedCancelEffects({ contract: signed({ source: 'external', externalDocKind: 'customer_po' }), linkedServiceOrders: [] }).join('\n');
  assert.doesNotMatch(external, /ลายน้ำ/);
  assert.match(external, /ไฟล์เอกสารที่แนบ/);
  const orphan = signedCancelEffects({ contract: substitute(), linkedOrder: historicalSo('cancelled'), linkedServiceOrders: SOS }).join('\n');
  assert.match(orphan, /ยกเลิกใบแล้วคีย์ใหม่/);
  const containerDeal = signedCancelEffects({ contract: signed({ deal: { origin: 'historical' } }), linkedServiceOrders: SOS }).join('\n');
  assert.doesNotMatch(containerDeal, /ใบเสนอราคาที่อนุมัติ/);
});

/* ── ตัวโหลดฝั่ง server ─────────────────────────────────────────────────── */
const stubDb = (results) => {
  const calls = [];
  const builder = (table) => {
    const q = {
      select: (cols, opts) => { calls.push([table, 'select', cols, opts || null]); return q; },
      eq: (col, val) => { calls.push([table, 'eq', col, val]); return q; },
      neq: (col, val) => { calls.push([table, 'neq', col, val]); return q; },
      not: (col, op, val) => { calls.push([table, 'not', col, op, val]); return q; },
      order: (col) => { calls.push([table, 'order', col]); return q; },
      range: async () => results[table],
      then: (resolve, reject) => Promise.resolve(results[table]).then(resolve, reject),
    };
    return q;
  };
  return { calls, from: (table) => builder(table) };
};

test('ใบสั่งขายที่ผูก = ไม่นับใบยกเลิก/ใบที่ถูก Rev. แทน (RPC ออก Rev. ยกลิงก์สัญญาไปใบใหม่)', async () => {
  assert.deepEqual([...LINKED_SERVICE_ORDER_DEAD_STATUSES], ['cancelled', 'revised']);
  const db = stubDb({ sales_orders: { data: SOS, error: null } });
  const { orders, error } = await loadLinkedServiceOrders(db, 'CTR-1');
  assert.equal(error, null);
  assert.deepEqual(orders.map((o) => o.orderNumber), ['SO-26080011-0', 'SO-26080012-1']);
  assert.ok(db.calls.some((c) => c[1] === 'eq' && c[2] === 'serviceContractId' && c[3] === 'CTR-1'));
  assert.ok(db.calls.some((c) => c[1] === 'not' && c[2] === 'status' && c[3] === 'in' && c[4] === '(cancelled,revised)'));
  const broken = await loadLinkedServiceOrders(stubDb({ sales_orders: { data: null, error: { message: 'timeout' } } }), 'CTR-1');
  assert.equal(broken.orders, null);
  assert.match(broken.error.message, /timeout/);
});

test('บริบทของโมดัล: ยิงฐานเฉพาะใบลงนามแล้ว + ผู้อนุมัติ · อ่านพัง = error ไม่ใช่ "ไม่มีใบ"', async () => {
  const touched = [];
  const spy = { from(table) { touched.push(table); throw new Error('ห้ามแตะฐาน'); } };
  assert.deepEqual(await loadSignedCancelContext(spy, signed({ status: 'awaiting_approval' }), AE_SUP), { context: null, error: null });
  assert.deepEqual(await loadSignedCancelContext(spy, signed(), ROLE('ac_supervisor')), { context: null, error: null });
  assert.deepEqual(touched, []);

  const db = stubDb({
    sales_orders: { data: SOS, error: null },
    sales_contract_addenda: { data: null, count: 2, error: null },
  });
  const { context, error } = await loadSignedCancelContext(db, signed(), AE_SUP);
  assert.equal(error, null);
  assert.deepEqual(context, { linkedServiceOrders: SOS, liveAddenda: 2 });
  assert.ok(db.calls.some((c) => c[0] === 'sales_contract_addenda' && c[1] === 'neq' && c[2] === 'status' && c[3] === 'cancelled'));

  const broken = await loadSignedCancelContext(stubDb({
    sales_orders: { data: SOS, error: null },
    sales_contract_addenda: { data: null, count: null, error: { message: 'boom' } },
  }), signed(), AE_SUP);
  assert.equal(broken.context, null);
  assert.match(broken.error.message, /boom/);
});

/* ── ยามของ route ──────────────────────────────────────────────────────── */
test('🔴 route ยกเลิก: ล็อกเอกสารแทนสัญญามาก่อนทั้งสองทาง · ใบลงนามแล้วถามด่านผู้อนุมัติ · กันกดชน', () => {
  const route = stripComments(readSrc('../../app/api/sales-planning/contracts/[id]/cancel/route.js'));
  const lock = route.indexOf('historicalContractLockGate(supabase, before)');
  assert.ok(lock > 0);
  assert.ok(lock < route.indexOf("before.status === 'signed'"), 'ล็อกต้องมาก่อนแยกทาง');
  assert.ok(lock < route.indexOf('canCancelContract(before)'));
  assert.match(route, /signedCancelError\(before, user, \{ linkedOrder: linked\.order \}\)/);
  assert.match(route, /\.eq\('status', 'signed'\)/);
  assert.match(route, /\.eq\('status', before\.status\)/, 'ทางเดิมก็ต้องกันกดชนด้วย');
  // อ่านใบสั่งขายที่ผูก **ก่อน** เขียนสัญญา — อ่านพังแล้วสัญญายังไม่ถูกแตะ
  const signedPath = route.slice(route.indexOf('async function cancelSigned'));
  assert.ok(signedPath.indexOf('signedCancelError(') < signedPath.indexOf('loadLinkedServiceOrders('));
  assert.ok(signedPath.indexOf('loadLinkedServiceOrders(') > 0);
  assert.ok(signedPath.indexOf('loadLinkedServiceOrders(') < signedPath.indexOf("status: 'cancelled'"));
  // บันทึกเพิ่มเติมยกเลิกตาม พร้อมเหตุ "สัญญาแม่ … ถูกยกเลิก"
  assert.match(route, /from\('sales_contract_addenda'\)[\s\S]{0,400}\.neq\('status', 'cancelled'\)/);
  assert.match(route, /สัญญาแม่ \$\{number\} ถูกยกเลิก/);
  // ⚠️ approvedAt ต้องคงอยู่ — ด่านเข้าไซต์ใช้แยก "เคยมีผล" ออกจาก "ไม่เคยมีผล"
  assert.doesNotMatch(route, /approvedAt:\s*null/);
  assert.match(route, /cancelledFromStatus: 'signed'/);
});

test('GET ของสัญญาแนบบริบทโมดัลยกเลิก · อ่านพัง = 500', () => {
  const route = stripComments(readSrc('../../app/api/sales-planning/contracts/[id]/route.js'));
  const get = route.slice(route.indexOf('export const GET'), route.indexOf('export const PATCH'));
  assert.match(get, /loadSignedCancelContext\(supabase, current, user\)/);
  assert.match(get, /signedCancelContext: signedCancel\.context/);
  assert.match(get, /if \(signedCancel\.error\) return fail\(/);
});

test('🔴 ลงนามบันทึกเพิ่มเติมได้เฉพาะเมื่อสัญญาแม่ยังลงนามแล้วอยู่', () => {
  const route = stripComments(readSrc('../../app/api/sales-planning/addenda/[id]/sign/route.js'));
  assert.match(route, /loadScoped\(supabase, 'sales_contracts', before\.contractId, user, 'view'\)/);
  assert.match(route, /parent\.status !== 'signed'/);
  assert.ok(route.indexOf("parent.status !== 'signed'") < route.indexOf("status: 'signed'"));
});

test('พิมพ์ซ้ำใบที่ยกเลิกแล้วมีลายน้ำ "ยกเลิก" ทั้งสัญญาและบันทึกเพิ่มเติม — ประทับตอนเสิร์ฟ ไม่เขียนกลับ', () => {
  for (const [rel, row] of [
    ['../../app/api/sales-planning/contracts/[id]/document/route.js', 'contract'],
    ['../../app/api/sales-planning/addenda/[id]/document/route.js', 'addendum'],
  ]) {
    const route = stripComments(readSrc(rel));
    assert.match(route, new RegExp(`stampWatermark\\(html, ${row}\\.status === 'cancelled' \\? 'ยกเลิก' : null\\)`), rel);
    assert.doesNotMatch(route, /issuedHtml: stampWatermark/, rel);
  }
});

test('หน้าสัญญา: ปุ่มใหม่ยิง /cancel · การ์ดการลงนามยังโชว์หลังยกเลิก', () => {
  const page = readSrc('../../app/sales-planning/contracts/[id]/page.js');
  assert.match(page, /transitionId === "cancel-signed"\) return act\("\/cancel", \{ reason: values\.reason \}/);
  assert.match(page, /signedCancel: contract\?\.signedCancelContext/);
  assert.match(page, /linkedOrder,/);
  assert.match(page, /contractCancelledAfterSigning\(contract\)/);
});

/* ── ข้อความที่เคยบอกว่า "ลงนามแล้วเลิกไม่ได้" ─────────────────────────────── */
test('ใบเสนอราคาถูกปิดใต้สัญญาที่ลงนามแล้ว: บอกทางบันทึกเพิ่มเติม และทางยกเลิกของผู้อนุมัติ', () => {
  const closed = { quoteNumber: 'QT-26080001-0', status: 'cancelled' };
  const body = contractQuotationNotice({ status: 'signed' }, closed).body;
  assert.match(body, /บันทึกเพิ่มเติม/);
  assert.match(body, /ยกเลิกสัญญา/);
});

test('ปรับแผนงวด: สัญญาที่ยกเลิกแล้วไม่ถูกอ้างว่า "ข้อ 3 ยังระบุงวดเดิม"', () => {
  const order = {
    orderNumber: 'SO-1', totalAmount: 100, actualAmount: 100, approvedAt: '2026-09-01T03:00:00Z',
    serviceContractId: 'CT1', serviceContract: { contractNo: 'CT-SR-1', status: 'cancelled' },
  };
  assert.equal(replanPromptFacts(order, [], []).contractNumber, null);
  assert.equal(replanPromptFacts({ ...order, serviceContract: { contractNo: 'CT-SR-1', status: 'signed' } }, [], []).contractNumber, 'CT-SR-1');
  // โหลดสัญญาไม่ขึ้น = ยังเตือนตามเดิม (ไม่รู้ ≠ ไม่มีผล)
  assert.equal(replanPromptFacts({ ...order, serviceContract: null }, [], []).contractNumber, 'ที่ผูกกับใบนี้');
});
