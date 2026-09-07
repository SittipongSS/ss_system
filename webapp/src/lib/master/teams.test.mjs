// ── ทะเบียนทีม (mig 0310) ─────────────────────────────────────────────────
//
// กติกาที่ชุดนี้ยึด (docs/team-management-plan.md):
//   · ทีมขายผูกสิทธิ์ · ทีมปฏิบัติงานไม่แตะสิทธิ์เลย — ห้ามปนสองแกน
//   · ปิดทีม ไม่ใช่ลบทีม · ทีมที่ปิดแล้วต้องไม่หายจากจอ
//   · ถัง "ยังไม่อยู่ทีมไหน" ต้องมีเสมอ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TEAM_CODE_MAX,
  allowedKindsFor,
  closeTeamBlocker,
  normalizeTeamCode,
  normalizeTeamInput,
  otherTeamCodes,
  planCrewRoster,
  teamNameOf,
  sortTeams,
  suggestTeamCode,
  teamHref,
  teamMoveEffects,
  unassignedMembers,
} from './teams.js';
import { canManageTeams } from '@/lib/permissions';

test('⭐ ฝ่ายอื่นสร้างทีมขายไม่ได้ — ทีมขายผูกสิทธิ์ของฝ่ายขาย', () => {
  assert.deepEqual(allowedKindsFor('SA'), ['sales', 'crew']);
  assert.deepEqual(allowedKindsFor('TS'), ['crew']);
  const bad = normalizeTeamInput({ name: 'ทีม A', kind: 'sales' }, { department: 'TS' });
  assert.match(bad.error, /ทีมขาย/);
  const ok = normalizeTeamInput({ name: 'ทีม A' }, { department: 'TS' });
  assert.equal(ok.error, null);
  assert.equal(ok.value.kind, 'crew', 'ฝ่ายที่ไม่ใช่ขาย ตั้งต้นเป็นทีมปฏิบัติงาน');
});

test('ต้องมีชื่อทีมและฝ่ายเสมอ', () => {
  assert.match(normalizeTeamInput({}, { department: 'TS' }).error, /ชื่อทีม/);
  assert.match(normalizeTeamInput({ name: 'ทีม A' }, {}).error, /ฝ่าย/);
});

test('รหัสทีมมีฝ่ายนำหน้า และไม่ชนของเดิม', () => {
  assert.equal(suggestTeamCode('TS', 'ทีม A'), 'TS-A', 'ตัดภาษาไทยทิ้ง เหลือส่วนที่เป็น ASCII');
  assert.equal(suggestTeamCode('TS', 'Alpha'), 'TS-ALPHA');
  assert.equal(suggestTeamCode('TS', 'Alpha', ['TS-ALPHA']), 'TS-ALPHA-2');
  assert.equal(suggestTeamCode('TS', ''), 'TS');
});

/* 🐞 พบตอน UAT 2026-08-28: ตั้งทีมชื่อไทยล้วนได้รหัส `TS-UAT-ทีมกรุงเ` — ภาษาไทย
   หลุดเข้ารหัสแล้วถูก `.slice(0, 12)` **ตัดกลางคำ**
   รหัสนี้เป็น route param (`/api/teams/[code]`) และรหัสอื่นทั้งระบบเป็น ASCII ล้วน */
test('⭐ รหัสทีมต้องเป็น ASCII และไม่ตัดกลางคำ', () => {
  // ชื่อไทยล้วน = ไม่มีอะไรให้ทำรหัส ⇒ ถอยไปใช้เลขรันแบบเดียวกับทีมเดิม
  assert.equal(suggestTeamCode('TS', 'ทีมกรุงเทพตะวันออก'), 'TS');
  assert.equal(suggestTeamCode('TS', 'ทีมกรุงเทพตะวันออก', ['TS']), 'TS-2');
  assert.equal(suggestTeamCode('TS', 'ทีมกรุงเทพ', ['TS', 'TS-2']), 'TS-3');

  // ยาวเกินเพดาน = ตัดที่ **ขอบคำ** ไม่ใช่กลางคำ
  assert.equal(suggestTeamCode('TS', 'Bangkok East Crew Alpha'), 'TS-BANGKOK-EAST');

  // ไม่มีตัวอักษรไทยหลงเข้ารหัสได้อีกไม่ว่าชื่อจะเป็นอะไร
  for (const name of ['[UAT] ทีมกรุงเทพตะวันออก', 'ทีม A ภาคเหนือ', 'สาย 2']) {
    assert.doesNotMatch(suggestTeamCode('TS', name), /[\u0e00-\u0e7f]/, name);
  }
});

test('⭐ ทีมที่ยังมีคนอยู่ ปิดไม่ได้ และต้องบอกเหตุ ไม่ใช่แค่ปฏิเสธ', () => {
  const team = { code: 'TS-A', isActive: true };
  assert.match(closeTeamBlocker(team, { memberCount: 3 }), /ยังมีสมาชิก 3 คน/);
  assert.equal(closeTeamBlocker(team, { memberCount: 0 }), '');
  assert.equal(closeTeamBlocker({ ...team, isActive: false }, { memberCount: 5 }), '', 'ทีมที่ปิดแล้วไม่ต้องบล็อกซ้ำ');
});

test('⭐ ทีมที่ปิดแล้วไปกองท้าย แต่ไม่หายจากจอ', () => {
  const rows = sortTeams([
    { code: 'C', name: 'ซี', sortOrder: 30, isActive: true },
    { code: 'X', name: 'เอ็กซ์', sortOrder: 5, isActive: false },
    { code: 'A', name: 'เอ', sortOrder: 10, isActive: true },
  ]);
  assert.deepEqual(rows.map((r) => r.code), ['A', 'C', 'X']);
});

test('⭐ ถัง "ยังไม่อยู่ทีมไหน" นับเฉพาะคนในฝ่ายนั้น', () => {
  const users = [
    { id: 'U1', department: 'TS' },
    { id: 'U2', department: 'TS' },
    { id: 'U3', department: 'SA' },
  ];
  const rows = unassignedMembers(users, [{ userId: 'U1', teamCode: 'TS-A' }], 'TS');
  assert.deepEqual(rows.map((u) => u.id), ['U2']);
});

test('⭐ ย้ายทีมต้องบอกของที่ค้าง ไม่ใช่ย้ายให้เงียบ ๆ', () => {
  const rows = teamMoveEffects({ openDeals: 7, futureTargets: 4, sharedDocs: 12 });
  assert.equal(rows.length, 3);
  assert.match(rows[0].text, /7 ใบ/);
  assert.match(rows[1].text, /4 เดือน/);
  assert.match(rows[2].text, /12 ไฟล์/);
  assert.deepEqual(teamMoveEffects({}), [], 'ไม่มีอะไรค้าง = ไม่ต้องขู่');
});

// ── ด่านสิทธิ์ ───────────────────────────────────────────────────────────
test('⭐ จัดทีมได้เฉพาะฝ่ายตัวเอง — และ "ผู้ช่วย" คือคนที่ถูก grant', () => {
  const assistant = { role: 'ts', department: 'TS', extraCaps: ['team:manage'] };
  assert.equal(canManageTeams(assistant, 'TS'), true);
  assert.equal(canManageTeams(assistant, 'SA'), false);
  assert.equal(canManageTeams({ role: 'ts', department: 'TS' }, 'TS'), false, 'ไม่ได้ grant = ทำไม่ได้');
});

test('⭐ หัวหน้าฝ่ายขายจัดทีมเจ้าหน้าที่บริการไม่ได้ — isSuperuser ไม่ใช่ด่านของเรื่องนี้', () => {
  const salesHead = { role: 'ae_supervisor', department: 'SA' };
  assert.equal(canManageTeams(salesHead, 'SA'), true);
  assert.equal(canManageTeams(salesHead, 'TS'), false);
  assert.equal(canManageTeams({ role: 'admin', department: 'AD' }, 'TS'), true, 'admin ข้ามฝ่ายได้');
});

test('⚠️ ฝ่ายว่างต้องไม่ "ตรงกัน" กับฝ่ายว่าง — บั๊กรูปเดิมของการเทียบทีม', () => {
  assert.equal(canManageTeams({ role: 'pc', extraCaps: ['team:manage'] }, ''), false);
  assert.equal(canManageTeams({ role: 'pc', extraCaps: ['team:manage'] }, null), false);
  assert.equal(canManageTeams({ role: 'ts', department: 'TS', extraCaps: ['team:manage'] }, null), false);
});

// ── จัดสมาชิกทีมปฏิบัติงานในการกดครั้งเดียว (มติ 2026-09-06) ────────────────
/* 🐞 ของเดิมตีกลับทั้งชุดถ้ามีคนของทีมอื่นปนมา ⇒ ย้ายเจ้าหน้าที่หนึ่งคนต้องกดสองรอบ
   สองหน้า และ **ระหว่างสองรอบนั้นเขาไม่มีทีมเลย** (หลุดจากทุกคิวงาน) */
test('⭐ ติ๊กคนที่อยู่ทีมอื่น = ย้ายให้ ไม่ใช่ตีกลับทั้งชุด', () => {
  const existing = [
    { teamCode: 'TS', userId: 'u1', userName: 'ภูวดล' },
    { teamCode: 'TS', userId: 'u2', userName: 'วีรชัย' },
    { teamCode: 'TS-2', userId: 'u3', userName: 'อภิสิทธิ์' },
  ];
  const plan = planCrewRoster({ code: 'TS', userIds: ['u1', 'u3'], existingMembers: existing });
  assert.deepEqual(plan.ids, ['u1', 'u3']);
  assert.deepEqual(plan.movedFrom.map((m) => m.userId), ['u3'], 'u3 ย้ายมาจาก TS-2');
  assert.deepEqual(plan.fromTeamCodes, ['TS-2']);
  assert.deepEqual(plan.leaving.map((m) => m.userId), ['u2'], 'u2 ถูกติ๊กออก');
  assert.deepEqual(plan.beforeIds, ['u1', 'u2']);
});

test('คนที่อยู่ทีมนี้อยู่แล้วต้องไม่ถูกนับว่า "ย้าย" — ไม่งั้นกดบันทึกทีไรก็รายงานว่าย้ายทั้งทีม', () => {
  const existing = [{ teamCode: 'TS', userId: 'u1' }, { teamCode: 'TS', userId: 'u2' }];
  const plan = planCrewRoster({ code: 'TS', userIds: ['u1', 'u2'], existingMembers: existing });
  assert.deepEqual(plan.movedFrom, []);
  assert.deepEqual(plan.leaving, []);
});

test('รายชื่อซ้ำ/ช่องว่างถูกกรองทิ้งก่อนเสมอ', () => {
  const plan = planCrewRoster({ code: 'TS', userIds: ['u1', 'u1', ' ', '', 'u2'], existingMembers: [] });
  assert.deepEqual(plan.ids, ['u1', 'u2']);
});

// ── ลิงก์ไปหน้าทีม (เส้นทางใหม่ 2026-09-06) ───────────────────────────────
/* ⚠️ ฝ่ายที่ไม่มีหน้าทะเบียนของตัวเองต้องคืน null — แถวที่ลิงก์ไป path เดา ๆ จะพา 404 */
test('teamHref: มีเฉพาะฝ่ายที่มีหน้าจริง', () => {
  assert.equal(teamHref('SA', 'KA'), '/sa/teams/KA');
  assert.equal(teamHref('TS', 'TS-2'), '/service/teams/TS-2');
  assert.equal(teamHref('PC', 'X'), null, 'ฝ่ายที่ยังไม่มีหน้าทะเบียน');
  assert.equal(teamHref('SA', ''), null);
});

// ── ป้ายทีมฝั่งเซิร์ฟเวอร์ (2026-09-07) ──────────────────────────────────
/* 🔴 **ไม่รู้จัก = รหัสดิบ ห้ามถอยไป `TEAM_LABELS`** — แมปมาจากฐานสด ถ้ามีรหัสนั้น
   ก็คือชื่อจริง · ถอยไปค่าคงที่มีผลเฉพาะตอนอ่านฐานพลาด ซึ่งตอนนั้นรหัสดิบคือความจริง
   ส่วนชื่อเก่าคือคำโกหกที่ดูเหมือนปกติ (ทีมที่เปลี่ยนชื่อจะพิมพ์ชื่อเก่าลง Excel ตลอดไป) */
test('⭐ teamNameOf: ทะเบียนก่อน · ไม่รู้จักคืนรหัสดิบ ไม่ใช่ชื่อจากค่าคงที่', () => {
  const names = new Map([['KA', 'คีย์แอคเคาต์ (ทะเบียน)'], ['SA-NORTH', 'ทีมภาคเหนือ']]);
  assert.equal(teamNameOf(names, 'KA'), 'คีย์แอคเคาต์ (ทะเบียน)');
  assert.equal(teamNameOf(names, 'SA-NORTH'), 'ทีมภาคเหนือ', 'ทีมที่สร้างใหม่ต้องมีชื่อ');
  assert.equal(teamNameOf(names, 'ODM'), 'ODM', 'อยู่ในค่าคงที่แต่ไม่อยู่ในทะเบียน = รหัสดิบ');
  assert.equal(teamNameOf(null, 'KA'), 'KA', 'อ่านฐานไม่ได้ = รหัสดิบ');
  assert.equal(teamNameOf(new Map(), ''), '', 'ไม่มีรหัส = คืนค่าที่รับมาตามเดิม');
  assert.equal(teamNameOf(new Map(), null), null);
});

// ── รหัสทีมที่คนพิมพ์เอง (มติผู้ใช้ 2026-09-07) ────────────────────────────
/* ⭐ ของเดิมรหัสมาจาก `suggestTeamCode` อย่างเดียว ⇒ ชื่อไทยล้วนได้ `SA` · `SA-2`
   ซึ่งอ่านไม่ออกว่าเป็นทีมไหน — และมันคือรหัสที่ถูกก๊อปลง 20+ คอลัมน์ตลอดไป
   ⚠️ ตัวตรวจตัวนี้ถูกเรียกทั้งฝั่งจอ (บอกตอนพิมพ์) และฝั่งเซิร์ฟเวอร์ (ด่านจริง) */
test('⭐ รหัสที่ตั้งเองต้องขึ้นต้นด้วยฝ่าย และเป็น A-Z 0-9 ขีด เท่านั้น', () => {
  assert.deepEqual(normalizeTeamCode('sa-north', { department: 'SA' }), { value: 'SA-NORTH', error: null },
    'ตัวพิมพ์เล็กยกเป็นใหญ่ให้ ไม่ใช่ตีกลับ');
  assert.match(normalizeTeamCode('NORTH', { department: 'SA' }).error, /ขึ้นต้นด้วย SA-/);
  /* 🐞 ไทยเคยหลุดเข้ารหัสมาแล้วครั้งหนึ่ง (`TS-UAT-ทีมกรุงเ`) — รหัสเป็น route param
     และถูกเขียนลงไฟล์ export ⇒ ต้อง ASCII ล้วน */
  assert.match(normalizeTeamCode('SA-เหนือ', { department: 'SA' }).error, /A-Z/);
  assert.match(normalizeTeamCode('SA NORTH', { department: 'SA' }).error, /A-Z/, 'ช่องว่างก็ไม่ได้');
  assert.match(normalizeTeamCode('SA-', { department: 'SA' }).error, /ขีด/);
  assert.match(normalizeTeamCode('SA--NORTH', { department: 'SA' }).error, /ขีด/);
  assert.match(normalizeTeamCode('', { department: 'SA' }).error, /ต้องระบุรหัสทีม/);
  assert.match(normalizeTeamCode(`SA-${'X'.repeat(TEAM_CODE_MAX)}`, { department: 'SA' }).error, /ยาวเกิน/);
});

/* 🔴 `<ฝ่าย>-<เลข>` เป็นรูปที่ `suggestTeamCode` จองไว้เป็นตัวหนีรหัสซ้ำ — คนจองไปเอง
   แปลว่ารอบหน้าตัวสร้างอัตโนมัติวิ่งชนแล้วต้องข้ามไปเรื่อย ๆ */
test('🔴 รูป <ฝ่าย>-<เลข> จองไว้ให้ตัวสร้างอัตโนมัติ ตั้งเองไม่ได้', () => {
  assert.match(normalizeTeamCode('SA-2', { department: 'SA' }).error, /อัตโนมัติ/);
  assert.equal(normalizeTeamCode('SA-2ND', { department: 'SA' }).error, null, 'มีตัวอักษรปนแล้วไม่ใช่รูปที่จอง');
});

test('รหัสซ้ำของเดิมไม่ได้ — และตอนแก้ต้องไม่นับรหัสของตัวเองเป็นซ้ำ', () => {
  const existingCodes = ['SA-NORTH', 'KA'];
  assert.match(normalizeTeamCode('SA-NORTH', { department: 'SA', existingCodes }).error, /ถูกใช้ไปแล้ว/);
  /* จอส่ง existingCodes ที่กรองรหัสของทีมที่กำลังแก้ออกแล้ว — ไม่งั้นกดบันทึกโดยไม่เปลี่ยน
     รหัสจะโดนบอกว่า "ซ้ำกับตัวเอง" */
  assert.equal(normalizeTeamCode('SA-NORTH', { department: 'SA', existingCodes: ['KA'] }).error, null);
});

test('ไม่มีฝ่าย = ตรวจต่อไม่ได้ ต้องบอก ไม่ใช่ปล่อยผ่าน', () => {
  assert.match(normalizeTeamCode('SA-NORTH', {}).error, /ฝ่าย/);
});

/* 🐞 **บั๊กที่รอบตรวจปฏิปักษ์จับได้ก่อน merge (2026-09-07)** — ฟอร์มเคยกรองรายการรหัสที่มีอยู่
   ด้วย **ค่าที่กำลังพิมพ์** ⇒ รหัสที่ซ้ำถูกตัดออกจากลิสต์เสมอ ⇒ สาขา "รหัสถูกใช้ไปแล้ว"
   ของ `normalizeTeamCode` ไม่มีวันทำงาน ⇒ ผู้ใช้พิมพ์รหัสที่มีอยู่แล้ว เห็นแค่ปุ่มดับ
   โดยไม่มีอะไรบอกว่าทำไม (ผิดกฎ GatedAction: ติดด่าน = โชว์แล้วบอกเหตุ)
   ⇒ ตัวกรองต้องผูกกับ **รหัสเดิมของทีม** ไม่ใช่ค่าที่พิมพ์ */
test('🔴 otherTeamCodes: กรองด้วยรหัสเดิมของทีม ไม่ใช่ค่าที่พิมพ์', () => {
  const all = ['KA', 'ODM', 'SV', 'SA-NORTH'];
  // ตอนสร้าง: ไม่มีรหัสเดิม ⇒ ทุกตัวยังนับเป็น "ถูกใช้แล้ว"
  assert.deepEqual(otherTeamCodes(all, null), all);
  assert.deepEqual(otherTeamCodes(all, ''), all);
  // ตอนแก้: ตัดเฉพาะรหัสของทีมที่กำลังแก้
  assert.deepEqual(otherTeamCodes(all, 'SA-NORTH'), ['KA', 'ODM', 'SV']);
  assert.deepEqual(otherTeamCodes(all, 'sa-north'), ['KA', 'ODM', 'SV'], 'ตัวพิมพ์เล็กต้องตรงกัน');
});

test('🔴 พิมพ์รหัสที่มีอยู่แล้วต้องได้ข้อความ ไม่ใช่ปุ่มดับเงียบ', () => {
  const all = ['KA', 'ODM', 'SV', 'SA-NORTH', 'SA-EAST'];
  // สร้างทีมใหม่แล้วพิมพ์รหัสที่มีอยู่ = ต้องฟ้อง
  assert.match(
    normalizeTeamCode('SA-NORTH', { department: 'SA', existingCodes: otherTeamCodes(all, null) }).error,
    /ถูกใช้ไปแล้ว/,
  );
  // แก้ทีม SA-NORTH โดยไม่เปลี่ยนรหัส = ต้องไม่ฟ้องว่าซ้ำกับตัวเอง
  assert.equal(
    normalizeTeamCode('SA-NORTH', { department: 'SA', existingCodes: otherTeamCodes(all, 'SA-NORTH') }).error,
    null,
  );
  /* แก้ทีม SA-NORTH ไปชนรหัสของทีมอื่น = ต้องฟ้อง
     ⚠️ ต้องใช้รหัสที่ **ผ่านด่านคำนำหน้าแล้ว** ไม่งั้นจะโดนตีกลับด้วยเหตุอื่นก่อน
     แล้วเทสต์ผ่านโดยไม่ได้ตรวจสิ่งที่ตั้งใจตรวจ */
  assert.match(
    normalizeTeamCode('SA-EAST', { department: 'SA', existingCodes: otherTeamCodes(all, 'SA-NORTH') }).error,
    /ถูกใช้ไปแล้ว/,
  );
});

/* 🔴 ยามของรูปแบบที่พลาดมาแล้ว — ฟอร์มห้ามกรองลิสต์ด้วยค่าที่พิมพ์อีก
   เทสต์ตรรกะข้างบนจับไม่ได้ เพราะมันป้อนลิสต์ที่กรองมาแล้วให้เอง (ซึ่งเป็นเหตุที่บั๊กเดิม
   รอดเทสต์มาได้) ⇒ ต้องดูที่ตัวไฟล์ */
test('🔴 TeamFormFields ต้องกรองด้วย ownCode ไม่ใช่ value.code', () => {
  const src = readFileSync(new URL('../../components/teams/TeamFormFields.js', import.meta.url), 'utf8');
  assert.match(src, /otherTeamCodes\(existingCodes, ownCode\)/);
  assert.doesNotMatch(src, /existingCodes\.filter\(/, 'กรองด้วยค่าที่พิมพ์ = ข้อความ "รหัสซ้ำ" ตายสนิท');
});
