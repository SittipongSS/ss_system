import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QT_PEOPLE_RETIRED_FIELDS, qtRoleText, quotationPersonAllowed, validateQuotationPeople,
} from './quotationPeople.js';

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

// ใบเสนอราคาเหลือช่องเดียว: ผู้ประสานงาน (AC) — ผู้ดูแล = เจ้าของดีล อ่านสด,
// ผู้จัดทำ = คนกดยื่น, ผู้ตรวจสอบอยู่ที่ใบสั่งขาย (มติผู้ใช้ 2026-08-17)
test('ผ่านเมื่อทุกช่องเป็นผู้ใช้จริง + role ตรง', async () => {
  const sb = fakeSupabase([U('AE เอ', 'ae'), U('AC ซี', 'ac')]);
  const r = await validateQuotationPeople(sb, { preparedBy: 'AC ซี' });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.people), ['preparedBy']);
});

test('ปฏิเสธผู้ประสานงานที่ไม่ใช่ AC', async () => {
  const sb = fakeSupabase([U('AE เอ', 'ae'), U('AC ซี', 'ac')]);
  const r = await validateQuotationPeople(sb, { preparedBy: 'AE เอ' });
  assert.equal(r.ok, false);
  assert.match(r.error, /ผู้ประสานงาน/);
});

// คีย์ที่ปลดระวางแล้ว (QT_PEOPLE_RETIRED_FIELDS) ต้องไม่เป็นด่านของใบเสนอราคาอีก
// แม้ client จะยัดมา — route ปอกทิ้งก่อนเขียน metadata อยู่แล้ว
//   aeOwner      → ผู้ดูแล = เจ้าของดีล (deal.ownerId) อ่านสด ไม่ใช่ค่าที่กรอก
//   aeSupervisor → ขั้นตรวจอยู่ที่ใบสั่งขาย (isSalesOrderReviewer + finance_*)
for (const retired of QT_PEOPLE_RETIRED_FIELDS) {
  test(`${retired} ไม่ใช่ช่องของใบเสนอราคาแล้ว — ส่งมาก็ไม่ตรวจ ไม่บังคับ`, async () => {
    const sb = fakeSupabase([U('AC ซี', 'ac')]);
    const r = await validateQuotationPeople(sb, { [retired]: 'นายปลอม แปลกหน้า' });
    assert.equal(r.ok, true);
    assert.equal(retired in r.people, false);

    const required = await validateQuotationPeople(sb, { preparedBy: 'AC ซี' }, { require: true });
    assert.equal(required.ok, true);
  });
}

test('ปฏิเสธชื่อปลอมที่ไม่มีใน directory', async () => {
  const sb = fakeSupabase([U('AC ซี', 'ac')]);
  const r = await validateQuotationPeople(sb, { preparedBy: 'นายปลอม แปลกหน้า' });
  assert.equal(r.ok, false);
});

test('require บังคับครบทุกช่อง (ด่านของขั้นยื่นอนุมัติ)', async () => {
  const sb = fakeSupabase([U('AC ซี', 'ac')]);
  const r = await validateQuotationPeople(sb, {}, { require: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /ผู้ประสานงาน/);
  assert.match(r.error, /ก่อนยื่นอนุมัติ/);
});

test('ช่องว่างทั้งหมดผ่านเมื่อไม่ require', async () => {
  const sb = fakeSupabase([]);
  const r = await validateQuotationPeople(sb, {}, { require: false });
  assert.equal(r.ok, true);
});

test('ปฏิเสธผู้ใช้ที่ถูกระงับ (banned_until อนาคต)', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const sb = fakeSupabase([U('AC เก่า', 'ac', future)]);
  const r = await validateQuotationPeople(sb, { preparedBy: 'AC เก่า' });
  assert.equal(r.ok, false);
});

// ── ตัวตรวจฝั่ง client (ใช้เตือนในฟอร์มก่อนกดบันทึก) ──
// รายชื่อจาก /api/pm/assignable-users: { name, role } — คนละ shape กับ auth directory
const A = (name, role) => ({ name, role });

test('client: หัวหน้าเป็นผู้ดูแลไม่ได้ — กติกาเดียวกับฝั่ง server', () => {
  const users = [A('AE เอ', 'ae'), A('หัวหน้า เอส', 'ae_supervisor')];
  assert.equal(quotationPersonAllowed(users, 'aeOwner', 'หัวหน้า เอส'), false);
  assert.equal(quotationPersonAllowed(users, 'aeOwner', 'AE เอ'), true);
  // ตารางกลาง role ยังมีคีย์ aeSupervisor ไว้ให้ **เอกสารโครงการ** ใช้
  // (components/pm/ProjectDocumentView.js) — ไม่ใช่ช่องของใบเสนอราคาแล้ว
  assert.equal(quotationPersonAllowed(users, 'aeSupervisor', 'หัวหน้า เอส'), true);
});

test('client: ค่าว่างผ่าน และยังไม่รู้รายชื่อ = ยังไม่เตือน', () => {
  assert.equal(quotationPersonAllowed([A('AE เอ', 'ae')], 'aeOwner', ''), true);
  assert.equal(quotationPersonAllowed([], 'aeOwner', 'ใครก็ไม่รู้'), true);
});

test('client: ชื่อที่ไม่มีในรายชื่อถือว่าใช้ไม่ได้', () => {
  assert.equal(quotationPersonAllowed([A('AE เอ', 'ae')], 'aeOwner', 'นายปลอม แปลกหน้า'), false);
});

test('client: ไม่มีชื่อ ใช้อีเมลแทน (ตรงกับที่ฟอร์มแสดง)', () => {
  const users = [{ email: 'ae@x.co', role: 'ae' }];
  assert.equal(quotationPersonAllowed(users, 'aeOwner', 'ae@x.co'), true);
});

test('ข้อความ role ของช่อง ตรงกับที่ใช้ในข้อความ error', () => {
  assert.equal(qtRoleText('aeOwner'), 'AE / Senior AE');
  assert.equal(qtRoleText('aeSupervisor'), 'AE Supervisor');
});
