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

/* 🔴 **ด่านลบนัดของแอดมิน** (ผู้ใช้แจ้ง 2026-09-02 "แอดมินลบแล้วติดนู่นนี่")
   นัดที่ปิดงานแล้วคือประวัติการเข้าไซต์ ⇒ ห้ามลบเป็นค่าตั้งต้น · แต่มติ #1501
   ("ขอสิทธิ์ทุกอย่างให้แอดมิน รวมลบด้วย") ให้แอดมินข้ามได้ด้วย `?force=1`
   ⚠️ เทสต์นี้ปักไว้ว่า **ต้องมีทั้งสองเงื่อนไขคู่กัน** — เหลือแค่ `isForceRequest`
      อย่างเดียวเมื่อไร ใครก็ตามที่แก้นัดได้จะลบประวัติทิ้งได้ด้วยการต่อ ?force=1
      ท้าย URL เอง ซึ่งเป็นช่องที่ไม่มีอะไรฟ้องเลย */
test('🔴 ลบนัดที่ปิดงานแล้วต้องเป็นแอดมิน **และ** ส่ง ?force=1 มาคู่กัน', () => {
  const src = readFileSync(new URL('../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');
  assert.match(src, /isForceRequest\(req\)\s*&&\s*canForceDelete\(user\)/,
    'ต้องเช็คทั้งธงและสิทธิ์ในนิพจน์เดียว');
  assert.match(src, /!canDeleteVisit\(before\)\s*&&\s*!force/,
    'ด่านสถานะต้องยอมให้ force ข้ามได้ ไม่ใช่บล็อกตายตัว');
  // ด่านสิทธิ์รายใบต้องยังอยู่ **ก่อน** force — force ข้ามได้แค่ด่านสถานะ
  assert.ok(src.indexOf('requireVisit(') < src.indexOf('isForceRequest('),
    'requireVisit ต้องมาก่อน — ไม่งั้น ?force=1 กลายเป็นทางข้ามสิทธิ์');
  assert.match(src, /แอดมินข้ามด่านประวัติ/,
    'audit ต้องอ่านออกว่าใบไหนถูกลบด้วยสิทธิ์พิเศษ');
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

/* 🔴 **ทุกเส้นลบของโมดูลบริการต้องมีทางลัดผู้ดูแลระบบ** (ผู้ใช้แจ้ง 2026-09-02)
   มติ #1501 ให้แอดมินลบได้ทุกอย่าง และ 9 route ทั่วระบบต่อ ?force=1 ไปแล้ว
   แต่โมดูลบริการไม่เคยต่อสักเส้น ⇒ แอดมินชนกำแพงทุกครั้งที่จะเก็บกวาด
   ⚠️ เทสต์นี้ปักไว้ทั้งชุด — เพิ่ม route ลบใหม่แล้วลืมต่อ จะรู้ตัวตรงนี้
      ไม่ใช่ตอนแอดมินไปกดแล้วติด */
test('🔴 route ลบของโมดูลบริการต้องรับ ?force=1 ของแอดมินครบทุกเส้น', () => {
  const ROUTES = [
    ['visits/[id]', 'นัด'],
    ['sites/[id]', 'ไซต์'],
    ['sites/[id]/zones/[zoneId]', 'โซน'],
    ['sites/[id]/assets/[assetId]', 'เครื่อง'],
  ];
  for (const [route, label] of ROUTES) {
    const src = readFileSync(new URL(`../../app/api/service/${route}/route.js`, import.meta.url), 'utf8');
    assert.match(src, /canForceDelete\(user\)/, `${label}: ต้องเช็คสิทธิ์แอดมิน`);
    assert.match(src, /isForceRequest\(req\)/, `${label}: ต้องรับธง ?force=1`);
    /* 🔴 ด่านสิทธิ์ต้องมาก่อน force เสมอ — force ข้ามได้แค่กฎธุรกิจ ไม่ใช่สิทธิ์
       สลับลำดับเมื่อไร ?force=1 กลายเป็นทางข้ามสิทธิ์ให้ใครก็ได้ */
    const guard = Math.min(
      ...['requireSite(', 'requireVisit('].map((fn) => {
        const i = src.indexOf(fn);
        return i === -1 ? Infinity : i;
      }),
    );
    assert.ok(guard < src.indexOf('isForceRequest('),
      `${label}: ด่านสิทธิ์ต้องมาก่อน force`);
  }
});

/* ทางลัดต้องมีพรีวิวคู่เสมอ — บังคับลบที่ไม่บอกว่าจะลบอะไรพ่วง คือการลบข้อมูล
   ของคนอื่นโดยที่คนกดไม่รู้ตัว (สามเส้นที่มี cascade จริง · นัดไม่มีลูกที่ RESTRICT) */
test('🔴 เส้นที่ลบพ่วงลูก ต้องมี ?dryRun=1 ให้พรีวิวก่อน', () => {
  for (const route of ['sites/[id]', 'sites/[id]/zones/[zoneId]', 'sites/[id]/assets/[assetId]']) {
    const src = readFileSync(new URL(`../../app/api/service/${route}/route.js`, import.meta.url), 'utf8');
    assert.match(src, /isDryRun\(req\)/, `${route}: ต้องรองรับพรีวิว`);
    assert.match(src, /Manifest\(supabase/, `${route}: พรีวิวต้องเดินเส้นเดียวกับตัวลบจริง`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   🔴 **ลบรอบเคยเป็นประตูหลังของด่านลบนัด** (ผู้ใช้แจ้ง 2026-09-02)

   ระบบห้ามลบนัดที่ปิดงานแล้ว โดยเขียนเหตุผลไว้เองว่า "ประวัติการเข้าไซต์คือของ
   มีค่าที่สุดของโมดูล" — แต่ด่านลบ *รอบ* ซึ่งเป็นแม่ของนัดพวกนั้นเป็น role ล้วน
   ⇒ ลบรอบได้ผลเสียแบบเดียวกัน เพราะ FK เป็น `ON DELETE SET NULL`:
   นัดยังอยู่ แต่ **ขาดจากรอบ** ⇒ คอลัมน์ "รอบที่เดิน n/N" กลายเป็น 0 ·
   โซ่ต่อรอบขาด · ตั้งรอบใหม่แล้วได้นัดซ้อนวันเดิม
   ═══════════════════════════════════════════════════════════════════════ */

test('🔴 รอบที่มีนัดปิดงานแล้วลบไม่ได้ — และคำต้องชี้ทางออกที่ถูก', async () => {
  const { planDeleteBlocker } = await import('./visitStatus.js');
  const open = [{ status: 'scheduled' }, { status: 'in_progress' }, { status: 'cancelled' }];
  assert.equal(planDeleteBlocker(open), null, 'รอบที่ยังไม่มีประวัติลบได้ตามปกติ');
  assert.equal(planDeleteBlocker([]), null);

  /* `partial`/`unable` = ไปถึงไซต์แล้วและได้ข้อสรุป ⇒ เป็นประวัติเท่ากับ `done`
     (ชุดเดียวกับที่ `canDeleteVisit` ใช้ — ตกไปตัวใดตัวหนึ่งคือรูรั่ว) */
  for (const status of ['done', 'partial', 'unable']) {
    const blocked = planDeleteBlocker([{ status: 'scheduled' }, { status }]);
    assert.ok(blocked, status);
    assert.match(blocked, /1 ครั้ง/, `${status}: ต้องบอกจำนวน ไม่ใช่ปฏิเสธลอย ๆ`);
    // ⚠️ ต้องชี้ **ตัวคุมที่มีอยู่จริง** — เคยบอกให้ใช้ปุ่ม "ปิดใช้งานรอบ" ซึ่งไม่มีอยู่
    assert.match(blocked, /เปิดใช้งาน/, `${status}: ต้องชี้ทางออกที่ได้ผลเท่ากันโดยประวัติไม่ขาด`);
  }
});

test('🔴 ลบรอบที่มีประวัติต้องเป็นแอดมิน **และ** ส่ง ?force=1 มาคู่กัน', () => {
  const src = readFileSync(new URL('../../app/api/service/plans/[id]/route.js', import.meta.url), 'utf8');
  assert.match(src, /planDeleteBlocker\(visits \|\| \[\]\)/, 'ต้องถามตัวตัดสินตัวเดียวกับที่จอถาม');
  assert.match(src, /if \(blocked && !\(isForceRequest\(req\) && admin\)\) return conflict\(blocked\)/,
    'ด่านต้องยอมให้ force ข้ามได้ ไม่ใช่บล็อกตายตัว');
  // ด่านสิทธิ์ต้องมาก่อน force — ไม่งั้น ?force=1 กลายเป็นทางข้ามสิทธิ์
  assert.ok(src.indexOf('requirePlan(') < src.indexOf('isForceRequest('),
    'requirePlan ต้องมาก่อน');
  assert.match(src, /แอดมินข้ามด่านประวัติ/, 'audit ต้องอ่านออกว่ารอบไหนถูกลบด้วยสิทธิ์พิเศษ');
});

/* 🪤 จอเคยสัญญากับผู้ใช้ไว้สามจุดว่า "ลบได้ นัดจะอยู่ต่อ" — แก้ด่านแล้วไม่แก้คำ
   = จอโกหก · และปุ่มต้องเดินเส้น force เดียวกับโซน/เครื่อง/ไซต์ ไม่ใช่ยิง DELETE ดิบ */
test('หน้าไซต์: ปุ่มลบรอบเดินเส้นบังคับลบเดียวกับของอื่น และคำไม่โกหก', () => {
  const page = readFileSync(new URL('../../app/service/sites/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /deleteWithForce\(`\/api\/service\/plans\/\$\{pendingDelete\.row\.id\}`, \{ isAdmin \}\)/);
  assert.match(page, /detail: "รอบที่มีนัดปิดงานแล้วจะลบไม่ได้/, 'กล่องยืนยันต้องบอกด่านใหม่');
  assert.match(page, /เปิดใช้งาน/, 'ต้องชี้ตัวคุมที่มีอยู่จริงในกล่องยืนยัน');
});

/* ⚠️ พรีวิวของแอดมินต้องไม่บอกว่า "จะลบนัด N ใบ" — FK เป็น SET NULL นัดไม่ถูกลบ
   สิ่งที่เกิดคือมันขาดจากรอบ ซึ่งเป็นคนละเรื่องและต้องพูดให้ตรง */
test('พรีวิวบังคับลบรอบต้องพูดเรื่อง "ขาดจากรอบ" ไม่ใช่ "ถูกลบ"', () => {
  const src = readFileSync(new URL('./forceDeleteService.js', import.meta.url), 'utf8');
  assert.match(src, /export async function planForceManifest/);
  assert.match(src, /cascade: \[\]/, 'ไม่มีอะไรถูกลบพ่วง — ใส่รายการจะโกหก');
  assert.match(src, /ไม่ถูกนับเป็นรอบตามข้อผูกพัน/);
});
