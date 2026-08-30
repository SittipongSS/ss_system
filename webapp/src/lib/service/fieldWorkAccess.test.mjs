// ── เจ้าหน้าที่หน้างานทำงานของตัวเองได้ แต่ไม่ใช่ของคนอื่น (มติผู้ใช้ 2026-08-30) ──
//
// ⭐ ฝ่าย TS มีห้าตำแหน่ง: เจ้าหน้าที่หน้างาน (`ts`) · Planner · Senior · Audit · ผู้ช่วยผู้จัดการ
//    "ลงคิว/มอบหมายเจ้าหน้าที่" = Planner + หัวหน้า · เจ้าหน้าที่หน้างาน = **ปิดงานของตัวเอง + อ่านทะเบียน**
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canCreateServiceSite, canDoFieldWork, canEditService, canPickServiceSite, canUser,
  canViewService, canWorkOwnVisit,
} from '../permissions.js';
import {
  PLANNING_FIELD_ERROR, VISIT_PLANNING_FIELDS, planningFieldsIn, visitWriteAccess,
} from './visitAccess.js';

const tech = { id: 'U-TECH', role: 'ts', department: 'TS' };
const mate = { id: 'U-MATE', role: 'ts', department: 'TS' };
const planner = { id: 'U-PLAN', role: 'ts_planner', department: 'TS' };
const head = { id: 'U-HEAD', role: 'ts_manager', department: 'TS' };
const aeSv = { id: 'U-SV', role: 'ae', department: 'SA', team: 'SV', teams: ['SV'] };

const visitOf = (over = {}) => ({ id: 'SVV-1', assigneeId: 'U-TECH', ...over });

test('🔴 เจ้าหน้าที่หน้างานไม่ถือ service:edit — cap นั้นเปิดทั้งโมดูล', () => {
  /* 🐞 ถ้าเจ้าหน้าที่ถือ service:edit เขาจะแก้คิวของเพื่อน · แก้ทะเบียนไซต์/โซน/เครื่อง ·
     ผูกใบสั่งขายเข้าโซน · ลบนัด ได้ทั้งชุด ซึ่งเกินคำว่า "ปิดงานของตัวเอง" ไปไกล */
  assert.equal(canUser(tech, 'service:edit'), false);
  assert.equal(canUser(tech, 'service:work'), true);
  assert.equal(canEditService(tech), false);
  // แต่ยังอ่านทะเบียนได้ทั้งฝ่าย — เจ้าหน้าที่ต้องเปิดดูไซต์/โซน/เครื่องก่อนออกไปหน้างาน
  assert.equal(canViewService(tech), true);
});

test('Planner กับหัวหน้าแก้ตารางได้ · หัวหน้าได้สิทธิ์จัดทีมเพิ่มมาอีกตัว', () => {
  assert.equal(canEditService(planner), true);
  assert.equal(canEditService(head), true);
  assert.equal(canUser(planner, 'team:manage'), false);
  assert.equal(canUser(head, 'team:manage'), true);
  // Audit/Senior = ชุดเดียวกับผู้ช่วยผู้จัดการ (มติ: "Audit เหมือนหัวหน้าทุกอย่าง")
  for (const role of ['ts_audit', 'ts_senior']) {
    assert.equal(canUser({ role, department: 'TS' }, 'team:manage'), true, role);
  }
});

test('🔴 นัดของคนอื่น = แก้ไม่ได้ แม้จะอยู่ฝ่ายเดียวกัน', () => {
  assert.equal(canWorkOwnVisit(tech, visitOf()), true);
  assert.equal(canWorkOwnVisit(mate, visitOf()), false);
  // ไปกันสองคน = ปิดงานได้ทั้งคู่ ไม่ใช่รอคนที่ชื่ออยู่ช่องหลัก
  assert.equal(canWorkOwnVisit(mate, visitOf({ assistantIds: ['U-MATE'] })), true);
  // ไม่มีนัด/ไม่มีผู้ใช้ = false เสมอ (ห้ามเป็น true เพราะค่าว่างตรงกัน)
  assert.equal(canWorkOwnVisit(tech, visitOf({ assigneeId: null })), false);
  assert.equal(canWorkOwnVisit({ role: 'ts', department: 'TS' }, visitOf()), false);
  assert.equal(canWorkOwnVisit(tech, null), false);
});

test('🔴 คนนอกฝ่าย TS ไม่ผ่านทั้งด่านโมดูลและด่านรายใบ', () => {
  /* มติผู้ใช้ 2026-08-30: "ระบบธุรกิจบริการ เข้าใช้ได้เฉพาะ TS" — ทีมขาย SV ที่เคย
     ดูแลงานบริการแทนตอนฝ่ายยังไม่มีคน ถูกตัดออกทั้งเส้น */
  assert.equal(canEditService(aeSv), false);
  assert.equal(canViewService(aeSv), false);
  assert.equal(canWorkOwnVisit({ ...aeSv, id: 'U-TECH' }, visitOf()), false);
});

test('canDoFieldWork = "มีงานหน้างานของตัวเองไหม" — ใช้ตัดสินเมนู ไม่ใช่การเขียน', () => {
  assert.equal(canDoFieldWork(tech), true);
  assert.equal(canDoFieldWork(planner), true);
  assert.equal(canDoFieldWork(aeSv), false);
  assert.equal(canDoFieldWork({ role: 'wh', department: 'WH' }), false);
  assert.equal(canDoFieldWork(null), false);
});

/* ── ด่านรายใบที่ requireVisit ใช้จริง ─────────────────────────────────── */
const decide = (user, visit, canEditAll = false) => visitWriteAccess({ user, visit, canEditAll });

test('🔴 เจ้าหน้าที่เขียนใบของตัวเองได้ พร้อมธง ownWorkOnly', () => {
  const access = decide(tech, visitOf());
  assert.equal(access.ok, true);
  /* ⚠️ ธงนี้คือสิ่งที่บอก route ว่าต้อง **จำกัดช่องที่แก้ได้** — ถ้าลืมส่งต่อ เจ้าหน้าที่จะ
     เลื่อนวันนัดตัวเองและย้ายงานให้คนอื่นได้ ทั้งที่ลูกค้าถูกแจ้งวันไปแล้ว */
  assert.equal(access.ownWorkOnly, true);
});

test('🔴 ใบของคนอื่นถูกตีกลับพร้อมเหตุผลที่อ่านออก ไม่ใช่ forbidden เปล่า', () => {
  const access = decide(mate, visitOf());
  assert.equal(access.ok, false);
  assert.match(access.error, /ไม่ใช่งานของคุณ/);
});

test('คนที่แก้ได้ทั้งตาราง (Planner/หัวหน้า/ทีมขาย SV) ไม่ติดธง ownWorkOnly', () => {
  const access = decide(planner, visitOf(), true);
  assert.equal(access.ok, true);
  assert.equal(access.ownWorkOnly, false);
});

test('คนนอกที่ไม่มีสิทธิ์อะไรเลย = ปล่อยให้ด่านชั้นนอกตอบ ไม่ใช่ทับด้วยข้อความของเจ้าหน้าที่', () => {
  const access = decide({ id: 'U-WH', role: 'wh', department: 'WH' }, visitOf());
  assert.equal(access.ok, false);
  assert.equal(access.error, null);
});

test('🔴 ช่องของ "แผน" ต้องถูกจับได้ทุกตัว — ช่องผลงานหน้างานต้องไม่โดนจับ', () => {
  assert.deepEqual(planningFieldsIn({ scheduledDate: '2026-09-01' }), ['scheduledDate']);
  assert.deepEqual(planningFieldsIn({ assigneeId: 'U-X', status: 'done' }), ['assigneeId']);
  // ผลของการไป: สถานะ · เวลาเข้าจริง · เหตุผล · โน้ต — เจ้าหน้าที่ต้องกรอกได้
  assert.deepEqual(planningFieldsIn({
    status: 'unable', actualDate: '2026-09-01', actualStartTime: '09:00',
    unableReason: 'เข้าไม่ได้', note: 'ล็อบบี้ปิด', closeFromAssets: true,
  }), []);
  assert.deepEqual(planningFieldsIn(), []);
  // ⚠️ เพิ่มช่องแผนใหม่แล้วลืมเติมลิสต์ = เจ้าหน้าที่แก้ได้เงียบ ๆ
  for (const field of ['scheduledDate', 'assigneeId', 'assistantIds', 'siteId', 'kind']) {
    assert.ok(VISIT_PLANNING_FIELDS.includes(field), field);
  }
  assert.match(PLANNING_FIELD_ERROR, /ผู้จัดคิว/);
});

test('🔴 route ของนัดต้องเรียกด่านนี้จริง — กติกาที่ไม่มีใครเรียกคือกติกาที่ไม่มีอยู่', () => {
  const src = readFileSync(new URL('../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');
  assert.match(src, /access\.ownWorkOnly/);
  assert.match(src, /planningFieldsIn\(body\)/);
  assert.match(src, /PLANNING_FIELD_ERROR/);
});

/* ── สองจุดที่เจอตอนซ้อม UAT (2026-08-30) ────────────────────────────────── */
test('🔴 หน้า "งานวันนี้" ต้องเปิดปุ่มเริ่ม/ปิดงานให้เจ้าหน้าที่หน้างาน', () => {
  /* 🐞 หน้านี้เคยเช็ค `canEditService` ⇒ ตำแหน่ง Operation เห็นเมนู (เปิดด้วย
     canDoFieldWork) แต่ไม่มีปุ่มสักปุ่ม — ตำแหน่งที่ตั้งใจให้ปิดงานของตัวเองได้
     กลับใช้งานไม่ได้ทั้งตำแหน่ง */
  const src = readFileSync(new URL('../../app/service/today/page.js', import.meta.url), 'utf8');
  assert.match(src, /canDoFieldWork\(\{ role, team, teams, department \}\)/);
  assert.doesNotMatch(src, /canEditService\(\{ role/);
});

test('🔴 เมนู "จัดทีม" ของบริหารงานขาย ต้องไม่โผล่ให้หัวหน้าฝ่ายอื่น', () => {
  /* 🐞 เมนูกั้นด้วย cap `team:manage` ล้วน ⇒ พอหัวหน้าฝ่าย TS ได้ cap นี้ เมนูก็โผล่
     แล้วกดเข้าไปเจอ "ดูทีมของฝ่ายอื่นไม่ได้" ทุกครั้ง */
  const src = readFileSync(new URL('../../components/AppLayout.js', import.meta.url), 'utf8');
  assert.match(src, /href: '\/sa\/teams'[\s\S]{0,140}visible: \(u\) => canManageTeams\(u, 'SA'\)/);
});

/* ── โมดูลเป็นของฝ่าย TS เท่านั้น (มติผู้ใช้ 2026-08-30) ───────────────────── */
test('🔴 ฝ่ายขายยังเลือก/สร้างสถานที่จากในใบคำร้องได้ แม้เข้าโมดูลไม่ได้แล้ว', () => {
  /* 🐞 ถ้าปิดทางอ่านนี้ไปด้วย ฟอร์มใบประเมินพื้นที่จะกางรายการสถานที่ไม่ได้เลย —
     ว่างเปล่าโดยไม่มีข้อความบอกว่าทำไม ทั้งที่ปุ่ม "สร้างสถานที่ใหม่" ยังอยู่ตรงนั้น */
  assert.equal(canViewService(aeSv), false);
  assert.equal(canPickServiceSite(aeSv), true);
  assert.equal(canCreateServiceSite(aeSv), true);
  // ฝ่าย TS เองก็ยังอ่านได้ตามปกติ
  assert.equal(canPickServiceSite(tech), true);
  // คนที่ไม่เกี่ยวเลยยังปิดสนิททั้งสองทาง
  assert.equal(canPickServiceSite({ role: 'wh', department: 'WH' }), false);
  assert.equal(canPickServiceSite({ role: 'viewer' }), false);
});

test('🔴 ด่านอ่านของฟอร์มใบคำร้องต้องถูกต่อจริงที่ route ไม่ใช่มีแต่ฟังก์ชัน', () => {
  const sites = readFileSync(new URL('../../app/api/service/sites/route.js', import.meta.url), 'utf8');
  assert.match(sites, /requireService\(\{ user, forRequestForm: true \}\)/);
  const zones = readFileSync(
    new URL('../../app/api/service/sites/[id]/zones/route.js', import.meta.url), 'utf8',
  );
  assert.match(zones, /forRequestForm: true/);
});
