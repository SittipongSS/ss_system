// ── แผนการผลิต (PD/PC) กับ ธุรกิจบริการ (TS) ต้องแยกจากกัน ────────────────
//
// ⭐ มติผู้ใช้ 2026-07-31: **สองระบบนี้เป็นคนละทีมปฏิบัติงาน** — แผนการผลิตคือ PD
// ธุรกิจบริการคือ TS · ช่างไม่ต้องเห็นตารางโรงงาน และคนโรงงานไม่ต้องเห็นนัดเข้าไซต์
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

const at = (department) => ({ role: 'staff', department, extraCaps: [] });
const keys = (user) => systemsForUser(user).map((s) => s.key);

test('⭐ ฝ่ายผลิต/จัดซื้อ (PD/PC) เห็นแต่ระบบวางแผนผลิต — ไม่แตะธุรกิจบริการเลย', () => {
  for (const dept of ['PD', 'PC']) {
    assert.equal(canViewProduction(at(dept)), true, dept);
    assert.equal(canEditProduction(at(dept)), true, dept);
    assert.equal(canViewService(at(dept)), false, dept);
    assert.equal(canEditService(at(dept)), false, dept);
    assert.ok(keys(at(dept)).includes('production'), dept);
    assert.ok(!keys(at(dept)).includes('service'), dept);
  }
});

test('⭐ TS เป็นฝ่ายเดียวในกลุ่ม staff ที่ถูกกันออกจากตารางผลิต — คนละทีมปฏิบัติงาน', () => {
  // ⚠️ จุดที่พลาดง่าย: กันเฉพาะ TS ไม่ใช่กวาดทุกฝ่ายที่ไม่ได้วางแผน (WH/QC ต้องอ่านได้)
  assert.equal(canViewProduction(at('TS')), false);
  for (const dept of ['PC', 'PD', 'WH', 'QC']) {
    assert.equal(canViewProduction(at(dept)), true, dept);
  }
});

test('⭐ ฝ่ายเทคนิคบริการ (TS) เห็นแต่ธุรกิจบริการ — ไม่เห็นตารางผลิตแม้แต่อ่าน', () => {
  // 🐞 ของเดิม canViewProduction ไม่แคบด้วยฝ่าย → TS อ่านตารางผลิตได้ทั้งระบบ
  // ยังไม่มีใครเห็นเพราะการ์ดระบบกั้นด้วย canEditProduction แต่ P-3 วางแผนจะเปิด
  // บอร์ดด้วย canViewProduction ซึ่งจะทำให้ระบบโรงงานโผล่ให้ TS ตอนนั้นเงียบ ๆ
  assert.equal(canViewProduction(at('TS')), false);
  assert.equal(canEditProduction(at('TS')), false);
  assert.equal(canViewService(at('TS')), true);
  assert.equal(canEditService(at('TS')), true);
  assert.deepEqual(keys(at('TS')).filter((k) => k === 'production'), []);
  assert.ok(keys(at('TS')).includes('service'));
});

test('⭐ ฝ่ายคลัง/QC อยู่ในสายงานโรงงาน — **อ่าน**ตารางผลิตได้ แต่แก้ไม่ได้ และไม่แตะธุรกิจบริการ', () => {
  // มติผู้ใช้ 2026-07-31: QC ตรวจของขาเข้าก่อนเข้าไลน์ · คลังรับของเข้าคลังแล้วจัดส่ง
  // ทั้งคู่เป็นขั้นตอนในแม่แบบไทม์ไลน์เดียวกับ "ผลิตสินค้า" จึงต้องรู้ว่าโรงงานจะผลิตวันไหน
  for (const dept of ['WH', 'QC']) {
    assert.equal(canViewProduction(at(dept)), true, dept);
    assert.equal(canEditProduction(at(dept)), false, dept);   // อ่านอย่างเดียว ไม่แก้ตาราง
    assert.equal(canViewService(at(dept)), false, dept);
    assert.deepEqual(keys(at(dept)).filter((k) => k === 'service'), [], dept);
  }
});

test('ฝ่ายขายอ่านได้ทั้งสองระบบเพื่อตอบลูกค้า แต่แก้ไม่ได้ (ยกเว้นทีม SV กับงานบริการ)', () => {
  const ka = { role: 'ae', team: 'KA', department: 'SA', extraCaps: [] };
  const sv = { role: 'ae', team: 'SV', department: 'SA', extraCaps: [] };
  assert.equal(canViewProduction(ka), true);
  assert.equal(canEditProduction(ka), false);   // ขายไม่แก้ตารางโรงงาน
  assert.equal(canViewService(ka), true);
  assert.equal(canEditService(ka), false);
  // ทีม SV เป็นเจ้าของสัญญาบริการ → แก้งานบริการได้ แต่ยังแตะตารางผลิตไม่ได้
  assert.equal(canEditService(sv), true);
  assert.equal(canEditProduction(sv), false);
});

test('⭐ ไม่มีฝ่ายไหนแก้ได้ทั้งสองระบบ ยกเว้น admin/หัวหน้าฝ่ายขาย (break-glass)', () => {
  for (const dept of ['PC', 'PD', 'TS', 'WH', 'QC']) {
    const both = canEditProduction(at(dept)) && canEditService(at(dept));
    assert.equal(both, false, `${dept} ไม่ควรแก้ได้ทั้งสองระบบ`);
  }
  assert.equal(canEditProduction({ role: 'admin' }) && canEditService({ role: 'admin' }), true);
});
