import test from 'node:test';
import assert from 'node:assert/strict';
import { fillCustomerSnapshotFromMaster, refreshCustomerNameForDisplay } from './customerSnapshotFallback.js';

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

/* ── ชื่อลูกค้าบนร่างที่ยังไม่ยื่น อ่านสดจากทะเบียน ────────────────────────
   เคสจริง 2026-08-27: สร้างลูกค้าชื่อ '… (สำนักงานใหญ่)' → ออกใบ 11:26 → ตัดคำออกจาก
   ชื่อ 12:29 · ใบที่ยื่น/ส่งแล้วต้องคงชื่อเก่า (หลักฐาน) แต่ร่างที่ไม่เคยยื่นไม่ควรค้าง */
// เลียนแบบลูกโซ่จริง: .from().select().in().limit() — ตัว limit คือขอบเขตของคำสั่ง
// (ดูเหตุผลที่ customerSnapshotFallback.js) ถ้าลูกโซ่เปลี่ยน เทสต์ต้องรู้ตัว
const customerListStub = (result) => ({
  from() {
    return {
      select() {
        return { in() { return { limit() { return result; } }; } };
      },
    };
  },
});
const customersReturning = (rows) => customerListStub({ data: rows, error: null });

test('ร่างที่ยังไม่ยื่น → ชื่อลูกค้าเดินตามทะเบียน', async () => {
  const quote = { customerId: 'CUS-1', customerName: 'บริษัท ก จำกัด (สำนักงานใหญ่)', status: 'draft', approvalStatus: 'not_submitted' };
  await refreshCustomerNameForDisplay(customersReturning([{ id: 'CUS-1', name: 'บริษัท ก จำกัด' }]), [quote]);
  assert.equal(quote.customerName, 'บริษัท ก จำกัด');
});

test('ยื่น/ส่ง/รับแล้ว → ชื่อบนใบตรึง ไม่ขยับตามทะเบียน', async () => {
  const frozen = [
    { customerId: 'CUS-1', customerName: 'ชื่อ ณ วันออกใบ', status: 'draft', approvalStatus: 'pending' },
    { customerId: 'CUS-1', customerName: 'ชื่อ ณ วันออกใบ', status: 'sent', approvalStatus: 'approved' },
    { customerId: 'CUS-1', customerName: 'ชื่อ ณ วันออกใบ', status: 'accepted', approvalStatus: 'approved' },
    { customerId: 'CUS-1', customerName: 'ชื่อ ณ วันออกใบ', status: 'revised', approvalStatus: 'approved' },
  ];
  await refreshCustomerNameForDisplay(customersReturning([{ id: 'CUS-1', name: 'ชื่อใหม่' }]), frozen);
  for (const q of frozen) assert.equal(q.customerName, 'ชื่อ ณ วันออกใบ', `${q.status}/${q.approvalStatus}`);
});

test('โหลดทะเบียนไม่สำเร็จ = คืนของเดิม ไม่ทำให้ GET ล้ม', async () => {
  const quote = { customerId: 'CUS-1', customerName: 'ชื่อเดิม', status: 'draft', approvalStatus: 'not_submitted' };
  const broken = customerListStub({ data: null, error: { message: 'boom' } });
  await refreshCustomerNameForDisplay(broken, [quote]);
  assert.equal(quote.customerName, 'ชื่อเดิม');
});

test('ใบที่ไม่ผูกลูกค้า / ไม่มีใบเลย = ไม่ยิง query', async () => {
  let called = false;
  const spy = {
    from() {
      called = true;
      return {
        select() {
          return { in() { return { limit() { return { data: [], error: null }; } }; } };
        },
      };
    },
  };
  await refreshCustomerNameForDisplay(spy, [{ status: 'draft', approvalStatus: 'not_submitted' }]);
  await refreshCustomerNameForDisplay(spy, []);
  assert.equal(called, false);
});
