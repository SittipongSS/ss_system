import test from 'node:test';
import assert from 'node:assert/strict';
import { fillCustomerSnapshotFromMaster } from './customerSnapshotFallback.js';

// mock supabase: .from('customers').select(...).eq('id', x).maybeSingle() → { data }
function mockSupabase(customerRow, spy = {}) {
  return {
    from(table) {
      spy.table = table;
      return {
        select(cols) {
          spy.select = cols;
          return {
            eq(col, val) {
              spy.eqCol = col;
              spy.eqVal = val;
              return { async maybeSingle() { spy.queried = true; return { data: customerRow }; } };
            },
          };
        },
      };
    },
  };
}

test('เติมเฉพาะช่องว่างจากทะเบียนลูกค้า ไม่ทับค่าที่ตรึงไว้', async () => {
  const record = {
    customerId: 'C1',
    customerTaxId: null,          // ว่าง → ต้องเติม
    billingAddress: '123 เดิม',    // มีค่า → ห้ามทับ
    shippingAddress: '',           // ว่าง → เติม
    branchCode: '00000',           // มีค่า → คงไว้
    contactName: null,             // ว่าง → เติมจาก contacts[0]
    contactPhone: null,
  };
  const customer = {
    taxId: '0105551234567',
    address: '999 ใหม่',
    shippingAddress: '888 จัดส่ง',
    branchCode: '00001',
    contacts: [{ name: 'คุณเอ', phone: '021112222' }],
    contactPerson: 'คุณสำรอง',
    contactPhone: '029998888',
  };
  const out = await fillCustomerSnapshotFromMaster(mockSupabase(customer), record);
  assert.equal(out.customerTaxId, '0105551234567'); // เติม
  assert.equal(out.billingAddress, '123 เดิม');       // ไม่ทับ
  assert.equal(out.shippingAddress, '888 จัดส่ง');    // เติม
  assert.equal(out.branchCode, '00000');              // ไม่ทับ
  assert.equal(out.contactName, 'คุณเอ');             // จาก contacts[0]
  assert.equal(out.contactPhone, '021112222');
});

test('ไม่มีช่องว่าง → คืนค่าเดิม ไม่ยิง query ทะเบียนลูกค้า', async () => {
  const record = {
    customerId: 'C1',
    customerTaxId: '0105551234567',
    billingAddress: '123',
    shippingAddress: '123',
    branchCode: '00000',
    contactName: 'คุณเอ',
    contactPhone: '021112222',
  };
  const spy = {};
  const out = await fillCustomerSnapshotFromMaster(mockSupabase({ taxId: 'X' }, spy), record);
  assert.equal(out, record);
  assert.equal(spy.queried, undefined); // ไม่ยิง query
});

test('ไม่มี customerId → คืนค่าเดิม (ไม่มีทางหาทะเบียน)', async () => {
  const record = { customerTaxId: null, billingAddress: null };
  const spy = {};
  const out = await fillCustomerSnapshotFromMaster(mockSupabase({ taxId: 'X' }, spy), record);
  assert.equal(out, record);
  assert.equal(spy.queried, undefined);
});

test('หาลูกค้าไม่เจอ → คืนค่าเดิม ช่องว่างคงว่าง', async () => {
  const record = { customerId: 'GONE', customerTaxId: null };
  const out = await fillCustomerSnapshotFromMaster(mockSupabase(null), record);
  assert.equal(out.customerTaxId, null);
});

test('ผู้ติดต่อ falldown ไป contactPerson/contactPhone เมื่อ contacts ว่าง', async () => {
  const record = { customerId: 'C1', contactName: null, contactPhone: null };
  const customer = { contacts: [], contactPerson: 'คุณสำรอง', contactPhone: '029998888' };
  const out = await fillCustomerSnapshotFromMaster(mockSupabase(customer), record);
  assert.equal(out.contactName, 'คุณสำรอง');
  assert.equal(out.contactPhone, '029998888');
});

test('ยิง query ตาราง customers ด้วย customerId ที่ตรึงบนใบ', async () => {
  const spy = {};
  await fillCustomerSnapshotFromMaster(mockSupabase({ taxId: 'T' }, spy), { customerId: 'C9', customerTaxId: null });
  assert.equal(spy.table, 'customers');
  assert.equal(spy.eqCol, 'id');
  assert.equal(spy.eqVal, 'C9');
});
