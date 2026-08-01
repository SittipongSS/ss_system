// เหตุการณ์ระบบของเธรดโครงการ — ตรรกะล้วน (ไม่มี I/O)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_UPDATE_KINDS, dealLinkedUpdate, dealUnlinkedUpdate,
  deliveriesCompletedUpdate, milestoneDoneUpdate, projectCloseUpdate,
} from './projectUpdates.js';
import { UPDATE_KINDS, isKnownUpdateKind } from '../master/updateTypes.js';

const deal = { id: 'D-1', code: 'DL-0007', title: 'ดีล NPD กลิ่นใหม่' };

// ตารางไม่มี CHECK บน kind — ทะเบียนฝั่งโค้ดคือด่านเดียวที่กันชนิดหลุด
test('ทุก kind ที่ไฟล์นี้สร้างต้องมีในทะเบียนของ entity project', () => {
  const built = [
    dealLinkedUpdate(deal),
    dealUnlinkedUpdate(deal),
    deliveriesCompletedUpdate([{ id: 'M-1' }], [{ id: 'M-1', arrivedAt: '2026-08-01' }]),
    milestoneDoneUpdate({ status: 'In Progress' }, { id: 'T-1', name: 'ส่งตัวอย่าง', isMilestone: true, status: 'Completed' }),
    ...['request', 'cancel_request', 'approve', 'reject', 'reopen'].map((a) => projectCloseUpdate(a, { closeType: 'completed' })),
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

test('ผูก/ถอดดีล: ข้อความบอกรหัสและชื่อดีล — อ่านย้อนหลังต้องรู้ว่าใบไหน', () => {
  assert.match(dealLinkedUpdate(deal).body, /DL-0007/);
  assert.match(dealLinkedUpdate(deal).body, /ดีล NPD กลิ่นใหม่/);
  assert.match(dealLinkedUpdate(deal, { how: 'create' }).body, /สร้างโครงการจากดีล/);
  assert.equal(dealLinkedUpdate(deal, { how: 'create' }).meta.dealId, 'D-1');
  assert.match(dealUnlinkedUpdate(deal).body, /หลุดจากโครงการ/);
  assert.match(dealUnlinkedUpdate(deal, { reason: 'ลบดีล (บังคับ)' }).body, /บังคับ/);
  // ไม่มีรหัส/ชื่อ ก็ยังต้องอ่านออก ไม่ใช่ได้ข้อความห้วน
  assert.match(dealLinkedUpdate({ id: 'D-9' }).body, /D-9/);
  assert.equal(dealLinkedUpdate(null), null);
});

// ⚠️ กติกาสำคัญ: บันทึกเฉพาะจังหวะ "เพิ่งครบ" — ติ๊กรับของรายชิ้นเป็นงานประจำวัน
// ของ PC ถ้าลงเธรดทุกครั้งจะกลบบทสนทนาจนหมด
test('ของเข้า: ลงเธรดเฉพาะตอนเพิ่งครบทุกรายการ', () => {
  const some = [{ id: 'M-1', arrivedAt: '2026-08-01' }, { id: 'M-2', arrivedAt: null }];
  const all = [{ id: 'M-1', arrivedAt: '2026-08-01' }, { id: 'M-2', arrivedAt: '2026-08-03' }];

  const event = deliveriesCompletedUpdate(some, all);
  assert.ok(event);
  assert.match(event.body, /ครบทุกรายการ/);
  assert.equal(event.meta.count, 2);
  assert.equal(event.meta.lastArrivedAt, '2026-08-03', 'ต้องเก็บวันที่ของชิ้นสุดท้าย');

  assert.equal(deliveriesCompletedUpdate(some, some), null, 'ยังไม่ครบ = เงียบ');
  assert.equal(deliveriesCompletedUpdate(all, all), null, 'ครบอยู่ก่อนแล้ว = ไม่ประกาศซ้ำ');
  assert.equal(deliveriesCompletedUpdate([], []), null, 'ไม่มีรายการเลย ≠ ครบ');
  // เพิ่มของใหม่หลังครบแล้วก็ไม่ประกาศซ้ำจนกว่าจะครบรอบใหม่จริง
  assert.equal(deliveriesCompletedUpdate(all, [...all, { id: 'M-3', arrivedAt: null }]), null);
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

// ⭐ เหตุผลต้องอยู่ใน**ข้อความที่คนอ่านเห็น** ไม่ใช่ซ่อนใน meta — บทเรียนจาก QT/SO
// ที่เหตุผลการตีกลับลงคอลัมน์เดียวแล้วถูกเขียนทับรอบถัดไป ไม่มีใครได้อ่าน
test('ปิด/เปิดโครงการ: เหตุผลอยู่ในข้อความ และใช้คำเดียวกับปุ่มบนหน้าจอ', () => {
  const request = projectCloseUpdate('request', { closeType: 'completed', reason: 'ส่งมอบครบแล้ว' });
  assert.match(request.body, /ขอปิดโครงการ/);
  assert.match(request.body, /ส่งมอบครบแล้ว/);
  assert.equal(request.meta.action, 'request');

  assert.match(projectCloseUpdate('approve', { closeType: 'cancelled' }).body, /ปิดโครงการแล้ว/);
  assert.match(projectCloseUpdate('reject', { reason: 'ยังมี SO ค้าง' }).body, /ตีกลับ/);
  assert.match(projectCloseUpdate('reopen', { reason: 'ลูกค้าสั่งเพิ่ม' }).body, /เปิดโครงการใหม่/);
  assert.match(projectCloseUpdate('cancel_request').body, /ถอนคำขอ/);

  // คำต้องห้ามของ workflow เอกสาร (ล็อกไว้ทั้งระบบ): ถอน/ถอด ใช้กับ "เพิกถอน" ไม่ได้
  assert.doesNotMatch(projectCloseUpdate('reject', {}).body, /เพิกถอน/);
  // action ที่ไม่รู้จัก = null ไม่ใช่แถวเปล่า
  assert.equal(projectCloseUpdate('ของแปลก'), null);
  assert.equal(projectCloseUpdate(''), null);
});
