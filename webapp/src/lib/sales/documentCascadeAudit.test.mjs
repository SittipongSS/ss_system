import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  snapshotDealDocumentsForAudit, snapshotSalesOrdersForAudit, documentCascadeSummary,
} from '@/lib/forceDelete';
import { documentCascadeAuditor } from '@/lib/sales/documentCascadeAudit';

/* 🐞 prod 24/11/2026: บังคับลบดีล DL-261000645 พา QT-26100448-0…-3 + SO-26100348-0 (อนุมัติแล้ว) หายไป
   แต่ audit_logs ได้แค่ดีล + คำร้อง — RPC force_delete_quotation ไม่จด audit · ไฟล์นี้ยืนยันว่า snapshot ครบ
   และเส้นลบจดทีละใบก่อนยิงลบ */

// stub ที่กรองแถวตาม .eq/.in และรองรับ .order/.range ของ fetchAllResult
function stubRows(rows, { errors = {} } = {}) {
  const reads = [];
  return {
    reads,
    from(table) {
      const filters = [];
      let range = null;
      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push([col, val]); return builder; },
        in(col, vals) { filters.push([col, vals]); return builder; },
        order() { return builder; },
        range(from, to) { range = [from, to]; return builder; },
        then(resolve) {
          reads.push(table);
          if (errors[table]) return resolve({ data: null, error: { message: errors[table] } });
          let data = (rows[table] || []).filter((row) => filters.every(([col, val]) => (
            Array.isArray(val) ? val.includes(row[col]) : row[col] === val
          )));
          if (range) data = data.slice(range[0], range[1] + 1);
          return resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

const ROWS = {
  quotations: [
    { id: 'Q1', quoteNumber: 'QT-1-0', status: 'revised', dealId: 'D1' },
    { id: 'Q2', quoteNumber: 'QT-1-1', status: 'accepted', dealId: 'D1' },
    { id: 'Q9', quoteNumber: 'QT-9-0', status: 'accepted', dealId: 'D2' },
  ],
  quotation_lines: [
    { id: 'QL1', quotationId: 'Q1' },
    { id: 'QL2', quotationId: 'Q2' },
    { id: 'QL3', quotationId: 'Q2' },
    { id: 'QL9', quotationId: 'Q9' },
  ],
  sales_orders: [
    // S1 ผูกดีลและใบ Q2 · S2 ผูกใบ Q2 แต่ dealId ไม่ตรง (ข้อมูลเก่า) — RPC วนลบตาม quotationId ก็ต้องถูกจดด้วย
    { id: 'S1', orderNumber: 'SO-1-0', status: 'approved', dealId: 'D1', quotationId: 'Q2' },
    { id: 'S2', orderNumber: 'SO-2-0', status: 'cancelled', dealId: 'DX', quotationId: 'Q2' },
    { id: 'S9', orderNumber: 'SO-9-0', status: 'approved', dealId: 'D2', quotationId: 'Q9' },
  ],
  sales_order_lines: [{ id: 'SL1', salesOrderId: 'S1' }, { id: 'SL9', salesOrderId: 'S9' }],
  sales_order_installments: [{ id: 'I1', salesOrderId: 'S1' }, { id: 'I2', salesOrderId: 'S1' }],
  sales_order_line_zones: [],
  issued_documents: [
    { id: 'ISD-Q2', documentType: 'quotation', documentId: 'Q2', quotationId: 'Q2', resolvedPayload: { total: 1 } },
    // ฉบับตรึงของ SO ก็พก quotationId — ห้ามไปโผล่ใต้ใบเสนอราคา
    { id: 'ISD-S1', documentType: 'sales_order', documentId: 'S1', quotationId: 'Q2', salesOrderId: 'S1' },
  ],
  document_signature_evidence: [
    { id: 'DSE-Q2', documentType: 'quotation', documentId: 'Q2' },
    { id: 'DSE-S1a', documentType: 'sales_order', documentId: 'S1' },
    { id: 'DSE-S1b', documentType: 'sales_order', documentId: 'S1' },
  ],
};

test('snapshotDealDocumentsForAudit: ใบเสนอราคาทุกใบของดีล + บรรทัด + ฉบับตรึง/หลักฐานของตัวเอง', async () => {
  const { quotations } = await snapshotDealDocumentsForAudit(stubRows(ROWS), 'D1');
  assert.deepEqual(quotations.map((q) => q.quoteNumber), ['QT-1-0', 'QT-1-1']);
  const accepted = quotations.find((q) => q.id === 'Q2');
  assert.deepEqual(accepted.lines.map((l) => l.id), ['QL2', 'QL3']);
  assert.deepEqual(accepted.issuedDocuments.map((d) => d.id), ['ISD-Q2'], 'ฉบับตรึงของ SO ต้องไม่ปนเข้าใบเสนอราคา');
  assert.deepEqual(accepted.issuedDocuments[0].resolvedPayload, { total: 1 }, 'เก็บเนื้อเอกสารที่ออกจริงไว้กู้');
  assert.deepEqual(accepted.signatureEvidence.map((d) => d.id), ['DSE-Q2']);
  assert.deepEqual(quotations.find((q) => q.id === 'Q1').issuedDocuments, []);
});

test('snapshotDealDocumentsForAudit: ใบสั่งขายทั้งตาม dealId (FK cascade) และตาม quotationId (RPC) ไม่ซ้ำ', async () => {
  const { salesOrders } = await snapshotDealDocumentsForAudit(stubRows(ROWS), 'D1');
  assert.deepEqual(salesOrders.map((o) => o.orderNumber), ['SO-1-0', 'SO-2-0']);
  const approved = salesOrders.find((o) => o.id === 'S1');
  assert.deepEqual(approved.lines.map((l) => l.id), ['SL1']);
  assert.deepEqual(approved.installments.map((i) => i.id), ['I1', 'I2']);
  assert.deepEqual(approved.lineZones, []);
  assert.deepEqual(approved.issuedDocuments.map((d) => d.id), ['ISD-S1']);
  assert.deepEqual(approved.signatureEvidence.map((d) => d.id), ['DSE-S1a', 'DSE-S1b']);
});

test('snapshotDealDocumentsForAudit: ดีลไม่มีเอกสาร = ว่างทั้งคู่ ไม่ยิงอ่านลูก', async () => {
  const supabase = stubRows(ROWS);
  const snap = await snapshotDealDocumentsForAudit(supabase, 'D-empty');
  assert.deepEqual(snap, { quotations: [], salesOrders: [] });
  assert.ok(!supabase.reads.includes('quotation_lines'));
  assert.ok(!supabase.reads.includes('sales_order_lines'));
});

test('⭐ snapshot อ่านไม่ขึ้น = โยน พร้อมบอกว่าอ่านอะไรพลาด (ผู้เรียกต้องหยุดก่อนลบ)', async () => {
  for (const [table, label] of [
    ['quotations', 'ใบเสนอราคาของดีล'],
    ['quotation_lines', 'บรรทัดใบเสนอราคา'],
    ['sales_order_installments', 'งวดชำระ'],
    ['issued_documents', 'ฉบับตรึง'],
    ['document_signature_evidence', 'หลักฐานลายเซ็น'],
  ]) {
    const supabase = stubRows(ROWS, { errors: { [table]: 'boom' } });
    await assert.rejects(() => snapshotDealDocumentsForAudit(supabase, 'D1'), new RegExp(`${label}.*boom`), table);
  }
});

test('snapshotSalesOrdersForAudit: รายการว่าง = [] ไม่ยิงอ่าน · id ซ้ำถูกยุบ', async () => {
  const empty = stubRows(ROWS);
  assert.deepEqual(await snapshotSalesOrdersForAudit(empty, []), []);
  assert.deepEqual(empty.reads, []);
  const orders = await snapshotSalesOrdersForAudit(stubRows(ROWS), ['S1', 'S1', null]);
  assert.deepEqual(orders.map((o) => o.id), ['S1']);
});

test('documentCascadeSummary: เลขที่ + สถานะ + เหตุที่หายพ่วง', () => {
  const cause = 'การลบดีล DL-261000645 (บังคับลบ — สิทธิ์ผู้ดูแลระบบ)';
  assert.equal(
    documentCascadeSummary('sales_order', { orderNumber: 'SO-26100348-0', status: 'approved' }, cause),
    'ลบใบสั่งขาย SO-26100348-0 (สถานะ approved) พ่วงการลบดีล DL-261000645 (บังคับลบ — สิทธิ์ผู้ดูแลระบบ)',
  );
  assert.equal(
    documentCascadeSummary('quotation', { id: 'Q1' }, 'การลบดีล D1'),
    'ลบใบเสนอราคา Q1 พ่วงการลบดีล D1',
  );
});

test('documentCascadeAuditor: จดทีละใบ เต็มแถว — ใบสั่งขายก่อนใบเสนอราคา', async () => {
  const snap = await snapshotDealDocumentsForAudit(stubRows(ROWS), 'D1');
  const written = [];
  const user = { id: 'U1', name: 'แอดมิน', role: 'admin' };
  await documentCascadeAuditor({
    user, request: null, cause: 'การลบดีล DL-1', write: async (entry) => { written.push(entry); },
  })(snap);
  assert.deepEqual(written.map((e) => `${e.entityType}:${e.entityId}`), [
    'sales_order:S1', 'sales_order:S2', 'quotation:Q1', 'quotation:Q2',
  ]);
  assert.ok(written.every((e) => e.action === 'delete' && e.user === user));
  const so = written[0];
  assert.equal(so.before.installments.length, 2, 'before ต้องพกลูกที่หายตาม');
  assert.match(so.summary, /^ลบใบสั่งขาย SO-1-0 \(สถานะ approved\) พ่วงการลบดีล DL-1$/);
});

test('documentCascadeAuditor: snapshot ว่าง/ไม่ส่ง = ไม่จดอะไร', async () => {
  const written = [];
  const audit = documentCascadeAuditor({ user: null, cause: 'x', write: async (e) => { written.push(e); } });
  await audit();
  await audit({ quotations: [], salesOrders: [] });
  assert.equal(written.length, 0);
});

/* ⭐ ลำดับในเส้นลบจริง: อ่าน snapshot ก่อนแตะอะไร · จด audit ก่อนยิงลบ */
test('⭐ เส้นลบดีล: snapshot ก่อนเก็บกวาด · จด audit ก่อนบังคับลบเอกสาร/ลบแถวดีล', () => {
  const src = readFileSync(new URL('../../app/api/sales-planning/deals/[id]/route.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export const DELETE'));
  const at = (needle) => {
    const i = body.indexOf(needle);
    assert.ok(i >= 0, `ไม่พบ ${needle}`);
    return i;
  };
  assert.ok(at('snapshotDealDocumentsForAudit(') < at('cleanupDealOrphans('));
  assert.ok(at('documentCascadeAuditor(') < at('forceDeleteDealDocuments('));
  assert.ok(at('documentCascadeAuditor(') < at(".from('sales_deals').delete()"));
});

test('⭐ เส้นลบใบเสนอราคา: snapshot ใบสั่งขายลูกก่อนปลด ref · จด audit ก่อนยิง RPC/ลบ', () => {
  const src = readFileSync(new URL('../../app/api/sales-planning/quotations/[id]/route.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export const DELETE'));
  const at = (needle) => {
    const i = body.indexOf(needle);
    assert.ok(i >= 0, `ไม่พบ ${needle}`);
    return i;
  };
  assert.ok(at('snapshotSalesOrdersForAudit(') < at('cleanupQuotationOrphans('));
  assert.ok(at('documentCascadeAuditor(') < at("rpc('force_delete_quotation'"));
});
