// หัวใบคำร้อง — ช่องไหนขึ้นเมื่อไร
//
// ⚠️ เคสแรกคือบั๊กที่ผู้ใช้แจ้งเอง (IS-26080003): ใบที่มีบรรทัดไม่เคยโชว์ลูกค้า
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestHeaderFacts } from './headerFacts.js';

const base = {
  createdAt: '2026-08-10T04:19:26.251Z',
  requestedByName: 'Patinya Poonsittichokchai',
  team: 'KA',
  customerName: 'บริษัท กี๊ก แกลเลอรี่ จำกัด สำนักงานใหญ่',
  refCustomer: { id: 'CUS-1', arCode: 'AR-231', contactPerson: 'คุณเจี๊ยบ', contactPhone: '081-234-5678' },
  requestedDueDate: '2026-08-15',
};

const keys = (facts) => facts.map((f) => f.key);
const byKey = (facts, key) => facts.find((f) => f.key === key);

test('ลูกค้าขึ้นทุกใบ — ทั้งใบที่มีบรรทัดและใบที่ไม่มี', () => {
  const withRows = requestHeaderFacts(base, { hasItems: true, progress: { done: 2, total: 5 } });
  const withoutRows = requestHeaderFacts(base, { hasItems: false });

  assert.ok(keys(withRows).includes('customer'), 'ใบที่มีบรรทัดต้องเห็นลูกค้า');
  assert.ok(keys(withoutRows).includes('customer'));
  // ของเดิมสองช่องนี้แย่งที่กัน — ตอนนี้อยู่ด้วยกันได้
  assert.ok(keys(withRows).includes('progress'));
});

test('ชื่อลูกค้าเป็นตัวหลัก รหัส AR เป็นบรรทัดรอง', () => {
  const customer = byKey(requestHeaderFacts(base, {}), 'customer');
  assert.equal(customer.value, base.customerName);
  assert.equal(customer.sub, 'AR-231');
});

test('ใบที่ทะเบียนยังไม่มีรหัส AR — โชว์ชื่อเปล่า ไม่ใช่ขีดหรือช่องว่าง', () => {
  const facts = requestHeaderFacts({ ...base, refCustomer: { id: 'CUS-1' } }, {});
  const customer = byKey(facts, 'customer');
  assert.equal(customer.value, base.customerName);
  assert.equal(customer.sub, null);
});

test('ใบที่ไม่ได้ผูกลูกค้า — ช่องยังอยู่แต่บอกว่าไม่มี', () => {
  const facts = requestHeaderFacts({ ...base, customerName: null, refCustomer: null }, {});
  assert.equal(byKey(facts, 'customer').value, '—');
  assert.equal(keys(facts).includes('contact'), false, 'ไม่มีลูกค้า = ไม่มีผู้ติดต่อให้โชว์');
});

test('ทีมของผู้ขอเป็นบรรทัดรอง ไม่กินช่องของตัวเอง', () => {
  const requester = byKey(requestHeaderFacts(base, {}), 'requester');
  assert.equal(requester.value, base.requestedByName);
  assert.equal(requester.sub, 'ทีม KA');
  assert.equal(byKey(requestHeaderFacts({ ...base, team: null }, {}), 'requester').sub, null);
});

test('ผู้ติดต่อขึ้นเฉพาะที่ทะเบียนมีข้อมูล · มีแต่เบอร์ก็ยังใช้ได้', () => {
  const both = byKey(requestHeaderFacts(base, {}), 'contact');
  assert.equal(both.value, 'คุณเจี๊ยบ');
  assert.equal(both.sub, '081-234-5678');

  const phoneOnly = requestHeaderFacts(
    { ...base, refCustomer: { id: 'CUS-1', contactPhone: '02-000-0000' } }, {},
  );
  assert.equal(byKey(phoneOnly, 'contact').value, '02-000-0000');
  assert.equal(byKey(phoneOnly, 'contact').sub, null);

  const none = requestHeaderFacts({ ...base, refCustomer: { id: 'CUS-1', arCode: 'AR-231' } }, {});
  assert.equal(keys(none).includes('contact'), false);
});

test('รับปากวันแล้ว — วันที่ผู้ขอขอต้องยังอ่านได้ ไม่หายไปทั้งอัน', () => {
  const due = byKey(requestHeaderFacts({ ...base, committedDueDate: '2026-08-20' }, {}), 'due');
  assert.equal(due.label, 'รับปากส่ง');
  assert.equal(due.value, '20/08/2026');
  assert.match(due.sub, /15\/08\/2026/);
});

test('ยังไม่มีใครรับปาก — โชว์วันที่ผู้ขอต้องการ พร้อมบอกว่ายังไม่มีคนรับปาก', () => {
  const due = byKey(requestHeaderFacts(base, {}), 'due');
  assert.equal(due.label, 'ต้องการคำตอบ');
  assert.equal(due.value, '15/08/2026');
  assert.equal(due.sub, 'ยังไม่มีใครรับปากวัน');
});

test('ใบด่วนโชว์ป้ายด่วนพร้อมเหตุผล — ใบปกติไม่มีช่องนี้เลย', () => {
  const urgent = byKey(
    requestHeaderFacts({ ...base, urgent: true, urgentReason: 'ลูกค้าเร่งปิดดีลศุกร์นี้' }, {}),
    'urgent',
  );
  assert.equal(urgent.value, 'งานด่วน');
  assert.equal(urgent.sub, 'ลูกค้าเร่งปิดดีลศุกร์นี้');
  assert.equal(keys(requestHeaderFacts(base, {})).includes('urgent'), false);
});

test('ลำดับช่องคงที่ — ลูกค้าอยู่ต่อจากผู้ขอเสมอ', () => {
  const order = keys(requestHeaderFacts(
    { ...base, urgent: true, committedDueDate: '2026-08-20' },
    { hasItems: true, progress: { done: 1, total: 3 } },
  ));
  assert.deepEqual(order, ['created', 'requester', 'customer', 'contact', 'progress', 'due', 'urgent']);
});

test('ไม่มีใบ = ไม่มีช่อง (หน้าจอเรนเดอร์ก่อนโหลดเสร็จได้)', () => {
  assert.deepEqual(requestHeaderFacts(null, {}), []);
});
