// ม-167 (มติเจ้าของ 25/11/2026) — ข้อมูลลูกค้าบน IFRA / MSDS: ที่อยู่ที่ผู้ขอเลือก · อังกฤษ + เบอร์บังคับก่อนส่ง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docCustomerAddressChoices, docCustomerAddressError, docCustomerDefaultAddressId, docCustomerGaps,
  docCustomerPickAddress, docCustomerSubmitError, docCustomerView, requestNeedsDocCustomer,
} from './docCustomer.js';

const ani = {
  id: 'CUS-ANI', name: 'ANI AXA LTD.', nameEn: 'ANI AXA LTD.', phone: '',
  addresses: [
    { id: 'ADR-1', label: 'สำนักงาน', address: '54/6 หมู่ 5 เกาะยาวน้อย', addressEn: '54/6 Moo 5, Ko Yao Noi', useFor: 'both', contactPhone: '0812345678' },
    { id: 'ADR-2', label: 'รีสอร์ต', address: 'ราไวย์ ภูเก็ต', useFor: 'shipping', contactPhone: '076111222' },
  ],
};

test('ใบที่มีบรรทัด IFRA หรือ MSDS ต้องใช้ข้อมูลลูกค้า · Spec Sheet/อื่น ๆ/ใบวางบิลไม่ต้อง', () => {
  assert.equal(requestNeedsDocCustomer([{ lineKind: 'document', docType: 'ifra' }]), true);
  assert.equal(requestNeedsDocCustomer([{ lineKind: 'document', docType: 'msds' }]), true);
  assert.equal(requestNeedsDocCustomer([{ lineKind: 'document', docType: 'spec_sheet' }, { lineKind: 'document', docType: 'other' }]), false);
  assert.equal(requestNeedsDocCustomer([{ lineKind: 'billing_doc', docType: 'ifra' }]), false);
  assert.equal(requestNeedsDocCustomer([]), false);
});

test('ที่อยู่ทุกแถวเป็นตัวเลือก (รวมที่อยู่จัดส่ง) · ตั้งต้น = แถวแรกที่ออกเอกสารได้', () => {
  const choices = docCustomerAddressChoices(ani);
  assert.deepEqual(choices.map((c) => c.id), ['ADR-1', 'ADR-2']);
  assert.equal(choices[0].en, '54/6 Moo 5, Ko Yao Noi');
  assert.equal(choices[1].en, '');
  assert.equal(docCustomerDefaultAddressId(choices), 'ADR-1');
  // แถวแรกเป็นที่อยู่จัดส่ง = ข้ามไปแถวที่ออกเอกสารได้
  assert.equal(docCustomerDefaultAddressId([{ id: 'S', useFor: 'shipping' }, { id: 'B', useFor: 'billing' }]), 'B');
  assert.equal(docCustomerDefaultAddressId([{ id: 'S', useFor: 'shipping' }]), 'S');
  assert.equal(docCustomerDefaultAddressId([]), null);
});

test('เบอร์: บริษัทก่อน ไม่มี = ผู้ติดต่อของที่อยู่ที่เลือก · เปลี่ยนที่อยู่แล้วเบอร์เปลี่ยนตาม', () => {
  const view = docCustomerView(ani);
  assert.equal(view.addressId, 'ADR-1');
  assert.equal(view.phone, '0812345678');
  assert.equal(view.phoneFrom, 'address');
  const resort = docCustomerPickAddress(view, 'ADR-2');
  assert.equal(resort.addressId, 'ADR-2');
  assert.equal(resort.phone, '076111222');
  const withCompany = docCustomerView({ ...ani, phone: '021234567' }, 'ADR-2');
  assert.equal(withCompany.phone, '021234567');
  assert.equal(withCompany.phoneFrom, 'company');
});

test('ที่อยู่ที่ใบเลือกถูกลบจากทะเบียน = ตกไปที่อยู่หลัก + ธง addressStale', () => {
  const view = docCustomerView(ani, 'ADR-GONE');
  assert.equal(view.addressId, 'ADR-1');
  assert.equal(view.addressStale, true);
  assert.equal(docCustomerView(ani, 'ADR-2').addressStale, false);
});

test('ด่านกดส่ง: ชื่ออังกฤษ · ที่อยู่อังกฤษของที่อยู่ที่เลือก · เบอร์ — ไทยไม่บังคับ (ลูกค้าต่างชาติ)', () => {
  assert.equal(docCustomerSubmitError(docCustomerView(ani)), null);
  // ที่อยู่รีสอร์ตไม่มีอังกฤษ
  assert.deepEqual(docCustomerGaps(docCustomerView(ani, 'ADR-2')).map((g) => g.key), ['addressEn']);
  const thaiOnly = { id: 'C', name: 'บริษัท มีเมตตา จำกัด', nameEn: null, phone: '', addresses: [{ id: 'A', address: '77 ห้วยขวาง', useFor: 'both' }] };
  assert.deepEqual(docCustomerGaps(docCustomerView(thaiOnly)).map((g) => g.key), ['nameEn', 'addressEn', 'phone']);
  assert.match(docCustomerSubmitError(docCustomerView(thaiOnly)), /ชื่อภาษาอังกฤษ · ที่อยู่ภาษาอังกฤษ · เบอร์โทร/);
  const foreign = { id: 'F', name: '', nameEn: 'Chidaya Beauty LLC', phone: '+1 207 555 0100', addresses: [{ id: 'A', addressEn: '91 Goose Rocks Rd, Maine', useFor: 'both' }] };
  assert.equal(docCustomerSubmitError(docCustomerView(foreign)), null);
  const noAddress = { id: 'N', nameEn: 'X', phone: '021111111', addresses: [] };
  assert.deepEqual(docCustomerGaps(docCustomerView(noAddress)).map((g) => g.key), ['address']);
  assert.deepEqual(docCustomerGaps(null).map((g) => g.key), ['customer']);
});

test('ที่อยู่ที่ส่งมาต้องเป็นของลูกค้าของใบ · ว่าง = ผ่าน (ใช้ที่อยู่หลัก)', () => {
  assert.equal(docCustomerAddressError(ani, ''), null);
  assert.equal(docCustomerAddressError(ani, 'ADR-2'), null);
  assert.match(docCustomerAddressError(ani, 'ADR-OTHER'), /ไม่ใช่ที่อยู่ของลูกค้ารายนี้/);
  assert.match(docCustomerAddressError(null, 'ADR-1'), /ยังไม่มีลูกค้า/);
});

test('ลูกค้าที่ยังไม่ backfill addresses ได้ที่อยู่จากช่องเดี่ยวเดิม', () => {
  const legacy = { id: 'L', name: 'เก่า', nameEn: 'Old Co.', phone: '021234567', address: '1 ถนนสุขุมวิท' };
  const view = docCustomerView(legacy);
  assert.equal(view.addressId, 'ADR-legacy-billing');
  assert.equal(view.address.th, '1 ถนนสุขุมวิท');
  assert.deepEqual(docCustomerGaps(view).map((g) => g.key), ['addressEn']);
});
