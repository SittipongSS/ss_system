import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssuedSalesOrderArtifactHtml,
  buildIssuedSalesOrderPayload,
  captureIssuedSalesOrderSnapshot,
  issuedContentFingerprint,
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
  // v4.5 = คอลัมน์แพ็คต่อเดือนบนกระดาษ + คีย์ packQty ใน payload ของบรรทัดที่มีเลขแพ็ค (docs/qt-pack-column.md)
  // ป้ายของตัวสร้างเท่านั้น — ใบที่ไม่มีเลขแพ็คได้ artifact และ payload เดิมทุกไบต์ (เทสต์ด้านล่างยืนยัน)
  assert.equal(ISSUED_SALES_ORDER_LAYOUT_VERSION, 'so-master-v4.5');
});

test('payload ตรึงชื่อ/ที่อยู่อังกฤษ — ค่าบนใบมาก่อน แล้วถอยไปใบเสนอราคาที่ผูก', () => {
  const fromQuote = buildIssuedSalesOrderPayload({
    ...baseOrder,
    customerNameEn: 'Customer A Co., Ltd.',
    quotation: { ...baseOrder.quotation, billingAddressEn: '123 Test Road', shippingAddressEn: '   ' },
  });
  assert.equal(fromQuote.customer.customerNameEn, 'Customer A Co., Ltd.');
  assert.equal(fromQuote.customer.billingAddressEn, '123 Test Road');
  // เว้นวรรคล้วน = ว่าง — ปล่อย null ให้ชั้นเรนเดอร์ถอยไปไทยเอง
  assert.equal(fromQuote.customer.shippingAddressEn, null);
  // ค่าบนใบสั่งขายเองมาก่อน snapshot ของใบเสนอราคา
  const own = buildIssuedSalesOrderPayload({
    ...baseOrder,
    billingAddressEn: 'SO Road',
    quotation: { ...baseOrder.quotation, billingAddressEn: 'QT Road' },
  });
  assert.equal(own.customer.billingAddressEn, 'SO Road');
  // ช่องไทยไม่ขยับ
  assert.equal(own.customer.customerName, 'ลูกค้า ก');
  assert.equal(own.customer.billingAddress, '123 ถนนทดสอบ');
  // ใบเก่าที่ยังไม่มีคอลัมน์ = null ทั้งชุด (ไม่ backfill ตามมติผู้ใช้)
  const old = buildIssuedSalesOrderPayload(baseOrder);
  assert.equal(old.customer.customerNameEn, null);
  assert.equal(old.customer.billingAddressEn, null);
  assert.equal(old.customer.shippingAddressEn, null);
});

/* ⭐ มติผู้ใช้ 2026-09-22 "ชื่อ ตำแหน่ง ขอเป็นชื่อเต็ม" + "ปรับการแสดงชื่อตำแหน่งในใบ QT และ SO ด้วย"
   ฉบับตรึงพิมพ์ตำแหน่งเต็มของคนที่เซ็นจริงทุกช่อง — role มาจากหลักฐานการลงนามแต่ละใบ (ยื่น · อนุมัติ · บัญชี) */
test('capture ฝังตำแหน่งเต็มของผู้ลงนามทั้งสามช่องจาก signerRole ของหลักฐาน', async () => {
  const sink = {};
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const asset = { storageBucket: 'sig', storagePath: 'p.png', mimeType: 'image/png' };
  const rows = {
    'DSE-SUBMIT': { id: 'DSE-SUBMIT', signerName: 'สมศรี ขายดี', signerRole: 'senior_ae', signedAt: '2026-07-24T03:00:00.000Z', signatureAssetSnapshot: asset },
    'DSE-FIN': { signerRole: 'finance', signatureAssetSnapshot: asset },
  };
  const client = {
    from(table) {
      let id = null;
      const q = {
        select: () => q,
        eq: (col, value) => { if (col === 'id') id = value; return q; },
        maybeSingle: async () => ({ data: table === 'document_signature_evidence' ? rows[id] || null : null, error: null }),
      };
      return q;
    },
    storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => png.buffer }, error: null }) }) },
    async rpc(name, args) { sink.args = args; return { data: {}, error: null }; },
  };
  await captureIssuedSalesOrderSnapshot(client, {
    order: {
      ...baseOrder,
      proposerSignatureEvidenceId: 'DSE-SUBMIT',
      financeSignatureEvidenceId: 'DSE-FIN',
      financeApprovedByName: 'Saowalak Muangsri',
    },
    evidence: { ...evidence, signerRole: 'admin', signatureAssetSnapshot: asset },
    user: { id: 'U1' },
  });
  const html = sink.args.p_artifact_html;
  assert.match(html, /<h2>ฝ่ายขาย <span>Senior Account Executive<\/span><\/h2>/);
  assert.match(html, /<h2>ผู้จัดการฝ่ายขาย <span>Administrator<\/span><\/h2>/, 'admin อนุมัติแทน ⇒ ตำแหน่งของคนที่เซ็น');
  assert.match(html, /<h2>ฝ่ายบัญชี <span>Finance Officer<\/span><\/h2>/);
  assert.equal((html.match(/<img class="signatureImage"/g) || []).length, 3);
  assert.doesNotMatch(html, /AE เจ้าของดีล|<span>AE Supervisor<|<span>ผู้ตรวจสอบ</);
});

/* 🐞 ตรวจรอบสาม: อ่านหลักฐานพลาดแล้วเดินต่อเงียบ ๆ ⇒ ตรึงกระดาษที่ช่องฝ่ายขายเป็นลายเซ็นสด/ช่องบัญชีว่าง + ตำแหน่งคำกลาง
   และ RPC idempotent ตามลายนิ้วมือ ⇒ กระดาษผิดกลายเป็นฉบับที่ออกถาวร · ต้อง throw ก่อนถึง RPC
   (ผู้เรียกทุกจุดครอบ best-effort + log — การอนุมัติไม่ถูกย้อน) */
test('🔴 capture: อ่านหลักฐานของผู้ยื่น/ฝ่ายบัญชีไม่ได้ = throw ไม่ตรึงกระดาษที่ขาดลายเซ็น/ตำแหน่ง', async () => {
  for (const [failing, pattern] of [['DSE-SUBMIT', /ผู้ยื่นไม่สำเร็จ: timeout/], ['DSE-FIN', /ฝ่ายบัญชีไม่สำเร็จ: timeout/]]) {
    const sink = {};
    const client = {
      from(table) {
        let id = null;
        const q = {
          select: () => q,
          eq: (col, value) => { if (col === 'id') id = value; return q; },
          maybeSingle: async () => (table === 'document_signature_evidence' && id === failing
            ? { data: null, error: { message: 'timeout' } }
            : { data: null, error: null }),
        };
        return q;
      },
      async rpc(name, args) { sink.args = args; return { data: {}, error: null }; },
    };
    await assert.rejects(captureIssuedSalesOrderSnapshot(client, {
      order: { ...baseOrder, proposerSignatureEvidenceId: 'DSE-SUBMIT', financeSignatureEvidenceId: 'DSE-FIN' },
      evidence,
      user: { id: 'U1' },
    }), pattern);
    assert.equal(sink.args, undefined, `${failing}: ห้ามเรียก RPC ตรึง`);
  }
});

// ══ เลขแพ็คต่อเดือนในฉบับตรึงของใบสั่งขาย (มติเจ้าของ 08/10 · mig 0407 · docs/qt-pack-column.md) ═══════════════════

/* คีย์ของบรรทัดใน payload ณ ก่อนเพิ่มเลขแพ็ค — บรรทัดที่ไม่มีเลขแพ็คต้องมีคีย์ชุดนี้เป๊ะ (ไม่มี packQty แม้เป็น null) */
const PAYLOAD_LINE_KEYS = ['fgCode', 'description', 'qty', 'unit', 'unitPrice', 'lineTotal'];
const packOrder = (over = {}) => ({
  ...baseOrder,
  subtotal: 85000, vatAmount: 5950, totalAmount: 90950,
  lines: [
    { id: 'L1', sortOrder: 1, fgCode: 'FG-1', description: 'สินค้า A', qty: 2, unit: 'ชิ้น', unitPrice: 500, lineTotal: 1000 },
    { id: 'L2', sortOrder: 2, fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 1 package', qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500, lineTotal: 84000, packQty: 2, ...over },
  ],
});

test('payload: บรรทัดที่มีเลขแพ็คได้คีย์ packQty ต่อท้ายสุด และหน่วยเป็นเดือนตามที่กระดาษพิมพ์ — บรรทัดอื่นคีย์และค่าเดิม', () => {
  const [plain, pack] = buildIssuedSalesOrderPayload(packOrder()).content.lines;
  assert.deepEqual(Object.keys(plain), PAYLOAD_LINE_KEYS);
  assert.deepEqual(plain, { fgCode: 'FG-1', description: 'สินค้า A', qty: 2, unit: 'ชิ้น', unitPrice: 500, lineTotal: 1000 });
  assert.deepEqual(Object.keys(pack), [...PAYLOAD_LINE_KEYS, 'packQty']);
  assert.deepEqual(pack, {
    fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 1 package', qty: 12, unit: 'เดือน', unitPrice: 3500, lineTotal: 84000, packQty: 2,
  });
  // เลขที่เก็บเป็นสตริงได้ค่าเดียวกับตัวเลข — ลายนิ้วมือเนื้อหาเท่ากัน
  assert.equal(
    issuedContentFingerprint(buildIssuedSalesOrderPayload(packOrder({ packQty: '2' }))),
    issuedContentFingerprint(buildIssuedSalesOrderPayload(packOrder())),
  );
  assert.notEqual(
    issuedContentFingerprint(buildIssuedSalesOrderPayload(packOrder({ packQty: 3 }))),
    issuedContentFingerprint(buildIssuedSalesOrderPayload(packOrder())),
    'เลขแพ็คต่างกัน = เนื้อหาต่างกัน = ต้องออกฉบับใหม่',
  );
});

test('payload: ค่าที่ไม่ใช่เลขแพ็ค (null ที่ select * คืน · ว่าง · ค่าที่เก็บลงฐานไม่ได้) = payload เดิมทุกคีย์ หน่วยที่เก็บไว้ตามเดิม', () => {
  const { packQty: _pack, ...noKeyLine } = packOrder().lines[1];
  const expected = buildIssuedSalesOrderPayload({ ...packOrder(), lines: [packOrder().lines[0], noKeyLine] });
  assert.deepEqual(Object.keys(expected.content.lines[1]), PAYLOAD_LINE_KEYS);
  assert.equal(expected.content.lines[1].unit, 'แพ็คเกจ', 'ไม่มีเลขแพ็ค = หน่วยที่เก็บไว้');
  for (const value of [null, undefined, '', '   ', 'abc', 0, '0', 1.5, 10000, true]) {
    const payload = buildIssuedSalesOrderPayload(packOrder({ packQty: value }));
    assert.deepEqual(payload, expected, `packQty=${JSON.stringify(value) ?? 'undefined'}`);
    assert.equal(issuedContentFingerprint(payload), issuedContentFingerprint(expected));
  }
});

test('artifact ของใบที่มีเลขแพ็คมีคอลัมน์แพ็ค — ใบที่ไม่มีไม่มีคำว่า withPack เลย', () => {
  const html = buildIssuedSalesOrderArtifactHtml(packOrder(), {});
  assert.match(html, /<table class="itemTable withPack">/);
  assert.ok(html.includes('<th class="number">แพ็ค/เดือน</th>'));
  assert.ok(!buildIssuedSalesOrderArtifactHtml(baseOrder, {}).includes('withPack'));
});
