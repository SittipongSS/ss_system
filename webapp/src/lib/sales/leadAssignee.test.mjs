// ── มอบหมายลีดต้องเป็นผู้ใช้จริงที่ทำงานคิวลีดได้ ──────────────────────────
//
// เดิม `POST /leads/[id]/transition` action=assign เขียน assigneeId/assigneeName
// จาก body ตรง ๆ — ปลอมชื่อได้, มอบให้คนที่ลาออกได้, มอบให้ role ที่ canWorkLead()
// ไม่มีวันคืน true ได้ (ลีดค้างถาวร ไม่มีใครกดต่อได้นอกจากแอดมินมาตีกลับ)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LEAD_ASSIGNEE_ROLES, leadAssigneeName, validateLeadAssignee } from './leadAssignee.js';
import { canWorkLead } from './leads.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

// stub auth admin: id -> user (undefined = ไม่พบ)
const stub = (users) => ({
  auth: {
    admin: {
      async getUserById(id) {
        const user = users[id];
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'User not found', status: 404 } };
      },
    },
  },
});

const authUser = (over = {}) => ({
  id: 'U-1',
  email: 'ae@example.com',
  user_metadata: { name: 'สมชาย ใจดี' },
  app_metadata: { role: 'ae', team: 'ODM' },
  banned_until: null,
  ...over,
});

test('ผู้ใช้จริง role AE → ผ่าน และคืนชื่อจาก server ไม่ใช่จาก client', async () => {
  const result = await validateLeadAssignee(stub({ 'U-1': authUser() }), 'U-1');
  assert.deepEqual(result, { ok: true, assigneeId: 'U-1', assigneeName: 'สมชาย ใจดี' });
});

test('id ว่าง / ไม่มีตัวตน → ปฏิเสธ (ไม่ใช่เขียนลงแถวเงียบ ๆ)', async () => {
  const supabase = stub({ 'U-1': authUser() });
  assert.equal((await validateLeadAssignee(supabase, '')).ok, false);
  assert.equal((await validateLeadAssignee(supabase, '   ')).ok, false);
  const missing = await validateLeadAssignee(supabase, 'U-ไม่มีจริง');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /ไม่พบผู้ใช้/);
});

test('บัญชีที่ถูกระงับ (ลาออก) มอบลีดให้ไม่ได้', async () => {
  const banned = authUser({ banned_until: new Date(Date.now() + 86400000).toISOString() });
  const result = await validateLeadAssignee(stub({ 'U-1': banned }), 'U-1');
  assert.equal(result.ok, false);
  assert.match(result.error, /ระงับ/);
  // ban ที่หมดอายุแล้ว = กลับมาใช้งานได้ตามปกติ
  const expired = authUser({ banned_until: new Date(Date.now() - 86400000).toISOString() });
  assert.equal((await validateLeadAssignee(stub({ 'U-1': expired }), 'U-1')).ok, true);
});

test('role ที่ทำงานคิวลีดไม่ได้ → ปฏิเสธ ไม่ปล่อยให้ลีดค้างถาวร', async () => {
  for (const role of ['legal', 'staff', 'rd', 'marketing', 'viewer', 'executive', 'secretary', 'ae_supervisor']) {
    const result = await validateLeadAssignee(
      stub({ 'U-1': authUser({ app_metadata: { role, team: 'ODM' } }) }), 'U-1',
    );
    assert.equal(result.ok, false, `role ${role} ต้องถูกปฏิเสธ`);
  }
  for (const role of ['ae', 'senior_ae', 'ac', 'admin']) {
    const result = await validateLeadAssignee(
      stub({ 'U-1': authUser({ app_metadata: { role, team: 'ODM' } }) }), 'U-1',
    );
    assert.equal(result.ok, true, `role ${role} ต้องผ่าน`);
  }
});

// ⭐ หัวใจ: ลิสต์ role ไม่ใช่ความชอบ แต่ถอดมาจาก canWorkLead — ถ้าวันหนึ่งกติกา
// ฝั่งนั้นเปลี่ยน ลิสต์นี้ต้องขยับตาม ไม่งั้นจะมอบให้คนที่กดอะไรไม่ได้อีกรอบ
test('ทุก role ที่อนุญาต ต้องมีทางทำงานลีดได้จริงตาม canWorkLead', () => {
  const lead = { team: 'ODM', assigneeId: 'U-1' };
  for (const role of LEAD_ASSIGNEE_ROLES) {
    const user = { role, id: 'U-1', team: 'ODM' };
    assert.equal(canWorkLead(user, lead), true, `${role} ถูกอนุญาตให้รับลีด แต่ canWorkLead ปฏิเสธ`);
  }
});

test('role ที่ไม่อยู่ในลิสต์ ต้องทำงานลีดไม่ได้จริง (ลิสต์ไม่แคบเกินไป)', () => {
  const lead = { team: 'ODM', assigneeId: 'U-1' };
  for (const role of ['legal', 'staff', 'rd', 'marketing', 'viewer', 'ae_supervisor']) {
    assert.equal(
      canWorkLead({ role, id: 'U-1', team: 'ODM' }, lead), false,
      `${role} ทำงานลีดได้แต่ถูกกันออกจากลิสต์ผู้รับผิดชอบ`,
    );
  }
});

test('ชื่อที่แสดง: name ก่อน แล้วค่อย email (ตรงกับ /api/pm/assignable-users)', () => {
  assert.equal(leadAssigneeName({ user_metadata: { name: ' สมชาย ' }, email: 'a@b.c' }), 'สมชาย');
  assert.equal(leadAssigneeName({ user_metadata: {}, email: 'a@b.c' }), 'a@b.c');
  assert.equal(leadAssigneeName({}), '');
});

test('route ต้องเรียก validateLeadAssignee — ห้ามกลับไปเชื่อ body.assigneeName', () => {
  const src = readFileSync(join(ROOT, 'src/app/api/sales-planning/leads/[id]/transition/route.js'), 'utf8');
  assert.match(src, /validateLeadAssignee\(supabase, body\.assigneeId, lead\)/);
  assert.doesNotMatch(src, /patch\.assigneeName = body\.assigneeName/);
  assert.doesNotMatch(src, /event\.assigneeName = body\.assigneeName/);
});

/* ── ทีม: ลีดคัดกรองเข้าทีมแล้ว คนรับต่อต้องอยู่ทีมนั้น ─────────────────────
   ไม่ใช่แค่ความเป็นระเบียบ — `canWorkLead` ให้ senior_ae/ac ทำงานได้เฉพาะลีดของ
   ทีมตัวเอง มอบข้ามทีมให้สองตำแหน่งนี้ = คนรับกดอะไรไม่ได้เลย ลีดค้าง */
test('มอบลีดข้ามทีมไม่ได้ — ต้องตีกลับแล้วคัดกรองใหม่', async () => {
  const supabase = stub({ 'U-1': authUser({ app_metadata: { role: 'ae', team: 'KA' } }) });
  const result = await validateLeadAssignee(supabase, 'U-1', { team: 'ODM' });
  assert.equal(result.ok, false);
  assert.match(result.error, /ตีกลับ/);
});

test('ทีมตรงกัน → ผ่าน', async () => {
  const supabase = stub({ 'U-1': authUser({ app_metadata: { role: 'ae', team: 'ODM' } }) });
  assert.equal((await validateLeadAssignee(supabase, 'U-1', { team: 'ODM' })).ok, true);
});

test('ผู้รับที่ไม่มีทีม (admin) ผ่านได้ — canWorkLead ให้ admin ทำได้ทุกใบ', async () => {
  const supabase = stub({ 'U-1': authUser({ app_metadata: { role: 'admin' } }) });
  assert.equal((await validateLeadAssignee(supabase, 'U-1', { team: 'ODM' })).ok, true);
});

test('ไม่ส่งลีดมา = ข้ามด่านทีม (ผู้เรียกเก่ายังใช้ได้)', async () => {
  const supabase = stub({ 'U-1': authUser({ app_metadata: { role: 'ae', team: 'KA' } }) });
  assert.equal((await validateLeadAssignee(supabase, 'U-1')).ok, true);
});
