// ── ด่านกันคนเขียนโค้ดต่อหยิบ "ทีม" ผิดช่อง ────────────────────────────────
//
// ตั้งแต่คนหนึ่งคนอยู่ได้หลายทีม (มติ 2026-08-11 · ADR 0015) มีสองช่องที่หน้าตา
// คล้ายกันมากบน object เดียวกัน:
//   user.team   = ทีมหลัก — ใช้ตอน **เขียน** ทีมลงแถวใหม่ (attribution)
//   user.teams  = ทุกทีมที่สังกัด — ใช้ตอน **ถาม** ว่าเห็น/แก้ได้ไหม (scope)
//
// รอบตรวจซ้ำวันเดียวกันเจอ 6 จุดที่หยิบผิดช่อง — ทุกจุดคือ "เทียบทีมหลักตรง ๆ"
// แล้วผลคือปฏิเสธคนที่อยู่ทีมนั้นจริง · บั๊กแบบนี้ไม่ระเบิด มันแค่เงียบและปฏิเสธ
// เทสต์นี้จึงอ่าน source ทั้ง src/ แล้วห้ามรูปแบบนั้นกลับมา (แพตเทิร์นเดียวกับ
// orderRoute.test.mjs / reportFilters.test.mjs ที่ตรึงนิพจน์เก่าไว้ไม่ให้ย้อน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

// ตัดคอมเมนต์ทิ้งก่อนตรวจ — คอมเมนต์ที่อธิบายบั๊กเดิมต้องพูดถึงนิพจน์เก่าได้
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const FILES = jsFiles(SRC).map((f) => [relative(SRC, f), codeOnly(readFileSync(f, 'utf8'))]);

test('ห้ามเทียบทีมของ "คน" ด้วย === — ต้องตัดชุดทีมผ่าน hasTeam/userTeams', () => {
  // จับเฉพาะฝั่ง "คน": user/actor/assigner/assignee/me/viewer/owner + .team
  // (record.team === X ยังใช้ได้ปกติ — แถวมีทีมเดียวเสมอ)
  const banned = /\b(user|actor|assigner|assignee|me|viewer|owner|resp)\??\.team\s*[!=]==/;
  const offenders = FILES.filter(([, code]) => banned.test(code)).map(([f]) => f);
  assert.deepEqual(offenders, [],
    `เทียบทีมหลักตรง ๆ = ปฏิเสธคนที่อยู่ทีมนั้นจริง — ใช้ hasTeam(user, team) แทน`);
});

test('ห้ามกรอง query ด้วย eq(team, ทีมของผู้ใช้) — ต้องเป็น in() ผ่าน teamScope', () => {
  const banned = /\.eq\(\s*['"]team['"]\s*,\s*(user|me|actor)\??\.team/;
  const offenders = FILES.filter(([, code]) => banned.test(code)).map(([f]) => f);
  assert.deepEqual(offenders, [],
    `ลิสต์จะเห็นแค่ทีมหลัก ทั้งที่ inScope ปล่อยผ่านทุกทีม — ใช้ whereTeamIn/teamInClause`);
});

test('ห้ามอ่าน app_metadata.team ดิบ ๆ ไปตัดสินขอบเขต — ต้องผ่าน userTeams()', () => {
  // อนุญาตให้ *อ่านค่า* ทีมหลักได้ (attribution) แต่ห้ามเอาไปเทียบทันที
  const banned = /app_metadata\??\.team\s*[!=]==/;
  const offenders = FILES.filter(([, code]) => banned.test(code)).map(([f]) => f);
  assert.deepEqual(offenders, [], `ดู ADR 0015 — ด่านตอนเขียนเคยพลาดตรงนี้ทั้งสองตัว`);
});

test('endpoint ที่คืนรายชื่อคนต้องส่ง teams ไปด้วย (ไม่งั้นจอกับ API ไม่ตรงกัน)', () => {
  // ฝั่งจอเอารายชื่อนี้ไปตัดสิน "ทีมเดียวกันไหม" — ได้แต่ทีมหลักแปลว่าคนที่อยู่
  // หลายทีมหายจาก dropdown ทั้งที่ server อนุญาต
  for (const rel of ['app/api/pm/assignable-users/route.js', 'app/api/users/route.js']) {
    const [, code] = FILES.find(([f]) => f === rel) || [];
    assert.ok(code, `หาไฟล์ ${rel} ไม่เจอ — เทสต์นี้กลายเป็นเทสต์เปล่า`);
    assert.match(code, /teams:\s*userTeams\(/, `${rel} ต้องคืน teams`);
  }
});

// ── ห้าม route ไหนเชื่อ body.team ตรง ๆ (มติ 2026-08-11 รอบสาม) ────────────
// ตั้งแต่ฟอร์มเลือกทีมได้ ช่อง `body.team` กลายเป็นค่าที่ผู้ใช้ควบคุม — เขียนลงแถว
// ตรง ๆ เมื่อไร = ยิง API ตรงแล้วโยนยอดเข้าทีมที่ตัวเองไม่ได้อยู่ (และมองไม่เห็นด้วยซ้ำ)
// ทุก route ต้องผ่าน attributionTeam() ซึ่งตีค่านอกทีมของเจ้าของทิ้งเสมอ
test('ห้ามเขียน body.team ลงแถวตรง ๆ — ต้องผ่านตัวกรองทีม', () => {
  const raw = /\bteam:\s*body\.team\b/;
  // ผ่านได้เมื่อไฟล์นั้นกรองด้วยตัวใดตัวหนึ่ง: attributionTeam (ทีมของงาน) หรือ
  // resolveTeamAssignment (สังกัดของบัญชีผู้ใช้ — /api/users ส่ง body.team เข้าไปตรวจ)
  const sanitized = /(attributionTeam|resolveTeamAssignment)\(/;
  const offenders = FILES
    .filter(([f, code]) => f.startsWith('app/api/') && raw.test(code) && !sanitized.test(code))
    .map(([f]) => f);
  assert.deepEqual(offenders, [],
    'ค่าที่ client ส่งมาต้องถูกกรองด้วยทีมของเจ้าของก่อนเสมอ');
});

// ฟอร์มกับ server ต้องตกลงกันว่า "ไม่เลือก = ทีมหลัก" — ถ้าฝั่งจอถอยไป teams[0]
// แต่ server ถอยไปทีมหลัก ชิปจะชี้ทีมหนึ่งแล้วงานไปลงอีกทีมเงียบ ๆ
test('ฟอร์มดีลถอยไปทีมหลักของเจ้าของ ไม่ใช่ teams[0]', () => {
  const [, code] = FILES.find(([f]) => f === 'components/salesPlanning/DealFormFields.js') || [];
  assert.ok(code, 'หา DealFormFields ไม่เจอ — เทสต์นี้กลายเป็นเทสต์เปล่า');
  assert.match(code, /ownerPick\?\.team \|\| ownerTeams\[0\]/);
});
