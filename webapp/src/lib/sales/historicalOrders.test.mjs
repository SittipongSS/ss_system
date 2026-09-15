// ── ตัวตัดสินกลางของใบสั่งขายย้อนหลัง (mig 0360) ──────────────────────────────────
// ⭐ ตัวเลข/สูตรฝั่ง JS ต้องตรงกับ SQL ของ 0360 — อ่านไฟล์ migration เทียบตรง ๆ (ตัวหนึ่งขยับ อีกตัวต้องขยับตาม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DOC_DATE_MAX, DOC_DATE_MIN, EXEMPT_REASON_MAX, EXEMPT_REASON_MIN, HISTORICAL_DEAL_TITLE, HISTORICAL_REF_MAX,
  INSTALLATION_POINT_MAX, INSTALLMENT_LABEL_MAX, ORIGIN_HISTORICAL, ORIGIN_PIPELINE,
  canKeyHistoricalSalesOrder, charLength, exemptReasonError, historicalDealPatchError, historicalDeleteBlock,
  historicalGateExempt, historicalOrderIdOf, historicalOwnerTakenMessage, historicalRefsOf, historicalRowsOnly,
  historicalSchemaMissing, isHistoricalDeal, isHistoricalOrder, isKpiDeal, pipelineRowsOnly,
} from './historicalOrders.js';
import { customerSnapshotName } from '../master/customerName.js';

const SQL = readFileSync(
  new URL('../../../supabase/migrations/0360_sales_order_historical_origin.sql', import.meta.url), 'utf8',
).replace(/--[^\n]*/g, '');

test('origin: เฉพาะ "historical" เท่านั้นที่เป็นใบ/ดีลย้อนหลัง — legacy/ว่าง/pipeline ไม่ใช่', () => {
  assert.equal(ORIGIN_PIPELINE, 'pipeline');
  assert.equal(ORIGIN_HISTORICAL, 'historical');
  for (const origin of ['legacy', undefined, null, 'pipeline', 'HISTORICAL', '']) {
    assert.equal(isHistoricalOrder({ origin }), false, String(origin));
    assert.equal(isHistoricalDeal({ origin }), false, String(origin));
    assert.equal(isKpiDeal({ origin }), true, String(origin));
  }
  assert.equal(isHistoricalOrder(null), false);
  assert.equal(isHistoricalOrder({ origin: 'historical' }), true);
  assert.equal(isHistoricalDeal({ origin: 'historical' }), true);
  assert.equal(isKpiDeal({ origin: 'historical' }), false);
});

test('ตัวกรอง query ต่อ .eq("origin", …) ตัวเดียว', () => {
  const seen = [];
  const q = { eq: (col, val) => { seen.push([col, val]); return q; } };
  assert.equal(pipelineRowsOnly(q), q);
  assert.equal(historicalRowsOnly(q), q);
  assert.deepEqual(seen, [['origin', 'pipeline'], ['origin', 'historical']]);
});

test('สิทธิ์คีย์ = AE Supervisor / Admin เท่านั้น — ตรงกับ literal ใน RPC ของ 0360', () => {
  for (const role of ['ae_supervisor', 'admin']) assert.equal(canKeyHistoricalSalesOrder({ role }), true, role);
  for (const role of ['ae', 'senior_ae', 'ac', 'finance', 'ts', 'ts_manager', 'rd', 'executive', 'viewer', undefined]) {
    assert.equal(canKeyHistoricalSalesOrder({ role }), false, String(role));
  }
  assert.equal(canKeyHistoricalSalesOrder(null), false);
  const literals = SQL.match(/p_actor_role, ''\) NOT IN \('ae_supervisor', 'admin'\)/g) || [];
  assert.equal(literals.length, 2, 'RPC สร้างใบ + RPC เพิ่มงวด ต้องใช้ชุด role เดียวกับ canKeyHistoricalSalesOrder');
});

test('ยกเว้นด่านเงินได้เฉพาะใบย้อนหลัง — ใบ pipeline ที่มีร่องรอยปลอมยังไม่ผ่าน', () => {
  assert.equal(historicalGateExempt({ origin: 'pipeline', paymentGateExemptAt: '2026-09-15T00:00:00Z' }), false);
  assert.equal(historicalGateExempt({ origin: 'historical', paymentGateExemptAt: null }), false);
  assert.equal(historicalGateExempt({ origin: 'historical', paymentGateExemptAt: '2026-09-15T00:00:00Z' }), true);
});

test('เลขเอกสารเดิม: ตัดช่องว่าง ทิ้งค่าว่าง เรียง ใบเสนอราคา → Express → ใบกำกับ', () => {
  assert.deepEqual(
    historicalRefsOf({ historicalQuoteRef: ' Q#1 ', historicalExpressRef: '', historicalInvoiceRef: 'IV6801041' }),
    ['Q#1', 'IV6801041'],
  );
  assert.deepEqual(historicalRefsOf(null), []);
});

test('id ของใบย้อนหลังตรงกับสูตรใน RPC: SOR-H + md5(รหัสการคีย์) 16 ตัวแรก', () => {
  assert.match(SQL, /v_order_id := 'SOR-H' \|\| substr\(md5\(p_intake_key\), 1, 16\);/);
  const key = '4f0c9d2e-1b7a-4c1e-9f3d-8a6b5c4d3e2f';
  const md5 = createHash('md5').update(key).digest('hex');
  assert.equal(historicalOrderIdOf(md5), `SOR-H${md5.slice(0, 16)}`);
  assert.equal(historicalOrderIdOf(md5).length, 21);
});

test('ค่าคงที่ JS = ตัวเลขใน CHECK/RPC ของ 0360', () => {
  for (const col of ['historicalQuoteRef', 'historicalExpressRef', 'historicalInvoiceRef']) {
    assert.ok(SQL.includes(`length(btrim("${col}")) BETWEEN 1 AND ${HISTORICAL_REF_MAX}`), col);
  }
  assert.ok(SQL.includes(`length(btrim("installationPoint")) BETWEEN 1 AND ${INSTALLATION_POINT_MAX}`));
  assert.ok(SQL.includes(`BETWEEN ${EXEMPT_REASON_MIN} AND ${EXEMPT_REASON_MAX}`));
  assert.ok(SQL.includes(`NOT BETWEEN 1 AND ${INSTALLMENT_LABEL_MAX}`));
  assert.ok(SQL.includes(`BETWEEN DATE '${DOC_DATE_MIN}' AND DATE '${DOC_DATE_MAX}'`));
  assert.ok(SQL.includes(`v_order_date < DATE '${DOC_DATE_MIN}'`));
});

test('เหตุผลยกเว้นด่านเงิน 10–500 ตัวอักษร (นับแบบ Postgres length)', () => {
  assert.match(exemptReasonError('123456789'), /10–500/);
  assert.equal(exemptReasonError('1234567890'), null);
  assert.equal(exemptReasonError('ก'.repeat(500)), null);
  assert.match(exemptReasonError('ก'.repeat(501)), /10–500/);
  assert.match(exemptReasonError('   สั้นไป   '), /10–500/);
  assert.equal(charLength('😀😀'), 2);
});

test('รู้จัก error ที่แปลว่ายังไม่ได้รัน 0360', () => {
  assert.equal(historicalSchemaMissing({ code: '42703', message: 'column sales_orders.origin does not exist' }), true);
  assert.equal(historicalSchemaMissing({ code: 'PGRST202', message: 'Could not find the function' }), true);
  assert.equal(historicalSchemaMissing({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(historicalSchemaMissing(null), false);
});

test('ลบใบย้อนหลังแบบปกติ: ติดเมื่อ TS ผูกโซน · มีรอบบริการ · งวดคอนเฟิร์ม · มีเลขใบกำกับ', () => {
  const order = { origin: 'historical', installments: [{ status: 'pending' }] };
  assert.equal(historicalDeleteBlock({ order }), null);
  assert.match(historicalDeleteBlock({ order, terms: [{}, {}] }), /TS ผูกโซนแล้ว 2 จุด/);
  assert.match(historicalDeleteBlock({ order, plans: [{}] }), /รอบบริการ/);
  assert.match(
    historicalDeleteBlock({ order: { ...order, installments: [{ status: 'confirmed' }] } }),
    /คอนเฟิร์มแล้ว 1 งวด/,
  );
  assert.match(
    historicalDeleteBlock({ order: { ...order, installments: [{ status: 'reported', taxInvoiceNo: 'IV-1' }] } }),
    /ใบกำกับภาษี/,
  );
  // ใบ pipeline ไม่ผ่านตัวนี้เลย
  assert.equal(historicalDeleteBlock({ order: { origin: 'pipeline' }, terms: [{}] }), null);
});

test('PATCH ดีลภาชนะ: ห้ามเปลี่ยนลูกค้า/สาย/ประเภท/ทีมว่าง · ย้ายเจ้าของ + ทีมที่มีจริงผ่าน', () => {
  const deal = { origin: 'historical', customerId: 'CUS-1', line: 'SERVICE', dealType: 'RE-ORDER', team: 'SV' };
  assert.match(historicalDealPatchError(deal, { customerId: 'CUS-2' }), /ลูกค้า/);
  assert.match(historicalDealPatchError(deal, { customerId: '' }), /ลูกค้า/);
  assert.match(historicalDealPatchError(deal, { line: 'PRODUCT' }), /สาย/);
  assert.match(historicalDealPatchError(deal, { dealType: 'NPD' }), /ประเภท/);
  assert.match(historicalDealPatchError(deal, { projectType: 'SCENT' }), /ประเภท/);
  assert.match(historicalDealPatchError(deal, { team: '  ' }), /ทีม/);
  assert.equal(historicalDealPatchError(deal, { ownerId: 'U-2', team: 'ODM' }), null);
  assert.equal(historicalDealPatchError(deal, { customerId: 'CUS-1', line: 'SERVICE', dealType: 'RE-ORDER' }), null);
  assert.equal(historicalDealPatchError(deal, { line: '' }), null); // ฟอร์มส่งค่าว่าง = ไม่แตะ
  assert.equal(historicalDealPatchError({ ...deal, origin: 'pipeline' }, { customerId: 'CUS-2', line: 'PRODUCT' }), null);
});

test('409 ย้ายเจ้าของชนดีลภาชนะเดิม: บอกชื่อ AE + รหัสดีล + ว่ายังรวมดีลไม่ได้', () => {
  const message = historicalOwnerTakenMessage('สมหญิง', 'DL-260900042');
  assert.match(message, /สมหญิง/);
  assert.match(message, /DL-260900042/);
  assert.match(message, /ยังไม่รวมดีล/);
  assert.match(historicalOwnerTakenMessage('', ''), /AE คนนั้น/);
});

test('ชื่อลูกค้าบนใบ: ไทยก่อน ไม่มีค่อยอังกฤษ — กติกาเดียวกับที่ RPC คำนวณเอง', () => {
  assert.equal(customerSnapshotName({ name: '', nameEn: 'X' }), 'X');
  assert.match(SQL, /COALESCE\(NULLIF\(btrim\(v_customer\.name\), ''\), NULLIF\(btrim\(v_customer\."nameEn"\), ''\)\)/);
});

test('ชื่อดีลภาชนะห้ามใช้คำว่า "ดีลเก่า" (ข้อ 19)', () => {
  assert.doesNotMatch(HISTORICAL_DEAL_TITLE('บจก. เอ'), /ดีลเก่า/);
  assert.match(HISTORICAL_DEAL_TITLE(null), /ไม่ระบุลูกค้า/);
});
