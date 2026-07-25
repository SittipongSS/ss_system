import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssuedSalesOrderPayload,
  captureIssuedSalesOrderSnapshot,
  ISSUED_SALES_ORDER_LAYOUT_VERSION,
} from './issuedSalesOrderSnapshot.js';

const baseOrder = {
  id: 'SO-1',
  orderNumber: 'SO-2026-0001',
  orderDate: '2026-07-25',
  paymentDueDate: '2026-08-25',
  customerName: 'ลูกค้า ก',
  createdBy: 'U-AE',
  createdByName: 'ผู้จัดทำ',
  approvedByName: 'ผู้อนุมัติ',
  approvedAt: '2026-07-25T03:00:00.000Z',
  subtotal: 1000,
  discountAmount: 0,
  vatAmount: 70,
  totalAmount: 1070,
  lines: [
    { id: 'L1', sortOrder: 1, fgCode: 'FG-1', description: 'สินค้า A', qty: 2, unit: 'ชิ้น', unitPrice: 500, lineTotal: 1000 },
  ],
  // ข้อมูลลูกค้าบน SO อ่านจาก snapshot ของใบเสนอราคาที่ผูก
  quotation: {
    id: 'QT-1',
    quoteNumber: 'QT-2026-0001',
    customerId: 'C1',
    customerTaxId: null,
    branchCode: null,
    billingAddress: '123 ถนนทดสอบ',
    shippingAddress: null,
    contactName: null,
    contactPhone: null,
  },
};

const evidence = { id: 'DSE-1', controlledFormSnapshot: { formCode: 'FM-SA-03', revision: '00' } };

function captureClient(customer, sink) {
  return {
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === 'customers' ? customer : null }),
      };
      return q;
    },
    async rpc(name, args) {
      sink.name = name;
      sink.args = args;
      return { data: { snapshot: { id: 'ISD-1' } }, error: null };
    },
  };
}

test('payload ตรึงเนื้อหา ลูกค้า และบริษัท', () => {
  const payload = buildIssuedSalesOrderPayload(baseOrder);
  assert.equal(payload.document.orderNumber, 'SO-2026-0001');
  assert.equal(payload.content.totalAmount, 1070);
  assert.equal(payload.content.lines[0].unit, 'ชิ้น');
  assert.equal(payload.context.quoteNumber, 'QT-2026-0001');
  assert.ok(payload.company.legalName, 'ตรึงบล็อกบริษัท');
});

test('capture เติมข้อมูลลูกค้าที่ว่างจากทะเบียนก่อนตรึง — ฉบับตรึงต้องไม่แสดง "-"', async () => {
  // คู่ขนานกับฝั่ง QT: เดิมเติมเฉพาะตอนอ่าน (GET) ทำให้เอกสารที่ออกจริงแสดง
  // เลขผู้เสียภาษี/ผู้ติดต่อเป็น '-' ทั้งที่หน้าเว็บแสดงครบ (บั๊กผู้ใช้ 2026-07-26)
  const sink = {};
  const client = captureClient({
    taxId: '0105561000000',
    address: '123 ถนนทดสอบ',
    shippingAddress: null,
    branchCode: '00001',
    contacts: [{ name: 'คุณบี', phone: '021112222' }],
  }, sink);
  await captureIssuedSalesOrderSnapshot(client, {
    order: baseOrder,
    evidence,
    user: { id: 'U1', name: 'ผู้อนุมัติ' },
  });
  assert.equal(sink.name, 'capture_issued_sales_order_snapshot_atomic');
  assert.equal(sink.args.p_sales_order_id, 'SO-1');
  assert.equal(sink.args.p_resolved_payload.customer.customerTaxId, '0105561000000');
  assert.equal(sink.args.p_resolved_payload.customer.contactName, 'คุณบี');
  assert.equal(sink.args.p_resolved_payload.customer.branchCode, '00001');
  assert.match(sink.args.p_artifact_html, /0105561000000/);
  assert.match(sink.args.p_artifact_html, /คุณบี/);
});

test('capture ไม่ล้มเมื่อ SO ไม่มีใบเสนอราคาผูก', async () => {
  const sink = {};
  const client = captureClient(null, sink);
  await captureIssuedSalesOrderSnapshot(client, {
    order: { ...baseOrder, quotation: null },
    evidence,
    user: { id: 'U1' },
  });
  assert.equal(sink.args.p_resolved_payload.customer.customerTaxId, null);
  assert.equal(sink.args.p_sales_order_id, 'SO-1');
});

test('layout version ถูก tag ไว้สำหรับติดตาม generator', () => {
  assert.equal(ISSUED_SALES_ORDER_LAYOUT_VERSION, 'so-master-v4.2');
});
