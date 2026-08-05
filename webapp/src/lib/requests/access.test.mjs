// ── ด่านคำร้องแยกออกจากด่านราคาแล้ว (R-1 · P7-FN1) ──────────────────────
//
// ⭐ เทสต์ชุดนี้มีหน้าที่หลักข้อเดียว: **พิสูจน์ว่าการแยกด่านไม่ทำให้ใครเสียสิทธิ์**
// การรื้อด่านสิทธิ์คือที่ที่ regression มองไม่เห็นที่สุด — คนที่เข้าไม่ได้จะไม่รู้ว่า
// เคยเข้าได้ และไม่มีอะไรบนหน้าจอบอกว่าหายไป
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_ANSWER_DEPARTMENTS, ROLES, canAnswerRequestsFor, canViewCosting, canViewRequests,
} from '../permissions.js';
import { REQUEST_DEPTS } from '../master/requestTypes.js';
import { canAnswerRequest } from './access.js';

// ฝ่ายที่ role `staff` ครอบ — ต้องลองให้ครบ ไม่ใช่แค่ RD/PC ที่รู้ว่าผ่าน
const STAFF_DEPARTMENTS = ['PC', 'PD', 'WH', 'RD', 'QC', 'TS', 'FN'];

test('ลิสต์ฝ่ายผู้รับคำร้องต้องตรงกับทะเบียนหัวข้อเสมอ', () => {
  // permissions.js เป็นชั้นล่างสุด จึงสะกดลิสต์เอง — เทสต์นี้คือสิ่งเดียวที่กันไม่ให้
  // สองที่นี้เพี้ยนกัน (เพิ่มฝ่ายที่ทะเบียนแต่ลืมที่ด่าน = ฝ่ายใหม่ตอบคำร้องไม่ได้เงียบ ๆ)
  assert.deepEqual([...REQUEST_ANSWER_DEPARTMENTS].sort(), [...REQUEST_DEPTS].sort());
});

test('ไม่มีใครเสียสิทธิ์ — ทุก role ที่เคยเข้าระบบคำร้องได้ ต้องยังเข้าได้', () => {
  for (const role of ROLES) {
    for (const department of [null, ...STAFF_DEPARTMENTS, 'SA', 'AD', 'EX']) {
      const user = { id: 'U1', role, department };
      if (canViewCosting(user)) {
        assert.ok(canViewRequests(user), `${role}/${department} เคยเข้าได้ แต่ตอนนี้เข้าไม่ได้`);
      }
    }
  }
});

test('ตอบคำร้องได้เฉพาะฝ่ายของตัวเอง — และเฉพาะฝ่ายที่รับคำร้อง', () => {
  const rd = { id: 'U1', role: 'rd', department: 'RD' };
  const pc = { id: 'U2', role: 'staff', department: 'PC' };
  assert.ok(canAnswerRequest(rd, { dept: 'RD' }));
  assert.ok(!canAnswerRequest(rd, { dept: 'PC' }));
  assert.ok(canAnswerRequest(pc, { dept: 'PC' }));
  assert.ok(!canAnswerRequest(pc, { dept: 'RD' }));

  // ⚠️ ฝ่ายโรงงานอื่นถือ cap เท่ากับ PC ทุกประการ — ที่กันไว้คือ **ฝ่าย** ไม่ใช่ cap
  const fn = { id: 'U6', role: 'staff', department: 'FN' };
  assert.ok(canAnswerRequest(fn, { dept: 'FN' }));
  assert.ok(!canAnswerRequest(fn, { dept: 'RD' }));
  // ⭐ บัญชีตอบคำร้องได้ **โดยไม่ผ่านด่านราคา** — นี่คือทั้งหมดที่ R-1 มีไว้เพื่อ
  assert.ok(!canViewCosting(fn), 'ฝ่ายบัญชีต้องไม่เห็นข้อมูลต้นทุน');
  assert.ok(canViewRequests(fn), 'ฝ่ายบัญชีต้องเข้าระบบคำร้องได้');

  for (const department of ['PD', 'WH', 'QC', 'TS']) {
    const staff = { id: 'U3', role: 'staff', department };
    for (const dept of REQUEST_ANSWER_DEPARTMENTS) {
      assert.ok(!canAnswerRequest(staff, { dept }), `${department} ไม่ควรตอบคำร้องของ ${dept}`);
    }
  }
});

test('ฝ่ายขายเปิดคำร้องได้แต่ไม่ใช่ผู้รับเรื่อง', () => {
  const ae = { id: 'U4', role: 'ae', department: 'SA' };
  assert.ok(canViewRequests(ae));
  for (const dept of REQUEST_ANSWER_DEPARTMENTS) assert.ok(!canAnswerRequestsFor(ae, dept));
});

test('ผู้ดูแลระบบยังเป็น break-glass ของทุกฝ่าย', () => {
  const admin = { id: 'U5', role: 'admin', department: 'AD' };
  for (const dept of REQUEST_ANSWER_DEPARTMENTS) assert.ok(canAnswerRequest(admin, { dept }));
  // ฝ่ายที่ยังไม่เปิดรับคำร้อง แม้เป็น admin ก็ต้องไม่ผ่าน — ไม่งั้นด่านนี้ไม่มีความหมาย
  // (FN เปิดแล้วใน P7-FN2 · ฝ่ายโรงงานอื่นยังไม่มีคิวคำร้องของตัวเอง)
  assert.ok(!canAnswerRequest(admin, { dept: 'PD' }));
  assert.ok(!canAnswerRequest(admin, { dept: null }));
});
