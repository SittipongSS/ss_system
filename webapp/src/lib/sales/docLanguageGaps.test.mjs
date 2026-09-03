import test from 'node:test';
import assert from 'node:assert/strict';

import { englishDocumentGaps, englishGapMessages } from '@/lib/sales/docLanguageGaps';

const line = (en) => ({ description: 'สินค้าไทย', metadata: en ? { descriptionEn: en } : {} });
// ใบที่กรอกคู่ภาษาของลูกค้าครบทุกช่อง — ฐานของเคส "ไม่ต้องเตือนอะไรเลย"
const customerBothLangs = {
  customerName: 'บริษัท ทดสอบ จำกัด', customerNameEn: 'Test Co., Ltd.',
  billingAddress: '1 ถนนทดสอบ', billingAddressEn: '1 Test Road',
  shippingAddress: '2 คลังสินค้า', shippingAddressEn: '2 Warehouse Road',
};

test('นับบรรทัดที่ไม่มีชื่ออังกฤษ', () => {
  const gaps = englishDocumentGaps({ lines: [line('Reed Diffuser'), line(null), line('  ')] });
  assert.equal(gaps.linesTotal, 3);
  assert.equal(gaps.linesMissingEn, 2, 'ช่องว่างล้วนนับว่าไม่มี');
});

test('ไม่มีบรรทัดเลย = ไม่เตือนเรื่องสินค้า', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [] }));
  assert.equal(msgs.filter((m) => m.includes('ชื่อสินค้า')).length, 0);
});

// ⭐ กติกาใหม่ (มติผู้ใช้ 2026-09-03): กรอกครบ = เงียบสนิท — เดิมบรรทัดลูกค้าขึ้นเสมอ
test('กรอกคู่ภาษาครบทั้งใบ = ไม่มีคำเตือนเลย', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ ...customerBothLangs, lines: [line('A'), line('B')] }));
  assert.deepEqual(msgs, []);
});

test('ลูกค้ามีแต่ภาษาไทย = เตือนทั้งชื่อและที่อยู่', () => {
  const msgs = englishGapMessages(englishDocumentGaps({
    customerName: 'บริษัท ทดสอบ จำกัด', billingAddress: '1 ถนนทดสอบ', lines: [line('A')],
  }));
  assert.deepEqual(msgs, [
    'ชื่อลูกค้ายังไม่มีภาษาอังกฤษ — จะพิมพ์ชื่อไทย',
    'ที่อยู่ลูกค้ายังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย',
  ]);
});

test('มีชื่ออังกฤษแล้วแต่ที่อยู่ยังไม่มี = เตือนเฉพาะที่อยู่', () => {
  const msgs = englishGapMessages(englishDocumentGaps({
    ...customerBothLangs, billingAddressEn: '', shippingAddressEn: '  ', lines: [line('A')],
  }));
  assert.deepEqual(msgs, ['ที่อยู่ลูกค้ายังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย']);
});

// ขาดข้างเดียวต้องบอกว่าแถวไหน ไม่งั้นคนไปแก้ผิดช่อง
test('ขาดเฉพาะที่อยู่จัดส่ง = บอกว่าเป็นที่อยู่จัดส่ง', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ ...customerBothLangs, shippingAddressEn: null }));
  assert.deepEqual(msgs, ['ที่อยู่จัดส่งยังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย']);
});

test('ขาดเฉพาะที่อยู่ผู้ซื้อ = บอกว่าเป็นที่อยู่ผู้ซื้อ', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ ...customerBothLangs, billingAddressEn: null }));
  assert.deepEqual(msgs, ['ที่อยู่ผู้ซื้อยังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย']);
});

// แถวจัดส่งที่ว่าง เอกสารพิมพ์ที่อยู่ออกบิลซ้ำลงไป ⇒ ต้องตัดสินตามที่อยู่ออกบิล
test('ไม่ได้แยกที่อยู่จัดส่ง: เดินตามที่อยู่ออกบิล', () => {
  const withEn = englishDocumentGaps({ billingAddress: '1 ถนนทดสอบ', billingAddressEn: '1 Test Road' });
  assert.equal(withEn.shippingAddressPrintsThai, false);
  const thaiOnly = englishDocumentGaps({ billingAddress: '1 ถนนทดสอบ' });
  assert.equal(thaiOnly.shippingAddressPrintsThai, true);
  assert.deepEqual(englishGapMessages(thaiOnly), ['ที่อยู่ลูกค้ายังไม่มีภาษาอังกฤษ — จะพิมพ์ที่อยู่ไทย']);
});

// ว่างทั้งสองภาษา = เอกสารพิมพ์ '-' อยู่แล้ว ไม่ใช่ของที่หายไปตอนแปล
test('ไม่มีข้อความเลยทั้งสองภาษา = ไม่เตือน', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ customerName: '', billingAddress: null, lines: [line('A')] }));
  assert.deepEqual(msgs, []);
});

// ลูกค้าที่มีแต่ที่อยู่อังกฤษ (มติ "อย่างน้อยหนึ่งภาษา") — ใบอังกฤษได้ของครบ ไม่ต้องเตือน
test('มีแต่ภาษาอังกฤษ ไม่มีไทย = ไม่เตือน', () => {
  const msgs = englishGapMessages(englishDocumentGaps({
    customerNameEn: 'Test Co., Ltd.', billingAddressEn: '1 Test Road', lines: [line('A')],
  }));
  assert.deepEqual(msgs, []);
});

test('ขาดทั้งหมด ใช้คำว่า "ทั้ง N บรรทัด" ไม่ใช่ "N จาก N"', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [line(null), line(null)] }));
  assert.match(msgs[0], /ชื่อสินค้าทั้ง 2 บรรทัด/);
});

test('ขาดบางบรรทัด บอกเศษส่วน', () => {
  const msgs = englishGapMessages(englishDocumentGaps({ lines: [line('A'), line(null), line(null)] }));
  assert.match(msgs[0], /ชื่อสินค้า 2 จาก 3 บรรทัด/);
});

// บรรทัดสินค้าอยู่ก่อนเสมอ — ของที่มีจำนวนเยอะสุดและแก้ที่ทะเบียนสินค้า
test('เรียงบรรทัดสินค้าก่อน แล้วค่อยชื่อ/ที่อยู่ลูกค้า', () => {
  const msgs = englishGapMessages(englishDocumentGaps({
    customerName: 'บริษัท ทดสอบ จำกัด', billingAddress: '1 ถนนทดสอบ', lines: [line(null)],
  }));
  assert.match(msgs[0], /ชื่อสินค้า/);
  assert.match(msgs[1], /ชื่อลูกค้า/);
  assert.match(msgs[2], /ที่อยู่ลูกค้า/);
});

test('ไม่มี lines เลย (ใบเก่า/ข้อมูลไม่ครบ) ต้องไม่พัง', () => {
  assert.deepEqual(englishDocumentGaps(), {
    linesTotal: 0,
    linesMissingEn: 0,
    customerNamePrintsThai: false,
    billingAddressPrintsThai: false,
    shippingAddressPrintsThai: false,
  });
  assert.equal(englishGapMessages(undefined).length, 0);
});
