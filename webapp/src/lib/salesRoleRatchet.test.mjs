// ── ด่านกันถอยหลัง: ห้ามเทียบ/ลิสต์ชื่อตำแหน่งฝ่ายขายตรง ๆ นอก permissions.js ──────────
//
// ⭐ ผังตำแหน่งฝ่ายขาย (มติผู้ใช้ 2026-09-24): CCO → CM → AE/AC Supervisor → Senior AE/AC → AE/AC
//    ตอนมีสี่ตำแหน่ง โค้ดเทียบ `role === 'ae_supervisor'` · `role === 'senior_ae' || role === 'ac'` ·
//    `['ae', 'ac', 'senior_ae', 'ae_supervisor']` ไว้ราว 65 ไฟล์ — ต้องไล่เปลี่ยนเป็นกลุ่มตำแหน่ง
//    (SALES_MANAGER_ROLES · SALES_SUPERVISOR_ROLES · TEAM_SCOPE_ROLES · TEAM_LEAD_ROLES · AC_TRACK_ROLES ·
//    DEAL_HOLDER_ROLES · SALES_ROLES) ใน lib/permissions.js
//
// 🐞 กับดักที่ไฟล์นี้กันไว้: จุดที่เขียนชื่อตำแหน่งเองจะ **เงียบ ไม่ error** — ตำแหน่งที่เพิ่มทีหลังเสียสิทธิ์
//    ทีละอย่างโดยไม่มีอะไรบนจอบอก (บทเรียนเดียวกับฝ่าย RD — rdRoleRatchet.test.mjs)
//
// ⚠️ ไม่จับ `'ae'` เดี่ยว ๆ — ด่านของ AE คือ "ของตัวเอง" (own scope) ซึ่งเป็นของตำแหน่งนี้ตำแหน่งเดียวจริง
// ⚠️ ไม่จับลิสต์ตัวเดียว (`roles: ['ae_supervisor']`) — นั่นคือ "ที่นั่ง" บนกระดาษที่ผูกตำแหน่งเดียวโดยตั้งใจ
//    (ช่องลงนาม PDR) ไม่ใช่รายชื่อตำแหน่งที่ต้องโตตามผัง
// ⚠️ ไม่จับรหัสขั้นอนุมัติ (`rejectedStage === 'ae_supervisor'`) — ตัวแปรไม่ใช่ role
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SALES_ROLES } from './permissions.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ไฟล์ที่ประกาศทะเบียนเอง — พูดถึงชื่อตำแหน่งได้ตามหน้าที่
const ALLOW = new Set([
  path.join(srcRoot, 'lib', 'permissions.js'),
]);

// ตำแหน่งที่ห้ามเทียบตรง ๆ = ฝ่ายขายทุกตำแหน่งยกเว้น 'ae' (ดูหัวไฟล์)
const RANKED = SALES_ROLES.filter((role) => role !== 'ae');
const NAME = `(?:${RANKED.join('|')})`;

function sourceFiles(dir = srcRoot) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      out.push(...sourceFiles(full));
      continue;
    }
    // เทสต์ใช้ชื่อตำแหน่งเป็นข้อมูลตัวอย่าง (`{ role: 'senior_ac' }`) — ด่านนี้ดูโค้ดที่รันจริง
    if (/\.(js|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(full);
  }
  return out;
}

/* ตัดคอมเมนต์ทิ้งก่อนตรวจ (คอมเมนต์เล่าถึงชื่อตำแหน่งได้) — แทนด้วยช่องว่างให้เลขบรรทัดยังตรง */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));

const COMPARE = new RegExp(
  `(?:\\brole|\\.role)\\s*[!=]==?\\s*['"]${NAME}['"]|['"]${NAME}['"]\\s*[!=]==?\\s*(?:\\w+\\??\\.)?role\\b`,
);
// ลิสต์สตริงล้วนตั้งแต่สองตัวขึ้นไป
const LIST = /\[\s*(?:['"][\w-]+['"]\s*,\s*)+['"][\w-]+['"]\s*,?\s*\]/g;

test('🔒 ไม่มีที่ไหนเทียบ role กับชื่อตำแหน่งฝ่ายขายตรง ๆ — ต้องถามกลุ่มตำแหน่งใน permissions.js', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    if (ALLOW.has(file)) continue;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (COMPARE.test(line)) offenders.push(`${path.relative(srcRoot, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `เทียบชื่อตำแหน่งตรง ๆ — ใช้ isSalesManager/isSuperuser/hasTeamScope/isTeamLead/isAcTrack/isDealHolder แทน:\n${offenders.join('\n')}`);
});

test('🔒 ไม่มีลิสต์ตำแหน่งฝ่ายขายที่พิมพ์มือ — ต่อจากกลุ่มกลาง (...SALES_ROLES ฯลฯ)', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    if (ALLOW.has(file)) continue;
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(LIST)) {
      const items = [...m[0].matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]);
      if (items.some((item) => RANKED.includes(item))) {
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(srcRoot, file)}:${line}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `ลิสต์ตำแหน่งที่พิมพ์มือ — ประกอบจากกลุ่มใน permissions.js แทน:\n${offenders.join('\n')}`);
});

test('ยามจับของจริงได้ (พิสูจน์ด้วยตัวอย่างที่เคยมีในรีโป)', () => {
  for (const bad of [
    "const reviewer = role === 'ae_supervisor' || role === 'admin';",
    'if (me.role === "senior_ae" && userTeams(me).length) {',
    "const inTeam = (user?.role === 'senior_ae' || user?.role === 'ac') && hasTeam(user, lead.team);",
    "'ac' === user.role",
  ]) assert.ok(COMPARE.test(bad), bad);
  for (const ok of [
    "if (role === 'ae') return 'own';",
    "latest.rejectedStage === 'ae_supervisor'",
    "const role = ROLES.includes(asked) ? asked : 'ae_supervisor';",
  ]) assert.ok(!COMPARE.test(ok), ok);
  const lists = (src) => [...src.matchAll(LIST)].map((m) => m[0]);
  assert.equal(lists("const SALES_ROLES = new Set(['ae', 'ac', 'senior_ae', 'ae_supervisor']);").length, 1);
  assert.equal(lists("const ALWAYS = ['admin', 'ae_supervisor'];").length, 1);
  assert.equal(lists("roles: ['ae_supervisor'] }").length, 0, 'ที่นั่งตัวเดียวไม่ใช่ลิสต์');
});
