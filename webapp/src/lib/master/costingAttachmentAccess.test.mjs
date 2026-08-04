// ด่านสิทธิ์ไฟล์แนบของระบบขอราคา
//
// ⚠️ ล็อกกฎที่ "อ่าน" กับ "เขียน" ต้องเข้มเท่ากันสำหรับคำร้อง — เดิมด่านเขียน
// (canAttachToCosting) ผูกกับแถวมาตั้งแต่ต้น แต่ด่านอ่าน (canViewCostingAttachment)
// เป็น `canViewCosting(user)` ล้วน ไม่รับ parent เลย ⇒ ใครถือ costing:view ก็เปิดดู
// รูป/สเปกของคำร้องใบไหนก็ได้ · สองมาตรฐานในเรื่องเดียวกันโดยไม่มีใครสังเกต
import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewCostingAttachment } from './costingAttachmentAccess.js';

const OWNER = { id: 'U-AE', role: 'ae', department: 'SA' };
const OTHER_SALES = { id: 'U-AE2', role: 'ae', department: 'SA' };
const RD = { id: 'U-RD', role: 'rd', department: 'RD' };
const PC = { id: 'U-PC', role: 'staff', department: 'PC' };
const EXEC = { id: 'U-EX', role: 'executive', department: 'EX' };
const MARKETING = { id: 'U-MK', role: 'marketing', department: 'MK' };

const REQ = { id: 'DR-1', status: 'pending', dept: 'PC', requestedById: 'U-AE' };
// stub เฉพาะเส้นที่บรรทัดใช้ถามหัวคำร้อง
const db = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: REQ, error: null }) }) }),
  }),
};

test('ไฟล์แนบหัวคำร้อง: อ่านได้เฉพาะผู้ขอ · ฝ่ายที่ต้องตอบ · ผู้สังเกตการณ์', async () => {
  for (const u of [OWNER, PC, EXEC]) {
    assert.equal(await canViewCostingAttachment(db, 'dept_request', REQ, u), true, u.id);
  }
  // ถือ costing:view เหมือนกันแต่ไม่เกี่ยวกับใบนี้
  assert.equal(await canViewCostingAttachment(db, 'dept_request', REQ, RD), false);
  assert.equal(await canViewCostingAttachment(db, 'dept_request', REQ, OTHER_SALES), false);
  // ไม่มี costing:view เลย — ด่านชั้นนอกตัดก่อนถึงด่านรายแถว
  assert.equal(await canViewCostingAttachment(db, 'dept_request', REQ, MARKETING), false);
});

test('ไฟล์แนบรายบรรทัด: ตัดสินจากหัวคำร้อง ไม่ใช่จากตัวบรรทัด', async () => {
  // บรรทัดไม่รู้จักผู้ขอ/ฝ่าย — ต้องไปโหลดหัวมาตัดสิน (รูปเดียวกับ canAttachToCosting)
  const line = { id: 'DRI-1', requestId: 'DR-1' };
  assert.equal(await canViewCostingAttachment(db, 'dept_request_item', line, PC), true);
  assert.equal(await canViewCostingAttachment(db, 'dept_request_item', line, RD), false);
  // บรรทัดที่ไม่มี requestId = ข้อมูลเสีย ต้องปฏิเสธ ไม่ใช่ปล่อยผ่าน
  assert.equal(await canViewCostingAttachment(db, 'dept_request_item', { id: 'x' }, PC), false);
});

test('ใบขอราคาผลิตคงเดิม — คุมด้วย cap ของระบบ ด่านรายใบอยู่ใน route ของใบเอง', async () => {
  // เปลี่ยนตรงนี้จะไปกระทบระบบที่ไม่เกี่ยวกัน จึงจงใจไม่แตะ
  for (const u of [OWNER, RD, PC, EXEC]) {
    assert.equal(await canViewCostingAttachment(db, 'costing_item', { id: 'CRI-1' }, u), true, u.id);
  }
  assert.equal(await canViewCostingAttachment(db, 'costing_item', { id: 'CRI-1' }, MARKETING), false);
});
