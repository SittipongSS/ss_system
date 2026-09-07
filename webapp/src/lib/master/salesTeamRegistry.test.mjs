// ── ทะเบียนทีมขายฝั่งจอ — ป้ายต้องไม่หายและไม่ว่าง ────────────────────────
//
// ⚠️ ทดสอบเฉพาะส่วนที่เป็นตรรกะล้วน (ตัว hook ต้องมี React runtime จึงไม่แตะที่นี่)
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSalesTeams, salesTeamLabel, FALLBACK_SALES_TEAMS } from './salesTeamRegistry.js';
import { TEAMS } from '@/lib/permissions';

/* ⚠️ ค่าสำรองต้องเรนเดอร์ได้ทันทีในรอบแรก — จอที่ว่างหนึ่งเฟรมทำให้ค่าที่ผู้ใช้เลือกไว้
   ถูกมองว่า "ไม่มีในตัวเลือก" แล้วโดนล้างทิ้ง
   🔴 แต่เป็น **รหัสล้วน ไม่ใช่ชื่อ** — สำเนาชื่อในโค้ดคือสิ่งที่ทำให้จอกับเซิร์ฟเวอร์
   ตอบไม่เหมือนกันหลังเปลี่ยนชื่อทีม (จอโชว์ชื่อเก่า · Excel โชว์รหัส) */
test('⭐ ค่าสำรองคือสามรหัสตั้งต้น และ **ไม่มีชื่อ** ติดมาด้วย', () => {
  assert.deepEqual(FALLBACK_SALES_TEAMS.map((t) => t.code), TEAMS);
  assert.deepEqual(FALLBACK_SALES_TEAMS.map((t) => t.name), TEAMS, 'ชื่อ = รหัส จนกว่าทะเบียนจะมาถึง');
  assert.ok(FALLBACK_SALES_TEAMS.every((t) => t.kind === 'sales' && t.isActive === true));
});

test('⭐ ป้ายใช้กติกาเดียวกับเซิร์ฟเวอร์: มีในทะเบียน = ชื่อจริง · ไม่มี = รหัสดิบ', () => {
  const rows = [{ code: 'SA-NORTH', name: 'ทีมภาคเหนือ' }];
  assert.equal(salesTeamLabel(rows, 'SA-NORTH'), 'ทีมภาคเหนือ', 'ทีมใหม่ต้องขึ้นชื่อจริง');
  /* 🔴 เดิมบรรทัดนี้ถอยไป TEAM_LABELS แล้วคืน "Key Account" — นั่นคือจุดที่จอโกหก
     หลังเปลี่ยนชื่อทีม ในขณะที่ไฟล์ที่เซิร์ฟเวอร์สร้างโชว์รหัสดิบ */
  assert.equal(salesTeamLabel(rows, 'KA'), 'KA', 'ไม่อยู่ในทะเบียนที่โหลดมา = รหัสดิบ');
  assert.equal(salesTeamLabel([], 'ZZZ'), 'ZZZ');
  assert.equal(salesTeamLabel(null, 'KA'), 'KA', 'ยังไม่โหลด = รหัสดิบ ไม่ใช่ชื่อเก่า');
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

/* 🔴 **ห้ามมีสำเนาชื่อทีมในโค้ดอีก** — นี่คือด่านของมติ 2026-09-07
   ค่าคงที่ `TEAM_LABELS` ถูกลบทิ้งเพราะมันทำให้จอกับเซิร์ฟเวอร์ตอบไม่เหมือนกัน
   (จอโชว์ชื่อเก่าอย่างมั่นใจหลังเปลี่ยนชื่อ · Excel โชว์รหัสดิบ) และทำให้ "เปลี่ยนชื่อทีม"
   กลายเป็นงานที่ต้องแก้โค้ดแล้ว deploy ทุกครั้ง */
test('⭐ ไม่มี TEAM_LABELS ในระบบแล้ว — ชื่อทีมมีบ้านเดียวคือทะเบียน', async () => {
  const perms = await import('@/lib/permissions');
  assert.equal(perms.TEAM_LABELS, undefined, 'ห้ามเอาสำเนาชื่อทีมกลับมาไว้ในโค้ด');
  assert.ok(Array.isArray(perms.TEAMS), 'TEAMS (รหัสสามตัวที่ seed มา) ยังอยู่ — ใช้เป็นค่าสำรองและรายการห้ามลบ');
});
