// ── ด่านอนุมัติ master data บน Control Panel — ลูกค้ากับสินค้าต้องพูดเหมือนกัน ──
//
// มติผู้ใช้ 2026-08-30: หน้ารายละเอียดลูกค้ากับสินค้าใช้ Control Panel ชุดเดียวกัน
// ⚠️ กติกาที่เทสต์ชุดนี้ล็อกไว้:
//   1. แถวเก่าก่อน mig 0027 (approvalStatus = NULL) = "อนุมัติแล้ว" ไม่ใช่ "ไม่ระบุ"
//   2. ถูกตีกลับ ยืนอยู่ **ก้าวเดียวกับรออนุมัติ** แต่คนละคำ — คนอ่านต้องรู้ว่าต้องแก้
//   3. รางมีสามขั้นเสมอ ไม่ว่าสถานะไหน (ตำแหน่งคงที่ สแกนข้ามหน้าได้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_CONTROL_META, approvalControlView } from './approvalControl.js';

test('อนุมัติแล้ว: ยืนขั้นสุดท้าย ป้ายเขียว', () => {
  const view = approvalControlView({ approvalStatus: 'approved' }, { noun: 'สินค้า' });
  assert.equal(view.label, APPROVAL_CONTROL_META.approved.label);
  assert.equal(view.color, 'var(--green)');
  assert.equal(view.currentIndex, 2);
  assert.equal(view.rejected, false);
  assert.equal(view.steps.length, 3);
});

test('รออนุมัติกับถูกตีกลับ ยืนก้าวเดียวกัน แต่คนละคำ', () => {
  const pending = approvalControlView({ approvalStatus: 'pending' }, { noun: 'ลูกค้า' });
  const rejected = approvalControlView({ approvalStatus: 'rejected' }, { noun: 'ลูกค้า' });
  assert.equal(pending.currentIndex, 1);
  assert.equal(rejected.currentIndex, 1);
  assert.equal(pending.steps[1].label, 'รออนุมัติ');
  assert.equal(rejected.steps[1].label, 'ถูกตีกลับ ต้องแก้ไข');
  assert.equal(rejected.rejected, true);
  // คำใบ้ของขั้นที่ถูกตีกลับต้องบอกว่า "ต้องลงมือ" ไม่ใช่ "รอคนอื่น"
  assert.match(rejected.steps[1].hint, /แก้/);
});

test('แถวเก่าก่อน mig 0027 (ไม่มีสถานะ) = อนุมัติแล้ว', () => {
  for (const record of [{}, { approvalStatus: null }, null]) {
    const view = approvalControlView(record);
    assert.equal(view.status, 'approved');
    assert.equal(view.currentIndex, 2);
  }
});

test('คำเรียกของเดินตามหน้าที่เรียก — ไม่ฮาร์ดโค้ดว่า "สินค้า"', () => {
  assert.equal(approvalControlView({}, { noun: 'ลูกค้า' }).steps[0].label, 'บันทึกลูกค้า');
  assert.equal(approvalControlView({}, { noun: 'สินค้า' }).steps[0].label, 'บันทึกสินค้า');
  // ประโยคของแต่ละหน้าส่งเข้ามาได้ ไม่ใช่ประโยคกลางที่ไม่ตรงกับของจริง
  const view = approvalControlView({ approvalStatus: 'approved' }, { doneHint: 'พร้อมออกเอกสาร' });
  assert.equal(view.steps[2].hint, 'พร้อมออกเอกสาร');
});
