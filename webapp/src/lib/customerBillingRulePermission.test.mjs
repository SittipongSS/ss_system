// ใครแก้ "รอบวางบิล" ของลูกค้าได้ (mig 0389 · มติเจ้าของ 25/09 ข้อ 4)
// ⭐ ฝ่ายขายทีมที่ดูแลลูกค้า + ฝ่ายบัญชี — ตัวเดียวที่ทั้ง API และปุ่มบนหน้าลูกค้าถาม
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, canEditCustomerBillingRule, canEditRecord } from './permissions';

const kaCustomer = { id: 'C1', teams: ['KA'] };
const teamless = { id: 'C2', teams: [] };

test('ฝ่ายขายทีมที่ดูแลลูกค้าแก้รอบวางบิลได้ — ทีมอื่นไม่ได้ (ด่านเดียวกับแก้ทะเบียนลูกค้า)', () => {
  for (const role of ['ae', 'ac', 'senior_ae', 'senior_ac']) {
    assert.equal(canEditCustomerBillingRule({ role, team: 'KA', teams: ['KA'] }, kaCustomer), true, `KA ${role}`);
    assert.equal(canEditCustomerBillingRule({ role, team: 'ODM', teams: ['ODM'] }, kaCustomer), false, `ODM ${role}`);
    // ลูกค้าไม่มีทีม = ของกลาง ใครถือ customers:edit ก็แก้ได้ (เหมือนฟอร์มลูกค้า)
    assert.equal(canEditCustomerBillingRule({ role, team: 'ODM', teams: ['ODM'] }, teamless), true, `teamless ${role}`);
  }
  // หัวหน้าฝ่ายขายข้ามทีมได้ — ผลต้องตรงกับ canEditRecord เป๊ะ (ห้ามเดินหนีกัน)
  for (const role of ['ae_supervisor', 'commercial_manager', 'admin']) {
    const user = { role, teams: [] };
    assert.equal(canEditCustomerBillingRule(user, kaCustomer), canEditRecord(user, 'customers', kaCustomer), role);
    assert.equal(canEditCustomerBillingRule(user, kaCustomer), true, role);
  }
});

test('⭐ ฝ่ายบัญชีแก้รอบวางบิลได้ทุกลูกค้า ทั้งที่แก้ทะเบียนลูกค้าส่วนอื่นไม่ได้', () => {
  const fn = { role: 'finance', department: 'FN', teams: [] };
  assert.equal(can('finance', 'customers:edit'), false, 'บัญชีต้องยังไม่มีสิทธิ์แก้ทะเบียนลูกค้า');
  assert.equal(canEditRecord(fn, 'customers', kaCustomer), false);
  assert.equal(canEditCustomerBillingRule(fn, kaCustomer), true);
  assert.equal(canEditCustomerBillingRule(fn, teamless), true);
  // ไม่ได้ตั้ง department ตรง ๆ = อนุมานจาก role (finance → FN) เหมือนด่านคอนเฟิร์มงวด
  assert.equal(canEditCustomerBillingRule({ role: 'finance' }, kaCustomer), true);
});

test('ช่องของฝ่ายบัญชีแคบด้วยฝ่าย — cap payments:confirm อย่างเดียวไม่พอ', () => {
  // คนฝ่ายอื่นที่ได้ cap มาแบบรายคน ยังต้องติดด่าน FN (กติกาเดียวกับ canConfirmPayment)
  assert.equal(canEditCustomerBillingRule({ role: 'rd', department: 'RD', extraCaps: ['payments:confirm'] }, kaCustomer), false);
});

test('ฝ่ายที่ไม่เกี่ยว + ผู้สังเกตการณ์ แก้รอบวางบิลไม่ได้ · ไม่มีผู้ใช้/ไม่มีลูกค้า = ไม่ได้', () => {
  for (const role of ['viewer', 'executive', 'marketing', 'rd', 'ra', 'pc', 'pd', 'wh', 'qc', 'ts']) {
    assert.equal(canEditCustomerBillingRule({ role, team: 'KA', teams: ['KA'] }, kaCustomer), false, role);
    assert.equal(canEditCustomerBillingRule({ role, teams: [] }, teamless), false, `${role} teamless`);
  }
  assert.equal(canEditCustomerBillingRule(null, kaCustomer), false);
  assert.equal(canEditCustomerBillingRule({ role: 'finance', department: 'FN' }, null), false);
});
