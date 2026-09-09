// ── ผู้ใช้สมมติตอน dev (bypass) ────────────────────────────────────────────
//
// ⚠️ ทางนี้เดินได้ **เฉพาะเมื่อ `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` ไม่มีค่า**
//   ซึ่งบน production มีเสมอ · เทสต์นี้ตรึงสองอย่าง: (ก) ค่าตั้งต้นไม่เปลี่ยนจากเดิม
//   (ข) env override ทำงานจริง เพื่อให้ UAT สวมบทบาทอื่นได้โดยไม่แตะรหัสผ่านใคร
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { devBypassUser } from './devBypass.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('ค่าตั้งต้นต้องเป็น ae_supervisor เหมือนเดิมทุกประการ', () => {
  const user = devBypassUser({});
  assert.equal(user.role, 'ae_supervisor');
  assert.equal(user.id, 'local-dev');
  /* 🔴 **ห้ามเปลี่ยน `id` ให้เป็น uuid ที่ถูกรูป** — โหมดนี้ `proxy.js` ข้ามด่านเขียน
     ทั้งหมด (proxy.js:32 คืน next() เมื่อ NEXT_PUBLIC_SUPABASE_* ว่าง) และ handler
     เขียนลง **ฐานข้อมูลจริง** ผ่าน service role · หกคอลัมน์ที่เป็น uuid
     (customers.ownerId · products.ownerId/approvedBy · orders.ownerId/filedBy ·
     projects.ownerId) ตีกลับ id นี้ ⇒ เส้นเขียนพวกนั้น **พังเสียงดัง** แทนที่จะ
     ปั๊มเจ้าของ/ผู้อนุมัติผีลงของจริงเงียบ ๆ · เจอ 500 จาก id นี้ที่ไหน ให้แก้ที่
     คำสั่งนั้น (เช่น api/pm/projects/route.js) ไม่ใช่แก้ที่ id */
  assert.doesNotMatch(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'id ของผู้ใช้สมมติต้องไม่ใช่ uuid ที่ถูกรูป — ดูเหตุผลข้างบน');
  assert.equal(user.devBypass, true);
  assert.deepEqual(user.teams, []);
  assert.equal(user.team, null);
});

test('⭐ สวมบทบาทอื่นได้ด้วย env — ใช้ตอน UAT แทนการล็อกอินด้วยรหัสผ่านคนอื่น', () => {
  const admin = devBypassUser({ NEXT_PUBLIC_DEV_BYPASS_ROLE: 'admin' });
  assert.equal(admin.role, 'admin');
  assert.equal(admin.department, 'AD', 'ฝ่ายถอยไปตามค่าตั้งต้นของ role');

  const tech = devBypassUser({ NEXT_PUBLIC_DEV_BYPASS_ROLE: 'ts', NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT: 'TS' });
  assert.equal(tech.role, 'ts');
  assert.equal(tech.department, 'TS');
});

test('ทีมรับได้ทั้งค่าเดียวและหลายทีม · ทีมหลัก = ตัวแรก', () => {
  const user = devBypassUser({ NEXT_PUBLIC_DEV_BYPASS_ROLE: 'ae', NEXT_PUBLIC_DEV_BYPASS_TEAM: 'SV,KA' });
  assert.deepEqual(user.teams, ['SV', 'KA']);
  assert.equal(user.team, 'SV');
});

test('role ที่ไม่รู้จักถอยกลับค่าตั้งต้น ไม่ใช่สร้าง role ผี', () => {
  assert.equal(devBypassUser({ NEXT_PUBLIC_DEV_BYPASS_ROLE: 'ผู้วิเศษ' }).role, 'ae_supervisor');
  assert.equal(devBypassUser({ NEXT_PUBLIC_DEV_BYPASS_ROLE: '' }).role, 'ae_supervisor');
});

/* คู่กับกฎข้างบน — เส้นที่ id สมมติทำให้พัง ต้องแก้ที่ **คำสั่ง** ไม่ใช่ที่ id
   `projects."ownerId"` เป็น uuid (mig 0008) ต่างจาก ownerId ของตารางอื่นที่เป็น text */
test('api/pm/projects ตัดเงื่อนไขเจ้าของทิ้งตอน devBypass แต่คนจริงต้องยังได้เหมือนเดิม', () => {
  const src = readFileSync(join(ROOT, 'src/app/api/pm/projects/route.js'), 'utf8');
  assert.match(src, /user\?\.devBypass\s*\n?\s*\? query\.or\(teamInClause\(user\)\)/,
    'ตอน devBypass ต้องเหลือแค่ขอบเขตทีม');
  assert.match(src, /: query\.or\(`\$\{teamInClause\(user\)\},ownerId\.eq\.\$\{own\}`\)/,
    'คนจริงต้องยังเห็นโครงการที่ตัวเองเป็นเจ้าของข้ามทีมเหมือนเดิม');
});
