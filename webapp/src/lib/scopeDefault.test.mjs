// ── ค่าตั้งต้นของตัวสลับ "ของฉัน / ทีม / ทั้งหมด" ─────────────────────────────
//
// มติผู้ใช้ 2026-09-08: เปิดหน้ามาต้องเจอ "ของฉัน" เป็นหลัก · ไม่มีของฉันก็ "ทีม" ·
// ไม่มีทีมอีกก็ "ทั้งหมด" — แทนกติกาเดิม (2026-08-05) ที่ตั้งต้นที่ตัวกว้างสุดเสมอ
//
// ⚠️ "ไม่มี" ในที่นี้คือ **ไม่มีโดยโครงสร้าง** (ตำแหน่งนี้ถือแถวของตัวเองไม่ได้ /
// บัญชีนี้มีทีมไม่ได้) ไม่ใช่ "วันนี้ยังไม่มีแถว" — AE ที่เคลียร์คิวหมดต้องเห็น
// คิวของตัวเองว่าง ไม่ใช่ถูกพาไปดูของทีมเงียบ ๆ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ROLES, SCOPE_ORDER, defaultScope, leadScopes, salesDealScopes, userTeams,
} from './permissions.js';
import { pmTaskScopes } from './permissions.js';
import { REQUEST_SCOPES, canUseScope } from './requests/scope.js';
import { DEAL_HOLDER_ROLES } from './sales/dealOwner.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TEAM = { teams: ['ODM'] };            // ตำแหน่งขายที่มีทีม
const NO_TEAM = {};                          // ตำแหน่งที่ระบบไม่ให้มีทีม
const as = (role, extra = NO_TEAM) => ({ role, ...extra });

test('ลำดับขอบเขตคือ แคบ → กว้าง', () => {
  assert.deepEqual(SCOPE_ORDER, ['mine', 'team', 'all']);
});

/* ⭐ ตารางที่ผู้ใช้สั่งมาตรง ๆ — AE/Senior AE = ของฉัน · AC = ทีม · AE Sup/Admin = ทั้งหมด */
test('สายขาย (ดีล/ลีด/ปฏิทิน) ได้ค่าตั้งต้นตามมติผู้ใช้', () => {
  const cases = [
    ['ae', TEAM, 'mine'],
    ['senior_ae', TEAM, 'mine'],
    ['ac', TEAM, 'team'],
    ['ae_supervisor', NO_TEAM, 'all'],
    ['admin', NO_TEAM, 'all'],
  ];
  for (const [role, teams, want] of cases) {
    assert.equal(defaultScope(salesDealScopes(role), as(role, teams), 'deals'), want, `ดีล/${role}`);
    if (leadScopes(role).length) {
      assert.equal(defaultScope(leadScopes(role), as(role, teams), 'leads'), want, `ลีด/${role}`);
      assert.equal(defaultScope(leadScopes(role), as(role, teams), 'calendar'), want, `ปฏิทิน/${role}`);
    }
  }
});

/* marketing กรอกลีดเอง ⇒ มี "ของฉัน" จริงบนคิวลีด — แต่ปฏิทินเทียบ assigneeId
   อย่างเดียว (ไม่มี createdBy) เขาจึงไม่มีนัดของตัวเอง ⇒ ต้องไม่เปิดมาที่ "ของฉัน" */
test('marketing: ของฉันบนคิวลีด แต่ทั้งหมดบนปฏิทิน', () => {
  assert.equal(defaultScope(leadScopes('marketing'), as('marketing'), 'leads'), 'mine');
  assert.equal(defaultScope(leadScopes('marketing'), as('marketing'), 'calendar'), 'all');
});

test('ผู้สังเกตการณ์เหลือตัวเลือกเดียว ⇒ ได้ตัวนั้น', () => {
  for (const role of ['viewer', 'executive']) {
    assert.equal(defaultScope(salesDealScopes(role), as(role), 'deals'), 'all', role);
    assert.equal(defaultScope(leadScopes(role), as(role), 'leads'), 'all', role);
  }
});

test('คิวคำร้อง: คนทำงานได้ของฉัน · ผู้กำกับ/ผู้สังเกตการณ์ได้ทั้งหมด', () => {
  const scopesOf = (user) => REQUEST_SCOPES.filter((s) => canUseScope(user, s));
  for (const [role, teams, want] of [
    ['ae', TEAM, 'mine'],
    ['senior_ae', TEAM, 'mine'],
    ['ac', TEAM, 'mine'],          // AC เปิดใบเองเป็นงานประจำ ⇒ "ของฉัน" ไม่ว่าง
    ['rd', NO_TEAM, 'mine'],
    ['finance', NO_TEAM, 'mine'],
    ['ae_supervisor', NO_TEAM, 'all'],
    ['admin', NO_TEAM, 'all'],
  ]) {
    const user = as(role, teams);
    assert.equal(defaultScope(scopesOf(user), user, 'requests'), want, role);
  }
});

/* 🔴 ค่าตั้งต้นต้องอยู่ในลิสต์ที่ชั้นสิทธิ์ยอมให้เสมอ — ไม่งั้นได้ขอบเขตที่ API ตีกลับ */
test('ทุก role: ค่าตั้งต้นต้องเป็นสมาชิกของลิสต์ที่ได้รับอนุญาต', () => {
  for (const role of ROLES) {
    for (const [surface, list] of [
      ['deals', salesDealScopes(role)],
      ['leads', leadScopes(role)],
      ['calendar', leadScopes(role)],
    ]) {
      const picked = defaultScope(list, as(role, TEAM), surface);
      if (!list.length) { assert.equal(picked, null, `${role}/${surface}`); continue; }
      assert.ok(list.includes(picked), `${role}/${surface}: ได้ ${picked} ซึ่งไม่อยู่ใน ${list}`);
    }
  }
});

/* ⚠️ "ทีม" ต้องมาจาก userTeams จริง ไม่ใช่แค่ปุ่มโผล่ — superuser มีปุ่ม "ทีม"
   (canUseScope ปล่อยผ่าน) แต่ scopeFilter จะถอยกลับเป็นของตัวเอง ⇒ ห้ามตั้งต้นที่นั่น */
test('คนไม่มีทีมต้องไม่ถูกตั้งต้นที่ "ทีม"', () => {
  for (const role of ROLES) {
    const user = as(role);
    if (userTeams(user).length) continue;
    for (const [surface, list] of [
      ['deals', salesDealScopes(role)],
      ['leads', leadScopes(role)],
      ['requests', REQUEST_SCOPES.filter((s) => canUseScope(user, s))],
    ]) {
      assert.notEqual(defaultScope(list, user, surface), 'team', `${role}/${surface}`);
    }
  }
});

/* รายชื่อ "คนถือดีล" ถูกประกาศสองที่ (permissions.js ประกาศเองเพื่อไม่ให้ import
   วนกับ dealOwner.js) — ต้องตรงกันเสมอ ไม่งั้นค่าตั้งต้นกับด่านเจ้าของดีลเพี้ยนกัน */
test('SALES_ROW_HOLDER_ROLES ต้องตรงกับ DEAL_HOLDER_ROLES', () => {
  const src = readFileSync(join(ROOT, 'src/lib/permissions.js'), 'utf8');
  const m = src.match(/const SALES_ROW_HOLDER_ROLES = (\[[^\]]*\]);/);
  assert.ok(m, 'หา SALES_ROW_HOLDER_ROLES ไม่เจอ');
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), DEAL_HOLDER_ROLES);
});

test('สี่จอใช้ตัวกลางตัวเดียวกัน ไม่คำนวณค่าตั้งต้นเอง', () => {
  for (const page of [
    'src/app/sales-planning/deals/page.js',
    'src/app/sales-planning/leads/page.js',
    'src/app/sa/calendar/page.js',
    'src/app/requests/page.js',
  ]) {
    const src = readFileSync(join(ROOT, page), 'utf8');
    assert.match(src, /defaultScope\(/, page);
    assert.doesNotMatch(src, /Scopes\.length - 1\]|scopes\[scopes\.length - 1\]/, `${page}: ยังตั้งต้นที่ตัวกว้างสุด`);
  }
});

/* 🐞 ลิงก์ "ดูคำร้อง" จากหน้าดีลมาเป็น `?dealId=` ไม่มี `?tab=` — คำร้องของดีลใบหนึ่ง
   เปิดโดยใครก็ได้ในทีม (AC เปิดแทน AE) แต่ "ของฉัน" ฝั่ง API = requestedById ของเรา
   ⇒ ค่าตั้งต้นแคบทำให้กดจากหน้าดีลแล้วเจอรายการว่างใต้หัวข้อ "คำร้องของดีล … เท่านั้น" */
test('คิวคำร้อง: มาจากหน้าดีล (?dealId=) ต้องได้ขอบเขตกว้างสุด ไม่ใช่ defaultScope', () => {
  const src = readFileSync(join(ROOT, 'src/app/requests/page.js'), 'utf8');
  assert.match(src, /if \(dealIdParam\) return allowed\[allowed\.length - 1\] \|\| "mine";/,
    'ลิงก์จากหน้าดีลต้องถอยไปขอบเขตกว้างสุด');
  const declAt = src.indexOf('const dealIdParam = searchParams.get("dealId")');
  const scopeAt = src.indexOf('const [scope, setScope] = useState(');
  assert.ok(declAt > -1 && declAt < scopeAt, 'dealIdParam ต้องประกาศก่อน state ของขอบเขต');
});

/* 🔴 ค่าตั้งต้นที่แคบลงทำให้จอแรกวิ่งผ่านสาขา "ของฉัน" ตั้งแต่ก่อน id ของผู้ใช้มาถึง —
   เพรดิเคตต้อง **ปิดไว้ก่อน** ไม่งั้นเห็นของทั้งทีมใต้ป้าย "ของฉัน" ชั่วครู่
   (และลีดที่ยังไม่คัดกรองมี assigneeId = null ⇒ null === null ผ่านตัวกรองไปหมด) */
test('เพรดิเคต "ของฉัน" ทุกจอต้องปิดไว้ก่อนระหว่างที่ยังไม่รู้ว่าเราเป็นใคร', () => {
  const leads = readFileSync(join(ROOT, 'src/app/sales-planning/leads/page.js'), 'utf8');
  assert.match(leads, /activeScope === "mine"\) return !!meId && \(l\.assigneeId === meId \|\| l\.createdBy === meId\)/);
  assert.match(leads, /activeScope === "mine" && !\(meId && \(l\.assigneeId === meId \|\| l\.createdBy === meId\)\)/);
  const deals = readFileSync(join(ROOT, 'src/app/sales-planning/deals/page.js'), 'utf8');
  assert.match(deals, /activeScope === "mine"\) return !!me\?\.id &&/);
  const calendar = readFileSync(join(ROOT, 'src/app/sa/calendar/page.js'), 'utf8');
  assert.match(calendar, /activeScope === "mine"\) return !!meId &&/);
});

/* หน้า "งานของฉัน" (/pm/tasks) — `mine` ที่นี่นับ **คนที่มอบหมายให้คนอื่น** ด้วย
   ⇒ แอดมิน/หัวหน้าฝ่ายมีงานของตัวเองจริง ต่างจากคิวคำร้อง · เหลือแต่ผู้สังเกตการณ์
   ที่ไม่มีงานเลยและมีขอบเขตเดียวคือ "ทั้งหมด" */
test('คิวงาน: ทุกตำแหน่งที่มีงานของตัวเองได้ "ของฉัน" · ผู้สังเกตการณ์ได้ "ทั้งหมด"', () => {
  for (const role of ROLES) {
    const want = ['viewer', 'executive'].includes(role) ? 'all' : 'mine';
    assert.equal(defaultScope(pmTaskScopes(role), as(role, TEAM), 'tasks'), want, role);
  }
});

/* จอกับ API ต้องตอบตรงกันตั้งแต่รอบแรก — ของเดิมจอฝัง "mine" ไว้ตายตัวแล้วให้ API
   แก้ค่าให้ทีหลัง ⇒ ผู้สังเกตการณ์โหลดสองรอบทุกครั้งที่เข้าหน้า */
test('คิวงาน: จอกับ API ใช้ defaultScope ตัวเดียวกัน ไม่ฝังค่าตายตัว', () => {
  const page = readFileSync(join(ROOT, 'src/app/pm/tasks/page.js'), 'utf8');
  assert.match(page, /useStickyState\("scope", defaultScope\(pmTaskScopes\(role\), \{ role \}, "tasks"\)\)/);
  const route = readFileSync(join(ROOT, 'src/app/api/pm/my-work/route.js'), 'utf8');
  assert.match(route, /allowed\.includes\(requested\) \? requested : defaultScope\(allowed, user, 'tasks'\)/);
  assert.doesNotMatch(route, /scope = allowed\[0\]/, 'ห้ามกลับไปเดาค่าตั้งต้นเองที่ API');
});

/* ── คิวของฝ่าย (/rd|/finance|/service/requests) ────────────────────────────
   ที่นั่น**ไม่มี**สามแท็บ ของฉัน/ทีม/ทั้งหมด โดยเจตนา — ฝ่ายต้องเห็นงานของฝ่ายครบ
   ไม่ว่าใครเปิด · สิ่งที่ต้องเหมือนกันคือ "กรองที่ API ไม่ใช่ที่จอ" */
test('คิวฝ่าย: ทั้งสามหน้าส่ง ?dept= ให้ API กรอง ไม่ใช่ดึงมาทั้งระบบแล้วซ่อน', () => {
  for (const page of [
    'src/app/rd/requests/page.js',
    'src/app/finance/requests/page.js',
    'src/app/service/requests/page.js',
  ]) {
    const src = readFileSync(join(ROOT, page), 'utf8');
    assert.match(src, /apiFetch\(`\/api\/sa\/requests\?dept=\$\{DEPT\}`/, page);
    assert.doesNotMatch(src, /apiFetch\("\/api\/sa\/requests"/, `${page}: ยังดึงมาทั้งระบบ`);
  }
});

/* 🔴 `?dept=` ต้องไม่กลายเป็นทางลัดอ่านคิวฝ่ายอื่น — ด่านอยู่ที่ตัวโหลด ไม่ใช่ที่จอ */
test('คิวฝ่าย: ?dept= ผ่านด่าน canAnswerRequestsFor เสมอ', () => {
  const lib = readFileSync(join(ROOT, 'src/lib/requests/visibleRows.js'), 'utf8');
  assert.match(lib, /REQUEST_ANSWER_DEPARTMENTS\.includes\(deptParam\)/);
  assert.match(lib, /isSuperuser\(user\?\.role\) \|\| canAnswerRequestsFor\(user, deptParam\)/);
  // ร่างของคนอื่นยังไม่ใช่งานของฝ่าย — ต้องตัดเหมือนทางปกติ
  assert.match(lib, /deptRows\.filter\(\(r\) => r\.status !== 'draft' \|\| r\.requestedById === user\?\.id\)/);
  const route = readFileSync(join(ROOT, 'src/app/api/sa/requests/route.js'), 'utf8');
  assert.match(route, /dept: url\.searchParams\.get\('dept'\)/);
});
