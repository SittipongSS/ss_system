// ── สิทธิ์ที่แจกรายคนได้ ต้องถูกนับทุกที่ที่ระบบถาม ───────────────────────────
//
// สิทธิ์เสริมรายคน (`app_metadata.extraCaps` · GRANTABLE_CAPS) จะมีผลจริงก็ต่อเมื่อ
// ทุกด่านถามด้วย `canUser(user, cap)` / `useCan(cap)` ซึ่งรวมสิทธิ์เสริมเข้าไปด้วย
// ⚠️ `can(role, cap)` ถามแค่ตำแหน่ง ⇒ คนที่ได้สิทธิ์เสริมจะผ่านด่านหนึ่งแต่ตกอีกด่านเงียบ ๆ
//
// 🐞 ของจริงที่เจอ 25/11/2026: จอ /tax/filings เปิดตารางให้คนที่ได้ ra:view รายคน (useCan)
//    แต่ API `/api/tax/orders/table` กับ `/queue` ถาม `can(user.role, 'ra:view')` ⇒ 403 ·
//    หน้าลูกค้าศูนย์รวมไม่นับ ra:view รายคน · ป้ายนับงานบริหารไม่นับ mgmt:view รายคน ·
//    `canSeeProductCost(role)` ถาม products:margin จากตำแหน่ง (ถอดฟังก์ชันนี้ทิ้งแล้ว)
//
// เทสต์นี้สแกนซอร์สทั้ง `src/` กันไม่ให้มีด่านแบบถามแค่ตำแหน่งสำหรับสิทธิ์ที่แจกได้กลับมาอีก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  GRANTABLE_CAPS, GRANTABLE_CAP_LABELS, CLOSED_MODULES,
  grantableNow, blockedNewGrants, blockedGrantError, sanitizeExtraCaps, canUser,
} from '@/lib/permissions';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(m?js|jsx)$/.test(d.name) && !/\.test\.m?js$/.test(d.name))
    .map((d) => path.join(d.parentPath ?? d.path, d.name));
}

/* `can(<อะไรก็ได้>, '<cap>')` — ไม่นับ `canUser(` / `x.can(` · อาร์กิวเมนต์แรกซ้อนวงเล็บได้หนึ่งชั้น
   (`can(String(role), …)`) · และ `capsFor(…).includes('<cap>')` ซึ่งเป็นอีกทางของการถามแค่ตำแหน่ง */
const ROLE_ONLY = [
  /(?<![\w$.])can\(\s*(?:[^(),]|\([^()]*\))+,\s*(['"])([a-z]+:[a-z]+)\1/g,
  /(?<![\w$.])capsFor\([^()]*\)\.includes\(\s*(['"])([a-z]+:[a-z]+)\1/g,
];

test('⭐ ไม่มีด่านไหนถามสิทธิ์ที่แจกรายคนได้จากตำแหน่งอย่างเดียว — ต้องใช้ canUser / useCan', () => {
  const hits = [];
  const files = sourceFiles(SRC);
  assert.ok(files.length > 300, `สแกนเจอแค่ ${files.length} ไฟล์ — ตัวไล่โฟลเดอร์พัง เทสต์จะผ่านเปล่า ๆ`);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const re of ROLE_ONLY) {
      for (const m of text.matchAll(re)) {
        if (!GRANTABLE_CAPS.includes(m[2])) continue;
        const line = text.slice(0, m.index).split('\n').length;
        hits.push(`${path.relative(SRC, file)}:${line}  ${m[0]}`);
      }
    }
  }
  assert.deepEqual(
    hits,
    [],
    `ด่านที่ถามแค่ตำแหน่ง — คนที่ได้สิทธิ์เสริมรายคนจะตกด่านนี้เงียบ ๆ:\n${hits.join('\n')}\n`
    + 'เปลี่ยนเป็น canUser(user, cap) (ฝั่ง server) หรือ useCan(cap) (ฝั่งจอ)',
  );
});

test('ตัวสแกนจับรูปที่ต้องจับ และไม่จับ canUser (กันตัวสแกนตายเงียบ)', () => {
  const sample = [
    "if (!can(user.role, 'ra:view')) return;",
    'const x = can(role, "products:margin");',
    "capsFor(user.role).includes('team:manage')",
    "canUser(user, 'ra:view')",
    "useCan('audit:view')",
    "can(role, 'customers:view')",
  ].join('\n');
  const found = ROLE_ONLY.flatMap((re) => [...sample.matchAll(re)].map((m) => m[2]))
    .filter((cap) => GRANTABLE_CAPS.includes(cap));
  assert.deepEqual(found.sort(), ['products:margin', 'ra:view', 'team:manage']);
});

test('สิทธิ์เสริมรายคนมีผลจริงผ่าน canUser — ra:view ของ RD coordinator · products:margin ของ Senior AE', () => {
  assert.equal(canUser({ role: 'rd_coordinator' }, 'ra:view'), false);
  assert.equal(canUser({ role: 'rd_coordinator', extraCaps: ['ra:view'] }, 'ra:view'), true);
  assert.equal(canUser({ role: 'senior_ae', extraCaps: ['products:margin'] }, 'products:margin'), true);
  // แอดมินสิทธิ์ผู้ดูแลระบบแจกรายคนไม่ได้ ต่อให้ app_metadata ถูกแก้มือ
  assert.equal(canUser({ role: 'ae', extraCaps: ['users:manage'] }, 'users:manage'), false);
});

// ── สิทธิ์ของระบบที่ปิดอยู่แจกใหม่ไม่ได้ (มติเจ้าของ 25/11/2026) ──────────────────

test('grantableNow: ระบบที่ปิดอยู่ (CLOSED_MODULES) แจกใหม่ไม่ได้ · ระบบที่เปิดแจกได้ · นอกรายการแจกไม่ได้', () => {
  assert.ok(CLOSED_MODULES.includes('mgmt'), 'เทสต์นี้เขียนตอนงานบริหารปิดอยู่ — ถ้าเปิดแล้วให้แก้เคสด้านล่าง');
  assert.equal(grantableNow('mgmt:view'), false);
  assert.equal(grantableNow('mgmt:edit'), false);
  for (const cap of ['ra:view', 'products:margin', 'audit:view', 'users:view', 'team:manage']) {
    assert.equal(grantableNow(cap), true, cap);
  }
  assert.equal(grantableNow('users:manage'), false);
  assert.equal(grantableNow('ra:approve'), false);
});

test('ทุกสิทธิ์ที่แจกได้มีป้ายไทย — ข้อความปฏิเสธต้องอ่านออก', () => {
  for (const cap of GRANTABLE_CAPS) assert.ok(GRANTABLE_CAP_LABELS[cap], cap);
});

test('blockedNewGrants: นับเฉพาะที่ขอเพิ่มใหม่ — ของที่ถืออยู่แล้วไม่ทำให้แก้ชื่อ/เบอร์โดนปฏิเสธ', () => {
  assert.deepEqual(blockedNewGrants([], ['mgmt:edit', 'ra:view']), ['mgmt:edit']);
  assert.deepEqual(blockedNewGrants(['mgmt:view', 'mgmt:edit'], ['mgmt:view', 'mgmt:edit']), []);
  assert.deepEqual(blockedNewGrants(['mgmt:view'], ['mgmt:view', 'mgmt:edit']), ['mgmt:edit']);
  // ถอดออกได้เสมอ
  assert.deepEqual(blockedNewGrants(['mgmt:view', 'ra:view'], []), []);
  // ค่าเพี้ยน/ของนอกรายการถูกทิ้งก่อนตัดสิน (sanitizeExtraCaps) — ไม่ใช่ "ถูกปฏิเสธ"
  assert.deepEqual(blockedNewGrants(null, ['users:manage', 'ra:view']), []);
  assert.deepEqual(sanitizeExtraCaps(['users:manage', 'ra:view']), ['ra:view']);
});

test('blockedGrantError: ผ่าน = null · ไม่ผ่าน = ข้อความไทยที่บอกชื่อสิทธิ์', () => {
  assert.equal(blockedGrantError([], ['ra:view']), null);
  const msg = blockedGrantError([], ['mgmt:view']);
  assert.match(msg, /ปิดอยู่ทั้งระบบ/);
  assert.ok(msg.includes(GRANTABLE_CAP_LABELS['mgmt:view']));
});

test('API สร้าง/แก้ผู้ใช้ถามตัวตัดสินเดียวกัน (blockedGrantError) — แก้ผู้ใช้เทียบกับของเดิม', () => {
  const create = readFileSync(fileURLToPath(new URL('../app/api/users/route.js', import.meta.url)), 'utf8');
  const update = readFileSync(fileURLToPath(new URL('../app/api/users/[id]/route.js', import.meta.url)), 'utf8');
  assert.match(create, /blockedGrantError\(\[\], extraCaps\)/);
  assert.match(update, /blockedGrantError\(existingMeta\.extraCaps, extraCaps\)/);
});
