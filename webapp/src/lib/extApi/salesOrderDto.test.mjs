// whitelist ของรูปข้อมูลที่ส่งออก — คีย์ต้องเท่ารายการเป๊ะ · ช่องภายในต้องไม่หลุด
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_KEYS, DELETED_KEYS, LINE_KEYS, ORDER_KEYS, deletedOrderDto, salesOrderDto, salesOrderLineDto } from './salesOrderDto.js';

const ROW = {
  id: 'SOR-internal', orderNumber: 'SO-26070001-1', baseNumber: 'SO-26070001', revisionNo: 1, status: 'approved',
  origin: 'pipeline', orderDate: '2026-07-03', deliveryDueDate: '2026-08-15', paymentDueDate: '2026-08-31',
  approvedAt: '2026-07-04T03:12:00Z', cancelledAt: null, customerId: 'CUS-1', customerName: 'ลูกค้า ก',
  subtotal: 10000, discountAmount: 0, vatAmount: 700, totalAmount: 10700, changeSeq: '18234', changedAt: '2026-07-04T03:12:00Z',
  // ⛔ ช่องภายในที่ห้ามหลุด
  actualAmount: 9999, notes: 'โน้ตภายใน', metadata: { secret: 1 }, approvedBy: 'U1', approvedByName: 'ผู้อนุมัติ',
  approvalNote: 'x', rejectionReason: 'x', cancelReason: 'x', createdBy: 'U2', projectId: 'PRJ-1', approvalFingerprint: 'sha256:…',
  supersededById: 'SOR-next', revisedFromId: 'SOR-prev', ownerId: 'U3', financeStatus: 'approved',
};
const LINE = {
  id: 'SOL-1', salesOrderId: 'SOR-internal', productId: 'P1', fgCode: 'FG-001-02-001-0001', description: 'ก้านหอม',
  qty: 1, packQty: 3, unit: 'เดือน', unitPrice: 3500, discountAmount: 6900, lineTotal: 3600, sortOrder: 0,
  metadata: { cost: 100 }, quotationLineId: 'QL-1', serviceZoneId: 'Z1',
};

test('หัวใบ: คีย์เท่า whitelist เป๊ะ · ไม่มีช่องภายในหลุด', () => {
  const dto = salesOrderDto(ROW, { lines: [LINE], arCode: 'AR-306', supersededBy: 'SO-26070001-2' });
  assert.deepEqual(Object.keys(dto), [...ORDER_KEYS]);
  assert.deepEqual(Object.keys(dto.customer), [...CUSTOMER_KEYS]);
  const text = JSON.stringify(dto);
  for (const leak of ['SOR-internal', '9999', 'โน้ตภายใน', 'secret', 'ผู้อนุมัติ', 'PRJ-1', 'fingerprint', 'SOR-next', 'SOR-prev', 'U1', 'U3', 'cost']) {
    assert.ok(!text.includes(leak), `${leak} ต้องไม่หลุด`);
  }
  assert.equal(dto.changeSeq, 18234, 'bigint จากฐานมาเป็นสตริงได้ — ส่งเป็นตัวเลข');
  assert.equal(dto.supersededBy, 'SO-26070001-2');
  assert.deepEqual(dto.customer, { arCode: 'AR-306', name: 'ลูกค้า ก' });
});

test('บรรทัด: คีย์เท่า whitelist · แพ็ค/เดือนกระทบยอดได้ qty × packQty × unitPrice − discountAmount = lineTotal', () => {
  const line = salesOrderLineDto(LINE);
  assert.deepEqual(Object.keys(line), [...LINE_KEYS]);
  assert.equal(line.categoryCode, '02-001');
  assert.equal(line.qty * (line.packQty ?? 1) * line.unitPrice - line.discountAmount, line.lineTotal);
  const plain = salesOrderLineDto({ fgCode: 'FG-001-01-005-0001', qty: 10, unitPrice: 1000, discountAmount: null, lineTotal: 10000, packQty: null });
  assert.equal(plain.packQty, null, 'บรรทัดทั่วไป = null (ปลายทางใช้ 1)');
  assert.equal(plain.discountAmount, 0);
  assert.equal(plain.qty * (plain.packQty ?? 1) * plain.unitPrice - plain.discountAmount, plain.lineTotal);
});

test('หมวดของบรรทัด: FG ก่อน · พิมพ์เองอ่าน metadata.categoryCode (หรือ alias metadataCategory) · ไม่รู้ = null', () => {
  assert.equal(salesOrderLineDto({ fgCode: null, metadataCategory: '01-003' }).categoryCode, '01-003');
  assert.equal(salesOrderLineDto({ fgCode: null, metadata: { categoryCode: '03-010' } }).categoryCode, '03-010');
  assert.equal(salesOrderLineDto({ fgCode: null }).categoryCode, null);
});

test('บรรทัดเรียงตาม sortOrder · ใบที่ถูกลบมีแค่เลขที่ใบ', () => {
  const dto = salesOrderDto(ROW, { lines: [{ ...LINE, sortOrder: 2, description: 'ข' }, { ...LINE, sortOrder: 1, description: 'ก' }] });
  assert.deepEqual(dto.lines.map((l) => l.description), ['ก', 'ข']);
  const gone = deletedOrderDto({ changeSeq: '5', orderNumber: 'SO-1-0', baseNumber: 'SO-1', revisionNo: 0, deletedAt: '2026-11-17T00:00:00Z', status: 'approved' });
  assert.deepEqual(Object.keys(gone), [...DELETED_KEYS]);
  assert.deepEqual(gone, { orderNumber: 'SO-1-0', baseNumber: 'SO-1', revisionNo: 0, status: 'deleted', changeSeq: 5, changedAt: '2026-11-17T00:00:00Z' });
});
