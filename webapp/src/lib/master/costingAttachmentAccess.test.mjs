// ด่านสิทธิ์ไฟล์แนบของระบบขอราคา
//
// ⚠️ ล็อกกฎที่ "อ่าน" กับ "เขียน" ต้องเข้มเท่ากันสำหรับคำร้อง — เดิมด่านเขียน
// (canAttachToCosting) ผูกกับแถวมาตั้งแต่ต้น แต่ด่านอ่าน (canViewCostingAttachment)
// เป็น `canViewCosting(user)` ล้วน ไม่รับ parent เลย ⇒ ใครถือ costing:view ก็เปิดดู
// รูป/สเปกของคำร้องใบไหนก็ได้ · สองมาตรฐานในเรื่องเดียวกันโดยไม่มีใครสังเกต
import test from 'node:test';
import assert from 'node:assert/strict';
import { canAttachToCosting, canViewCostingAttachment } from './costingAttachmentAccess.js';

const OWNER = { id: 'U-AE', role: 'ae', department: 'SA' };
const OTHER_SALES = { id: 'U-AE2', role: 'ae', department: 'SA' };
const RD = { id: 'U-RD', role: 'rd', department: 'RD' };
const PC = { id: 'U-PC', role: 'pc', department: 'PC' };
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

// ── ฝ่ายที่รับคำร้องได้ ต้องแตะไฟล์ของใบนั้นได้ด้วย ────────────────────────
//
// 🐞 ด่านชั้นนอกของไฟล์แนบคำร้องเคยเป็น `canViewCosting` ล้วน ซึ่งแคบ role `staff`
// ไว้เฉพาะฝ่ายแหล่งราคา (COSTING_SOURCE_DEPARTMENTS = RD/PC) — แต่ฝ่ายที่รับคำร้อง
// คือ REQUEST_ANSWER_DEPARTMENTS = RD/PC/**FN** ⇒ ฝ่ายบัญชีรับคำร้องเอกสารการเงิน
// ของตัวเองได้ แต่ **เปิดดูไฟล์ที่แนบมากับใบนั้นไม่ได้สักไฟล์ และแนบกลับก็ไม่ได้**
//
// เป็นกับดักเดียวกับที่ R-1 เขียนเตือนไว้เอง ("ปลดด่านคือปิดที่เนื้อ ไม่ใช่เปิดที่เมนู"):
// แยกด่านคำร้องออกจากด่านราคาแล้วที่ตัว endpoint แต่สายไฟล์แนบยังวิ่งผ่านด่านราคาอยู่
const FN = { id: 'U-FN', role: 'finance', department: 'FN' };
const FN_REQ = { id: 'DR-9', status: 'pending', dept: 'FN', requestedById: 'U-AE' };
const fnDb = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: FN_REQ, error: null }) }) }),
  }),
};

test('⭐ ฝ่ายบัญชี (FN) อ่านและแนบไฟล์ในคำร้องของฝ่ายตัวเองได้', async () => {
  assert.equal(await canViewCostingAttachment(fnDb, 'dept_request', FN_REQ, FN), true, 'อ่านหัวคำร้อง');
  assert.equal(await canAttachToCosting(fnDb, 'dept_request', FN_REQ, FN), true, 'แนบเข้าหัวคำร้อง');
  const line = { id: 'DRI-9', requestId: 'DR-9' };
  assert.equal(await canViewCostingAttachment(fnDb, 'dept_request_item', line, FN), true, 'อ่านรายบรรทัด');
  assert.equal(await canAttachToCosting(fnDb, 'dept_request_item', line, FN), true, 'แนบรายบรรทัด');
});

test('การเปิดทางให้ FN ต้องไม่ทำให้เห็นใบของฝ่ายอื่น หรือแตะระบบราคา', async () => {
  // REQ (ฝ่าย PC) ไม่ใช่ของ FN — ด่านรายแถวยังตัดตามเดิม
  assert.equal(await canViewCostingAttachment(db, 'dept_request', REQ, FN), false, 'ใบของฝ่าย PC');
  assert.equal(await canAttachToCosting(db, 'dept_request', REQ, FN), false, 'แนบใบของฝ่าย PC');
  // ใบขอราคาผลิตยังผูกกับด่านราคาเหมือนเดิม — FN ไม่ใช่ฝ่ายแหล่งราคา
  assert.equal(await canViewCostingAttachment(db, 'costing_item', {}, FN), false, 'ต้นทุนในใบขอราคา');
  assert.equal(await canAttachToCosting(db, 'costing_item', {}, FN), false, 'แนบใบขอราคา');
});

test('คำร้องที่ปิด/ยกเลิกแล้วยังแนบไม่ได้ แม้เป็นฝ่ายเจ้าของ (หลักฐานห้ามแก้ย้อนหลัง)', async () => {
  for (const status of ['closed', 'cancelled']) {
    const closed = { ...FN_REQ, status };
    assert.equal(await canAttachToCosting(fnDb, 'dept_request', closed, FN), false, status);
  }
});

// ── ไฟล์แนบของคำร้องประเมินพื้นที่ — ช่างอ่านได้บนจอใบประเมิน (PR-S · แผน crew Q6) ──────
//
// 🐞 ก่อนนี้จอประเมินให้ช่างแค่ "รายละเอียดคำร้อง" · ไฟล์ที่ SA แนบมา (ผังอาคาร · รูปหน้าร้าน) เปิดไม่ได้เพราะ
//   proxy ถามบันไดคำร้อง (`canViewRequests`) ซึ่ง role `ts` ไม่ผ่าน ⇒ ลิสต์ไฟล์อย่างเดียว = ลิงก์ตายทุกอัน
// ⭐ เปิด **เฉพาะคำร้องประเมินพื้นที่** ด้วยด่านอ่านของใบประเมินตัวเดียวกับ GET/รูปของพื้นที่ (`surveyReadError`)
// 🔴 ด่านแนบ/ลบไม่ขยับ — ช่างอ่านอย่างเดียว
const CREW = { id: 'U-TS1', role: 'ts', department: 'TS' };
const SURVEY_REQ = { id: 'DR-S1', status: 'acknowledged', kind: 'site_survey', dept: 'TS', requestedById: 'U-AE' };

test('⭐ ช่าง (ts) เปิดไฟล์แนบของคำร้องประเมินพื้นที่ที่ส่งถึงฝ่าย TS ได้ · แนบ/ลบไม่ได้', async () => {
  assert.equal(await canViewCostingAttachment(db, 'dept_request', SURVEY_REQ, CREW), true);
  assert.equal(await canAttachToCosting(db, 'dept_request', SURVEY_REQ, CREW), false, 'อ่านอย่างเดียว');
});

test('🔴 ช่องที่เปิดให้ช่างแคบแค่คำร้องประเมินพื้นที่ของฝ่าย TS', async () => {
  // คำร้องของฝ่ายอื่น (RD) — ช่างต้องเปิดไม่ได้ แม้จะส่งมาในรูป kind เดียวกัน
  assert.equal(await canViewCostingAttachment(db, 'dept_request', { ...SURVEY_REQ, dept: 'RD', kind: 'scent_dev' }, CREW), false);
  assert.equal(await canViewCostingAttachment(db, 'dept_request', { ...SURVEY_REQ, dept: 'RD' }, CREW), false);
  // คำร้องชนิดอื่นของ TS (วันหน้า) — ไม่ใช่ใบประเมิน ไม่ได้ช่องนี้
  assert.equal(await canViewCostingAttachment(db, 'dept_request', { ...SURVEY_REQ, kind: 'install' }, CREW), false);
  // คนนอกโมดูลที่ไม่เกี่ยวกับใบ ยังตกเหมือนเดิม
  assert.equal(await canViewCostingAttachment(db, 'dept_request', SURVEY_REQ, MARKETING), false);
  // รายบรรทัดไม่ได้เปิดตาม (ใบประเมินไม่มีบรรทัด — hasItems false)
  assert.equal(await canViewCostingAttachment(db, 'dept_request_item', { id: 'x', requestId: 'DR-S1' }, CREW), false);
});

test('ผู้ขอ (SA) ยังเปิดไฟล์ของใบประเมินตัวเองได้เหมือนเดิม', async () => {
  assert.equal(await canViewCostingAttachment(db, 'dept_request', SURVEY_REQ, OWNER), true);
});
