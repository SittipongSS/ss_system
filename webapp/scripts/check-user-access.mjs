// ── ตรวจสิทธิ์ของบัญชีผู้ใช้จริงทุกคน ────────────────────────────────────────
//
// เทสต์ในโปรเจกต์ตรวจได้แค่ว่า "แต่ละ role ได้สิทธิ์อะไร" — ตรวจไม่ได้ว่า
// **บัญชีจริงถูกตั้งค่าถูกไหม** เพราะ role/team/extraCaps อยู่ใน app_metadata
// บน Supabase Auth ไม่ได้อยู่ในโค้ด
//
// สิ่งที่สคริปต์นี้จับ (เรียงตามความรุนแรง):
//   ✗ role สายทีม (senior_ae/ac/ae) ที่ **ไม่มี team** → inScope('team') คืน false
//     ทุกกรณี ⇒ เปิดระบบมาแล้วไม่เห็นอะไรเลย และแก้อะไรไม่ได้ (fail closed)
//   ✗ บัญชีที่ยังไม่ตั้ง role (หรือ role = 'user') → ตกไปสิทธิ์ default อ่านอย่างเดียว
//     และหายจากทุก dropdown มอบหมายงาน
//   ✗ role ที่ไม่รู้จัก (พิมพ์ผิด/ของเก่า) → capsFor คืน [] แบบเงียบ
//   ⚠ extraCaps ที่ grant รายคน — ไม่ใช่ของผิด แต่ต้องมีคนรู้ว่ามีอยู่
//   ⚠ team ที่ไม่อยู่ใน TEAMS · department ที่ไม่ตรงกับ role
//   ✗ ทีมหลักไม่อยู่ในชุดทีมที่สังกัด (teams[]) — ของใหม่เข้าทีมที่เจ้าตัวมองไม่เห็น
//   ⚠ บัญชีถูกระงับที่ยังถูกอ้างอยู่ (เตือนให้ตรวจงานค้าง)
//
// วิธีใช้:  node scripts/check-user-access.mjs
//   ต้องมี .env.local (SUPABASE_URL + SERVICE_ROLE_KEY) เหมือน check-select-columns.mjs
//   อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, ROLE_LABELS, TEAMS, TEAM_ROLES, DEPARTMENTS, GRANTABLE_CAPS,
  capsFor, departmentFor, normalizeDepartment,
  viewScope, editScope, isSuperuser, userTeams,
} from '../src/lib/permissions.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(HERE, '..', file), 'utf8');
      const out = {};
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      }
      return out;
    } catch { /* ลองไฟล์ถัดไป */ }
  }
  return {};
}

const env = { ...loadEnv(), ...process.env };
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('ข้าม: ไม่มี SUPABASE_URL / SERVICE_ROLE_KEY (ดู .env.example)');
  process.exit(0);
}

// อ่านผ่าน GoTrue admin API ตรง ๆ — ไม่ต้องพึ่ง @supabase/supabase-js
async function listUsers() {
  const rows = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`อ่านรายชื่อผู้ใช้ไม่สำเร็จ: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const body = await res.json();
    const users = body?.users || [];
    if (!users.length) break;
    rows.push(...users);
    if (users.length < 1000) break;
  }
  return rows;
}

const users = await listUsers();
const problems = [];
const notes = [];

const label = (u) => `${(u.user_metadata?.name || '').trim() || u.email || u.id}`;

for (const u of users) {
  const role = u.app_metadata?.role || null;
  const team = u.app_metadata?.team || null;   // ทีมหลัก (ยอดของใหม่เข้าทีมนี้)
  const teams = userTeams(u.app_metadata);      // ทุกทีมที่สังกัด (ขอบเขตจริง)
  const dept = u.app_metadata?.department || null;
  const extraCaps = u.app_metadata?.extraCaps || [];
  const disabled = !!u.banned_until && new Date(u.banned_until) > new Date();
  const who = label(u);

  if (!role || role === 'user') {
    problems.push(`✗ ${who}: ยังไม่ได้ตั้ง role — ได้สิทธิ์ default อ่านอย่างเดียว และหายจาก dropdown มอบหมายงานทุกที่`);
    continue;
  }
  if (!ROLES.includes(role)) {
    problems.push(`✗ ${who}: role "${role}" ไม่มีอยู่ในระบบ — capsFor() คืนค่าว่างแบบเงียบ`);
    continue;
  }
  if (TEAM_ROLES.includes(role) && !teams.length) {
    problems.push(`✗ ${who} (${ROLE_LABELS[role]}): ไม่มีทีม — inScope('team') เป็น false ทุกกรณี ⇒ มองไม่เห็น/แก้ไม่ได้เกือบทั้งระบบ`);
  }
  const badTeams = teams.filter((t) => !TEAMS.includes(t));
  if (badTeams.length) {
    problems.push(`✗ ${who}: ทีม "${badTeams.join(', ')}" ไม่อยู่ในรายการ (${TEAMS.join('/')})`);
  }
  // ทีมหลักต้องอยู่ในชุดที่สังกัดเสมอ (resolveTeamAssignment บังคับตอนเขียน) — หลุดได้
  // ทางเดียวคือมีคนแก้ app_metadata มือ · ผลคือของใหม่ถูกบันทึกเข้าทีมที่เจ้าตัวไม่ได้อยู่
  if (team && teams.length && !teams.includes(team)) {
    problems.push(`✗ ${who}: ทีมหลัก "${team}" ไม่อยู่ในทีมที่สังกัด (${teams.join(', ')}) — ของใหม่จะถูกบันทึกเข้าทีมที่ตัวเองมองไม่เห็น`);
  }
  if (TEAM_ROLES.includes(role) && teams.length && !team) {
    problems.push(`✗ ${who}: มีทีมสังกัด (${teams.join(', ')}) แต่ไม่มีทีมหลัก — ดีล/ลูกค้าที่สร้างใหม่จะไร้ทีม`);
  }
  if (teams.length && !TEAM_ROLES.includes(role) && !isSuperuser(role)) {
    notes.push(`⚠ ${who} (${ROLE_LABELS[role]}): ตั้งทีม "${teams.join(', ')}" ไว้ทั้งที่ตำแหน่งนี้ไม่ได้ใช้ทีมตัดสินสิทธิ์`);
  }
  if (teams.length > 1) {
    notes.push(`⚠ ${who} (${ROLE_LABELS[role]}): อยู่ ${teams.length} ทีม (${teams.join(' + ')}) — ทีมหลัก ${team} คือทีมที่ยอด/เป้าถูกนับเข้า`);
  }
  if (dept && !DEPARTMENTS.includes(normalizeDepartment(dept))) {
    problems.push(`✗ ${who}: department "${dept}" ไม่อยู่ในรายการ`);
  }
  const impliedDept = departmentFor(role);
  if (dept && impliedDept && normalizeDepartment(dept) !== impliedDept) {
    notes.push(`⚠ ${who}: department "${dept}" ต่างจากที่ role บอก ("${impliedDept}") — ตั้งใจไหม? (ฝ่ายคุมสิทธิ์ production/service/costing)`);
  }
  const badCaps = extraCaps.filter((c) => !GRANTABLE_CAPS.includes(c));
  if (badCaps.length) {
    problems.push(`✗ ${who}: extraCaps ที่ grant ไม่ได้ ${badCaps.join(', ')} — sanitizeExtraCaps จะตัดทิ้งเงียบ ๆ`);
  }
  const goodCaps = extraCaps.filter((c) => GRANTABLE_CAPS.includes(c));
  if (goodCaps.length) {
    notes.push(`⚠ ${who} (${ROLE_LABELS[role]}): ได้สิทธิ์เพิ่มรายคน → ${goodCaps.join(', ')}`);
  }
  if (disabled) {
    notes.push(`⚠ ${who}: บัญชีถูกระงับ — ตรวจว่ายังมีลีด/ดีล/งานค้างอยู่ในชื่อเขาไหม`);
  }
}

// ── สรุปรายคน ────────────────────────────────────────────────────────────
const active = users.filter((u) => !(u.banned_until && new Date(u.banned_until) > new Date()));
console.log(`\n# บัญชีทั้งหมด ${users.length} คน (ใช้งานอยู่ ${active.length})\n`);
console.log('| ชื่อ | role | ทีม | ฝ่าย | view/edit | สิทธิ์เพิ่ม | สถานะ |');
console.log('|---|---|---|---|---|---|---|');
for (const u of [...users].sort((a, b) => (a.app_metadata?.role || '').localeCompare(b.app_metadata?.role || ''))) {
  const role = u.app_metadata?.role || '(ยังไม่ตั้ง)';
  const disabled = !!u.banned_until && new Date(u.banned_until) > new Date();
  const known = ROLES.includes(role);
  console.log([
    label(u),
    known ? `${role} (${capsFor(role).length} cap)` : `**${role}**`,
    // ทีมหลักขึ้นก่อน แล้วต่อด้วยทีมรอง — ตารางนี้คือที่เดียวที่คนตรวจเห็นสังกัดจริง
    userTeams(u.app_metadata).map((t) => (t === u.app_metadata?.team ? `**${t}**` : t)).join(' + ') || '-',
    normalizeDepartment(u.app_metadata?.department) || departmentFor(role) || '-',
    known ? `${viewScope(role)}/${editScope(role)}` : '?',
    (u.app_metadata?.extraCaps || []).join(', ') || '-',
    disabled ? 'ระงับ' : 'ใช้งาน',
  ].map((c) => ` ${c} `).join('|').replace(/^/, '|') + '|');
}

console.log(`\n## ต้องแก้ (${problems.length})\n`);
console.log(problems.length ? problems.join('\n') : '(ไม่พบ)');
console.log(`\n## ควรดู (${notes.length})\n`);
console.log(notes.length ? notes.join('\n') : '(ไม่พบ)');

process.exit(problems.length ? 1 : 0);
