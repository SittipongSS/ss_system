// ── แอดมินต้องถือทุกสิทธิ์ที่มีอยู่จริงในระบบ ───────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28: "ขอสิทธิ์ทุกอย่างให้แอดมิน รวมลบด้วย"**
//
// 🐞 ที่มา: `SUPERUSER_CAPS` เขียนคอมเมนต์ไว้เองว่า *"Every capability in the system"*
//   แต่ตรวจจริงแล้ว **ขาดไป 2 ตัว** (`requests:answer`, `users:view`) และไม่มีใครรู้
//   เพราะแต่ละจุดแก้เฉพาะหน้ากันเอง:
//     · เมนูฝ่าย RD/FN เขียน `caps: ['requests:answer', 'users:manage']` — ยัด
//       `users:manage` เข้าไปเพื่อให้ admin เห็นเมนู ทั้งที่ไม่เกี่ยวกันเลย
//     · `api/admin/signature-coverage/route.js` คอมเมนต์ไว้ว่า *"เช็ค users:view
//       ตัวเดียวไม่ได้ เพราะไม่มี role ไหนถือ cap นั้นเลย"*
//   ⇒ ด่านนี้อ่าน **สตริงสิทธิ์ที่ถูกใช้จริงทั้งรีโป** แล้วบังคับว่า admin ต้องมีครบ
//   เพิ่ม cap ใหม่ในอนาคตแล้วลืมใส่ให้ admin = เทสต์แดงทันที ไม่ต้องรอมีคนบ่น
//
// ⚠️ ด่านนี้ตรวจ **ชั้น cap** อย่างเดียว — helper ที่แคบด้วยฝ่าย/ทีมทับลงไปอีกชั้น
//   (canAccessRd · canConfirmPayment · canEditService …) เป็นคนละเรื่องและมีเทสต์
//   ของตัวเอง · admin ผ่านชั้นนั้นด้วยทางลัด `role === 'admin'` ไม่ใช่ด้วย cap
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canUser } from './permissions.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ชื่อกลุ่มสิทธิ์ที่มีอยู่จริง — ประกาศไว้ตรงนี้เพื่อไม่ให้ regex ไปคว้าสตริงหน้าตา
   คล้ายกันที่ไม่ใช่สิทธิ์ (เช่น `finance:todo` ซึ่งเป็นสถานะรางของใบสั่งขาย
   และ `doc:now` / `money:todo` ชุดเดียวกัน) */
const CAP_GROUPS = [
  'customers', 'products', 'sales', 'ra', 'history', 'audit', 'users', 'master',
  'pm', 'salesplan', 'sahamit', 'costing', 'production', 'service', 'payments',
  'mgmt', 'team', 'requests',
];

/* สตริงที่หน้าตาเป็นสิทธิ์แต่ไม่ใช่ — ถ้าเจอตัวใหม่ให้เติมที่นี่พร้อมเหตุผล */
const NOT_A_CAP = new Set([
  'salesplan:deal',   // 🐞 สิทธิ์ที่ไม่เคยมีจริง — เคยถูกถามใน useCan แล้วแก้ไปแล้ว
                      //    (lib/sales/leads.js อธิบายไว้) เก็บไว้กันคนเผลอเพิ่มกลับ
]);

const CAP_RE = new RegExp(`'(?:${CAP_GROUPS.join('|')}):[a-z]+'`, 'g');

function capsInRepo() {
  const found = new Map();   // cap → ไฟล์แรกที่เจอ
  for (const file of walk(srcRoot)) {
    const rel = path.relative(srcRoot, file).replaceAll('\\', '/');
    if (!/\.(js|jsx|mjs)$/.test(rel)) continue;
    const text = readFileSync(file, 'utf8');
    for (const hit of text.matchAll(CAP_RE)) {
      const cap = hit[0].slice(1, -1);
      if (NOT_A_CAP.has(cap)) continue;
      if (!found.has(cap)) found.set(cap, rel);
    }
  }
  return found;
}

test('⭐ แอดมินถือทุกสิทธิ์ที่ถูกใช้จริงในรีโป — ไม่มีข้อยกเว้น', () => {
  const caps = capsInRepo();
  assert.ok(caps.size >= 30, `หาสิทธิ์เจอแค่ ${caps.size} ตัว — regex น่าจะพัง`);

  const admin = { role: 'admin' };
  const missing = [...caps.entries()]
    .filter(([cap]) => !canUser(admin, cap))
    .map(([cap, file]) => `${cap} (ใช้ที่ ${file})`);

  assert.deepEqual(missing, [],
    'เพิ่ม cap ใหม่แล้วต้องใส่ใน SUPERUSER_CAPS ด้วย — มติ "admin ทำได้ทุกอย่าง"');
});

test('สิทธิ์ที่ให้ผู้ใช้รายคนได้ (GRANTABLE_CAPS) แอดมินต้องมีอยู่แล้วทุกตัว', async () => {
  const { GRANTABLE_CAPS } = await import('./permissions.js');
  const admin = { role: 'admin' };
  assert.deepEqual(GRANTABLE_CAPS.filter((cap) => !canUser(admin, cap)), []);
});

test('⚠️ การเติมสิทธิ์ให้แอดมินต้องไม่หลุดไปหาหัวหน้าฝ่ายขาย', () => {
  // SALES_HEAD_CAPS = SUPERUSER_CAPS ลบรายการที่กันไว้ ⇒ ทุกครั้งที่เติม cap ให้
  // admin หัวหน้าฝ่ายขายจะได้ตามไปด้วยโดยอัตโนมัติ ถ้าไม่กันไว้ที่ SALES_HEAD_EXCLUDED
  const head = { role: 'ae_supervisor', team: 'KA' };
  for (const cap of ['users:manage', 'users:view', 'master:manage', 'audit:view',
    'ra:approve', 'products:margin', 'mgmt:view', 'mgmt:edit',
    'costing:approve', 'costing:quote', 'requests:answer']) {
    assert.equal(canUser(head, cap), false, `หัวหน้าฝ่ายขายไม่ควรถือ ${cap}`);
  }
});
