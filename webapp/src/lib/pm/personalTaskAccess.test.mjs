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
