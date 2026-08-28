// ── ผู้ใช้สมมติตอน dev (bypass) ────────────────────────────────────────────
//
// ⚠️ ทางนี้เดินได้ **เฉพาะเมื่อ `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` ไม่มีค่า**
//   ซึ่งบน production มีเสมอ · เทสต์นี้ตรึงสองอย่าง: (ก) ค่าตั้งต้นไม่เปลี่ยนจากเดิม
//   (ข) env override ทำงานจริง เพื่อให้ UAT สวมบทบาทอื่นได้โดยไม่แตะรหัสผ่านใคร
import test from 'node:test';
import assert from 'node:assert/strict';
import { devBypassUser } from './devBypass.js';

test('ค่าตั้งต้นต้องเป็น ae_supervisor เหมือนเดิมทุกประการ', () => {
  const user = devBypassUser({});
  assert.equal(user.role, 'ae_supervisor');
  assert.equal(user.id, 'local-dev');
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
