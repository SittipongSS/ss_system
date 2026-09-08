// ── ด่านคำร้องแยกออกจากด่านราคาแล้ว (R-1 · P7-FN1) ──────────────────────
//
// ⭐ เทสต์ชุดนี้มีหน้าที่หลักข้อเดียว: **พิสูจน์ว่าการแยกด่านไม่ทำให้ใครเสียสิทธิ์**
// การรื้อด่านสิทธิ์คือที่ที่ regression มองไม่เห็นที่สุด — คนที่เข้าไม่ได้จะไม่รู้ว่า
// เคยเข้าได้ และไม่มีอะไรบนหน้าจอบอกว่าหายไป
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUEST_ANSWER_DEPARTMENTS, ROLES, canAnswerRequestsFor, canViewCosting, canViewRequests,
} from '../permissions.js';
import { REQUEST_DEPTS } from '../master/requestTypes.js';
import { canAnswerRequest, canAssignBriefPerfumer, canManageRequest, canReadRequestRow, canViewRequest } from './access.js';

// ฝ่ายโรงงานทุกฝ่าย — ต้องลองให้ครบ ไม่ใช่แค่ RD/PC ที่รู้ว่าผ่าน
const STAFF_DEPARTMENTS = ['PC', 'PD', 'WH', 'RD', 'QC', 'TS', 'FN'];

test('ฝ่ายที่เปิดใบใหม่ได้ ต้องเป็นฝ่ายที่ตอบคำร้องได้เสมอ', () => {
  // permissions.js เป็นชั้นล่างสุด จึงสะกดลิสต์เอง — เทสต์นี้คือสิ่งเดียวที่กันไม่ให้
  // สองที่นี้เพี้ยนกัน (เพิ่มฝ่ายที่ทะเบียนแต่ลืมที่ด่าน = ฝ่ายใหม่ตอบคำร้องไม่ได้เงียบ ๆ)
  //
  // ⚠️ **ไม่ใช่ลิสต์เท่ากัน** (มติผู้ใช้ 2026-08-08: PC/FN ปิดเก็บไว้ก่อน) —
  // `REQUEST_DEPTS` = ฝ่ายที่ **เปิดใบใหม่ถึงได้** · `REQUEST_ANSWER_DEPARTMENTS` =
  // ฝ่ายที่ **ตอบใบได้** ซึ่งต้องกว้างกว่าหรือเท่ากันเสมอ ไม่งั้นใบเก่าของฝ่ายที่ปิดไป
  // จะไม่มีใครตอบได้เลย
  for (const dept of REQUEST_DEPTS) {
    assert.ok(REQUEST_ANSWER_DEPARTMENTS.includes(dept), `${dept} เปิดใบได้แต่ตอบไม่ได้`);
  }
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
  const pc = { id: 'U2', role: 'pc', department: 'PC' };
  assert.ok(canAnswerRequest(rd, { dept: 'RD' }));
  assert.ok(!canAnswerRequest(rd, { dept: 'PC' }));
  assert.ok(canAnswerRequest(pc, { dept: 'PC' }));
  assert.ok(!canAnswerRequest(pc, { dept: 'RD' }));

  // ⚠️ ฝ่ายโรงงานอื่นถือ cap เท่ากับ PC ทุกประการ — ที่กันไว้คือ **ฝ่าย** ไม่ใช่ cap
  const fn = { id: 'U6', role: 'finance', department: 'FN' };
  assert.ok(canAnswerRequest(fn, { dept: 'FN' }));
  assert.ok(!canAnswerRequest(fn, { dept: 'RD' }));
  /* ⭐ ฝ่ายธุรกิจบริการรับคำร้อง "ประเมินพื้นที่" (mig 0314) — ด่านฝ่ายเดียวกันเป๊ะ
     ⚠️ **คนรับเรื่องคือ Planner/หัวหน้า** (มติ 2026-08-30) — เจ้าหน้าที่หน้างานไม่ถือ
        `requests:answer` เพราะเขารับงานจากนัดที่ถูกลงคิวให้แล้ว ไม่ใช่จากคิวใบคำร้อง */
  const ts = { id: 'U7', role: 'ts_planner', department: 'TS' };
  assert.ok(canAnswerRequest(ts, { dept: 'TS' }));
  assert.ok(!canAnswerRequest({ id: 'U8', role: 'ts', department: 'TS' }, { dept: 'TS' }));
  assert.ok(!canAnswerRequest(ts, { dept: 'RD' }), 'TS ต้องไม่ตอบคำร้องของ RD');
  assert.ok(!canAnswerRequest(rd, { dept: 'TS' }), 'RD ต้องไม่ตอบคำร้องของ TS');
  assert.ok(!canViewCosting(ts), 'ฝ่ายบริการต้องไม่เห็นข้อมูลต้นทุน');

  // ⭐ บัญชีตอบคำร้องได้ **โดยไม่ผ่านด่านราคา** — นี่คือทั้งหมดที่ R-1 มีไว้เพื่อ
  assert.ok(!canViewCosting(fn), 'ฝ่ายบัญชีต้องไม่เห็นข้อมูลต้นทุน');
  assert.ok(canViewRequests(fn), 'ฝ่ายบัญชีต้องเข้าระบบคำร้องได้');

  // ⚠️ TS ออกจากลิสต์นี้แล้ว — ฝ่ายบริการรับคำร้อง "ประเมินพื้นที่" ตั้งแต่ mig 0314
  //   (ยืนยันข้างบนว่ายังตอบได้เฉพาะของฝ่ายตัวเอง) · ที่เหลือคือฝ่ายโรงงานที่ไม่รับคำร้อง
  for (const department of ['PD', 'WH', 'QC']) {
    const staff = { id: 'U3', role: { PD: 'pd', WH: 'wh', QC: 'qc' }[department], department };
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

// ── หน้าจอต้องถามคำถามเดียวกับ API ──────────────────────────────────────
test('🐞 ฝ่ายบัญชีต้องกดปุ่มบนรางได้จริง ไม่ใช่ผ่านแค่ API', () => {
  // ⚠️ **บั๊กที่ปิดตรงนี้:** R-1 แก้ `canAnswerRequest` (ฝั่ง API) แต่หน้าจอสามจุด
  // ยังถาม `canQuoteMaterial` อยู่ ⇒ FN ยิง API ผ่าน แต่บนจอเห็นแต่ป้าย "รอฝ่าย
  // ปลายทางรับเรื่อง" และกดอะไรไม่ได้เลย · เขียวทั้ง CI เพราะไม่มีเทสต์ไหนถาม
  // คำถามนี้ — เจอตอนไล่โค้ดสาย SA↔RD ไม่ใช่ตอนเทสต์
  const fn = { id: 'U7', role: 'finance', department: 'FN' };
  const request = { dept: 'FN', requestedById: 'someone-else' };

  // `owner` ของหน้ารายละเอียด และ `isDept` ของ nextStepForRow ใช้ตัวนี้ตัวเดียวกัน
  assert.ok(canAnswerRequestsFor(fn, request.dept));
  assert.ok(canAnswerRequest(fn, request));
});

test('ratchet: ระบบคำร้องห้ามถาม "ตอบราคาได้ไหม" แทน "รับคำร้องได้ไหม"', () => {
  const files = [
    'src/lib/requests/rowStage.js',
    'src/app/requests/page.js',
    'src/app/requests/[id]/page.js',
  ];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // อนุญาตในคอมเมนต์ (อธิบายของเดิม) แต่ห้ามเรียกจริง
    assert.ok(!/canQuoteMaterial\(/.test(src), `${file}: ยังเรียก canQuoteMaterial อยู่`);
  }
});

// ── ทีมเดียวกัน = ใบเดียวกัน (มติผู้ใช้ 2026-08-11) ───────────────────────
//
// 🐞 อาการที่ผู้ใช้แจ้ง: คิวมีขอบเขต "ทีม" ให้เลือกอยู่แล้ว ⇒ เห็นแถวของเพื่อนร่วมทีม
// แต่กดเปิดใบไม่ได้ เพราะด่านรายแถวยังเป็น "ของตัวเองเท่านั้น" ⇒ 403 กลางทาง
const owner = { id: 'USR-OWNER', role: 'ae', team: 'SV' };
const teammate = { id: 'USR-MATE', role: 'ac', team: 'SV' };
const otherTeam = { id: 'USR-KA', role: 'ae', team: 'KA' };
const multiTeam = { id: 'USR-MULTI', role: 'ae', team: 'ODM', teams: ['ODM', 'SV'] };
const rdStaff = { id: 'USR-RD', role: 'rd' };
const svRequest = { requestedById: 'USR-OWNER', team: 'SV', dept: 'RD', status: 'pending' };

test('เพื่อนร่วมทีมทำแทนกันได้ทุกอย่าง — ไม่ใช่แค่มองเห็น', () => {
  assert.equal(canManageRequest(teammate, svRequest), true);
  assert.equal(canViewRequest(teammate, svRequest), true);
  assert.equal(canReadRequestRow(teammate, svRequest), true);
});

test('คนละทีมยังเข้าไม่ได้ — ขอบเขตคือทีม ไม่ใช่ทั้งฝ่ายขาย', () => {
  assert.equal(canManageRequest(otherTeam, svRequest), false);
  assert.equal(canReadRequestRow(otherTeam, svRequest), false);
});

test('คนอยู่หลายทีมเห็นของทุกทีมที่สังกัด (#1122)', () => {
  assert.equal(canManageRequest(multiTeam, svRequest), true);
  assert.equal(canManageRequest(multiTeam, { ...svRequest, team: 'KA' }), false);
});

test('⚠️ ใบไม่มีทีม ต้องไม่กลายเป็นใบสาธารณะ', () => {
  // ใบที่แอดมินหรือฝ่ายอื่นเปิด (`team` ว่าง) กับผู้ใช้ที่ไม่มีทีม (RD/PC) จะ "ตรงกัน"
  // ทันทีถ้าปล่อยให้ null เทียบ null ผ่าน — ช่องรั่วที่เงียบที่สุดของด่านแบบนี้
  const noTeamRequest = { requestedById: 'USR-ADMIN', team: null, dept: 'RD' };
  assert.equal(canManageRequest(teammate, noTeamRequest), false);
  assert.equal(canManageRequest(rdStaff, noTeamRequest), false);
  assert.equal(canManageRequest({ id: 'USR-X', role: 'ae' }, { requestedById: 'USR-Y', team: '' }), false);
});

test('เจ้าของใบยังทำได้เหมือนเดิม และฝ่ายที่ต้องตอบยังอ่านได้ตามเดิม', () => {
  assert.equal(canManageRequest(owner, svRequest), true);
  assert.equal(canManageRequest(rdStaff, svRequest), false, 'ฝ่ายที่ตอบไม่ใช่เจ้าของใบ');
  assert.equal(canReadRequestRow(rdStaff, svRequest), true, 'แต่ต้องอ่านใบที่ส่งถึงฝ่ายตัวเองได้');
});

test('ไม่ได้ล็อกอิน = ไม่ได้อะไรเลย แม้ใบจะมีทีมตรงกัน', () => {
  assert.equal(canManageRequest(null, svRequest), false);
  assert.equal(canManageRequest({ role: 'ae', team: 'SV' }, svRequest), false, 'ไม่มี id = ไม่ใช่คน');
});

/* ── แจกกลิ่นให้ผู้ปรุง: หัวหน้าแจก · ผู้ปรุงดูอย่างเดียว (มติผู้ใช้ 2026-09-08) ──
 *
 * ⚠️ ด่านนี้เป็น **ด่านเดียวในระบบที่แยกตำแหน่งในฝ่าย RD ออกจากกัน** — ที่เหลือทั้งหมด
 * ยังถือ cap ชุดเดียวกัน (มติ 2026-09-01 "ต่างแค่ป้าย") ⇒ เทสต์ชุดนี้คือสิ่งเดียว
 * ที่กันไม่ให้ใครเผลอเปิดกว้างกลับไปตอน refactor
 */
const rdRequest = { dept: 'RD', status: 'acknowledged', requestedById: 'USR-SA', team: 'SV' };
const rdUser = (role) => ({ id: `USR-${role}`, role, department: 'RD' });

test('หัวหน้าและผู้ประสานงานของฝ่าย RD แจกกลิ่นได้', () => {
  for (const role of ['rd', 'rd_coordinator', 'rd_supervisor']) {
    assert.equal(canAssignBriefPerfumer(rdUser(role), rdRequest), true, role);
  }
});

test('ผู้ปรุงและนักเคมีเห็นตารางได้ แต่แจกงานไม่ได้', () => {
  for (const role of ['rd_perfumer', 'rd_chemist']) {
    assert.equal(canAnswerRequest(rdUser(role), rdRequest), true, `${role} ต้องยังตอบใบได้เหมือนเดิม`);
    assert.equal(canAssignBriefPerfumer(rdUser(role), rdRequest), false, role);
  }
});

/* กติกา admin-full-rights — แอดมินต้องทำได้ทุกอย่าง รวมของที่ผูกกับตำแหน่งในฝ่ายอื่น */
test('แอดมินแจกได้ทุกใบ', () => {
  assert.equal(canAssignBriefPerfumer({ id: 'USR-ADMIN', role: 'admin' }, rdRequest), true);
});

/* ⚠️ `isSuperuser` = admin || ae_supervisor ⇒ ถ้าด่านนี้ใช้ isSuperuser หัวหน้าฝ่ายขาย
   จะแจกงานปรุงกลิ่นได้ด้วย ซึ่งไม่มีใครสั่ง · เทสต์นี้คือตัวกันเรื่องนั้นโดยเฉพาะ */
test('หัวหน้าฝ่ายขายผ่านด่านใบได้ แต่ต้องแจกกลิ่นไม่ได้', () => {
  const salesHead = { id: 'USR-AES', role: 'ae_supervisor', department: 'SA' };
  assert.equal(canAnswerRequest(salesHead, rdRequest), true, 'break-glass ของใบยังเปิดตามเดิม');
  assert.equal(canAssignBriefPerfumer(salesHead, rdRequest), false);
});

test('หัวหน้า RD แจกกลิ่นในใบของฝ่ายอื่นไม่ได้', () => {
  assert.equal(canAssignBriefPerfumer(rdUser('rd_supervisor'), { ...rdRequest, dept: 'TS' }), false);
});

test('ไม่ได้ล็อกอิน / ไม่มีใบ = แจกไม่ได้', () => {
  assert.equal(canAssignBriefPerfumer(null, rdRequest), false);
  assert.equal(canAssignBriefPerfumer(rdUser('rd_supervisor'), null), false);
});
