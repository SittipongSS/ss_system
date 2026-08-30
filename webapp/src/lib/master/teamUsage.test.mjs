// ── ลบทีมได้เฉพาะทีมที่ยังไม่มีใครใช้ (มติผู้ใช้ 2026-08-30) ────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TEAM_STAMPED_COLUMNS, deleteTeamBlocker } from './teamUsage.js';

const team = (over = {}) => ({ code: 'SA-NEW', name: 'ทีมใหม่', department: 'SA', ...over });

test('ทีมที่ยังไม่มีใครใช้ = ลบได้', () => {
  assert.equal(deleteTeamBlocker(team(), { usage: [{ label: 'ดีล', count: 0 }] }), '');
});

test('🔴 มีของค้างแม้แถวเดียวก็ลบไม่ได้ — และต้องบอกว่าติดอะไรอยู่', () => {
  /* 🐞 ลบทีมที่ถูกใช้แล้ว = ป้ายทีมในรายงานย้อนหลังกลายเป็นรหัสดิบทันที
     (รหัสทีมถูกก๊อปเป็น *ข้อความ* ลงหลายตาราง ไม่ใช่ FK) */
  const blocker = deleteTeamBlocker(team(), {
    usage: [{ label: 'ดีล', count: 3 }, { label: 'ลีด', count: 0 }, { label: 'เป้าขาย', count: 1 }],
  });
  assert.match(blocker, /ดีล 3/);
  assert.match(blocker, /เป้าขาย 1/);
  assert.doesNotMatch(blocker, /ลีด/, 'ของที่ไม่มีค้างต้องไม่ถูกพูดถึง');
  assert.match(blocker, /ปิดทีม/, 'ต้องบอกทางออกที่ทำได้จริง');
});

test('🔴 คนยังสังกัดอยู่ = ลบไม่ได้ (ทีมขายเก็บสังกัดที่บัญชีผู้ใช้ ไม่ใช่ตาราง)', () => {
  const blocker = deleteTeamBlocker(team(), { usage: [], memberUserIds: ['U1', 'U2'] });
  assert.match(blocker, /ผู้ใช้ 2 คน/);
});

test('🔴 ทีมขายหลักที่โค้ดอ้างถึง ลบไม่ได้แม้ยังว่าง', () => {
  /* ODM/KA/SV เป็นค่าคงที่ใน permissions.TEAMS และมีด่าน CI คุมว่าทะเบียนต้องตรงกับโค้ด
     ⇒ ลบแถวออกไปทะเบียนกับโค้ดจะไม่ตรงกันทันที */
  const blocker = deleteTeamBlocker(team({ code: 'SV', name: 'Services' }), {
    usage: [], protectedCode: true,
  });
  assert.match(blocker, /ระบบอ้างในโค้ด/);
  assert.match(blocker, /ปิดทีม/);
});

test('ไม่พบทีม = ตอบให้ชัด ไม่ใช่ปล่อยผ่าน', () => {
  assert.equal(deleteTeamBlocker(null), 'ไม่พบทีม');
});

/* ── ทะเบียน "ที่ที่รหัสทีมไปโผล่" ต้องครบ ────────────────────────────────
   🔴 ตกหล่นตารางไหน = ลบทีมที่ยังถูกอ้างอยู่ได้เงียบ ๆ ⇒ ไล่จาก migration จริง
      ไม่ใช่จากความจำของคนเขียน */
test('🔴 ทุกตารางที่มีคอลัมน์ team ต้องอยู่ในทะเบียนตรวจการใช้งาน', () => {
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const known = new Set(TEAM_STAMPED_COLUMNS.map((c) => c.table));
  /* ตารางที่ **ไม่ใช่** รหัสทีมของทะเบียนนี้ — ประกาศไว้ให้เห็น ไม่ใช่ปล่อยเงียบ
     · `teams` คือทะเบียนเอง · `user_*` ไม่มีคอลัมน์ team (สังกัดอยู่ใน Auth) */
  const skip = new Set(['teams']);
  const found = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(new URL(file, dir), 'utf8');
    let current = null;
    for (const line of sql.split('\n')) {
      const m = line.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z_]+)|ALTER TABLE (?:ONLY )?public\.([a-z_]+)/i);
      if (m) current = m[1] || m[2];
      if (!current || skip.has(current)) continue;
      if (/(^|[\s"(,])"?team"?\s+text|ADD COLUMN[^;]*"?team"?\s+text|"teamCode"\s+text/i.test(line)) {
        found.add(current);
      }
    }
  }
  const missing = [...found].filter((t) => !known.has(t));
  assert.deepEqual(missing, [], `ตารางที่ประทับรหัสทีมแต่ยังไม่ถูกตรวจ: ${missing.join(', ')}`);
});

test('🔴 route ลบทีมต้องเป็นของแอดมินและต้องตรวจการใช้งานจริง', () => {
  const src = readFileSync(new URL('../../app/api/teams/[code]/route.js', import.meta.url), 'utf8');
  assert.match(src, /export const DELETE/);
  assert.match(src, /user\?\.role !== 'admin'/, 'หัวหน้าฝ่ายปิดทีมได้ แต่ลบไม่ได้');
  assert.match(src, /for \(const \{ table, column, label \} of TEAM_STAMPED_COLUMNS\)/);
  // อ่านตารางไม่สำเร็จ ห้ามตีความว่า "ว่าง" แล้วลบต่อ
  assert.match(src, /ตรวจการใช้งานทีมที่ตาราง/);
});
