// ── SO ค่าสรรพสามิต (แผนรื้อสรรพสามิต PR4 · mig 0416) ─────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCISE_ORDER_STATUS_DESCRIPTION, exciseQuotationCancelBlock, exciseSalesOrderBlock, exciseSalesOrderCreateError,
  exciseSourceOrderLabel, loadLiveExciseSalesOrder, salesOrderApprovalDeal,
} from './exciseSalesOrder.js';
import { billingDealIdOf } from '../requests/billingQuotations.js';
import { documentWorkflowError } from '../sales/documentWorkflowErrors.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const exciseOrder = (over = {}) => ({
  id: 'SOR-X', orderNumber: 'SO-26100100-0', origin: 'excise', dealId: null, deal: null, sourceSalesOrderId: 'SO-1',
  sourceDeal: { id: 'D-1', ownerId: 'U-OWNER', ownerName: 'เจ้าของดีล' }, metadata: { sourceOrderNumber: 'SO-26100001-0' }, ...over,
});

// ── 1. ตัวช่วยบริสุทธิ์ ─────────────────────────────────────────────────────────────────────────
test('salesOrderApprovalDeal: ใบปกติ = ดีลของใบ · SO ค่าสรรพสามิต = ดีลของ SO ต้นทาง · ใบอื่นไม่ถอยไป sourceDeal', () => {
  assert.equal(salesOrderApprovalDeal({ origin: 'pipeline', deal: { id: 'D-2' } }).id, 'D-2');
  assert.equal(salesOrderApprovalDeal(exciseOrder()).id, 'D-1');
  assert.equal(salesOrderApprovalDeal({ origin: 'pipeline', deal: null, sourceDeal: { id: 'D-9' } }), null);
  assert.equal(salesOrderApprovalDeal(exciseOrder({ sourceDeal: null })), null);
  assert.equal(salesOrderApprovalDeal(null), null);
});

test('exciseSalesOrderBlock: ย้อนอนุมัติ/Rev./ย้อน Won ปิดเฉพาะ SO ค่าสรรพสามิต — ใบอื่นไม่โดน', () => {
  assert.match(exciseSalesOrderBlock(exciseOrder(), 'revoke'), /ย้อนการอนุมัติไม่ได้ — ยกเลิกใบแล้วออกใหม่/);
  assert.match(exciseSalesOrderBlock(exciseOrder(), 'revise'), /ออก Rev\. ไม่ได้/);
  assert.match(exciseSalesOrderBlock(exciseOrder(), 'reverse'), /ไม่ย้อนสถานะดีล/);
  assert.equal(exciseSalesOrderBlock(exciseOrder(), 'submit'), null);
  assert.equal(exciseSalesOrderBlock({ origin: 'pipeline' }, 'revoke'), null);
  assert.equal(exciseSalesOrderBlock({ origin: 'historical' }, 'revoke'), null);
});

test('exciseSalesOrderCreateError: รหัสของ 0416 เป็นไทย · รหัสอื่นปล่อยให้ route จัดตามเดิม', () => {
  assert.match(exciseSalesOrderCreateError({ message: 'excise_source_order_invalid' }), /ใบสั่งขายต้นทางไม่ได้อยู่ในสถานะอนุมัติแล้ว/);
  assert.match(exciseSalesOrderCreateError({ message: 'quotation_not_won' }), /ลูกค้ารับแล้ว/);
  assert.match(exciseSalesOrderCreateError({ message: 'excise_quotation_origin_invalid' }), /ไม่ใช่ใบค่าสรรพสามิต/);
  assert.equal(exciseSalesOrderCreateError({ message: 'sales_order_confirm_type_invalid' }), null);
  assert.equal(exciseSalesOrderCreateError(null), null);
});

test('ย้อนอนุมัติ SO ค่าสรรพสามิตถึงฐาน (โค้ดรุ่นเก่า) ได้ข้อความไทย 409', () => {
  const mapped = documentWorkflowError({ message: 'sales_order_revoke_excise_forbidden' }, { context: 'test' });
  assert.equal(mapped.status, 409);
  assert.match(mapped.error || mapped.message, /ย้อนการอนุมัติไม่ได้/);
});

test('ถ้อยคำหน้า SO ค่าสรรพสามิตไม่บอกว่านับ Actual · เลข SO ต้นทางมาจาก metadata', () => {
  for (const text of Object.values(EXCISE_ORDER_STATUS_DESCRIPTION)) assert.doesNotMatch(text, /นับเป็น Actual|เข้า Actual/);
  assert.match(EXCISE_ORDER_STATUS_DESCRIPTION.approved, /ไม่นับ Actual/);
  assert.equal(exciseSourceOrderLabel(exciseOrder()), 'SO-26100001-0');
  assert.equal(exciseSourceOrderLabel(exciseOrder({ metadata: {} })), 'SO-1');
});

test('billingDealIdOf: คำร้องขอเอกสารจากใบค่าสรรพสามิตผูกดีลของ SO ต้นทาง (มติ 29/10)', () => {
  assert.equal(billingDealIdOf({ dealId: 'D-2' }), 'D-2');
  assert.equal(billingDealIdOf({ dealId: null, sourceDeal: { id: 'D-1' } }), 'D-1');
  assert.equal(billingDealIdOf({}), '');
  assert.equal(billingDealIdOf(null), '');
});

// ── 2. ยกเลิกใบค่าสรรพสามิตที่รับแล้ว ────────────────────────────────────────────────────────────
test('exciseQuotationCancelBlock: มี SO ค่าสรรพสามิตที่ยังมีผล = ยกเลิกใบไม่ได้ (บอกเลข SO) · ไม่มี = ผ่าน', () => {
  const quote = { id: 'QT-X', origin: 'excise', status: 'accepted' };
  assert.match(exciseQuotationCancelBlock(quote, { id: 'SOR-X', orderNumber: 'SO-26100100-0' }), /SO-26100100-0 ที่ยังมีผลอยู่/);
  assert.equal(exciseQuotationCancelBlock(quote, null), null);
  assert.equal(exciseQuotationCancelBlock({ origin: 'pipeline' }, { id: 'SO-9' }), null);
});

test('loadLiveExciseSalesOrder: ตัดใบยกเลิก/ถูกแทน · ใบล่าสุดก่อน · ไม่มี quotationId = ไม่ยิง', async () => {
  const calls = [];
  const builder = {
    select(cols) { calls.push(['select', cols]); return this; },
    eq(col, value) { calls.push(['eq', col, value]); return this; },
    neq(col, value) { calls.push(['neq', col, value]); return this; },
    is(col, value) { calls.push(['is', col, value]); return this; },
    order(col, opts) { calls.push(['order', col, opts]); return this; },
    limit(n) { calls.push(['limit', n]); return Promise.resolve({ data: [{ id: 'SOR-X', orderNumber: 'SO-1', status: 'draft' }], error: null }); },
  };
  const supabase = { from(table) { calls.push(['from', table]); return builder; } };
  const { data, error } = await loadLiveExciseSalesOrder(supabase, 'QT-X');
  assert.equal(error, null);
  assert.equal(data.id, 'SOR-X');
  assert.deepEqual(calls.filter((c) => c[0] !== 'select'), [
    ['from', 'sales_orders'], ['eq', 'quotationId', 'QT-X'], ['neq', 'status', 'cancelled'], ['is', 'supersededById', null],
    ['order', 'createdAt', { ascending: false }], ['limit', 1],
  ]);
  const none = await loadLiveExciseSalesOrder({ from() { throw new Error('ไม่ควรยิง'); } }, '');
  assert.deepEqual(none, { data: null, error: null });
});

// ── 3. ต่อสายใน route (อ่านซอร์ส — ไม่มี DB ในเทสต์) ─────────────────────────────────────────────────
test('POST สร้าง SO: ใบค่าสรรพสามิตเติม sourceDeal ก่อนตัดสินสิทธิ์ · ข้ามด่านโครงการ · RPC ของตัวเอง', () => {
  const route = code('../../app/api/sales-planning/sales-orders/route.js');
  const attach = route.indexOf('attachSourceDeals(supabase, [quote])');
  const scope = route.indexOf("inSalesDocScope(user, quote, 'edit')");
  assert.ok(attach > 0 && attach < scope, 'ต้องมีดีลต้นทางก่อนตัดสินสิทธิ์ ไม่งั้นใบไม่มีดีลถูกปฏิเสธ/เปิดเงียบ');
  assert.match(route, /if \(!excise\) \{\s*const closedProject = await closedProjectBlock\(supabase, quote\.deal\?\.projectId/);
  assert.match(route, /excise\s*\? await supabase\.rpc\('create_excise_sales_order_draft', createArgs\)\s*: await supabase\.rpc\('create_sales_order_draft', createArgs\)/);
  assert.match(route, /const exciseError = excise \? exciseSalesOrderCreateError\(error\) : null;/);
  assert.doesNotMatch(route, /quote\.deal\.projectId/, 'ใบไม่มีดีล = TypeError');
});

test('PATCH SO: ย้อนอนุมัติ/Rev./ย้อน Won ของ SO ค่าสรรพสามิตถูกปฏิเสธก่อนถึง RPC · ยื่นใช้ดีลของ SO ต้นทาง', () => {
  const route = code('../../app/api/sales-planning/sales-orders/[id]/route.js');
  const revoke = route.indexOf("exciseSalesOrderBlock(before, 'revoke')");
  assert.ok(revoke > 0 && revoke < route.indexOf("rpc('revoke_sales_order_approval_atomic'"));
  const revise = route.indexOf("exciseSalesOrderBlock(before, 'revise')");
  assert.ok(revise > 0 && revise < route.indexOf("canIssueSalesOrderRevision(before"));
  const reverse = route.indexOf("exciseSalesOrderBlock(before, 'reverse')");
  assert.ok(reverse > 0 && reverse < route.indexOf("rpc('cancel_sales_order_with_reversal_atomic'"));
  assert.match(route, /if \(isExciseOrder\(before\)\) \{[\s\S]{0,400}!before\.sourceSalesOrderId/);
});

test('ยกเลิกใบค่าสรรพสามิตที่รับแล้ว: ตรวจ SO ที่ยังมีผลก่อนพรีวิว (โมดัลบอกเหตุตั้งแต่เปิด)', () => {
  const route = code('../../app/api/sales-planning/quotations/[id]/cancel/route.js');
  const guard = route.indexOf('exciseQuotationCancelBlock(quote, liveOrder)');
  assert.ok(guard > 0 && guard < route.indexOf('isDryRun(req)'));
});

test('คำร้องขอเอกสารบัญชีจากใบค่าสรรพสามิต: ดีลมาจาก SO ต้นทางที่ server อ่านเอง', () => {
  const route = code('../../app/api/sa/requests/route.js');
  assert.match(route, /"paymentPlan", origin, "sourceSalesOrderId"/);
  assert.match(route, /if \(!qtDealId && isExciseOrder\(qtRow\) && qtRow\.sourceSalesOrderId\) \{\s*const \{ data: sourceDeals, error: sourceError \} = await loadSourceDeals\(supabase, \[qtRow\.sourceSalesOrderId\]\);/);
  assert.match(route, /dealId = qtDealId;/);
});

test('GET …/excise-quotation ส่ง SO ค่าสรรพสามิตของใบที่ลูกค้ารับแล้ว (ช่วงบนเส้นเดินงานตามต่อ)', () => {
  const route = code('../../app/api/sales-planning/sales-orders/[id]/excise-quotation/route.js');
  assert.match(route, /if \(liveQuote\?\.status === 'accepted'\) \{\s*const \{ data, error: orderError \} = await loadLiveExciseSalesOrder\(supabase, liveQuote\.id\);/);
  assert.match(route, /exciseOrder,/);
});

// ── 4. migration 0416 ──────────────────────────────────────────────────────────────────────────
test('0416: สามจุดปะมีป้าย · ย้อนอนุมัติกันด้วย trigger · RPC สร้างไม่เปิดให้ anon/authenticated · ถอยกลับปฏิเสธเมื่อมี SO excise', () => {
  const sql = read('../../../supabase/migrations/0416_excise_sales_order_rpcs.sql');
  for (const mark of ['0416/E1', '0416/E2', '0416/E3']) assert.match(sql, new RegExp(mark));
  /* 🐞 29/10: ปะเนื้อ revoke ไม่เจอข้อความยึดบน prod ⇒ ห้ามกลับไปปะเนื้อฟังก์ชันนั้น — trigger ไม่ขึ้นกับเนื้อใด ๆ */
  assert.doesNotMatch(sql.split('\nBEGIN;\n')[1], /ARRAY\['revoke_sales_order_approval_atomic'/);
  assert.match(sql, /CREATE TRIGGER sales_orders_excise_no_revoke_trg\s+BEFORE UPDATE OF status ON public\.sales_orders/);
  assert.match(sql, /WHEN \(NEW\.origin = 'excise' AND NEW\.status = 'approval_revoked'/);
  assert.match(sql, /RAISE EXCEPTION 'sales_order_revoke_excise_forbidden';/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_excise_sales_order_draft\(text, text, text, text, jsonb\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_excise_sales_order_draft\(text, text, text, text, jsonb\) TO service_role;/);
  assert.match(sql, /'excise', v_source\.id,/);
  assert.match(sql, /"dealId"\/"projectId" ว่าง/);
  assert.match(sql, /RAISE EXCEPTION 'excise sales orders exist'/);
});
