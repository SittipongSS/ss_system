// ── ทะเบียนทีม (mig 0309) ─────────────────────────────────────────────────
//
// กติกาที่ชุดนี้ยึด (docs/team-management-plan.md):
//   · ทีมขายผูกสิทธิ์ · ทีมปฏิบัติงานไม่แตะสิทธิ์เลย — ห้ามปนสองแกน
//   · ปิดทีม ไม่ใช่ลบทีม · ทีมที่ปิดแล้วต้องไม่หายจากจอ
//   · ถัง "ยังไม่อยู่ทีมไหน" ต้องมีเสมอ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedKindsFor,
  closeTeamBlocker,
  normalizeTeamInput,
  sortTeams,
  suggestTeamCode,
  teamMoveEffects,
  unassignedMembers,
} from './teams.js';
import { canManageTeams } from '@/lib/permissions';

test('⭐ ฝ่ายอื่นสร้างทีมขายไม่ได้ — ทีมขายผูกสิทธิ์ของฝ่ายขาย', () => {
  assert.deepEqual(allowedKindsFor('SA'), ['sales', 'crew']);
  assert.deepEqual(allowedKindsFor('TS'), ['crew']);
  const bad = normalizeTeamInput({ name: 'ทีม A', kind: 'sales' }, { department: 'TS' });
  assert.match(bad.error, /ทีมขาย/);
  const ok = normalizeTeamInput({ name: 'ทีม A' }, { department: 'TS' });
  assert.equal(ok.error, null);
  assert.equal(ok.value.kind, 'crew', 'ฝ่ายที่ไม่ใช่ขาย ตั้งต้นเป็นทีมปฏิบัติงาน');
});

test('ต้องมีชื่อทีมและฝ่ายเสมอ', () => {
  assert.match(normalizeTeamInput({}, { department: 'TS' }).error, /ชื่อทีม/);
  assert.match(normalizeTeamInput({ name: 'ทีม A' }, {}).error, /ฝ่าย/);
});

test('รหัสทีมมีฝ่ายนำหน้า และไม่ชนของเดิม', () => {
  assert.equal(suggestTeamCode('TS', 'ทีม A'), 'TS-ทีม-A');
  assert.equal(suggestTeamCode('TS', 'Alpha'), 'TS-ALPHA');
  assert.equal(suggestTeamCode('TS', 'Alpha', ['TS-ALPHA']), 'TS-ALPHA-2');
  assert.equal(suggestTeamCode('TS', ''), 'TS');
});

test('⭐ ทีมที่ยังมีคนอยู่ ปิดไม่ได้ และต้องบอกเหตุ ไม่ใช่แค่ปฏิเสธ', () => {
  const team = { code: 'TS-A', isActive: true };
  assert.match(closeTeamBlocker(team, { memberCount: 3 }), /ยังมีสมาชิก 3 คน/);
  assert.equal(closeTeamBlocker(team, { memberCount: 0 }), '');
  assert.equal(closeTeamBlocker({ ...team, isActive: false }, { memberCount: 5 }), '', 'ทีมที่ปิดแล้วไม่ต้องบล็อกซ้ำ');
});

test('⭐ ทีมที่ปิดแล้วไปกองท้าย แต่ไม่หายจากจอ', () => {
  const rows = sortTeams([
    { code: 'C', name: 'ซี', sortOrder: 30, isActive: true },
    { code: 'X', name: 'เอ็กซ์', sortOrder: 5, isActive: false },
    { code: 'A', name: 'เอ', sortOrder: 10, isActive: true },
  ]);
  assert.deepEqual(rows.map((r) => r.code), ['A', 'C', 'X']);
});

test('⭐ ถัง "ยังไม่อยู่ทีมไหน" นับเฉพาะคนในฝ่ายนั้น', () => {
  const users = [
    { id: 'U1', department: 'TS' },
    { id: 'U2', department: 'TS' },
    { id: 'U3', department: 'SA' },
  ];
  const rows = unassignedMembers(users, [{ userId: 'U1', teamCode: 'TS-A' }], 'TS');
  assert.deepEqual(rows.map((u) => u.id), ['U2']);
});

test('⭐ ย้ายทีมต้องบอกของที่ค้าง ไม่ใช่ย้ายให้เงียบ ๆ', () => {
  const rows = teamMoveEffects({ openDeals: 7, futureTargets: 4, sharedDocs: 12 });
  assert.equal(rows.length, 3);
  assert.match(rows[0].text, /7 ใบ/);
  assert.match(rows[1].text, /4 เดือน/);
  assert.match(rows[2].text, /12 ไฟล์/);
  assert.deepEqual(teamMoveEffects({}), [], 'ไม่มีอะไรค้าง = ไม่ต้องขู่');
});

// ── ด่านสิทธิ์ ───────────────────────────────────────────────────────────
test('⭐ จัดทีมได้เฉพาะฝ่ายตัวเอง — และ "ผู้ช่วย" คือคนที่ถูก grant', () => {
  const assistant = { role: 'staff', department: 'TS', extraCaps: ['team:manage'] };
  assert.equal(canManageTeams(assistant, 'TS'), true);
  assert.equal(canManageTeams(assistant, 'SA'), false);
  assert.equal(canManageTeams({ role: 'staff', department: 'TS' }, 'TS'), false, 'ไม่ได้ grant = ทำไม่ได้');
});

test('⭐ หัวหน้าฝ่ายขายจัดทีมช่างไม่ได้ — isSuperuser ไม่ใช่ด่านของเรื่องนี้', () => {
  const salesHead = { role: 'ae_supervisor', department: 'SA' };
  assert.equal(canManageTeams(salesHead, 'SA'), true);
  assert.equal(canManageTeams(salesHead, 'TS'), false);
  assert.equal(canManageTeams({ role: 'admin', department: 'AD' }, 'TS'), true, 'admin ข้ามฝ่ายได้');
});

test('⚠️ ฝ่ายว่างต้องไม่ "ตรงกัน" กับฝ่ายว่าง — บั๊กรูปเดิมของการเทียบทีม', () => {
  assert.equal(canManageTeams({ role: 'staff', extraCaps: ['team:manage'] }, ''), false);
  assert.equal(canManageTeams({ role: 'staff', extraCaps: ['team:manage'] }, null), false);
  assert.equal(canManageTeams({ role: 'staff', department: 'TS', extraCaps: ['team:manage'] }, null), false);
});
