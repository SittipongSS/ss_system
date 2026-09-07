// ── ทะเบียนทีมขายฝั่งจอ — ป้ายต้องไม่หายและไม่ว่าง ────────────────────────
//
// ⚠️ ทดสอบเฉพาะส่วนที่เป็นตรรกะล้วน (ตัว hook ต้องมี React runtime จึงไม่แตะที่นี่)
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSalesTeams, salesTeamLabel, FALLBACK_SALES_TEAMS } from './salesTeamRegistry.js';
import { TEAMS, TEAM_LABELS } from '@/lib/permissions';

/* ⚠️ ค่าสำรองต้องเรนเดอร์ได้ทันทีในรอบแรก — จอที่ว่างหนึ่งเฟรมทำให้ค่าที่ผู้ใช้เลือกไว้
   ถูกมองว่า "ไม่มีในตัวเลือก" แล้วโดนล้างทิ้ง */
test('⭐ ค่าสำรองคือสามทีมตั้งต้น เรียงตามลำดับของระบบ', () => {
  assert.deepEqual(FALLBACK_SALES_TEAMS.map((t) => t.code), TEAMS);
  assert.deepEqual(FALLBACK_SALES_TEAMS.map((t) => t.name), TEAMS.map((c) => TEAM_LABELS[c]));
  assert.ok(FALLBACK_SALES_TEAMS.every((t) => t.kind === 'sales' && t.isActive === true));
});

test('ป้ายอ่านจากทะเบียนก่อน แล้วค่อยถอยไปค่าคงที่ แล้วค่อยเป็นรหัสดิบ', () => {
  const rows = [{ code: 'SA-NORTH', name: 'ทีมภาคเหนือ' }];
  assert.equal(salesTeamLabel(rows, 'SA-NORTH'), 'ทีมภาคเหนือ', 'ทีมใหม่ต้องขึ้นชื่อจริง');
  assert.equal(salesTeamLabel(rows, 'KA'), 'Key Account', 'ทีมเดิมที่ไม่ได้อยู่ในผลถอยไปค่าคงที่');
  assert.equal(salesTeamLabel([], 'ZZZ'), 'ZZZ', 'ไม่รู้จักเลย = โชว์รหัส ไม่ใช่ว่าง');
  assert.equal(salesTeamLabel(null, 'KA'), 'Key Account', 'ยังไม่โหลด = ยังมีป้ายให้');
});

/* ทีมที่ปิดแล้วต้องไม่อยู่ในตัวเลือก แต่ยังต้องแปลป้ายได้ (รายงานย้อนหลังอ้างรหัสเดิม) */
test('ตัวเลือกเอาเฉพาะทีมที่เปิดอยู่ · แต่ป้ายของทีมที่ปิดแล้วยังอ่านได้', () => {
  const rows = [
    { code: 'KA', name: 'Key Account', isActive: true },
    { code: 'SA-OLD', name: 'ทีมเก่า', isActive: false },
  ];
  assert.deepEqual(activeSalesTeams(rows).map((t) => t.code), ['KA']);
  assert.equal(salesTeamLabel(rows, 'SA-OLD'), 'ทีมเก่า');
});
