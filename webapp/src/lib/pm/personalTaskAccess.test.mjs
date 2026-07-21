import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAttachToPersonalTask,
  canManagePersonalTask,
  canViewPersonalTask,
} from './personalTaskAccess.js';

function fakeSupabase({ teams = {}, projectTeam = null } = {}) {
  return {
    auth: {
      admin: {
        async getUserById(id) {
          return { data: { user: { app_metadata: { team: teams[id] ?? null } } } };
        },
      },
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: projectTeam ? { team: projectTeam } : null }; },
      };
    },
  };
}

const task = { id: 't1', ownerId: 'owner', assigneeId: 'worker', proxyBy: null, projectId: null };

test('personal task files follow creator, assignee, proxy and viewer permissions', async () => {
  const db = fakeSupabase();
  assert.equal(await canManagePersonalTask(db, task, { id: 'owner', role: 'ae' }), true);
  assert.equal(await canAttachToPersonalTask(db, task, { id: 'worker', role: 'ae' }), true);
  assert.equal(await canAttachToPersonalTask(db, { ...task, proxyBy: 'proxy' }, { id: 'proxy', role: 'ae' }), true);
  assert.equal(await canViewPersonalTask(db, task, { id: 'viewer', role: 'viewer' }), true);
  assert.equal(await canAttachToPersonalTask(db, task, { id: 'viewer', role: 'viewer' }), false);
  assert.equal(await canViewPersonalTask(db, task, { id: 'other', role: 'ae' }), false);
});

test('staff/rd manage their OWN tasks without pm:edit (งานของฉันใช้ได้จริง)', async () => {
  const db = fakeSupabase();
  // เจ้าของ/ผู้รับมอบ (rd/staff) จัดการงานตัวเองได้ แม้ role ไม่มี pm:edit
  assert.equal(await canManagePersonalTask(db, task, { id: 'owner', role: 'rd', department: 'RD' }), true);
  assert.equal(await canManagePersonalTask(db, task, { id: 'worker', role: 'staff', department: 'PC' }), true);
  // แต่จัดการงานของคนอื่นไม่ได้ (สายบังคับบัญชายังต้องมี pm:edit)
  assert.equal(await canManagePersonalTask(db, task, { id: 'other', role: 'rd', department: 'RD' }), false);
  // viewer เป็น observer อ่านอย่างเดียว — ต่อให้ถูกระบุเป็นเจ้าของก็ไม่จัดการ
  assert.equal(await canManagePersonalTask(db, task, { id: 'owner', role: 'viewer' }), false);
});

test('senior AE can manage task files only inside the same team scope', async () => {
  const sameTeam = fakeSupabase({ teams: { worker: 'KA' } });
  const otherTeam = fakeSupabase({ teams: { worker: 'ODM' } });
  const senior = { id: 'senior', role: 'senior_ae', team: 'KA' };

  assert.equal(await canManagePersonalTask(sameTeam, task, senior), true);
  assert.equal(await canManagePersonalTask(otherTeam, task, senior), false);
});

// ── view ต้องตรงกับที่ my-work list เปิดให้ (มติ 2026-07-21) ──
test('view: ทุกตำแหน่งในทีม (senior_ae/ac/ae) เห็นงานของทีมตัวเอง — กันงานทีมอื่น', async () => {
  const sameTeam = fakeSupabase({ teams: { worker: 'KA' } });   // ผู้รับผิดชอบอยู่ KA
  const otherTeam = fakeSupabase({ teams: { worker: 'ODM' } });
  for (const role of ['senior_ae', 'ac', 'ae']) {
    // อยู่ทีม KA → เห็นงานของทีม KA (ทั้งที่ไม่ใช่เจ้าของ/ผู้รับมอบ)
    assert.equal(await canViewPersonalTask(sameTeam, task, { id: 'x', role, team: 'KA' }), true, `KA ${role}`);
    // อยู่ทีม ODM → ไม่เห็นงานของทีม KA
    assert.equal(await canViewPersonalTask(otherTeam, task, { id: 'x', role, team: 'KA' }), false, `cross ${role}`);
    // ไม่มีทีม → เห็นไม่ได้ (กันงานเข้ามือคนไร้ทีม)
    assert.equal(await canViewPersonalTask(sameTeam, task, { id: 'x', role, team: null }), false, `no-team ${role}`);
  }
});

test('view: ผู้มอบหมาย (assignedBy) เห็นงานที่ตัวเองมอบให้คนอื่นได้เสมอ', async () => {
  const db = fakeSupabase();
  // งานที่ 'boss' มอบให้ 'worker' — boss ไม่ใช่เจ้าของ/ผู้รับมอบ แต่ต้องเห็น (โผล่ใน my-work)
  const assigned = { ...task, ownerId: 'someoneElse', assigneeId: 'worker', assignedBy: 'boss' };
  assert.equal(await canViewPersonalTask(db, assigned, { id: 'boss', role: 'ae', team: null }), true);
  // คนนอกที่ไม่เกี่ยวข้องเลย ยังเห็นไม่ได้
  assert.equal(await canViewPersonalTask(db, assigned, { id: 'stranger', role: 'ae', team: null }), false);
});
