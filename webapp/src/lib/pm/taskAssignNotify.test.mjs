// แจ้งเตือน "มอบหมายงาน" (มติผู้ใช้ 2026-08-20)
//
// สิ่งที่ต้องล็อกไว้ เรียงตามความเสียหายถ้าหลุด:
//   1) **คนที่งานเข้ามือต้องได้รับ** — ทั้งฟีเจอร์มีไว้เพื่อข้อนี้ข้อเดียว
//   2) **ห้ามแจ้งตัวเอง** — คนกดมอบหมายได้แจ้งเตือนงานที่ตัวเองเพิ่งมอบ = กล่องตาย
//   3) คนที่งานหลุดจากมือต้องรู้ ไม่งั้นสองคนทำงานใบเดียวกันพร้อมกัน
//   4) ข้อความของสองฝั่งต้องคนละใบ — "เข้ามือคุณ" กับ "หลุดจากมือคุณ" คนละเรื่อง
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { taskAssignNotices } from './taskAssignNotify.js';
import { NOTIFICATION_BOXES } from '../notifications.js';

const task = (over = {}) => ({ id: 'TSK-1', title: 'ทำสัญญา', ownerId: 'u-own', ...over });

test('⭐ มอบงานให้คนอื่น — ผู้รับใหม่ได้ใบของตัวเอง และคนกดไม่ได้แจ้งตัวเอง', () => {
  const got = taskAssignNotices({
    task: task({ assigneeId: 'u-new', dueDate: '2026-08-25' }),
    actorId: 'u-own', actorName: 'สมชาย', previousAssigneeId: null, assigneeName: 'สมหญิง',
  });
  assert.equal(got.length, 1, 'เจ้าของงานเป็นคนกดเอง จึงไม่มีใบ "งานย้ายมือ"');
  assert.deepEqual(got[0].userIds, ['u-new']);
  assert.match(got[0].title, /มอบหมายงานให้คุณ · ทำสัญญา/);
  assert.match(got[0].body, /สมชาย/);
  assert.match(got[0].body, /2026-08-25/, 'กำหนดส่งคือสิ่งแรกที่ผู้รับต้องรู้');
});

test('⭐ ย้ายมือ — คนเก่ากับเจ้าของงานได้คนละข้อความกับคนใหม่', () => {
  const got = taskAssignNotices({
    task: task({ assigneeId: 'u-new' }),
    actorId: 'u-boss', actorName: 'หัวหน้า', previousAssigneeId: 'u-old', assigneeName: 'สมหญิง',
  });
  assert.equal(got.length, 2);
  assert.deepEqual(got[0].userIds, ['u-new']);
  assert.deepEqual(got[1].userIds, ['u-old', 'u-own']);
  assert.match(got[1].title, /งานย้ายมือ/);
  assert.match(got[1].body, /สมหญิง/, 'ต้องบอกว่างานไปอยู่กับใคร ไม่ใช่แค่ว่าหลุดมือ');
});

test('รับช่วงงานเอง — คนดึงไม่ได้แจ้งตัวเอง แต่คนที่ถืออยู่เดิมต้องรู้', () => {
  const got = taskAssignNotices({
    task: task({ assigneeId: 'u-me' }),
    actorId: 'u-me', actorName: 'ฉัน', previousAssigneeId: 'u-old', assigneeName: 'ฉัน',
  });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].userIds, ['u-old', 'u-own']);
  assert.match(got[0].body, /รับช่วงงานนี้ไป/, 'คนดึงงานเอง ต้องไม่อ่านว่า "มอบหมายให้ ฉัน"');
});

test('ไม่รู้ชื่อผู้รับใหม่ = บอกแค่ว่างานย้ายไปแล้ว ไม่แต่งประโยคให้ดูเหมือนรู้', () => {
  const got = taskAssignNotices({
    task: task({ assigneeId: 'u-new' }),
    actorId: 'u-boss', actorName: 'หัวหน้า', previousAssigneeId: 'u-old',
  });
  assert.match(got[1].body, /ย้ายงานนี้ไปให้คนอื่นแล้ว/);
});

test('ถอนการมอบหมาย — ต้องบอกคนที่เพิ่งเสียงานไป ไม่ใช่เงียบ', () => {
  const got = taskAssignNotices({
    task: task({ assigneeId: null }),
    actorId: 'u-own', actorName: 'สมชาย', previousAssigneeId: 'u-old',
  });
  assert.deepEqual(got.map((n) => n.userIds), [['u-old']]);
  assert.match(got[0].body, /ถอนการมอบหมาย/);
});

test('ผู้รับคนเดิม = คนใหม่ (คำขอไม่ได้เปลี่ยนมือจริง) ต้องไม่เด้งอะไรเลย', () => {
  assert.deepEqual(taskAssignNotices({
    task: task({ assigneeId: 'u-same' }), actorId: 'u-own', previousAssigneeId: 'u-same',
  }), []);
  assert.deepEqual(taskAssignNotices({ task: null }), []);
});

test('เจ้าของงานที่เป็นผู้รับใหม่เองต้องได้ใบเดียว ไม่ใช่สองใบซ้อน', () => {
  const got = taskAssignNotices({
    task: task({ assigneeId: 'u-own' }),
    actorId: 'u-boss', actorName: 'หัวหน้า', previousAssigneeId: 'u-old',
  });
  assert.deepEqual(got.map((n) => n.userIds), [['u-own'], ['u-old']]);
});

test('⭐ kind ที่ยิงต้องเป็นตัวเดียวกับที่กระดิ่งกรอง — ไม่งั้นแจ้งเตือนไม่โผล่บนกระดิ่ง', () => {
  assert.ok(NOTIFICATION_BOXES.bell.kinds.includes('task_assign'));
});
