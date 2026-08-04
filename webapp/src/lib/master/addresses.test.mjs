import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addressLabel,
  addressesFromLegacy,
  customerAddresses,
  legacyAddressMirror,
  normalizeAddresses,
  pickDocumentAddresses,
  primaryShippingAddress,
  toggleAddressUse,
} from './addresses.js';

// ลูกค้าที่มีสำนักงานใหญ่ (ออกบิล) + คลัง (จัดส่ง) + สาขาระยอง (ใช้ได้ทั้งสองอย่าง)
const CUSTOMER = {
  branchCode: '00000',
  addresses: [
    { id: 'ADR-hq', label: 'สำนักงานใหญ่', address: '1 สีลม', useFor: 'billing' },
    { id: 'ADR-wh', label: 'คลังบางนา', address: '9 บางนา', useFor: 'shipping' },
    { id: 'ADR-br2', label: 'สาขาระยอง', address: '77 ระยอง', useFor: 'both' },
  ],
};

test('แถวใหม่ได้ id เสมอ และแถวที่ไม่มีตัวที่อยู่ถูกตัดทิ้ง', () => {
  const rows = normalizeAddresses([
    { label: ' คลังบางนา ', address: ' 99/1 บางนา ', useFor: 'shipping' },
    { label: 'ป้ายชื่อล้วน', address: '   ' }, // ไม่มีที่อยู่ = ไม่ใช่ที่อยู่
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^ADR-/);
  assert.deepEqual(
    { ...rows[0], id: undefined },
    { id: undefined, label: 'คลังบางนา', address: '99/1 บางนา', useFor: 'shipping' },
  );
});

test('id เดิมไม่ถูกสร้างใหม่ — เอกสารฝั่งขายอ้างที่อยู่ด้วย id', () => {
  const [row] = normalizeAddresses([{ id: 'ADR-keep', address: 'ที่อยู่เดิม' }]);
  assert.equal(row.id, 'ADR-keep');
});

test('useFor ที่ไม่รู้จักตกเป็น both — ที่อยู่ที่บันทึกไว้แล้วต้องไม่หายจาก dropdown', () => {
  const [row] = normalizeAddresses([{ address: 'ที่อยู่', useFor: 'warehouse' }]);
  assert.equal(row.useFor, 'both');
});

test('ช่องเดี่ยวเดิมที่ไม่มีที่อยู่จัดส่ง → ที่อยู่เดียวใช้ได้ทั้งสองอย่าง', () => {
  const rows = addressesFromLegacy({ address: '1 สีลม' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].useFor, 'both');
});

test('ที่อยู่จัดส่งที่ซ้ำกับที่อยู่ออกบิลไม่กลายเป็นแถวซ้ำ', () => {
  const rows = addressesFromLegacy({ address: '1 สีลม', shippingAddress: '1 สีลม' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].useFor, 'both');
});

test('ที่อยู่จัดส่งที่ต่างกันแตกเป็นสองแถว และแยกหน้าที่กัน', () => {
  const rows = addressesFromLegacy({ address: '1 สีลม', shippingAddress: '9 บางนา' });
  assert.deepEqual(rows.map((r) => r.useFor), ['billing', 'shipping']);
});

test('ลูกค้าที่ยังไม่ backfill อ่านที่อยู่จากช่องเดี่ยวได้ ไม่ใช่ลิสต์ว่าง', () => {
  const rows = customerAddresses({ addresses: [], address: '1 สีลม' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, '1 สีลม');
});

test('ลิสต์ชนะช่องเดี่ยวเสมอเมื่อมีข้อมูลทั้งคู่', () => {
  const rows = customerAddresses({
    addresses: [{ id: 'ADR-1', address: 'ที่อยู่ใหม่' }],
    address: 'ที่อยู่เก่า',
  });
  assert.deepEqual(rows.map((r) => r.address), ['ที่อยู่ใหม่']);
});

test('กระจกลงช่องเดี่ยว: ที่อยู่หลักคือรายการแรกที่ใช้งานนั้นได้', () => {
  const list = [
    { id: 'A', address: 'คลัง', useFor: 'shipping' },
    { id: 'B', address: 'สำนักงานใหญ่', useFor: 'billing' },
  ];
  assert.deepEqual(legacyAddressMirror(list), {
    address: 'สำนักงานใหญ่',
    shippingAddress: 'คลัง',
  });
  assert.equal(primaryShippingAddress(list).id, 'A');
});

test('ที่อยู่จัดส่งหลัก = ที่อยู่ออกบิลตัวเดียวกัน → shippingAddress กลับเป็น null ตามความหมายเดิม', () => {
  const mirror = legacyAddressMirror([{ id: 'A', address: '1 สีลม', useFor: 'both' }]);
  assert.equal(mirror.address, '1 สีลม');
  assert.equal(mirror.shippingAddress, null);
});

test('ไม่มีที่อยู่ออกบิลเลย → กระจกเป็น null ให้ API ปฏิเสธได้', () => {
  const mirror = legacyAddressMirror([{ id: 'A', address: 'คลัง', useFor: 'shipping' }]);
  assert.equal(mirror.address, null);
});

test('เอกสารที่ไม่ได้เลือกที่อยู่ → ที่อยู่หลักของแต่ละหน้าที่ (พฤติกรรมเดิมของสายที่ไม่มีหน้าจอให้เลือก)', () => {
  const { snapshot } = pickDocumentAddresses(CUSTOMER, {});
  assert.equal(snapshot.billingAddress, '1 สีลม');
  assert.equal(snapshot.shippingAddress, '9 บางนา');
  assert.equal(snapshot.branchCode, '00000');
  assert.equal(snapshot.billingAddressId, 'ADR-hq');
});

test('เลือกที่อยู่คนละที่ไม่ทำให้สาขาขยับ — สาขาเป็นของลูกค้าทั้งราย', () => {
  const { snapshot } = pickDocumentAddresses(
    { ...CUSTOMER, branchCode: '00009' },
    { billingAddressId: 'ADR-br2', shippingAddressId: 'ADR-br2' },
  );
  assert.equal(snapshot.billingAddress, '77 ระยอง');
  assert.equal(snapshot.shippingAddress, '77 ระยอง');
  assert.equal(snapshot.branchCode, '00009');
});

test('id ที่ใช้กับหน้าที่นั้นไม่ได้ ถูกปฏิเสธ แล้วถอยไปที่อยู่หลัก', () => {
  // ADR-wh เป็นที่อยู่ "จัดส่งอย่างเดียว" — เอามาเป็นที่อยู่ออกบิลไม่ได้
  const { snapshot } = pickDocumentAddresses(CUSTOMER, { billingAddressId: 'ADR-wh' });
  assert.equal(snapshot.billingAddress, '1 สีลม');
  assert.equal(snapshot.billingAddressId, 'ADR-hq');
});

test('ที่อยู่ที่ใบเดิมเลือกไว้ถูกลบไปแล้ว → ถอยไปที่อยู่หลัก ไม่ใช่ค้างว่าง', () => {
  const { snapshot } = pickDocumentAddresses(CUSTOMER, { billingAddressId: 'ADR-หายไปแล้ว' });
  assert.equal(snapshot.billingAddress, '1 สีลม');
});

test('ลูกค้าที่ยังไม่ backfill ยังออกเอกสารได้จากช่องเดี่ยวเดิม', () => {
  const { snapshot } = pickDocumentAddresses({ address: '1 สีลม', branchCode: '00007' }, {});
  assert.equal(snapshot.billingAddress, '1 สีลม');
  assert.equal(snapshot.shippingAddress, '1 สีลม');
  assert.equal(snapshot.branchCode, '00007');  // มาจากคอลัมน์ของลูกค้า ไม่ใช่ของที่อยู่
});

test('ที่อยู่ที่ derive จากช่องเดี่ยวได้ id คงที่ — ไม่งั้น dropdown เลือกไม่ติด', () => {
  const legacy = { address: '1 สีลม', shippingAddress: '9 บางนา' };
  const first = customerAddresses(legacy).map((a) => a.id);
  const second = customerAddresses(legacy).map((a) => a.id);
  assert.deepEqual(first, second);
  // และ id นั้นต้องใช้เลือกได้จริง (ไม่ใช่แค่เท่ากันแต่ชี้ผิดแถว)
  const { snapshot } = pickDocumentAddresses(legacy, { billingAddressId: first[0] });
  assert.equal(snapshot.billingAddress, '1 สีลม');
});

test('ไม่ตั้งชื่อเรียก ป้ายใน dropdown ใช้ตัวที่อยู่ย่อ — ไม่ใช่ช่องว่างที่เลือกไม่ถูก', () => {
  assert.equal(addressLabel({ label: 'คลังบางนา', address: '9 บางนา' }), 'คลังบางนา');
  assert.equal(addressLabel({ label: '', address: '99/1 หมู่ 2 ถนนบางนา' }), '99/1 หมู่ 2 ถนนบางนา');
  assert.equal(addressLabel({ label: '', address: 'บรรทัดแรก\nบรรทัดสอง' }), 'บรรทัดแรก');
  assert.equal(addressLabel({ label: '', address: '' }), 'ที่อยู่');
});

test('ปุ่มติ๊กสองปุ่ม ↔ useFor สามค่า', () => {
  assert.equal(toggleAddressUse('both', 'shipping'), 'billing');
  assert.equal(toggleAddressUse('both', 'billing'), 'shipping');
  assert.equal(toggleAddressUse('billing', 'shipping'), 'both');
  assert.equal(toggleAddressUse('shipping', 'billing'), 'both');
});

test('ติ๊กปุ่มสุดท้ายออกไม่ได้ — ที่อยู่ที่ใช้ทำอะไรไม่ได้เลยไม่ใช่ที่อยู่', () => {
  assert.equal(toggleAddressUse('billing', 'billing'), 'billing');
  assert.equal(toggleAddressUse('shipping', 'shipping'), 'shipping');
});
