import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  recentSystemForUser,
  SYSTEM_CATALOG,
  SYSTEM_ORDER,
  systemLandingForUser,
  systemsForUser,
} from './systems.js';
import { canUser } from '@/lib/permissions';

const keysFor = (user) => systemsForUser(user).map((system) => system.key);

// ⚠️ `support` (แจ้งปัญหาระบบ mig 0223) อยู่ท้ายลิสต์ของ **ทุก** เคสโดยเจตนา —
// เป็นระบบเดียวที่ `isVisible: () => true` เพราะคนที่เจอบั๊กบ่อยที่สุดคือคนที่สิทธิ์
// น้อยที่สุด (มติ Q2) · ถ้าวันหนึ่งมันหายจากเคสไหน แปลว่ามีคนไปใส่เงื่อนไข cap ให้มัน
test('system catalog keeps the agreed global order and role visibility', () => {
  // 'finance' แทรกหลัง 'service' (มติผู้ใช้ 2026-08-13) — โมดูลของฝ่ายอยู่ติดกัน
  assert.deepEqual(SYSTEM_ORDER, ['salesplan', 'rd', 'production', 'service', 'finance', 'tax', 'sahamit', 'master', 'mgmt', 'support']);
  assert.deepEqual(keysFor({ role: 'admin', team: null, extraCaps: [] }), SYSTEM_ORDER);
  assert.deepEqual(keysFor({ role: 'ae', team: 'ODM', extraCaps: [] }), ['salesplan', 'production', 'service', 'tax', 'master', 'support']);
  assert.deepEqual(keysFor({ role: 'ae', team: 'KA', extraCaps: [] }), ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']);
  // secretary/marketing ได้ products:view อ่านอย่างเดียว (มติ 2026-07-20) → เห็นการ์ด "ฐานข้อมูล" ด้วย
  assert.deepEqual(keysFor({ role: 'secretary', team: null, extraCaps: [] }), ['master', 'mgmt', 'support']);
  assert.deepEqual(keysFor({ role: 'ra', team: null, extraCaps: [] }), ['tax', 'master', 'support']);
});

test('system visibility covers every supported role and sales team', () => {
  const cases = [
    ['admin', null, SYSTEM_ORDER],
    ['secretary', null, ['master', 'mgmt', 'support']],
    ['ae_supervisor', null, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['marketing', null, ['salesplan', 'master', 'support']],
    ['ra', null, ['tax', 'master', 'support']],
    // ⭐ ฝ่าย R&D ได้บ้านของตัวเองแล้ว (ม-29) — การ์ดขึ้นจาก **ฝ่าย** ไม่ใช่ role
    ['rd', null, ['salesplan', 'rd', 'master', 'support']],
    // ⭐ viewer/executive อ่านได้ทุกระบบ แต่ **ยังไม่เห็น "วางแผนผลิต"** ตอนนี้ —
    // PR-1 มีแต่หน้าตั้งค่าไลน์ซึ่งผู้สังเกตการณ์ทำอะไรไม่ได้ · เปิดตอน PR-3 (บอร์ด)
    ['viewer', null, ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'mgmt', 'support']],
    /* ⭐ หนึ่งฝ่าย หนึ่ง role (2026-08-28) — เดิมทั้งห้าฝ่ายเป็น `staff` ตัวเดียว
       การ์ดจึงต้องขึ้นกับ **ฝ่าย** · ตอนนี้ role บอกฝ่ายอยู่แล้ว การ์ดจึงตรงกับ role */
    ['pc', null, ['salesplan', 'production', 'master', 'support']],
    ['pd', null, ['salesplan', 'production', 'master', 'support']],
    // WH/QC อ่านบอร์ดผลิตเพื่อวางแผนงานตัวเอง (มติผู้ใช้ 2026-07-31) แต่แก้ไม่ได้
    ['wh', null, ['salesplan', 'production', 'master', 'support']],
    ['qc', null, ['salesplan', 'production', 'master', 'support']],
    // ⭐ TS เป็นฝ่ายเดียวที่ไม่อยู่สายโรงงาน — ได้ธุรกิจบริการแทนวางแผนผลิต
    ['ts', null, ['salesplan', 'service', 'master', 'support']],
    /* ⭐ ฝ่ายบัญชี (มติผู้ใช้ 2026-08-13): *"เปิดระบบให้บัญชีเห็นแค่ฐานข้อมูลกับ
       บริหารงานขาย"* + บ้านของตัวเอง · **ห้ามมี `tax`** — เคยมีเพราะ role ถือ
       `history:view` ซึ่งเป็นตัวเปิดโมดูลภาษีทั้งโมดูล ไม่ใช่งานของฝ่ายนี้ */
    // ไม่มี 'salesplan' — เอกสารของ FN ย้ายเข้าโมดูลตัวเองแล้ว (มติ 2026-08-22)
    ['finance', null, ['finance', 'master', 'support']],
    ['senior_ae', 'ODM', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['senior_ae', 'KA', ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['senior_ae', 'SV', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ac', 'ODM', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ac', 'KA', ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['ac', 'SV', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ae', 'ODM', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
    ['ae', 'KA', ['salesplan', 'production', 'service', 'tax', 'sahamit', 'master', 'support']],
    ['ae', 'SV', ['salesplan', 'production', 'service', 'tax', 'master', 'support']],
  ];

  for (const [role, team, expected] of cases) {
    assert.deepEqual(keysFor({ role, team, extraCaps: [] }), expected, `${role}:${team || '-'}`);
  }
});

test('⭐ ฝ่ายโรงงานกับฝ่ายช่างไม่เห็นระบบของกันและกัน', () => {
  /* 🐞 ที่ต้องมีเทสต์นี้: เดิม PC/PD/WH/QC/TS ใช้ role `staff` ร่วมกัน ⇒ ถือ
     production:* / service:* ทั้งก้อน แล้วต้องหวังให้ด่าน **ฝ่าย** กันถูกทุกจุด ·
     หลุดที่ไหนที่หนึ่ง คลัง/QC จะได้ระบบโรงงาน + ธุรกิจบริการมาโดยไม่มีใครสังเกต
     ⭐ ตอนนี้ cap แคบตั้งแต่ role แล้ว เทสต์นี้จึงล็อกว่า "ให้ cap ถูก role" แทน */
  const at = (role) => keysFor({ role, team: null, extraCaps: [] });

  // ⭐ สายงานโรงงาน (PC/PD/WH/QC) เห็นระบบวางแผนผลิต — WH/QC อ่านบอร์ดเพื่อวางแผน
  // งานตัวเอง (มติผู้ใช้ 2026-07-31) · **TS เป็นฝ่ายเดียวที่ถูกกันออก** เพราะคนละทีม
  for (const role of ['pc', 'pd', 'wh', 'qc']) {
    assert.ok(at(role).includes('production'), role);
  }
  assert.ok(!at('ts').includes('production'));

  // ฝ่ายเทคนิคบริการเห็นระบบธุรกิจบริการ · ฝ่ายโรงงานไม่เห็น
  assert.ok(at('ts').includes('service'));
  for (const role of ['pc', 'pd', 'wh', 'qc']) {
    assert.ok(!at(role).includes('service'), role);
  }
});

test('specialized users land on the one workspace they can use', () => {
  const marketing = { role: 'marketing', team: null, extraCaps: [] };
  // ฝ่ายคลัง: ระบบขายที่เขาเห็นคือ "งานของฉัน" ไม่ใช่ลีด/ดีล
  const warehouse = { role: 'wh', team: null, department: 'WH', extraCaps: [] };

  assert.deepEqual(keysFor(marketing), ['salesplan', 'master', 'support']);
  assert.equal(systemLandingForUser('salesplan', marketing), '/sa/leads');
  assert.deepEqual(keysFor(warehouse), ['salesplan', 'production', 'master', 'support']);
  assert.equal(systemLandingForUser('salesplan', warehouse), '/sa/tasks');

  // ช่างฝ่าย TS ลงที่ **ภาพรวมของธุรกิจบริการ** (X-1) — ไม่ใช่ปฏิทินรวมสองระบบ
  const tech = { role: 'ts', team: null, department: 'TS', extraCaps: [] };
  assert.deepEqual(keysFor(tech), ['salesplan', 'service', 'master', 'support']);
  assert.equal(systemLandingForUser('service', tech), '/service');
});

test('X-1: สองระบบลงที่หน้าภาพรวมของตัวเอง — ไม่มีปลายทางร่วม', () => {
  // ⚠️ มติผู้ใช้ 2026-08-01: เลิกทำปฏิทินรวม · ถ้าวันหนึ่งมีคนทำ landing ของสอง
  // ระบบให้ชี้ที่เดียวกัน เทสต์นี้จะดับ — นั่นคือการกลับไปรวมสองทีมเข้าด้วยกันอีก
  const planner = { role: 'pc', team: null, department: 'PC', extraCaps: [] };
  const tech = { role: 'ts', team: null, department: 'TS', extraCaps: [] };
  const admin = { role: 'admin', team: null, extraCaps: [] };

  assert.equal(systemLandingForUser('production', planner), '/production');
  assert.equal(systemLandingForUser('service', tech), '/service');
  assert.notEqual(
    systemLandingForUser('production', admin),
    systemLandingForUser('service', admin),
  );
});

test('ฐานข้อมูล lands on the product list when the user has no customers:view', () => {
  // หน้าภาพรวม /database ผสมสถิติลูกค้า — บทบาทที่มีแค่ products:view ต้องข้ามไปหน้าสินค้า
  const secretary = { role: 'secretary', team: null, extraCaps: [] };
  const marketing = { role: 'marketing', team: null, extraCaps: [] };
  assert.equal(systemLandingForUser('master', secretary), '/database/products');
  assert.equal(systemLandingForUser('master', marketing), '/database/products');

  // ส่วนบทบาทที่ดูลูกค้าได้ ยังลงหน้าภาพรวมเหมือนเดิม
  for (const role of ['admin', 'ae_supervisor', 'ae', 'ra', 'viewer', 'pc', 'pd', 'wh', 'qc', 'ts', 'rd']) {
    assert.equal(systemLandingForUser('master', { role, team: 'ODM', extraCaps: [] }), '/database', role);
  }
});

test('recent system is accepted only while the current user can access it', () => {
  const secretary = { role: 'secretary', team: null, extraCaps: [] };
  const grantedSales = { role: 'ae', team: 'ODM', extraCaps: ['mgmt:view'] };

  assert.equal(recentSystemForUser(secretary, 'salesplan'), null);
  assert.equal(recentSystemForUser(secretary, 'master')?.key, 'master');
  assert.equal(recentSystemForUser(grantedSales, 'master')?.key, 'master');
  assert.equal(recentSystemForUser(grantedSales, 'unknown'), null);

  // สิทธิ์ราย **ผู้ใช้** ยังเปิดการ์ดระบบให้ได้ — เดิมเคสนี้ทดสอบผ่าน `mgmt` แต่
  // `mgmt` ถูกปิดชั่วคราว (ดูเทสต์ถัดไป) จึงใช้เป็นตัวอย่างของ "ระบบล่าสุด" ไม่ได้แล้ว
  assert.ok(keysFor(grantedSales).includes('mgmt'));
});

// ── ระบบที่ยังไม่เปิดใช้ (มติผู้ใช้ 2026-08-09) ──────────────────────────
//
// กฎคือ **จางแต่ยังอยู่** — ถ้าวันไหนมีคนไปกรองมันทิ้งใน `systemsForUser` การ์ดจะหาย
// แล้วผู้ใช้จะนึกว่าสิทธิ์ตัวเองโดนถอด · และถ้ามีคนถอด `disabled` ออกโดยไม่ตั้งใจ
// เทสต์นี้ดับเพื่อบังคับให้เป็นการตัดสินใจ ไม่ใช่ผลข้างเคียง
test('⭐ ระบบที่ยังไม่เปิดใช้ยังโชว์การ์ด แต่ห้ามถูกหยิบเป็น "ทำงานต่อ"', () => {
  const admin = { role: 'admin', team: null, extraCaps: [] };
  const disabledKeys = SYSTEM_CATALOG.filter((system) => system.disabled).map((system) => system.key);

  // `service` ถูกปลดออกจากลิสต์นี้ 2026-08-27 (แผนระบบธุรกิจบริการ เฟส 1 — มติผู้ใช้):
  // ฝ่าย TS เริ่มใช้เมนู "งานวันนี้ / จัดคิวช่าง" จริงแล้ว การ์ดจึงต้องกดได้
  assert.deepEqual(disabledKeys, ['production', 'mgmt']);

  for (const key of disabledKeys) {
    assert.ok(keysFor(admin).includes(key), `${key} ต้องยังอยู่ในลิสต์การ์ด`);
    assert.equal(recentSystemForUser(admin, key), null, `${key} ต้องไม่ขึ้นการ์ดทำงานต่อ`);
  }
});

/* ── กฎสามชั้น §ข้อ 5 + มติผู้ใช้ 2026-08-22 ────────────────────────────────
   docs/module-ownership-rule.md · เดิมกฎนี้พาฝ่ายบัญชี **ไปลงที่บ้านฝ่ายขาย**
   (`/sa/sales-orders` ใต้เปลือก "บริหารงานขาย") ซึ่งคือสิ่งที่ผู้ใช้บอกว่าผิด:
   *"อยากให้แต่ละฝ่ายทำงานเฉพาะของโมดูลตัวเอง โดยให้ส่วนข้อมูลกลางเดียวกัน"*
   ⇒ เอกสารสี่ชนิดของเขาย้ายไปอยู่ในกลุ่มเมนูของโมดูล "บัญชีและการเงิน" แล้ว
   การ์ด "บริหารงานขาย" จึงไม่มีของเหลือให้เขา และต้องไม่ขึ้นอีกต่อไป
   ⚠️ **ไม่ใช่การตัดสิทธิ์** — `salesplan:view` ยังอยู่ครบ (ดูเทสต์ข้างล่าง) */
test('⭐ ฝ่ายบัญชีไม่มีการ์ด "บริหารงานขาย" — เอกสารของเขาอยู่ในโมดูลตัวเองแล้ว', () => {
  const FN = { role: 'finance', department: 'FN', team: null, extraCaps: [] };
  assert.deepEqual(keysFor(FN), ['finance', 'master', 'support']);
  // สิทธิ์อ่านยังอยู่ — ที่ตัดคือ *เมนู* ไม่ใช่ *cap* (กฎข้อ 7)
  assert.ok(canUser(FN, 'salesplan:view'));
  // ฝ่ายขายและ RD ยังลงที่เดิมทุกอย่าง — กฎนี้แคบเฉพาะ FN โดยตั้งใจ
  // (ความกว้างของ RD เป็นมติที่ตัดสินไว้แล้ว อย่ายุบเป็นกฎเดียวกับ FN)
  assert.equal(systemLandingForUser('salesplan', { role: 'ae', team: 'SV', extraCaps: [] }), '/sa');
  assert.equal(systemLandingForUser('salesplan', { role: 'rd', team: null, extraCaps: [] }), '/sa');
  assert.equal(systemLandingForUser('salesplan', { role: 'admin', team: null, extraCaps: [] }), '/sa');
  assert.ok(keysFor({ role: 'rd', department: 'RD', team: null, extraCaps: [] }).includes('salesplan'));
});

// ── landing ต้องไม่ชี้หน้าที่เมนูเทาไว้ ────────────────────────────────────
// 🐞 กับดักที่เทสต์นี้กันไว้: การ์ดระบบกับแถบเมนูเป็นคนละไฟล์ (systems.js กับ
// AppLayout.js) — เทาเมนู "ภาพรวม" แล้วลืมแก้ landing = กดการ์ดแล้วเด้งเข้าหน้าที่
// ระบบเพิ่งบอกว่ายังไม่เปิด ซึ่งอ่านแล้วขัดกันเอง และ build/eslint จับไม่ได้เลย
// (เกิดกับ /finance มาก่อน แก้ทันตอนทำ · /rd ตามมาอีกใบ 2026-08-15)
test('⭐ ไม่มีระบบไหน landing ลงหน้าที่เมนูของมันเทาไว้', () => {
  const nav = readFileSync(new URL('../components/AppLayout.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // เก็บ href ของทุกเมนูที่ตั้ง disabled: true ไว้ในบรรทัดเดียวกัน
  const disabledHrefs = new Set(
    [...nav.matchAll(/\{\s*href:\s*'([^']+)'[^}]*disabled:\s*true/g)].map((m) => m[1]),
  );
  assert.ok(disabledHrefs.size > 0, 'อ่านเมนูที่เทาไว้ไม่เจอสักอัน — เทสต์นี้จะกลายเป็นเทสต์เปล่า');

  const admin = { role: 'admin', team: null, extraCaps: [] };
  for (const system of SYSTEM_CATALOG) {
    const landing = systemLandingForUser(system, admin);
    assert.ok(
      !disabledHrefs.has(landing),
      `ระบบ "${system.key}" ลงที่ ${landing} ซึ่งเมนูเทาไว้ — แก้ landing ให้ชี้หน้าที่กดได้จริง`,
    );
  }
});
