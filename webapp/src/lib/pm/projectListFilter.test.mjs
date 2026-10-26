// ── ป้ายเมนู "โครงการ N" ↔ ทะเบียนโครงการ: เลขบนป้าย = แถวที่ทะเบียนโชว์ (ตรวจตัวเลข M17a/M17b · 20/10) ──
//
// ป้ายนับใน `api/nav/counts` ด้วย `isProjectCloseWaitingOnMe` (เฉพาะผู้อนุมัติปิด) · หน้าทะเบียนกรองด้วย
// `filterProjects` จากธง `_waitingOnMe` ที่ server ติดด้วย helper ตัวเดียวกัน ⇒ เทสต์เดินจากลิงก์ของป้าย
// → ตัวอ่านของหน้า → การล้างตัวกรองที่ค้าง → ตัวกรองแถว แล้วเทียบกับตัวนับของป้ายตรง ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROJECTS_COUNT_KEY, PROJECT_SCOPE_DEFAULT, filterProjects, projectMatchesListFilter, projectsClearedHref,
  projectsWaitingOnMeFrom, projectsWaitingOnMeHref, withWaitingOnMe,
} from './projectListFilter.js';
import { canApproveProjectClose, isProjectCloseWaitingOnMe } from './projectClose.js';
import { PROJECT_WORK_STATUSES } from './projectLifecycle.js';
import { ROLES, viewScope } from '../permissions.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const approver = { id: 'U-SUP', role: 'ae_supervisor', team: 'ODM', teams: ['ODM', 'SV'] };
const raw = [
  { id: 'P1', code: 'PJ-1', name: 'ครีม', status: 'In Progress', closeStatus: 'pending_close', closeRequestedBy: 'U-AE', team: 'ODM', line: 'PRODUCT' },
  // ขอปิดแล้วสถานะเป็น Completed (route ขอปิดไม่แตะ status) — ค่าตั้งต้น "active" กรองทิ้ง
  { id: 'P2', code: 'PJ-2', name: 'สบู่', status: 'Completed', closeStatus: 'pending_close', closeRequestedBy: 'U-AE', team: 'KA', line: 'SERVICE' },
  { id: 'P3', code: 'PJ-3', name: 'เทียน', status: 'Dropped', closeStatus: 'pending_close', closeRequestedBy: 'U-AE', team: null, line: null },
  // ใบที่ผู้อนุมัติยื่นเอง — เซ็นให้ตัวเองไม่ได้ ⇒ ไม่ใช่ "งานรอฉัน"
  { id: 'P4', code: 'PJ-4', name: 'น้ำหอม', status: 'In Progress', closeStatus: 'pending_close', closeRequestedBy: 'U-SUP', team: 'ODM', line: 'PRODUCT' },
  { id: 'P5', code: 'PJ-5', name: 'โลชั่น', status: 'New', closeStatus: 'open', team: 'SV', line: 'PRODUCT' },
  { id: 'P6', code: 'PJ-6', name: 'แชมพู', status: 'Completed', closeStatus: 'closed', team: 'ODM', line: 'SERVICE' },
];
// ธงที่ `/api/pm/projects` ติดให้ทุกแถว — helper ตัวเดียวกับตัวนับของป้าย
const rowsFor = (user) => raw.map((p) => ({
  ...p,
  canApproveClose: canApproveProjectClose(user),
  _waitingOnMe: isProjectCloseWaitingOnMe(p, user),
}));
// ตัวนับของป้ายเมนู (api/nav/counts · projectCloses) — อ่านทุกโครงการที่ pending_close ไม่ผ่านขอบเขตทีม
const navBadge = (user) => (canApproveProjectClose(user)
  ? raw.filter((p) => p.closeStatus === 'pending_close').filter((p) => isProjectCloseWaitingOnMe(p, user)).length
  : 0);

const PRIOR_STATES = [];
for (const query of ['', 'ครีม', 'ไม่มีอะไรตรง']) {
  for (const status of [PROJECT_SCOPE_DEFAULT, 'all', 'closed', ...PROJECT_WORK_STATUSES]) {
    for (const lines of [[], ['PRODUCT'], ['__unset'], ['SERVICE', '__unset']]) {
      PRIOR_STATES.push({ query, status, lines });
    }
  }
}

test('🔴 กดป้ายเมนู (ลิงก์ ?count=projectCloses) จากตัวกรองค้างแบบไหนก็ได้ ⇒ แถว = เลขบนป้าย', () => {
  const rows = rowsFor(approver);
  const badge = navBadge(approver);
  assert.equal(badge, 3, 'P1 P2 P3 รอฉันเซ็น · P4 เป็นใบที่ฉันยื่นเอง');
  const href = '/sa/projects?count=projectCloses';
  const url = new URL(href, 'http://localhost');
  assert.equal(projectsWaitingOnMeFrom(url.searchParams), true);
  // ผู้อนุมัติปิดเป็นขอบเขต 'all' ⇒ หน้าไม่ส่งตัวกรองทีม (teamMatches = null)
  assert.equal(viewScope(approver.role), 'all');
  for (const prior of PRIOR_STATES) {
    const state = withWaitingOnMe({ ...prior, teamMatches: null });
    const shown = filterProjects(rows, state);
    assert.equal(shown.length, badge, `ค้างไว้ ${JSON.stringify(prior)}`);
    assert.deepEqual(shown.map((p) => p.id), ['P1', 'P2', 'P3']);
  }
});

test('ติ๊ก "รอฉันเซ็นปิด" เองในปุ่มตัวกรอง = ไป URL เดียวกับป้าย ⇒ ได้ชุดเดียวกัน', () => {
  const href = projectsWaitingOnMeHref('');
  assert.equal(href, `/sa/projects?count=${PROJECTS_COUNT_KEY}`);
  const menu = read('../../config/menuRegistry.js');
  assert.match(menu, new RegExp(`countHref: '${href.replace('?', '\\?')}'`), 'ลิงก์ของป้ายเมนูต้องเป็นตัวเดียวกัน');
  assert.equal(projectsWaitingOnMeFrom(new URL(href, 'http://x').searchParams), true);
});

test('× / เอาติ๊กออก เขียน URL ใหม่ (ถอด ?count=) — กดป้ายซ้ำจึงเป็นการเปลี่ยน URL จริง', () => {
  assert.equal(projectsClearedHref('count=projectCloses'), '/sa/projects');
  assert.equal(projectsClearedHref('?count=projectCloses&x=1'), '/sa/projects?x=1');
  assert.equal(projectsClearedHref(''), '/sa/projects');
  assert.equal(projectsWaitingOnMeFrom(new URL(projectsClearedHref('count=projectCloses'), 'http://x').searchParams), false);
  // คีย์ของหน้าอื่นไม่ใช่ของเรา — ไม่ถอด
  assert.equal(projectsClearedHref('count=other'), '/sa/projects?count=other');
});

test('ค่าตั้งต้น (ไม่มี ?count=) ไม่กรอง "รอฉัน" · สถานะ "กำลังดำเนินการ" ตัด Completed/Dropped', () => {
  const rows = rowsFor(approver);
  assert.deepEqual(filterProjects(rows, {}).map((p) => p.id), ['P1', 'P4', 'P5']);
  assert.deepEqual(filterProjects(rows, { status: 'closed' }).map((p) => p.id), ['P2', 'P3', 'P6']);
  assert.deepEqual(filterProjects(rows, { status: 'all', lines: ['__unset'] }).map((p) => p.id), ['P3']);
});

test('ค้นหาเจอแบรนด์ที่โชว์บนแถว (brandOf) และชื่อดีล', () => {
  const rows = [{ id: 'A', name: 'x', status: 'New', deals: [{ title: 'ดีลน้ำหอมห้อง' }] }, { id: 'B', name: 'y', status: 'New' }];
  assert.deepEqual(filterProjects(rows, { query: 'น้ำหอมห้อง' }).map((p) => p.id), ['A']);
  assert.deepEqual(filterProjects(rows, { query: 'ยี่ห้อ', brandOf: (p) => (p.id === 'B' ? 'ยี่ห้อดี' : '') }).map((p) => p.id), ['B']);
});

test('M17b: ชิปทีมใช้เฉพาะขอบเขต team — หัวหน้าหลายทีมเห็นครบเท่าที่ API ส่งมา', () => {
  // ผู้อนุมัติปิดทุกตำแหน่งเป็นขอบเขต 'all' ⇒ ไม่มีวันมีชิปมาหั่นแถวของป้าย
  for (const role of ROLES.filter((r) => canApproveProjectClose({ role: r }))) {
    assert.equal(viewScope(role), 'all', `${role} อนุมัติปิดได้แต่ขอบเขตไม่ใช่ all`);
  }
  const rows = rowsFor(approver);
  const onlyOdm = (team) => team === 'ODM';
  // ขอบเขต team (เช่น AC ที่อยู่ ODM+SV · ผู้แจ้ง IS-26080012 role ปัจจุบัน ณ 20/10 = ac) — ชิปแคบลงได้ตามเดิม
  assert.deepEqual(filterProjects(rows, { status: 'all', teamMatches: onlyOdm }).map((p) => p.id), ['P1', 'P4', 'P6']);
  // ขอบเขต all — หน้าส่ง null ⇒ โครงการทีมอื่น/ไม่มีทีมอยู่ครบ
  assert.equal(filterProjects(rows, { status: 'all', teamMatches: null }).length, raw.length);
  assert.equal(projectMatchesListFilter({ team: null, status: 'New' }, { teamMatches: null }), true);
});

test('ไม่ใช่ผู้อนุมัติ: ป้ายไม่มี · ธงไม่ติด · หน้าไม่โชว์ตัวเลือก "รอฉันเซ็นปิด"', () => {
  const ae = { id: 'U-AE', role: 'ae', team: 'ODM', teams: ['ODM'] };
  const rows = rowsFor(ae);
  assert.equal(navBadge(ae), 0);
  assert.equal(rows.some((p) => p.canApproveClose), false);
  assert.equal(filterProjects(rows, withWaitingOnMe({})).length, 0);
});

test('ด่านซอร์ส: หน้าทะเบียนอ่านตัวกรองจาก URL · ล้างตัวกรองค้างตอนเปิด · ชิปทีมเฉพาะ team · กรองผ่าน lib', () => {
  const src = read('../../app/sa/projects/page.js');
  assert.match(src, /projectsWaitingOnMeFrom\(searchParams\)/, 'ตัวกรองต้องมาจาก URL ทุกเรนเดอร์ ไม่ใช่ initializer ของ useState');
  assert.doesNotMatch(src, /useState\(fromNavCount\)/, 'ห้ามกลับไปอ่าน ?count= ครั้งเดียว');
  assert.match(src, /router\.replace\(on \? projectsWaitingOnMeHref\(searchParams\) : projectsClearedHref\(searchParams\)/);
  assert.match(src, /const turnedOn = waitingOnMeOnly && !prevWaitingOnMe\.current;\s*prevWaitingOnMe\.current = waitingOnMeOnly;\s*if \(!turnedOn\) return;\s*const cleared = withWaitingOnMe\(\);\s*setStatusFilter\(cleared\.status\);\s*setQuery\(cleared\.query\);\s*setLineFilter\(cleared\.lines\);/,
    'เปิด "รอฉันเซ็นปิด" ขณะอยู่บนหน้า ต้องล้างค้นหา/สายธุรกิจ และเปิดทุกสถานะ ด้วยค่าจาก withWaitingOnMe');
  assert.match(src, /const prevWaitingOnMe = useRef\(waitingOnMeOnly\);/,
    'ล้างเฉพาะจังหวะปิด→เปิด — ตอนเมานต์ (กดย้อน/F5) ต้องไม่ลบค่าที่ useStickyState คืนมา (มติ 2026-08-25)');
  assert.match(src, /useState\(waitingOnMeOnly \? withWaitingOnMe\(\)\.status : SCOPE_DEFAULT\)/,
    'เมานต์พร้อม ?count= (เข้าใหม่จากป้าย) ได้สถานะ "ทั้งหมด" จาก initializer');
  assert.match(src, /filterProjects\(rows, \{/);
  assert.match(src, /teamMatches: teamScoped \? myTeams\.matches : null/);
  assert.match(src, /\{teamScoped && <MyTeamsFilter /);
  assert.match(src, /canApproveCloses \|\| waitingOnMeOnly \?/, 'ตัวเลือก "รอฉันเซ็นปิด" โชว์เฉพาะผู้อนุมัติ');
});
