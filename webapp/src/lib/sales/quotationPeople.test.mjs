import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuotationPeople } from './quotationPeople.js';

// supabase ปลอม: ส่ง users หนึ่งหน้าแล้วหน้าถัดไปว่าง (ตรง loop ของ loadRoleDirectory)
function fakeSupabase(users) {
  let served = false;
  return {
    auth: { admin: { listUsers: async () => {
      if (served) return { data: { users: [] } };
      served = true;
      return { data: { users } };
    } } },
  };
}
const U = (name, role, banned_until = null) => ({ user_metadata: { name }, app_metadata: { role }, banned_until });

test('ผ่านเมื่อทั้งสามช่องเป็นผู้ใช้จริง + role ตรง', async () => {
  const sb = fakeSupabase([U('AE เอ', 'ae'), U('AC ซี', 'ac'), U('หัวหน้า เอส', 'ae_supervisor')]);
  const r = await validateQuotationPeople(sb, { aeOwner: 'AE เอ', preparedBy: 'AC ซี', aeSupervisor: 'หัวหน้า เอส' });
  assert.equal(r.ok, true);
});

test('senior_ae เป็นผู้ดูแลได้', async () => {
  const sb = fakeSupabase([U('ซีเนียร์', 'senior_ae')]);
  const r = await validateQuotationPeople(sb, { aeOwner: 'ซีเนียร์' });
  assert.equal(r.ok, true);
});

test('ปฏิเสธผู้ตรวจสอบที่ไม่ใช่ ae_supervisor', async () => {
  const sb = fakeSupabase([U('AE เอ', 'ae'), U('AC ซี', 'ac')]);
  const r = await validateQuotationPeople(sb, { aeSupervisor: 'AE เอ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /ผู้ตรวจสอบ/);
});

test('ปฏิเสธชื่อปลอมที่ไม่มีใน directory', async () => {
  const sb = fakeSupabase([U('AE เอ', 'ae')]);
  const r = await validateQuotationPeople(sb, { aeOwner: 'นายปลอม แปลกหน้า' });
  assert.equal(r.ok, false);
});

test('require บังคับครบทั้งสามช่อง', async () => {
  const sb = fakeSupabase([U('AC ซี', 'ac')]);
  const r = await validateQuotationPeople(sb, { preparedBy: 'AC ซี' }, { require: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /ก่อนส่ง/);
});

test('ช่องว่างทั้งหมดผ่านเมื่อไม่ require', async () => {
  const sb = fakeSupabase([]);
  const r = await validateQuotationPeople(sb, {}, { require: false });
  assert.equal(r.ok, true);
});

test('ปฏิเสธผู้ใช้ที่ถูกระงับ (banned_until อนาคต)', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const sb = fakeSupabase([U('หัวหน้าเก่า', 'ae_supervisor', future)]);
  const r = await validateQuotationPeople(sb, { aeSupervisor: 'หัวหน้าเก่า' });
  assert.equal(r.ok, false);
});
