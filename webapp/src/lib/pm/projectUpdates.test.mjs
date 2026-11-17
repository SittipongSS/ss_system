// เหตุการณ์ระบบของเธรดโครงการ — ตรรกะล้วน (ไม่มี I/O)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_UPDATE_KINDS, dealUnlinkedUpdate, milestoneDoneUpdate,
} from './projectUpdates.js';
import { UPDATE_KINDS, isKnownUpdateKind } from '../master/updateTypes.js';

const deal = { id: 'D-1', code: 'DL-0007', title: 'ดีล NPD กลิ่นใหม่' };

// ตารางไม่มี CHECK บน kind — ทะเบียนฝั่งโค้ดคือด่านเดียวที่กันชนิดหลุด
test('ทุก kind ที่ไฟล์นี้สร้างต้องมีในทะเบียนของ entity project', () => {
  const built = [
    dealUnlinkedUpdate(deal),
    milestoneDoneUpdate({ status: 'In Progress' }, { id: 'T-1', name: 'ส่งตัวอย่าง', isMilestone: true, status: 'Completed' }),
  ];
  for (const event of built) {
    assert.ok(event, 'ต้องสร้างเหตุการณ์ได้');
    assert.ok(isKnownUpdateKind('project', event.kind), `kind ${event.kind} ไม่มีในทะเบียน`);
    assert.ok(event.body && event.body.trim(), `kind ${event.kind} ต้องมีเนื้อความ`);
  }
  // ชนิดที่ประกาศไว้ต้องมีจริงในทะเบียนทั้งหมด (กันประกาศค้างแบบ scent)
  for (const kind of PROJECT_UPDATE_KINDS) {
    assert.ok(UPDATE_KINDS.project[kind], `${kind} ประกาศไว้แต่ไม่มีในทะเบียน`);
  }
});

test('ถอดดีล: ข้อความบอกรหัสและชื่อดีล — อ่านย้อนหลังต้องรู้ว่าใบไหน', () => {
  assert.match(dealUnlinkedUpdate(deal).body, /DL-0007/);
  assert.match(dealUnlinkedUpdate(deal).body, /ดีล NPD กลิ่นใหม่/);
  assert.equal(dealUnlinkedUpdate(deal).meta.dealId, 'D-1');
  assert.match(dealUnlinkedUpdate(deal).body, /หลุดจากโครงการ/);
  assert.match(dealUnlinkedUpdate(deal, { reason: 'ลบดีล (บังคับ)' }).body, /บังคับ/);
  // ไม่มีรหัส/ชื่อ ก็ยังต้องอ่านออก ไม่ใช่ได้ข้อความห้วน
  assert.match(dealUnlinkedUpdate({ id: 'D-9' }).body, /D-9/);
  assert.equal(dealUnlinkedUpdate(null), null);
});

test('หมุดหมาย: เฉพาะขั้นที่ติดธง isMilestone และเฉพาะตอนเพิ่งเสร็จ', () => {
  const done = { id: 'T-1', name: 'ส่งตัวอย่างให้ลูกค้า', isMilestone: true, status: 'Completed', actualFinishDate: '2026-08-02' };
  const event = milestoneDoneUpdate({ status: 'In Progress' }, done);
  assert.ok(event);
  assert.match(event.body, /ส่งตัวอย่างให้ลูกค้า/);
  assert.match(event.body, /2026-08-02/);
  assert.equal(event.meta.taskId, 'T-1');

  // ขั้นธรรมดา (ไม่ใช่หมุดหมาย) ต้องเงียบ — โครงการมี 20–40 ขั้น
  assert.equal(milestoneDoneUpdate({ status: 'In Progress' }, { ...done, isMilestone: false }), null);
  // เสร็จอยู่แล้ว แก้ชื่อ/วันอย่างอื่น = ไม่ประกาศซ้ำ
  assert.equal(milestoneDoneUpdate({ status: 'Completed' }, done), null);
  // ถอยกลับ (Completed → In Progress) ไม่ใช่เหตุการณ์ "ผ่านหมุดหมาย"
  assert.equal(milestoneDoneUpdate({ status: 'Completed' }, { ...done, status: 'In Progress' }), null);
});
