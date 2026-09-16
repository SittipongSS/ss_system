// ── ทะเบียนเมนูชุดเดียว (ADR 0016 · PR1) ──────────────────────────────────
//
// ⭐ เทสต์ชุดนี้คือเหตุผลที่ย้ายทะเบียนออกจาก `AppLayout` — ตอนอยู่ในนั้นมันเป็น
//    client component ที่ import มารันไม่ได้ ทุกด่านจึงต้องอ่านซอร์สด้วย regex
//    ตอนนี้เรียกฟังก์ชันจริงกับ persona จริงได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_GROUPS, SHARED_DOC_ITEMS, menuGroupsForUser } from './menuRegistry.js';
import { ROLES } from '@/lib/permissions';
import { SYSTEM_CATALOG } from './systems.js';

const user = (over = {}) => ({ id: 'u1', role: 'ae', teams: [], extraCaps: [], ...over });
const hrefs = (groups, system) => (groups.find((g) => g.system === system)?.items || []).map((i) => i.href);

test('ทุกระบบใน SYSTEM_CATALOG มีกลุ่มเมนูของตัวเอง', () => {
  for (const system of SYSTEM_CATALOG) {
    assert.ok(MENU_GROUPS.some((g) => g.system === system.key), `ระบบ ${system.key} ไม่มีกลุ่มเมนู`);
  }
});

test('ไม่มี role ⇒ ชุดว่าง (เปลือกยังไม่รู้ว่าใครกำลังดู) ไม่ใช่เมนูของทุกคน', () => {
  assert.deepEqual(menuGroupsForUser(null), []);
  assert.deepEqual(menuGroupsForUser({ id: 'u1' }), []);
});

test('ทุก role ใน ROLES เปิดหน้าแรกได้โดยไม่ระเบิด และกลุ่มที่คืนมาไม่มีกลุ่มว่าง', () => {
  // role `user` = ค่าตกของเปลือกเมื่อบัญชียังไม่ได้ตั้ง role — ต้องอยู่ในชุดทดสอบด้วย
  for (const role of [...ROLES, 'user']) {
    const groups = menuGroupsForUser(user({ role }));
    assert.ok(Array.isArray(groups), role);
    for (const group of groups) {
      assert.ok(group.items.length > 0, `${role}: กลุ่ม ${group.system} ว่างแต่ยังถูกส่งออกมา`);
      assert.ok(group.label && group.home, `${role}: กลุ่ม ${group.system} ขาด label/home`);
    }
  }
});

test('⭐ เอกสารร่วมขึ้นกลุ่มเดียวต่อคน — ไม่ใช่สองกลุ่มพร้อมกัน', () => {
  for (const role of [...ROLES, 'user']) {
    for (const dept of [null, 'RD', 'FN', 'TS']) {
      const groups = menuGroupsForUser(user({ role, department: dept }));
      for (const item of Object.values(SHARED_DOC_ITEMS)) {
        const owners = groups.filter((g) => g.items.some((i) => i.href === item.href)).map((g) => g.system);
        assert.ok(owners.length <= 1, `${role}/${dept}: ${item.href} โผล่ที่ ${owners.join(' + ')}`);
      }
    }
  }
});

test('ฝ่ายบัญชีได้เมนูเอกสารร่วมในบ้านตัวเอง ไม่ต้องเดินไปยืนในเปลือกงานขาย', () => {
  const groups = menuGroupsForUser(user({ role: 'finance', department: 'FN' }));
  const fn = hrefs(groups, 'finance');
  for (const href of ['/sa/quotations', '/sa/sales-orders', '/sa/contracts']) {
    assert.ok(fn.includes(href), `เมนูบัญชีต้องมี ${href}`);
  }
  assert.ok(!hrefs(groups, 'salesplan').includes('/sa/quotations'), 'ต้องไม่ขึ้นซ้ำที่กลุ่มขาย');
});

/* 🐞 บั๊กที่การย้ายเข้าเปลือกแก้ (ADR 0016 §บริบท): หน้าแรกเดิมประกอบ userContext
   โดยทิ้ง `teams` ⇒ คนที่อยู่ทีม KA เป็นทีมรองไม่เห็นงานสหมิตร · ทะเบียนตัวเดียว
   อ่าน user ก้อนเดียวกับเปลือก ปัญหานี้จึงเกิดซ้ำไม่ได้ */
test('ทีมรองต้องนับด้วย — งานสหมิตรของคนที่มี KA เป็นทีมที่สอง', () => {
  const one = menuGroupsForUser(user({ role: 'ae', teams: ['SV'] }));
  const two = menuGroupsForUser(user({ role: 'ae', teams: ['SV', 'KA'] }));
  const sahamit = (groups) => groups.some((g) => g.items.some((i) => i.href.includes('sahamit')));
  assert.equal(sahamit(one), false, 'ทีม SV อย่างเดียวไม่ควรเห็นงานสหมิตร');
  assert.equal(sahamit(two), true, 'ทีมรอง KA ต้องเปิดเมนูงานสหมิตรให้');
});

test('สิทธิ์รายคน (extraCaps) เปิดระบบเพิ่มให้ได้ — SA ที่ได้ mgmt:view มาช่วยเลขา', () => {
  const plain = menuGroupsForUser(user({ role: 'ae' }));
  const extra = menuGroupsForUser(user({ role: 'ae', extraCaps: ['mgmt:view'] }));
  assert.ok(!plain.some((g) => g.system === 'mgmt'));
  assert.ok(extra.some((g) => g.system === 'mgmt'), 'สิทธิ์รายคนต้องเปิดกลุ่มงานบริหาร');
});

test('ด่านทะเบียนเดียว — AppLayout ต้องไม่ประกาศเมนูเองอีก', async () => {
  const { readFileSync } = await import('node:fs');
  const shell = readFileSync(new URL('../components/AppLayout.js', import.meta.url), 'utf8');
  assert.ok(!shell.includes("{ href: '/"), 'เปลือกต้องไม่มีนิยามเมนูของตัวเอง');
  assert.match(shell, /menuGroupsForUser\(userContext\)/);
});

test('ทุก countHref ต้องชี้เมนูที่มีคีย์ตัวเลขจริง', async () => {
  const { NAV_COUNT_KEYS } = await import('@/lib/nav/useNavCounts');
  const withCount = MENU_GROUPS.flatMap((g) => g.items).filter((i) => i.countHref);
  assert.ok(withCount.length >= 8, 'ตัวตรวจตายแล้วหรือเมนูที่มีป้ายหายไปเกือบหมด');
  for (const item of withCount) {
    assert.ok(NAV_COUNT_KEYS[item.href], `${item.href} มี countHref แต่ไม่มีคีย์ตัวเลข`);
  }
});
