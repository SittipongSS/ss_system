// ── เมนูตั้งค่ากับด่าน proxy ต้องพูดตรงกัน ────────────────────────────────────
//
// 🐞 ของจริงที่ผู้ใช้เจอ (2026-08-21): บางบัญชีกด "ต้นแบบดีไซน์ระบบ" จากหน้าตั้งค่า
// แล้ว **เด้งไปหน้าแรก** — แถบข้าง/หน้าภาพรวมอ่านสิทธิ์จาก `visible()` ของ
// config/settingsNav.js ส่วน proxy เป็น allowlist คนละชุด ⇒ ลิงก์ที่โชว์ให้กด
// พาไปชนด่านที่ไม่รู้จัก path นั้น แล้ว redirect เงียบ ๆ
//
// ⚠️ เทสต์นี้คือด่านกันไหลกลับ: **เห็นเมนู = ต้องเปิดหน้าได้** ทุกรายการ ทุกบทบาท
// รวมสิทธิ์รายคน (extraCaps) ซึ่งเป็นจุดที่ `can(role, …)` ของ proxy เคยมองไม่เห็น
import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_NAV } from './settingsNav.js';
import { lockedOut } from '../proxy.js';

const ROLES = [
  'admin', 'ae_supervisor', 'ae', 'senior_ae', 'ac', 'rd', 'pc', 'pd', 'qc',
  'lg', 'wh', 'ts', 'ra', 'staff', 'viewer', 'secretary', 'executive', 'finance',
];

// สิทธิ์รายคนที่ผู้ดูแลระบบให้กันจริงในระบบนี้ (ดู sanitizeExtraCaps)
const GRANTS = [[], ['master:manage'], ['users:view'], ['users:manage'], ['audit:view']];

const ITEMS = SETTINGS_NAV.flatMap((group) => group.items);

test('เห็นเมนูไหน = เปิดหน้านั้นได้ (ทุกบทบาท × ทุกชุดสิทธิ์รายคน)', () => {
  const broken = [];
  for (const role of ROLES) {
    for (const extraCaps of GRANTS) {
      const user = { role, extraCaps };
      for (const item of ITEMS) {
        if (!item.visible(user)) continue;
        if (lockedOut(user, item.href, 'GET', false)) {
          broken.push(`${role}${extraCaps.length ? ` +${extraCaps.join(',')}` : ''} → ${item.href}`);
        }
      }
    }
  }
  assert.deepEqual(broken, [], 'เมนูโชว์ให้กดแต่ proxy เด้งกลับ — ลิงก์ตายเงียบ ๆ');
});

test('ไม่เห็นเมนู = ยังต้องถูกด่านกันไว้ (เมนูไม่ใช่ด่าน)', () => {
  // ตัวอย่างที่ต้องแน่ใจว่ายังปิดอยู่จริง — ผู้ใช้ทั่วไปไม่มีทางเปิดค่าตั้งของระบบ
  const plain = { role: 'ae', extraCaps: [] };
  for (const href of ['/settings/company', '/settings/workflow-templates', '/settings/cost-templates', '/settings/storage', '/audit', '/users']) {
    assert.equal(lockedOut(plain, href, 'GET', false), true, `${href} ต้องยังปิดสำหรับ ae`);
  }
});

test('หน้าที่เปิดให้ทุกคน: ภาพรวมตั้งค่า · ปฏิทินวันหยุด · ต้นแบบดีไซน์', () => {
  for (const role of ROLES) {
    const user = { role, extraCaps: [] };
    for (const href of ['/settings', '/settings/holidays', '/settings/design-preview']) {
      assert.equal(lockedOut(user, href, 'GET', false), false, `${role} ${href}`);
    }
  }
});
