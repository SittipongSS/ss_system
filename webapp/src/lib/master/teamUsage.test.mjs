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

test('🔴 สามทีมตั้งต้น (KA/ODM/SV) ลบไม่ได้แม้ยังว่าง', () => {
  /* รหัสสามตัวนี้ถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19 ตารางไปแล้ว และยังเป็นค่าถอย
     ของฝั่งจอที่อ่านแบบ sync ⇒ ลบแถวออกไป ป้ายในรายงานย้อนหลังกลายเป็นรหัสดิบ
     ⚠️ ตั้งแต่ปลดล็อกทีมขายใหม่ (2026-09-07) ข้อนี้คุ้ม **เฉพาะสามทีมตั้งต้น** —
        ทีมขายที่สร้างใหม่และยังไม่มีใครใช้ ลบได้ตามปกติ */
  const blocker = deleteTeamBlocker(team({ code: 'SV', name: 'Services' }), {
    usage: [], protectedCode: true,
  });
  assert.match(blocker, /ทีมตั้งต้นของระบบ/);
  assert.match(blocker, /ปิดทีม/);
});

test('ทีมขายที่สร้างใหม่และยังไม่มีใครใช้ ลบได้', () => {
  // ไม่มีอะไรค้าง = ไม่มีข้อความบล็อก (ฟังก์ชันคืนสตริงว่าง ไม่ใช่ null)
  assert.equal(deleteTeamBlocker(team({ code: 'SA-NORTH', name: 'ทีมภาคเหนือ' }), {
    usage: [], protectedCode: false,
  }), '');
});

test('ไม่พบทีม = ตอบให้ชัด ไม่ใช่ปล่อยผ่าน', () => {
  assert.equal(deleteTeamBlocker(null), 'ไม่พบทีม');
});

/* ── ทะเบียน "ที่ที่รหัสทีมไปโผล่" ต้องครบ **และต้องมีอยู่จริง** ──────────────
   🔴 ตกหล่นตารางไหน = ลบทีมที่ยังถูกอ้างอยู่ได้เงียบ ๆ
   🔴 มีตารางที่ตายไปแล้วในลิสต์ = ด่านโยน 500 ทุกครั้ง ⇒ **ลบทีมไม่ได้เลย**
   ⇒ เทียบ **สองทาง** จากประวัติสคีมาจริง ไม่ใช่จากความจำของคนเขียน

   🐞 ของเดิมไล่ทางเดียว และอ่านเฉพาะ `supabase/migrations/` — พลาดสองแบบพร้อมกัน
      (พบ 2026-09-07):
      · `customers` · `products` · `orders` เกิดใน `supabase/schema.sql` ⇒ ไม่เคยถูกไล่เจอ
        ทั้งที่ถือรหัสทีมรวมกัน ~600 แถวบน production
      · `inquiries` (mig 0174 ลบ) · `material_price_requests` (mig 0158 ลบ) ·
        `material_price_asks` (mig 0173 เปลี่ยนชื่อเป็น `dept_requests`) ยังค้างในลิสต์
        ⇒ PostgREST ตอบ PGRST205 ⇒ ปุ่มลบทีมพังเงียบมาตั้งแต่ mig 0174

   ⚠️ ตัวไล่ต้อง **ตัดคอมเมนต์ทิ้งก่อน** — บล็อก rollback ท้าย migration เขียน SQL
      ย้อนกลับไว้เป็นคอมเมนต์ (`-- ALTER TABLE ... RENAME TO material_price_asks;`)
      ซึ่งจะ "เปลี่ยนชื่อกลับ" ให้ตัวไล่ถ้าอ่านทั้งบรรทัด */
const scanSchemaHistory = () => {
  const supabase = new URL('../../../supabase/', import.meta.url);
  const migrations = new URL('migrations/', supabase);
  const files = [
    new URL('schema.sql', supabase),
    ...readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => new URL(f, migrations)),
  ];

  const alive = new Set();
  const stamped = new Map();   // ตาราง → Set(คอลัมน์ที่ประทับรหัสทีม)
  const stamp = (table, column) => {
    if (!stamped.has(table)) stamped.set(table, new Set());
    stamped.get(table).add(column);
  };

  for (const file of files) {
    let current = null;
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.split('--')[0];
      const dropped = line.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.([a-z_]+)/i);
      if (dropped) {
        alive.delete(dropped[1]); stamped.delete(dropped[1]); current = null; continue;
      }
      const renamed = line.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.([a-z_]+)\s+RENAME\s+TO\s+([a-z_]+)/i);
      if (renamed) {
        const [, from, to] = renamed;
        if (alive.delete(from)) alive.add(to);
        if (stamped.has(from)) { stamped.set(to, stamped.get(from)); stamped.delete(from); }
        current = to; continue;
      }
      const created = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_]+)/i);
      if (created) { alive.add(created[1]); current = created[1]; continue; }
      const altered = line.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?public\.([a-z_]+)/i);
      if (altered) current = altered[1];
      if (!current) continue;
      /* ⚠️ ชื่อคอลัมน์ต้องถูกต้อง ไม่ใช่แค่ "ตารางนี้มีรหัสทีม" — `team_members` ใช้
         `teamCode` ⇒ เหมาเป็น `team` แล้วด่านจะไปถามคอลัมน์ที่ไม่มีอยู่ */
      if (/"teamCode"\s+text/i.test(line)) stamp(current, 'teamCode');
      else if (/(^|[\s"(,])"?team"?\s+text|ADD COLUMN[^;]*"?team"?\s+text/i.test(line)) {
        stamp(current, 'team');
      }
      if (/"teams"\s+jsonb/i.test(line)) stamp(current, 'teams');
    }
  }
  return { alive, stamped };
};

test('🔴 ทุกตารางที่มีคอลัมน์ team ต้องอยู่ในทะเบียนตรวจการใช้งาน', () => {
  const { alive, stamped } = scanSchemaHistory();
  const known = new Set(TEAM_STAMPED_COLUMNS.map((c) => c.table));
  /* ตารางที่ **ไม่ใช่** รหัสทีมของทะเบียนนี้ — ประกาศไว้ให้เห็น ไม่ใช่ปล่อยเงียบ
     · `teams` คือทะเบียนเอง · `user_*` ไม่มีคอลัมน์ team (สังกัดอยู่ใน Auth) */
  const skip = new Set(['teams']);
  const missing = [...stamped.keys()]
    .filter((t) => alive.has(t) && !skip.has(t) && !known.has(t)).sort();
  assert.deepEqual(missing, [], `ตารางที่ประทับรหัสทีมแต่ยังไม่ถูกตรวจ: ${missing.join(', ')}`);
});

/* 🔴 อีกทางของด่านเดียวกัน — ตารางที่ตายแล้วในลิสต์ทำให้ **ลบทีมไม่ได้เลย** ไม่ใช่แค่
   "ตรวจไม่ครบ" · PostgREST ตอบ PGRST205 แล้ว route โยน 500 ก่อนถึงตัวตัดสินด้วยซ้ำ */
test('🔴 ทุกตารางในทะเบียนต้องยังมีอยู่จริง — ตารางที่ถูกลบ/เปลี่ยนชื่อทำให้ด่านพังทั้งด่าน', () => {
  const { alive } = scanSchemaHistory();
  const dead = [...new Set(TEAM_STAMPED_COLUMNS.map((c) => c.table))]
    .filter((t) => !alive.has(t)).sort();
  assert.deepEqual(dead, [], `ตารางในทะเบียนที่ไม่มีอยู่ในฐานแล้ว: ${dead.join(', ')}`);
});

/* คอลัมน์ก็ต้องตรงด้วย ไม่ใช่แค่ชื่อตาราง — ประทับคอลัมน์ใหม่แล้วลืมมาเติมที่นี่
   คือรูปเดิมของบั๊กทุกครั้ง */
test('🔴 คอลัมน์ที่ประทับรหัสทีมต้องอยู่ในทะเบียนครบทุกคอลัมน์', () => {
  const { alive, stamped } = scanSchemaHistory();
  const known = new Set(TEAM_STAMPED_COLUMNS.map((c) => `${c.table}.${c.column}`));
  const missing = [];
  for (const [table, columns] of stamped) {
    if (!alive.has(table) || table === 'teams') continue;
    for (const column of columns) {
      if (!known.has(`${table}.${column}`)) missing.push(`${table}.${column}`);
    }
  }
  assert.deepEqual(missing.sort(), [], `คอลัมน์ที่ประทับรหัสทีมแต่ยังไม่ถูกตรวจ: ${missing.join(', ')}`);
});

/* 🔴 ยามของ **รูที่เพิ่งอุด** — สามตารางยุคก่อน migration ต้องอยู่ในทะเบียนเสมอ
   ตัวไล่ข้างบนจับได้อยู่แล้ว *ถ้า* มันยังอ่าน schema.sql · ข้อนี้กันคนถอดไฟล์นั้น
   ออกจากตัวไล่แล้วด่านกลับมาเขียวเงียบ ๆ */
test('🔴 ตารางยุคก่อน migration (customers · products · orders) ต้องอยู่ในทะเบียน', () => {
  const known = new Set(TEAM_STAMPED_COLUMNS.map((c) => c.table));
  for (const table of ['customers', 'products', 'orders']) {
    assert.ok(known.has(table), `${table} ถือรหัสทีมบน production แต่หลุดจากด่านตรวจการใช้งาน`);
  }
});

/* ⚠️ `customers.teams` เป็น jsonb array — เทียบด้วย `.eq()` ได้ 0 เสมอ
   ⇒ แถวนั้นต้องบอก `match: 'jsonbArray'` ไม่งั้นด่านตอบว่าว่างทั้งที่มี 209 แถว */
test('🔴 คอลัมน์ jsonb ต้องประกาศวิธีเทียบ ไม่ใช่ปล่อยให้ตกไปเป็น eq', () => {
  const jsonb = TEAM_STAMPED_COLUMNS.find((c) => c.table === 'customers' && c.column === 'teams');
  assert.ok(jsonb, 'customers.teams (ทีมที่ร่วมดูแลลูกค้า) ต้องอยู่ในทะเบียน');
  assert.equal(jsonb.match, 'jsonbArray');
});

test('🔴 route ลบทีมต้องเป็นของแอดมินและต้องตรวจการใช้งานจริง', () => {
  const src = readFileSync(new URL('../../app/api/teams/[code]/route.js', import.meta.url), 'utf8');
  assert.match(src, /export const DELETE/);
  assert.match(src, /user\?\.role !== 'admin'/, 'หัวหน้าฝ่ายปิดทีมได้ แต่ลบไม่ได้');
  // ⚠️ ต้องเรียก **ตัวสแกนกลาง** ไม่ใช่ลูปของตัวเอง — ลูปที่ก๊อปไว้จะพลาดคอลัมน์ jsonb
  assert.match(src, /scanTeamUsage\(supabase, code\)/);
});

/* ── เปลี่ยนรหัสทีม ต้องเดินด่านเดียวกับลบทีม (มติผู้ใช้ 2026-09-07) ────────
   🔴 รหัสถูกก๊อปเป็น **ข้อความ** ไม่ใช่ FK ⇒ เปลี่ยนรหัสของทีมที่ถูกใช้แล้ว = แถวเก่า
      ทั้งหมดชี้ทีมที่ไม่มีอยู่ **โดยไม่มีอะไรพังให้เห็น** (ต่างจากลบทีมที่อย่างน้อยยัง
      มี FK ของ `team_members` คอยขวาง) ⇒ ด่านต้องเข้มเท่ากันเป๊ะ */
test('🔴 PATCH เปลี่ยนรหัสทีมต้องสแกนการใช้งานจริงก่อน และห้ามแตะทีมตั้งต้น', () => {
  const src = readFileSync(new URL('../../app/api/teams/[code]/route.js', import.meta.url), 'utf8');
  assert.match(src, /const nextCode = /, 'ต้องแยกเคส "ส่ง code มาแต่เท่าเดิม" ออกจาก "เปลี่ยนรหัส"');
  assert.match(src, /if \(nextCode\) \{[\s\S]*?scanTeamUsage\(supabase, code\)/,
    'เปลี่ยนรหัสต้องสแกนการใช้งานก่อนเขียนเสมอ');
  assert.match(src, /if \(nextCode\) \{[\s\S]*?TEAMS\.includes\(code\)/,
    'สามทีมตั้งต้นเปลี่ยนรหัสไม่ได้');
  assert.match(src, /loadTeamHolderIds\(supabase, code\)/, 'ทีมขายนับสมาชิกจาก Auth ไม่ใช่ตาราง');
});

/* ⚠️ ไม่ส่ง `code` มา = ห้ามวิ่งสแกน 19 ตาราง — แก้หมายเหตุอย่างเดียวไม่ควรจ่ายราคานั้น */
test('แก้ทีมโดยไม่เปลี่ยนรหัส ต้องไม่วิ่งสแกนการใช้งาน', () => {
  const src = readFileSync(new URL('../../app/api/teams/[code]/route.js', import.meta.url), 'utf8');
  const patch = src.slice(src.indexOf('export const PATCH'), src.indexOf('export const DELETE'));
  const scanAt = patch.indexOf('scanTeamUsage');
  const guardAt = patch.indexOf('if (nextCode) {');
  assert.ok(guardAt >= 0 && scanAt > guardAt, 'ตัวสแกนต้องอยู่ **ใน** เงื่อนไขเปลี่ยนรหัส');
});
