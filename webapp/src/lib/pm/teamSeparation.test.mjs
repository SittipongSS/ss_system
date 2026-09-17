// ── แผนการผลิต (PD/PC) กับ ธุรกิจบริการ (TS) ต้องแยกจากกัน ────────────────
//
// ⭐ มติผู้ใช้ 2026-07-31: **สองระบบนี้เป็นคนละทีมปฏิบัติงาน** — แผนการผลิตคือ PD
// ธุรกิจบริการคือ TS · เจ้าหน้าที่ไม่ต้องเห็นตารางโรงงาน และคนโรงงานไม่ต้องเห็นนัดเข้าไซต์
//
// 🐞 ที่ต้องมีเทสต์ชุดนี้: cap `production:view` / `service:view` อยู่ที่ **role `staff`**
// ซึ่ง PC/PD/WH/QC/TS ใช้ร่วมกันทั้งหมด — ตัวกั้นจริงคือ *ฝ่าย* ที่เขียนไว้ในฟังก์ชัน
// ถ้าวันไหนมีคนลืมแคบด้วยฝ่าย ทั้งสองระบบจะรั่วหากันโดยไม่มีอะไรฟ้อง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditProduction,
  canEditService,
  canViewProduction,
  canViewService,
} from '../permissions.js';
import { systemsForUser } from '../../config/systems.js';

/* ⭐ หนึ่งฝ่าย หนึ่ง role (2026-08-28) — เดิมทั้งห้าฝ่ายเป็น role `staff` ตัวเดียว
   จึงต้องพิสูจน์ว่าด่าน **ฝ่าย** กันถูก · ตอนนี้ cap แคบตั้งแต่ role แล้ว เทสต์ชุดนี้
   จึงกลายเป็นตัวล็อกว่า "ให้ cap ถูกฝ่าย" ซึ่งยังต้องคุมเหมือนเดิม */
const ROLE_OF = { PC: 'pc', PD: 'pd', WH: 'wh', QC: 'qc', TS: 'ts' };
const at = (department) => ({ role: ROLE_OF[department], department, extraCaps: [] });
const keys = (user) => systemsForUser(user).map((s) => s.key);

test('⭐ ฝ่ายผลิต (PD) เห็นแต่ระบบวางแผนผลิต — ไม่แตะธุรกิจบริการเลย', () => {
  /* ⚠️ **PC ไม่อยู่ในเทสต์นี้แล้ว** (มติผู้ใช้ 2026-09-16 "เปิดให้เฉพาะ PD กับ Admin") —
     ดูเทสต์ถัดไปที่ล็อกไว้ว่าเขาถูกตัดออกจริง */
  const dept = 'PD';
  assert.equal(canViewProduction(at(dept)), true);
  assert.equal(canEditProduction(at(dept)), true);
  assert.equal(canViewService(at(dept)), false);
  assert.equal(canEditService(at(dept)), false);
  assert.ok(keys(at(dept)).includes('production'));
  assert.ok(!keys(at(dept)).includes('service'));
});

test('🔴 โมดูลวางแผนผลิตเหลือ PD กับ admin — PC/WH/QC ไม่เห็นการ์ดแล้ว (มติ 2026-09-16)', () => {
  for (const dept of ['PC', 'WH', 'QC']) {
    assert.equal(canViewProduction(at(dept)), false, dept);
    assert.equal(canEditProduction(at(dept)), false, dept);
    assert.deepEqual(keys(at(dept)).filter((k) => k === 'production'), [], dept);
  }
  assert.ok(keys({ role: 'admin', extraCaps: [] }).includes('production'));
});

test('⭐ TS ยังถูกกันออกจากตารางผลิต — คนละทีมปฏิบัติงาน (คนละเหตุผลกับ PC/WH/QC)', () => {
  /* TS ไม่มี `production:view` ตั้งแต่ชั้น role ⇒ ถูกกันแม้วันไหนจะเปิดด่านฝ่ายคืน
     ส่วน PC/WH/QC ถือ cap อยู่ แต่ถูกด่านฝ่ายกั้น (มติ 2026-09-16) */
  assert.equal(canViewProduction(at('TS')), false);
  assert.equal(canViewProduction(at('PD')), true);
});

test('⭐ ฝ่ายเทคนิคบริการ (TS) เห็นแต่ธุรกิจบริการ — ไม่เห็นตารางผลิตแม้แต่อ่าน', () => {
  // 🐞 ของเดิม canViewProduction ไม่แคบด้วยฝ่าย → TS อ่านตารางผลิตได้ทั้งระบบ
  // ยังไม่มีใครเห็นเพราะการ์ดระบบกั้นด้วย canEditProduction แต่ P-3 วางแผนจะเปิด
  // บอร์ดด้วย canViewProduction ซึ่งจะทำให้ระบบโรงงานโผล่ให้ TS ตอนนั้นเงียบ ๆ
  assert.equal(canViewProduction(at('TS')), false);
  assert.equal(canEditProduction(at('TS')), false);
  assert.equal(canViewService(at('TS')), true);
  /* ⚠️ `at('TS')` = **เจ้าหน้าที่หน้างาน** (role `ts`) ซึ่งตั้งแต่ 2026-08-30 ไม่ถือ service:edit
     แล้ว — เขาปิดงานของตัวเองผ่าน service:work · คนแก้ตารางคือ Planner/หัวหน้า */
  assert.equal(canEditService(at('TS')), false);
  assert.equal(canEditService({ role: 'ts_planner', department: 'TS', extraCaps: [] }), true);
  assert.deepEqual(keys(at('TS')).filter((k) => k === 'production'), []);
  assert.ok(keys(at('TS')).includes('service'));
});

test('⭐ ฝ่ายคลัง/QC ไม่แตะธุรกิจบริการ (ตารางผลิตก็ไม่เห็นแล้วตั้งแต่ 2026-09-16)', () => {
  for (const dept of ['WH', 'QC']) {
    assert.equal(canEditProduction(at(dept)), false, dept);   // ไม่มี production:edit ตั้งแต่ชั้น role
    assert.equal(canViewService(at(dept)), false, dept);
    assert.deepEqual(keys(at(dept)).filter((k) => k === 'service'), [], dept);
  }
});

test('🔴 ฝ่ายขายเข้าไม่ได้ทั้งตารางผลิตและธุรกิจบริการ', () => {
  const ka = { role: 'ae', team: 'KA', department: 'SA', extraCaps: [] };
  const sv = { role: 'ae', team: 'SV', department: 'SA', extraCaps: [] };
  /* 🔴 มติผู้ใช้ 2026-09-16: วางแผนผลิตเหลือ PD กับ admin — เดิมฝ่ายขายอ่านบอร์ดได้
     เพื่อตอบลูกค้าว่าผลิตวันไหน · cap `production:view` ยังอยู่ ตัวกั้นคือด่านฝ่าย */
  assert.equal(canViewProduction(ka), false);
  assert.equal(canEditProduction(ka), false);   // ขายไม่แก้ตารางโรงงาน
  /* 🔴 มติผู้ใช้ 2026-08-30: "ระบบธุรกิจบริการ เข้าใช้ได้เฉพาะ TS" — ต่างจากตารางผลิต
     ที่ฝ่ายขายยัง **อ่าน** ได้เพื่อตอบลูกค้าว่าผลิตวันไหน · งานบริการปิดทั้งอ่านและเขียน
     ⚠️ ทีม SV เคยเป็นเจ้าของงานบริการแทนฝ่ายที่ยังไม่มีคน — เหตุผลนั้นหมดอายุแล้ว */
  assert.equal(canViewService(ka), false);
  assert.equal(canEditService(ka), false);
  assert.equal(canViewService(sv), false);
  assert.equal(canEditService(sv), false);
  assert.equal(canEditProduction(sv), false);
});

test('⭐ ไม่มีฝ่ายไหนแก้ได้ทั้งสองระบบ ยกเว้น admin (break-glass)', () => {
  for (const dept of ['PC', 'PD', 'TS', 'WH', 'QC']) {
    const both = canEditProduction(at(dept)) && canEditService(at(dept));
    assert.equal(both, false, `${dept} ไม่ควรแก้ได้ทั้งสองระบบ`);
  }
  assert.equal(canEditProduction({ role: 'admin' }) && canEditService({ role: 'admin' }), true);
});
