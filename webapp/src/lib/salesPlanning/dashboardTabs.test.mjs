// ── แท็บแดชบอร์ด — ใครเห็นแท็บไหน ────────────────────────────────────────
//
// 🐞 ตอนลบแท็บ "แดชบอร์ด RD" ทิ้ง (2026-08-11) เกือบทำให้ role `rd` เหลือ **ศูนย์แท็บ**
// เพราะเดิม rd ถูกกันออกจากแท็บ "ของฉัน" ด้วยเหตุผลว่า "มีแท็บ RD ให้อยู่แล้ว"
// ⇒ เปิดหน้าแดชบอร์ดแล้วได้จอเปล่าโดยไม่มีอะไรบอกว่าทำไม · เทสต์นี้คือตาข่ายนั้น
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '@/lib/permissions';
import {
  DASHBOARD_TABS, TAB_PERIOD, allowedDashboardTabs, resolveDashboardTab,
} from './dashboardTabs.js';

test('⭐ ไม่มี role ไหนเหลือศูนย์แท็บ — จอเปล่าคือบั๊กเสมอ', () => {
  for (const role of ROLES) {
    const allowed = allowedDashboardTabs(role);
    assert.equal(allowed.length > 0, true, `role ${role} ไม่มีแท็บให้เปิดสักอัน`);
    // แท็บ "ของฉัน" เป็นแดชบอร์ดของคนที่เปิด ไม่ใช่ของฝ่ายขาย ⇒ ต้องเปิดให้ทุก role
    assert.equal(allowed.some((t) => t.key === 'my'), true, `role ${role} ไม่เห็นแดชบอร์ดของตัวเอง`);
  }
});

test('ทุกแท็บต้องมีหน่วยของช่วงเวลา — ไม่มี = หัวหน้าจอโชว์ตัวคุมที่ไม่มีผล', () => {
  for (const t of DASHBOARD_TABS) {
    assert.ok(TAB_PERIOD[t.key], `แท็บ ${t.key} ยังไม่ได้ประกาศช่วงเวลา`);
    assert.ok(['month', 'year', 'none'].includes(TAB_PERIOD[t.key]), t.key);
  }
  // ⚠️ แท็บที่ถูกลบต้องไม่มีเศษค้างในตารางช่วงเวลา
  const keys = new Set(DASHBOARD_TABS.map((t) => t.key));
  for (const key of Object.keys(TAB_PERIOD)) assert.equal(keys.has(key), true, `${key} ไม่มีแท็บแล้ว`);
});

test('ขอแท็บที่ไม่มีสิทธิ์ทาง URL → ถอยไปแท็บแรกที่เปิดให้ พร้อมบอกว่าถูกปฏิเสธ', () => {
  // rd ไม่มีสิทธิ์ KPI ลีด (ของฝ่ายขาย) — ต้องถอยไป "ของฉัน" ไม่ใช่จอเปล่า
  const denied = resolveDashboardTab('rd', 'lead_kpi');
  assert.equal(denied.tab, 'my');
  assert.equal(denied.denied?.key, 'lead_kpi', 'ต้องบอกด้วยว่าแท็บไหนถูกปฏิเสธ');

  // ขอแท็บที่มีสิทธิ์ = ได้ตัวนั้น และไม่มีข้อความปฏิเสธ
  const ok = resolveDashboardTab('admin', 'performance');
  assert.equal(ok.tab, 'performance');
  assert.equal(ok.denied, null);

  // ไม่ได้ขออะไรมา = ค่าตั้งต้น ไม่ใช่การถูกปฏิเสธ
  const none = resolveDashboardTab('rd', null);
  assert.equal(none.tab, 'my');
  assert.equal(none.denied, null);

  // แท็บที่ไม่รู้จัก (ลิงก์เก่า/พิมพ์มั่ว) ตกไปค่าตั้งต้นเงียบ ๆ ไม่ใช่จอเปล่า
  assert.equal(resolveDashboardTab('admin', 'rd_kpi').tab, 'my');
});
