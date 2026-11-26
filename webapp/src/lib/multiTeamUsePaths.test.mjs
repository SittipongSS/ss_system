// ── คนอยู่สองทีม "ใช้งาน" ได้ทั้งสองทีมจริง (ตรวจบัญชีจริงบัญชีแรก ODM+SV · 26/11/2026) ──────────────
//
// ส่วน "เห็น" ผ่านมาตั้งแต่ #1122 (teams = ขอบเขต) แต่ห้าทางเขียนยังหยิบ **ทีมหลัก** ไปประทับงานของทีมที่สอง
// เงียบ ๆ — ไม่มี error ไม่มีอะไรแดง ยอด/คิวไปโผล่อีกทีม · ไฟล์นี้คุมทั้งห้าทาง:
//   1. ดีลต่อสัญญาบริการ — ฟอร์มไม่รู้ตัวตน (useDealOwners ไม่ได้ meId) + ไม่รู้ทีมของดีลรอบที่หมด
//   2. แก้ไขดีล — AE ไม่มีรายชื่อเจ้าของ ⇒ ชิปทีมไม่โผล่ · หน้ารายละเอียดไม่โหลดทีม ⇒ PATCH ย้ายดีลกลับทีมหลัก
//   3. เปิดดีลจากลีด — ชิปทีมไม่ตั้งตามทีมของลีด
//   4. คำร้อง RQ — ทีมตั้งต้นไม่ดูทีมของดีลที่ผูก
//   5. ปุ่มโอนงานพนักงาน — เทสต์อยู่ที่ lib/usersTransfer.test.mjs
//
// รอบสอง (26/11 · Senior AE/AC ที่อยู่สองทีม — ยังไม่มีบัญชีจริง แก้ก่อนเกิด):
//   6. รายชื่อเจ้าของดีลกรองด้วยทีมหลัก ⇒ เปิดแก้ดีลของ AE ทีม SV แล้วช่องเจ้าของว่าง
//   7. ตารางลีดส่งตัวคนดูโดยไม่มี teams ⇒ ปุ่มทำงานของลีดทีมที่สองหาย (หน้ารายละเอียดส่งครบ)
//   8. แท็บ KPI งานซ่อนตัวเลือกทีมของหัวหน้า ⇒ หัวหน้าสองทีมติดทีมหลัก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { requestTeamFor } from './requests/requestTeam.js';
import { assignableOwners, editFormLockedOwner } from './sales/dealOwner.js';
import { canEditLead, canWorkLead } from './sales/leads.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const twoTeamAe = { id: 'U-NAT', role: 'ae', team: 'ODM', teams: ['ODM', 'SV'] };
const oneTeamAe = { id: 'U-ONE', role: 'ae', team: 'ODM', teams: ['ODM'] };
const teamless = { id: 'U-ADM', role: 'admin', team: null, teams: [] };

/* ── 4. คำร้อง RQ ─────────────────────────────────────────────────────────── */

test('requestTeamFor: ไม่ได้เลือกทีม + ผูกดีล SV + คนเปิดอยู่ SV ⇒ คิว SV (ไม่ใช่ทีมหลัก ODM)', () => {
  assert.equal(requestTeamFor(twoTeamAe, { requested: '', dealTeam: 'SV' }), 'SV');
  assert.equal(requestTeamFor(twoTeamAe, { requested: undefined, dealTeam: 'SV' }), 'SV');
});

test('requestTeamFor: เลือกทีมเองชนะทีมของดีล — ตราบที่เป็นทีมของตัวเอง', () => {
  assert.equal(requestTeamFor(twoTeamAe, { requested: 'ODM', dealTeam: 'SV' }), 'ODM');
  // ขอทีมที่ไม่ได้อยู่ = ไม่มีผล (กันยิง API ตรงโยนใบเข้าคิวคนอื่น)
  assert.equal(requestTeamFor(twoTeamAe, { requested: 'KA', dealTeam: 'SV' }), 'SV');
  assert.equal(requestTeamFor(twoTeamAe, { requested: 'KA', dealTeam: null }), 'ODM');
});

test('requestTeamFor: ดีลของทีมที่คนเปิดไม่ได้อยู่ ⇒ ทีมหลักของคนเปิด (พฤติกรรมเดิม)', () => {
  assert.equal(requestTeamFor(oneTeamAe, { requested: '', dealTeam: 'SV' }), 'ODM');
  assert.equal(requestTeamFor(twoTeamAe, { requested: '', dealTeam: 'KA' }), 'ODM');
});

test('requestTeamFor: คนเปิดไม่มีทีม ⇒ ทีมของดีล · ไม่ผูกดีลด้วย ⇒ null (พฤติกรรมเดิมของ route)', () => {
  assert.equal(requestTeamFor(teamless, { requested: '', dealTeam: 'SV' }), 'SV');
  assert.equal(requestTeamFor(teamless, { requested: '', dealTeam: null }), null);
});

test('RQ: server กับชิปบนฟอร์มใช้ตัวตัดสินเดียวกัน (สิ่งที่เห็น = สิ่งที่บันทึก)', () => {
  const route = read('app/api/sa/requests/route.js');
  assert.match(route, /team: requestTeamFor\(user, \{ requested: body\.team, dealTeam \}\)/);
  assert.doesNotMatch(route, /attributionTeam\(user, body\.team\) \|\| dealTeam/);
  const form = read('components/requests/RequestForm.js');
  assert.match(form, /requestTeamFor\(me, \{ requested: value\.team, dealTeam: selectedDeal\?\.team \}\)/);
});

/* ── 2. แก้ไขดีล ──────────────────────────────────────────────────────────── */

test('editFormLockedOwner: AE (ไม่มีรายชื่อเจ้าของ) แก้ดีลของตัวเอง ⇒ ได้ตัวเองแบบล็อก — ชิปทีมจึงโผล่', () => {
  const self = { id: 'U-NAT', name: 'Nat', team: 'ODM', teams: ['ODM', 'SV'] };
  assert.equal(editFormLockedOwner({ owners: [], lockedOwner: self, ownerId: 'U-NAT' }), self);
});

test('editFormLockedOwner: คนที่มีรายชื่อเจ้าของ (Senior/AC/หัวหน้า) ⇒ null — ฟอร์มหาเจ้าของจากรายชื่อเอง และยังเปลี่ยนเจ้าของได้', () => {
  const self = { id: 'U-SEN', name: 'Sen', team: 'SV', teams: ['SV'] };
  assert.equal(editFormLockedOwner({ owners: [{ id: 'U-NAT' }], lockedOwner: self, ownerId: 'U-SEN' }), null);
});

test('editFormLockedOwner: ดีลของคนอื่น ⇒ null — ไม่โผล่ชื่อตัวเองเป็นเจ้าของ', () => {
  const self = { id: 'U-NAT', name: 'Nat', team: 'ODM', teams: ['ODM', 'SV'] };
  assert.equal(editFormLockedOwner({ owners: [], lockedOwner: self, ownerId: 'U-OTHER' }), null);
  assert.equal(editFormLockedOwner({ owners: [], lockedOwner: null, ownerId: 'U-NAT' }), null);
});

test('แก้ไขดีล: ทั้งสองหน้าส่งเจ้าของแบบล็อกเข้าฟอร์มแก้ และโหลดทีมเดิมของดีล', () => {
  for (const rel of ['app/sales-planning/deals/page.js', 'app/sales-planning/deals/[id]/page.js']) {
    const src = read(rel);
    assert.match(src, /lockedOwner=\{editFormLockedOwner\(\{/, `${rel}: ฟอร์มแก้ต้องได้เจ้าของแบบล็อก`);
    assert.match(src, /team: deal\.team \|\| "",/, `${rel}: ฟอร์มแก้ต้องโหลดทีมเดิมของดีล`);
  }
});

test('PATCH ดีล: ไม่ส่งทีมมา = ขอทีมเดิมของดีล (ไม่ถอยทีมหลักของเจ้าของเงียบ ๆ)', () => {
  const route = read('app/api/sales-planning/deals/[id]/route.js');
  assert.match(route, /const requestedTeam = 'team' in body \? body\.team : before\.team;/);
  assert.match(route, /validateDealOwner\(supabase, body\.ownerId, user, requestedTeam\)/);
});

/* ── 1. ดีลต่อสัญญาบริการ ─────────────────────────────────────────────────── */

// ⚠️ อ่านซอร์สแทนเรียกตรง — renewalContext ลากตัวโหลดฝั่ง server (next/headers) มาด้วย รันใน node:test ไม่ได้
test('ต่อสัญญา: แถวทะเบียนส่งทีมของดีลรอบที่หมดมาให้จอ', () => {
  const src = read('lib/service/renewalContext.js');
  assert.match(src, /deal: deal \? \{[^}]*team: deal\.team \|\| null[^}]*\} : null/);
});

test('ต่อสัญญา: แผงส่งตัวตนเข้า useDealOwners และตั้งทีมของดีลใหม่ตามดีลรอบที่หมด', () => {
  const src = read('components/salesPlanning/RenewalsPanel.js');
  assert.match(src, /useDealOwners\(meId\)/);
  assert.match(src, /row\.deal\?\.team \? \{ team: row\.deal\.team \} : \{\}/);
});

test('useDealOwners: ทุกที่ที่เรียกต้องส่งไอดีตัวเอง — ไม่ส่ง = lockedOwner เป็น null แล้วฟอร์มไม่ถามทีม', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(name) || /\.test\./.test(name)) continue;
      const src = readFileSync(full, 'utf8');
      if (/useDealOwners\(\s*\)/.test(src)) offenders.push(relative(SRC, full));
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, []);
});

/* ── 3. เปิดดีลจากลีด ─────────────────────────────────────────────────────── */

test('ดีลจากลีด: ใบแรกและใบถัดไปตั้งทีมตามลีด (ก่อน defaults ของทางที่เปิด)', () => {
  const src = read('components/salesPlanning/DealCreateModal.js');
  assert.match(src, /const leadTeam = \(lead\) => \(lead\?\.team \? \{ team: lead\.team \} : \{\}\);/);
  for (const fn of ['firstDeal', 'nextDeal']) {
    const body = src.slice(src.indexOf(`const ${fn} = `), src.indexOf('});', src.indexOf(`const ${fn} = `)));
    assert.match(body, /\.\.\.leadTeam\(lead\),[\s\S]*\.\.\.defaults,/, `${fn} ต้องตั้งทีมตามลีด`);
  }
});

/* ── 6. รายชื่อเจ้าของดีล (Senior AE/AC สองทีม) ──────────────────────────────── */

const OWNER_DIRECTORY = [
  { id: 'U-AE-ODM', role: 'ae', team: 'ODM', teams: ['ODM'] },
  { id: 'U-AE-SV', role: 'ae', team: 'SV', teams: ['SV'] },
  { id: 'U-AE-KA', role: 'ae', team: 'KA', teams: ['KA'] },
];

test('assignableOwners: คนเปิดอยู่ ODM+SV ส่งทั้งชุด ⇒ เห็น AE ทั้งสองทีม ไม่เห็น KA', () => {
  const ids = assignableOwners(OWNER_DIRECTORY, ['ODM', 'SV']).map((u) => u.id);
  assert.deepEqual(ids.sort(), ['U-AE-ODM', 'U-AE-SV']);
});

test('useDealOwners กรองรายชื่อด้วยชุดทีม (teams) ไม่ใช่ทีมหลัก — และ memo ขึ้นกับ teams', () => {
  const src = read('lib/sales/useDealOwners.js');
  assert.match(src, /assignableOwners\(directory, teams\.length \? teams : team\)/);
  assert.doesNotMatch(src, /assignableOwners\(directory, team\)/);
  assert.match(src, /\[directory, role, team, teams, meId\]/);
});

/* ── 7. ตารางลีด ───────────────────────────────────────────────────────────── */

test('canWorkLead/canEditLead: Senior AE ที่อยู่ ODM+SV ทำงานลีด SV ได้เมื่อส่ง teams มา', () => {
  const lead = { id: 'L1', team: 'SV', status: 'assigned', assigneeId: 'U-OTHER' };
  const withTeams = { role: 'senior_ae', id: 'U-SEN', team: 'ODM', teams: ['ODM', 'SV'] };
  assert.equal(canWorkLead(withTeams, lead), true);
  // ⚠️ ตัวคนดูที่ไม่มี teams = เห็นแค่ทีมหลัก — นี่คือของเดิมของตารางลีดที่ทำปุ่มหาย
  assert.equal(canWorkLead({ role: 'senior_ae', id: 'U-SEN', team: 'ODM' }, lead), false);
  assert.equal(typeof canEditLead(withTeams, lead), 'boolean');
});

test('ตารางลีด: ตัวคนดูมี teams และทุกด่านในแถวใช้ตัวเดียวกัน', () => {
  const src = read('app/sales-planning/leads/page.js');
  assert.match(src, /const viewer = useMemo\(\(\) => \(\{ role, id: meId, team, teams \}\), \[role, meId, team, teams\]\);/);
  assert.match(src, /canEditLead\(viewer, lead\)/);
  assert.match(src, /canDeleteLead\(viewer, lead\)/);
  assert.doesNotMatch(src, /\{ role, id: meId, team \}/);
});

/* ── 8. แท็บ KPI งาน ───────────────────────────────────────────────────────── */

test('KPI งาน: API ส่งทีมที่หัวหน้าเลือกได้ และจอโชว์ช่องเลือกเมื่อมีมากกว่าหนึ่งทีม', () => {
  const route = read('app/api/sales-planning/task-kpi/route.js');
  assert.match(route, /pickableTeams: isTeamLead\(user\.role\) \? userTeams\(user\) : availableTeams/);
  const screen = read('components/pm/SalesKpiDashboard.js');
  assert.match(screen, /const canPickTeam = data\?\.scope === "all" \|\| pickableTeams\.length > 1;/);
  // หัวหน้าไม่มีตัวเลือก "ทุกทีม" — API คืนทีมเดียวเสมอสำหรับ scope 'team'
  assert.match(screen, /\{!teamScoped && <option value="">ทุกทีม<\/option>\}/);
});
