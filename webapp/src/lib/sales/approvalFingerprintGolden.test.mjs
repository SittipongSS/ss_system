// ── ค่าทองของลายนิ้วมือการอนุมัติ (ใบเสนอราคา · ใบสั่งขาย) ───────────────────────────────────────
//
// ⭐ ทำไมต้องมี (ช่องแพ็คต่อเดือนของใบเสนอราคา · mig 0407 · docs/qt-pack-column.md)
//   ลายนิ้วมือของใบที่อนุมัติแล้วถูกเก็บไว้ในฐานทุกใบ (วัด 08/10: ใบเสนอราคา 559 · ใบสั่งขาย 244)
//   แล้วทุกด่าน "ส่งลูกค้า / รับใบ / อนุมัติ" เทียบค่าที่เก็บกับค่าที่คำนวณสด ⇒ คีย์ใหม่ในบรรทัด
//   แม้ค่าเป็น null = ใบที่อนุมัติแล้วทุกใบกลายเป็น "ถูกแก้หลังอนุมัติ" พร้อมกันทั้งระบบ
//   (canonical JSON เก็บ null ไว้ — ดู lib/documentApproval.js)
//
// ⛔ ค่าในไฟล์นี้ **จับจากโค้ดก่อนแตะสองไฟล์ลายนิ้วมือ** (08/10 · รันเขียวบนต้นไม้ที่ยังไม่แก้)
//   ห้ามแก้ค่าให้เทสต์เขียว — ค่าเปลี่ยน = ใบบน production หลุดการอนุมัติ ต้องไปแก้โค้ดกลับ
//   เอกสารตัวอย่างคัดมาจาก mockups/qt-pack-column/_plan-tools/golden.mjs ทุกตัวอักษร
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentApprovalFingerprint } from '@/lib/documentApproval';
import { quotationApprovalContent, quotationApprovalFingerprint } from './quotationApprovalFingerprint.js';
import { salesOrderApprovalContent, salesOrderApprovalFingerprint } from './salesOrderApprovalFingerprint.js';
import { buildIssuedQuotationPayload } from './issuedQuotationSnapshot.js';
import { buildIssuedSalesOrderPayload } from './issuedSalesOrderSnapshot.js';

const GOLDEN_QUOTE = {
  quoteDate: '2026-10-08', validUntil: '2026-11-07', subtotal: 111900, discountType: 'amount', discountValue: 900, discountAmount: 900,
  vatRate: 7, vatAmount: 7770, totalAmount: 118770, paymentPlan: { type: 'installment', installments: [{ label: 'งวดที่ 1', percent: 50, amount: 59385 }, { label: 'งวดที่ 2', percent: 50, amount: 59385 }] },
  paymentTerms: 'เครดิต 30 วัน', notes: 'ราคานี้รวมค่าติดตั้งแล้ว',
  lines: [
    { id: 'QTL-b', sortOrder: 1, productId: 'PRD-1', fgCode: 'FG-278-02-001-0757', description: 'ระบบกระจายกลิ่น SDS · 1 package', qty: 24, unitPrice: 3500, discountType: 'amount', discountValue: 14400, discountAmount: 14400, lineTotal: 69600, unit: 'แพ็คเกจ', metadata: { note: 'x' } },
    { id: 'QTL-a', sortOrder: 0, productId: 'PRD-1', fgCode: 'FG-278-02-001-0757', description: 'ระบบกระจายกลิ่น SDS · 1 package', qty: 12, unitPrice: 3500, discountType: null, discountValue: 0, discountAmount: 0, lineTotal: 42000, unit: 'แพ็คเกจ' },
    { id: 'QTL-c', sortOrder: 2, productId: null, fgCode: null, description: ' ค่าติดตั้ง ', qty: 3, unitPrice: 33.33, discountType: 'percent', discountValue: 10, discountAmount: 10, lineTotal: 89.99, unit: 'งาน' },
    { id: 'QTL-d', sortOrder: 3, productId: 'PRD-9', fgCode: 'FG-336-01-009-1290', description: 'น้ำหอม 50 ml', qty: 2, unitPrice: 105.005, discountType: null, discountValue: 0, discountAmount: 0, lineTotal: 210.01, unit: 'ขวด' },
  ],
};
const GOLDEN_ORDER = {
  orderNumber: 'SO-26100001-0', quotationId: 'QT-golden', dealId: 'DL-golden', projectId: 'PJ-golden', customerId: 'CUS-golden', customerName: ' บริษัท ตัวอย่าง จำกัด ',
  orderDate: '2026-10-08', paymentDueDate: null, subtotal: 111900, discountAmount: 900, vatAmount: 7770, totalAmount: 118770, actualAmount: 111000, notes: 'ส่งของภายใน 7 วัน',
  docLanguage: 'th',
  lines: GOLDEN_QUOTE.lines.map((l) => ({ ...l, id: `SOL-${l.id}`, quotationLineId: l.id, serviceRounds: l.fgCode?.includes('-02-001-') ? 12 : null })),
};

/* ค่าที่จับจากโค้ดก่อนแก้ — หกค่าแรกคือของแผน (IMPL_PLAN_PR1 §5) · สองค่าหลังคือ payload ของฉบับตรึง */
const GOLDEN = Object.freeze({
  quotation: 'sha256:0c545cf1d3cfaab8ea69658ab1e8292c40515508ddbc0edcffaaf44f38b93ac3',
  quotationEmpty: 'sha256:682a66b904958f3f5af2ffea0b11a6e2e3d069622b3a69f7ef5c5ed7a86e6e77',
  salesOrder: 'sha256:db127f304e52e9082e677a36626b5490f2dfc5e3bd8bb31ab0d5f9bc5bf5443e',
  salesOrderEmpty: 'sha256:3017ff9fd5ab60aa28766b52ca01e2c886cbfb950f56f1efa5a075bf39d79d82',
  issuedSalesOrderContent: 'sha256:d0cff0c2d6a30558ccfaec9e7883b0ad7b75d7b8af3c4be29a2332d43b7a36ce',
});

/* เอกสารเดิมที่ทุกบรรทัดถูกเติมคีย์ packQty ด้วยค่าเดียวกัน — `undefined` = มีคีย์แต่ไม่มีค่า */
const withPackKey = (doc, value) => ({ ...doc, lines: doc.lines.map((l) => ({ ...l, packQty: value })) });
/* ค่าที่ "ไม่ใช่เลขแพ็ค": สิ่งที่ `select *` คืนหลังรัน 0407 (null) · ช่องที่ยังไม่ได้พิมพ์ ('' / เว้นวรรค) */
const NOT_A_PACK = [null, undefined, '', '   '];

test('ค่าทอง: ลายนิ้วมือใบเสนอราคาและใบสั่งขายของเอกสารตัวอย่าง = ค่าที่จับไว้ก่อนแก้โค้ด', () => {
  assert.equal(quotationApprovalFingerprint(GOLDEN_QUOTE, GOLDEN_QUOTE.lines), GOLDEN.quotation);
  assert.equal(quotationApprovalFingerprint(GOLDEN_QUOTE), GOLDEN.quotation, 'ไม่ส่งบรรทัด = อ่านจาก quote.lines');
  assert.equal(quotationApprovalFingerprint({}, []), GOLDEN.quotationEmpty);
  assert.equal(salesOrderApprovalFingerprint(GOLDEN_ORDER, GOLDEN_ORDER.lines), GOLDEN.salesOrder);
  assert.equal(salesOrderApprovalFingerprint(GOLDEN_ORDER), GOLDEN.salesOrder);
  assert.equal(salesOrderApprovalFingerprint({}, []), GOLDEN.salesOrderEmpty);
});

test('ค่าทอง: บรรทัดที่มีคีย์ packQty แต่ไม่มีเลขแพ็ค (null · undefined · ว่าง) = ค่าเดิมทุกตัวอักษร', () => {
  // ⭐ หลังรัน 0407 ทุกบรรทัดที่อ่านด้วย select * มี `packQty: null` ติดมา — ต้องไม่ขยับลายนิ้วมือของใบไหนเลย
  for (const value of NOT_A_PACK) {
    const label = JSON.stringify(value) ?? 'undefined';
    assert.equal(quotationApprovalFingerprint(withPackKey(GOLDEN_QUOTE, value)), GOLDEN.quotation, `ใบเสนอราคา packQty=${label}`);
    assert.equal(salesOrderApprovalFingerprint(withPackKey(GOLDEN_ORDER, value)), GOLDEN.salesOrder, `ใบสั่งขาย packQty=${label}`);
  }
});

test('ค่าทอง: เนื้อหาของบรรทัดที่ไม่มีเลขแพ็คมีคีย์ชุดเดิม — ไม่มีคีย์ packQty แม้เป็น null', () => {
  const QUOTE_KEYS = ['productId', 'fgCode', 'description', 'qty', 'unitPrice', 'discountType', 'discountValue', 'discountAmount', 'lineTotal'];
  for (const doc of [GOLDEN_QUOTE, ...NOT_A_PACK.map((v) => withPackKey(GOLDEN_QUOTE, v))]) {
    for (const line of quotationApprovalContent(doc).lines) assert.deepEqual(Object.keys(line), QUOTE_KEYS);
  }
  for (const doc of [GOLDEN_ORDER, ...NOT_A_PACK.map((v) => withPackKey(GOLDEN_ORDER, v))]) {
    for (const line of salesOrderApprovalContent(doc).lines) assert.deepEqual(Object.keys(line), ['quotationLineId', ...QUOTE_KEYS]);
  }
  // ลำดับบรรทัดตาม sortOrder (ตัวอย่างตั้งใจสลับ QTL-b มาก่อน QTL-a)
  assert.deepEqual(quotationApprovalContent(GOLDEN_QUOTE).lines.map((l) => l.lineTotal), [42000, 69600, 89.99, 210.01]);
});

test('ค่าทอง: payload ของฉบับตรึง (ใบเสนอราคา = เนื้อหาเดียวกับลายนิ้วมือ · ใบสั่งขาย = รายการคีย์ของตัวเอง) ไม่ขยับ', () => {
  // ใบเสนอราคา: ฉบับตรึงฝังเนื้อหาการอนุมัติทั้งก้อน ⇒ กฎ "ไม่มีเลขแพ็ค = ไม่มีคีย์" คุ้มครองฉบับตรึงด้วย
  for (const doc of [GOLDEN_QUOTE, ...NOT_A_PACK.map((v) => withPackKey(GOLDEN_QUOTE, v))]) {
    const payload = buildIssuedQuotationPayload(doc, {}, null);
    assert.deepEqual(payload.content, quotationApprovalContent(GOLDEN_QUOTE));
    assert.equal(documentApprovalFingerprint(payload.content), GOLDEN.quotation);
  }
  for (const doc of [GOLDEN_ORDER, ...NOT_A_PACK.map((v) => withPackKey(GOLDEN_ORDER, v))]) {
    assert.equal(documentApprovalFingerprint(buildIssuedSalesOrderPayload(doc, null).content), GOLDEN.issuedSalesOrderContent);
  }
});

/* ═══ หลังงวด PR-1: บรรทัดที่ "มี" เลขแพ็คได้คีย์เพิ่ม — บรรทัดอื่นของใบเดียวกันและใบอื่นทุกใบไม่ขยับ ═══════════════ */

/* เติมเลขแพ็คให้บรรทัดเดียว (ตาม id) */
const withPackOn = (doc, id, value) => ({ ...doc, lines: doc.lines.map((l) => (l.id === id ? { ...l, packQty: value } : l)) });
/* ค่าที่แผนคำนวณไว้ล่วงหน้าด้วยมือ (เติมคีย์ packQty: 1 ลงเนื้อหาของบรรทัด QTL-a) — IMPL_PLAN_PR1 §5 */
const GOLDEN_QUOTE_PACK1_ON_A = 'sha256:620449f8fb7d1efb30cf2827b9ce7c3f255c923849d5968e36672135f43e3a64';

test('เลขแพ็ค 1 เปลี่ยนลายนิ้วมือ (1 แพ็ค × 12 เดือน ≠ 12 ที่ไม่ได้แยกแพ็ค) — ได้ค่าที่คำนวณไว้ล่วงหน้า', () => {
  const doc = withPackOn(GOLDEN_QUOTE, 'QTL-a', 1);
  assert.equal(quotationApprovalFingerprint(doc), GOLDEN_QUOTE_PACK1_ON_A);
  assert.notEqual(quotationApprovalFingerprint(doc), GOLDEN.quotation);
  // เนื้อหา: บรรทัดนั้นได้คีย์ packQty ต่อท้าย บรรทัดอื่นคีย์ชุดเดิม
  const content = quotationApprovalContent(doc);
  assert.deepEqual(content.lines.map((l) => ('packQty' in l ? l.packQty : 'ไม่มีคีย์')), [1, 'ไม่มีคีย์', 'ไม่มีคีย์', 'ไม่มีคีย์']);
  assert.deepEqual(Object.keys(content.lines[0]).slice(-2), ['lineTotal', 'packQty']);
  const { packQty: _pack, ...rest } = content.lines[0];
  assert.deepEqual(rest, quotationApprovalContent(GOLDEN_QUOTE).lines[0], 'คีย์อื่นของบรรทัดนั้นไม่ขยับ');
});

test('เลขแพ็คที่เป็นสตริงกับตัวเลขได้ลายนิ้วมือเดียวกัน ("2" = 2) · เลขต่างกันได้ลายนิ้วมือต่างกัน', () => {
  for (const [fingerprint, base, id] of [
    [quotationApprovalFingerprint, GOLDEN_QUOTE, 'QTL-a'],
    [salesOrderApprovalFingerprint, GOLDEN_ORDER, 'SOL-QTL-a'],
  ]) {
    const two = fingerprint(withPackOn(base, id, 2));
    assert.equal(fingerprint(withPackOn(base, id, '2')), two);
    assert.equal(fingerprint(withPackOn(base, id, ' 2 ')), two);
    assert.notEqual(two, fingerprint(withPackOn(base, id, 3)));
    assert.notEqual(two, fingerprint(withPackOn(base, id, 1)));
    assert.notEqual(two, fingerprint(base));
    assert.notEqual(fingerprint(withPackOn(base, id, 1)), fingerprint(base), 'เลขแพ็ค 1 ≠ ไม่มีเลขแพ็ค');
  }
});

test('ค่าที่ไม่ใช่เลขแพ็คที่ใช้ได้ ("abc" · 0 · 1.5 · 10000) นับเป็น "ไม่มี" — เก็บลงฐานไม่ได้อยู่แล้ว (เซิร์ฟเวอร์ปฏิเสธ · คอลัมน์เป็นจำนวนเต็ม 1–9999)', () => {
  for (const value of ['abc', 0, '0', 1.5, 10000, true, {}]) {
    assert.equal(quotationApprovalFingerprint(withPackKey(GOLDEN_QUOTE, value)), GOLDEN.quotation, `ใบเสนอราคา packQty=${JSON.stringify(value)}`);
    assert.equal(salesOrderApprovalFingerprint(withPackKey(GOLDEN_ORDER, value)), GOLDEN.salesOrder, `ใบสั่งขาย packQty=${JSON.stringify(value)}`);
  }
});

test('ใบสั่งขาย: บรรทัดที่มีเลขแพ็คได้คีย์เดียวกับฝั่งใบเสนอราคา — ก๊อปจาก QT แล้วลายนิ้วมือของสองฝั่งพูดเรื่องเดียวกัน', () => {
  const order = withPackOn(GOLDEN_ORDER, 'SOL-QTL-b', 2);
  const lines = salesOrderApprovalContent(order).lines;
  assert.deepEqual(lines.map((l) => l.packQty), [undefined, 2, undefined, undefined]);
  assert.deepEqual(Object.keys(lines[1]).slice(-2), ['lineTotal', 'packQty']);
  assert.notEqual(salesOrderApprovalFingerprint(order), GOLDEN.salesOrder);
  // ฉบับตรึงของใบเสนอราคาฝังเนื้อหาการอนุมัติ ⇒ เลขแพ็คเข้าฉบับตรึงของใบเสนอราคาไปด้วยโดยโครงสร้าง
  const quote = withPackOn(GOLDEN_QUOTE, 'QTL-b', 2);
  assert.deepEqual(buildIssuedQuotationPayload(quote, {}, null).content, quotationApprovalContent(quote));
  /* ฉบับตรึงของใบสั่งขายมีรายการคีย์ของตัวเอง — งวด PR-1 ยังไม่แตะ · **งวด PR-2 เติมพร้อมกระดาษ** (บรรทัดนี้คือจุดที่
     งวด PR-1 ประกาศไว้ว่าจะพลิก): บรรทัดที่มีเลขแพ็คได้คีย์ packQty ต่อท้าย + หน่วยเป็นเดือนตามที่กระดาษพิมพ์
     ⇒ ลายนิ้วมือเนื้อหาของใบที่มีเลขแพ็ค **ต้องต่าง** จากค่าทอง · ใบที่ไม่มีเลขแพ็คยังเท่าค่าทองทุกตัวอักษร
     (เทสต์ "payload ของฉบับตรึง … ไม่ขยับ" ด้านบนไม่ถูกแก้) */
  const issued = buildIssuedSalesOrderPayload(order, null).content;
  assert.notEqual(documentApprovalFingerprint(issued), GOLDEN.issuedSalesOrderContent);
  assert.deepEqual(issued.lines.map((l) => ('packQty' in l ? l.packQty : 'ไม่มีคีย์')), ['ไม่มีคีย์', 2, 'ไม่มีคีย์', 'ไม่มีคีย์']);
  assert.deepEqual(Object.keys(issued.lines[1]).slice(-2), ['lineTotal', 'packQty']);
  assert.equal(issued.lines[1].unit, 'เดือน', 'เก็บไว้เป็นแพ็คเกจ แต่กระดาษพิมพ์เดือน — หลักฐานพูดตรงกับกระดาษ');
  // บรรทัดอื่นของใบเดียวกัน และยอดท้ายใบ ไม่ขยับจากใบที่ไม่มีเลขแพ็ค
  const base = buildIssuedSalesOrderPayload(GOLDEN_ORDER, null).content;
  assert.deepEqual([issued.lines[0], issued.lines[2], issued.lines[3]], [base.lines[0], base.lines[2], base.lines[3]]);
  const { packQty: _pack, unit: _unit, ...rest } = issued.lines[1];
  const { unit: baseUnit, ...baseRest } = base.lines[1];
  assert.deepEqual(rest, baseRest);
  assert.equal(baseUnit, 'แพ็คเกจ');
  assert.deepEqual({ ...issued, lines: null }, { ...base, lines: null });
});
