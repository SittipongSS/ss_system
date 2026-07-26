// ด่านสิทธิ์เธรดของระบบขอราคา — entity ใหม่ 2 ตัวในทะเบียน updateAccess
//
// ⚠️ ทะเบียนของกลางมีเทสต์โครงสร้างอยู่แล้ว (ประกาศ canView/canPost ครบไหม) แต่
// **โครงสร้างครบไม่ได้แปลว่ากฎถูก** — ไฟล์นี้ล็อกพฤติกรรมจริง: ใครโพสต์ได้/ไม่ได้
// ต้นทุนเป็นข้อมูลลับ และเธรดนี้จะกลายเป็นที่เก็บเหตุผลราคา ปล่อยหลุดคือหลุดจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPostUpdate, canViewUpdates } from './updateAccess.js';

// entity ทั้งสองตัวตัดสินจากตัว record ล้วน ไม่ query ต่อ — ไม่ต้อง stub supabase
const db = null;

const EXEC = { id: 'U-EX', role: 'executive', department: 'EX' };
const OWNER = { id: 'U-AE', role: 'ae', department: 'SA', team: 'KA' };
const OTHER_SALES = { id: 'U-AE2', role: 'ae', department: 'SA', team: 'KA' };
const RD = { id: 'U-RD', role: 'rd', department: 'RD' };
const PC = { id: 'U-PC', role: 'staff', department: 'PC' };
const ADMIN = { id: 'U-AD', role: 'admin', department: 'SA' };

// ── เคสขอราคาวัสดุ ───────────────────────────────────────────────────────
const ask = (over = {}) => ({
  id: 'A1', status: 'pending', dept: 'PC', requestedById: 'U-AE', ...over,
});

test('เคสขอราคา: ผู้เปิดเคสกับฝ่ายที่ต้องตอบโพสต์ได้ · ฝ่ายอื่นอ่านได้แต่โพสต์ไม่ได้', async () => {
  const a = ask();
  for (const u of [OWNER, PC, ADMIN]) {
    assert.equal(await canPostUpdate(db, 'material_ask', a, u), true, `${u.role}/${u.department} ควรโพสต์ได้`);
  }
  // RD อยู่ในวงคนเห็นระบบขอราคา แต่เคสนี้เป็นงานฝ่าย PC — ตอบแทนกันไม่ได้
  assert.equal(await canViewUpdates(db, 'material_ask', a, RD), true);
  assert.equal(await canPostUpdate(db, 'material_ask', a, RD), false);
  // เซลคนอื่นเห็นเคสได้ (ระบบขอราคาเห็นกันทั้งวง) แต่ไม่ใช่เคสของเขา
  assert.equal(await canPostUpdate(db, 'material_ask', a, OTHER_SALES), false);
});

test('เคสขอราคา: เคสฝ่าย RD ต้องให้ RD ตอบ ไม่ใช่ PC', async () => {
  const a = ask({ dept: 'RD' });
  assert.equal(await canPostUpdate(db, 'material_ask', a, RD), true);
  assert.equal(await canPostUpdate(db, 'material_ask', a, PC), false);
});

test('เคสขอราคา: ปิด/ยกเลิกแล้วเป็นหลักฐาน — โพสต์ต่อไม่ได้แม้เป็นเจ้าของ', async () => {
  // กฎเดียวกับไฟล์แนบ (canAttachToCosting) เพื่อไม่ให้เคสเดียวมีสองมาตรฐาน
  for (const status of ['closed', 'cancelled']) {
    const a = ask({ status });
    assert.equal(await canPostUpdate(db, 'material_ask', a, OWNER), false, `status ${status}`);
    assert.equal(await canPostUpdate(db, 'material_ask', a, PC), false, `status ${status}`);
    // แต่ยังอ่านย้อนหลังได้ — หลักฐานต้องเปิดอ่านได้เสมอ
    assert.equal(await canViewUpdates(db, 'material_ask', a, OWNER), true, `status ${status}`);
  }
});

// ── ใบขอราคาผลิต ─────────────────────────────────────────────────────────
const cr = (over = {}) => ({
  id: 'C1', status: 'pending_exec', team: 'KA', requestedById: 'U-AE', ...over,
});

test('ใบขอราคาผลิต: ผู้บริหารกับเจ้าของใบโพสต์ได้ · RD/PC อ่านได้แต่โพสต์ไม่ได้', async () => {
  const r = cr();
  assert.equal(await canPostUpdate(db, 'costing_request', r, EXEC), true);
  assert.equal(await canPostUpdate(db, 'costing_request', r, OWNER), true);
  assert.equal(await canPostUpdate(db, 'costing_request', r, ADMIN), true);
  // บทสนทนาเรื่องราคาวัสดุอยู่บนเคสขอราคา ไม่ใช่บนใบขออนุมัติราคาผลิต
  for (const u of [RD, PC]) {
    assert.equal(await canViewUpdates(db, 'costing_request', r, u), true, `${u.department} ควรอ่านได้`);
    assert.equal(await canPostUpdate(db, 'costing_request', r, u), false, `${u.department} ไม่ควรโพสต์ได้`);
  }
});

test('ใบขอราคาผลิต: อนุมัติแล้วยังคุยกันได้ (เนื้อใบล็อก แต่เธรดไม่ล็อก)', async () => {
  // ⭐ จุดที่ตั้งใจต่างจาก canEditCostingRequest ซึ่งปิดตายที่ approved/linked —
  // ช่วงหลังอนุมัติคือช่วงที่มีคำถามเยอะที่สุด ถ้าล็อกเธรดด้วยจะไม่มีที่ให้ถาม
  for (const status of ['approved', 'linked']) {
    const r = cr({ status });
    assert.equal(await canPostUpdate(db, 'costing_request', r, OWNER), true, `status ${status}`);
    assert.equal(await canPostUpdate(db, 'costing_request', r, EXEC), true, `status ${status}`);
  }
});

test('ใบขอราคาผลิต: ยกเลิกแล้วปิดเธรด — ไม่มีอะไรต้องคุยต่อ', async () => {
  const r = cr({ status: 'cancelled' });
  assert.equal(await canPostUpdate(db, 'costing_request', r, OWNER), false);
  assert.equal(await canPostUpdate(db, 'costing_request', r, EXEC), false);
  assert.equal(await canViewUpdates(db, 'costing_request', r, OWNER), true);
});

test('ใบขอราคาผลิต: ใบของทีมอื่นที่ไม่ใช่ของเรา โพสต์ไม่ได้', async () => {
  const r = cr({ team: 'KB', requestedById: 'U-SOMEONE' });
  assert.equal(await canPostUpdate(db, 'costing_request', r, OWNER), false);
});

test('ไม่มี record = ปิดตายทั้งสอง entity (ห้ามตกไปเป็นปล่อยผ่าน)', async () => {
  for (const type of ['material_ask', 'costing_request']) {
    assert.equal(await canViewUpdates(db, type, null, ADMIN), false, type);
    assert.equal(await canPostUpdate(db, type, null, ADMIN), false, type);
  }
});
