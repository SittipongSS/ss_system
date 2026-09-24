// ── ทะเบียนไซต์/เครื่องใน /database ต้องเปิดอ่านได้ทุกคนที่เข้าฐานข้อมูล (มติผู้ใช้ 2026-09-24) ──
//
// *"ฐานข้อมูล ไซต์ เครื่อง เปิดให้ผู้ใช้ที่เข้าระบบฐานข้อมูลได้เห็นได้เลย เพราะตอนนี้บางคนเข้า
//  รายละเอียดแล้ว Forbidden"*
//
// 🐞 ต้นเหตุ: หน้า `/database/sites/[id]` โหลด **รอบบริการ + นัด** พร้อมตัวไซต์ แล้ว `throw` ทั้งหน้า
//    ถ้าตัวใดตัวหนึ่งไม่ผ่าน · สองเส้นนั้นยังใช้ด่านฝ่ายบริการ (`canViewService`) ⇒ ทุกตำแหน่งนอก TS
//    (ฝ่ายขาย · RD · บัญชี · โรงงาน · ผู้บริหาร) เปิดหน้าไซต์แล้วเจอ Forbidden ทั้งที่ทะเบียนอ่านได้
//    (ย้ายทะเบียนเข้าฐานข้อมูล 17/09 เปิดแค่เส้นของตัวไซต์ ลืมเส้นที่หน้าเดียวกันโหลดคู่กัน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROLES, canEditService, canUser, canViewService, canViewServiceRegistry, canViewVisitReport, isSalesRole,
} from '../permissions.js';
import { systemForPathname } from '../../config/navigation.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
const userOf = (role) => ({ role, department: role.startsWith('ts') ? 'TS' : 'SA', team: 'KA', teams: ['KA'] });
// ด่านเข้าระบบฐานข้อมูล = `isVisible` ของระบบ master ใน config/systems.js
const canEnterDatabase = (user) => canUser(user, 'customers:view') || canUser(user, 'products:view');

test('🔴 ทุกตำแหน่งที่เข้าระบบฐานข้อมูลได้ อ่านทะเบียนไซต์/เครื่องได้', () => {
  for (const role of ROLES) {
    const user = userOf(role);
    if (!canEnterDatabase(user)) continue;
    assert.ok(canViewServiceRegistry(user), `${role} เข้าฐานข้อมูลได้แต่อ่านทะเบียนไซต์ไม่ได้`);
  }
  assert.match(read('config/systems.js'), /isVisible: \(user\) => canUser\(user, 'customers:view'\) \|\| canUser\(user, 'products:view'\)/,
    'ด่านเข้าระบบฐานข้อมูลเปลี่ยน — ปรับ canEnterDatabase ในเทสต์นี้ให้ตรง');
});

test('ประชากรที่เคยเจอ Forbidden มีจริง — เข้าฐานข้อมูลได้แต่ไม่ใช่ฝ่ายบริการ', () => {
  const outsiders = ROLES.map(userOf).filter((u) => canEnterDatabase(u) && !canViewService(u));
  assert.ok(outsiders.some((u) => u.role === 'ae'), 'AE ต้องอยู่ในกลุ่มนี้ (ผู้ใช้หลักที่ต้องตอบลูกค้า)');
  assert.ok(outsiders.length > 5);
});

/* เส้นที่หน้าทะเบียนเรียก **ตอนโหลด** ต้องใช้ด่านทะเบียนทุกเส้น — เส้นเดียวที่แคบกว่า = หน้าล่มทั้งหน้า */
test('🔴 เส้นอ่านที่หน้าไซต์/โซน/เครื่อง/ลูกค้าใช้ตอนโหลด = ด่านทะเบียน', () => {
  assert.match(read('app/api/service/sites/[id]/route.js'), /export const GET[\s\S]*?requireSite\(\{ user, supabase, id, registry: true \}\)/);
  assert.match(read('app/api/service/sites/[id]/zones/[zoneId]/detail/route.js'), /registry: true/);
  assert.match(read('app/api/service/assets/[id]/detail/route.js'), /requireService\(\{ user, registry: true \}\)/);
  assert.match(read('app/api/service/customers/[customerId]/zones/route.js'), /requireService\(\{ user, registry: true \}\)/);
  // รอบ + นัด: ระบุไซต์ = ทะเบียน · ไม่ระบุ (คิว/ปฏิทินทั้งระบบ) = ยังเป็นของฝ่ายบริการ
  for (const rel of ['app/api/service/plans/route.js', 'app/api/service/visits/route.js']) {
    assert.match(read(rel),
      /siteId\s*\?\s*await requireSite\(\{ user, supabase, id: siteId, registry: true \}\)\s*:\s*requireService\(\{ user \}\)/, rel);
  }
});

test('⭐ นัดที่อ่านแบบทะเบียนได้แค่ตัวนัด — ภาระงาน/บริบทด่าน (จ่ายถึง · สัญญา) เป็นของ TS', () => {
  const src = read('app/api/service/visits/route.js');
  assert.match(src, /if \(!canViewService\(user\)\) return ok\(\{ visits, sites:/);
  assert.ok(src.indexOf('if (!canViewService(user))') < src.indexOf('visitBundle(supabase, visits)'),
    'ต้องตัดก่อนคำนวณ visitBundle');
});

test('🔴 หน้าไซต์: รอบ/นัดโหลดไม่ได้ ห้ามลากทั้งหน้าล่ม', () => {
  const page = read('app/database/sites/[id]/page.js');
  assert.doesNotMatch(page, /if \(!planRes\.ok\) throw/);
  assert.doesNotMatch(page, /if \(!visitRes\.ok\) throw/);
  assert.match(page, /setPlanError\(/);
  assert.match(page, /setVisitError\(/);
});

/* ใบส่งงาน (`/service/visits/[id]`) เปิดได้เฉพาะฝ่ายบริการ + ฝ่ายขาย (มติ 2026-09-24) — ลิงก์บนหน้าทะเบียน
   ต้องโชว์เฉพาะคนที่เปิดได้จริง (ไม่มีสิทธิ์ = ไม่โชว์) ไม่งั้นกดแล้วเจอ Forbidden อีกทาง */
test('🔴 ลิงก์ใบส่งงานบนหน้าทะเบียนผูกกับ canViewVisitReport (ด่านเดียวกับ API ของใบ)', () => {
  for (const rel of [
    'app/database/sites/[id]/page.js',
    'app/database/sites/[id]/zones/[zoneId]/page.js',
    'app/database/assets/[id]/page.js',
  ]) {
    const src = read(rel);
    assert.match(src, /const canOpenVisit = useMemo\(\s*\(\) => canViewVisitReport\(/, rel);
    // เฉพาะลิงก์ไปหน้าใบ (`/service/visits/…`) — ไม่นับเส้น API (`/api/service/visits/…`) ของปุ่มลบนัด
    for (const match of src.matchAll(/(?<!\/api)\/service\/visits\/\$\{/g)) {
      const before = src.slice(Math.max(0, match.index - 200), match.index);
      assert.match(before, /canOpenVisit/, `${rel}: ลิงก์ใบส่งงานที่ไม่ได้ผูก canOpenVisit`);
    }
  }
});

// ── ใบส่งงานเปิดให้ฝ่ายขายอ่านได้ (มติผู้ใช้ 2026-09-24 "ใบส่งงานเปิดให้ฝ่ายขายดูได้ด้วย") ─────────
test('⭐ อ่านใบส่งงาน = ฝ่ายบริการ + ฝ่ายขายทุกตำแหน่ง · ฝ่ายอื่นยังไม่ได้', () => {
  for (const role of ROLES) {
    const user = userOf(role);
    const expected = canViewService(user) || isSalesRole(role);
    assert.equal(canViewVisitReport(user), expected, role);
  }
  assert.ok(canViewVisitReport(userOf('ae')));
  assert.ok(canViewVisitReport(userOf('ac')));
  assert.ok(canViewVisitReport(userOf('ae_supervisor')));
  assert.ok(!canViewVisitReport(userOf('rd')), 'RD ไม่อยู่ในมติ');
  assert.ok(!canViewVisitReport(userOf('finance')), 'บัญชีไม่อยู่ในมติ');
  // อ่านอย่างเดียว — ฝ่ายขายไม่ได้สิทธิ์แก้งานบริการติดมาด้วย
  assert.ok(!canEditService(userOf('ae')));
});

test('🔴 API ของใบ: GET เท่านั้นที่รับฝ่ายขาย · PATCH/DELETE และเส้นย่อยยังเป็นด่านเดิม', () => {
  const route = read('app/api/service/visits/[id]/route.js');
  assert.match(route, /export const GET[\s\S]*?requireVisit\(\{ user, supabase, id, report: true \}\)/);
  // นับเฉพาะการเรียกจริง (`…, report: true })`) — คอมเมนต์ที่อธิบายสวิตช์ไม่นับ
  assert.equal((route.match(/requireVisit\(\{[^}]*report: true/g) || []).length, 1, 'report: true ต้องมีที่ GET ที่เดียว');
  assert.match(route, /export const PATCH[\s\S]*?requireVisit\(\{ user, supabase, id, edit: true \}\)/);
  assert.match(route, /export const DELETE[\s\S]*?requireVisit\(\{ user, supabase, id, edit: true \}\)/);
  for (const rel of ['app/api/service/visits/[id]/items/route.js', 'app/api/service/visits/[id]/assets/route.js']) {
    assert.doesNotMatch(read(rel), /report: true/, rel);
  }
  const repo = read('lib/service/visitsRepo.js');
  // ทางอ่านของฝ่ายขายต้องถูกข้ามเมื่อเป็นคำสั่งเขียน
  assert.match(repo, /if \(report && !edit && user && !canViewService\(user\) && canViewVisitReport\(user\)\)/);
});

test('⭐ ฝ่ายขายเปิดใบส่งงาน = คงเปลือกเมนูเดิม (ไม่สวมเปลือกบริการที่ไม่มีเมนู) · TS ยังได้เปลือกบริการ', () => {
  assert.equal(systemForPathname('/service/visits/SVV-1', userOf('ae')), null);
  assert.equal(systemForPathname('/service/visits/SVV-1', userOf('ts_manager')), 'service');
  // หน้าอื่นใต้ /service ไม่ได้รับข้อยกเว้นนี้ · ไม่ส่ง user = พฤติกรรมเดิม
  assert.equal(systemForPathname('/service/schedule', userOf('ae')), 'service');
  assert.equal(systemForPathname('/service/visits/SVV-1'), 'service');
});

test('หน้าใบส่งงาน: ทางออกของฝ่ายขายชี้หน้าที่เขาเปิดได้ (ไซต์ในฐานข้อมูล · ใบคำร้อง)', () => {
  const page = read('app/service/visits/[id]/page.js');
  assert.match(page, /if \(!serviceViewer\) \{\s*return \{ href: siteIdForBack \? `\/database\/sites\/\$\{siteIdForBack\}`/);
  assert.match(page, /href=\{serviceViewer \? `\/service\/surveys\/\$\{visit\.requestId\}` : `\/requests\/\$\{visit\.requestId\}`\}/);
});
