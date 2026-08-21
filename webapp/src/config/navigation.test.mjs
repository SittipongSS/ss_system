import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBareShellPathname, isSettingsPathname, sortSystems, systemForPathname } from './navigation.js';

test('systemForPathname keeps public and legacy sales routes in one system', () => {
  assert.equal(systemForPathname('/sa/quotations/1'), 'salesplan');
  assert.equal(systemForPathname('/sales-planning/deals'), 'salesplan');
  assert.equal(systemForPathname('/pm/projects/1'), 'salesplan');
  assert.equal(systemForPathname('/sahamit/po'), 'sahamit');
});

test('⭐ วางแผนผลิตเป็นระบบของตัวเอง ไม่ถูกดูดเข้าบริหารงานขาย', () => {
  // มติผู้ใช้ 2026-07-30: แยกโมดูล · เส้นทางจึงต้องไม่อยู่ใต้ /pm ซึ่งเป็นของฝ่ายขาย
  assert.equal(systemForPathname('/production/lines'), 'production');
  assert.equal(systemForPathname('/production'), 'production');
});

/* 🔴 โมดูลที่ตกกฎ systemForPathname จะไปโผล่ใต้เปลือกเมนู "ภาษีสรรพสามิต" จาก
   `return 'tax'` ท้ายฟังก์ชัน — บั๊กที่ `/requests` เคยเป็น และ `/finance` เป็นซ้ำ
   ตอนกดดูรอบแรก · build กับเทสต์อื่นจับไม่ได้เพราะหน้าเรนเดอร์ปกติทุกอย่าง */
test('⭐ โมดูลของฝ่ายต้องได้เปลือกเมนูของตัวเอง ไม่ตกไปเป็นระบบภาษี', () => {
  assert.equal(systemForPathname('/rd'), 'rd');
  assert.equal(systemForPathname('/rd/requests'), 'rd');
  assert.equal(systemForPathname('/finance'), 'finance');
  assert.equal(systemForPathname('/finance/payments'), 'finance');
  // ทะเบียนการชำระอ่านตารางของฝ่ายขาย แต่ต้องไม่ถูกดูดเข้าเปลือก salesplan
  assert.notEqual(systemForPathname('/finance/payments'), 'salesplan');
});

test('sortSystems follows the global navigation order', () => {
  const groups = ['mgmt', 'master', 'tax', 'salesplan', 'sahamit'].map((system) => ({ system }));
  assert.deepEqual(sortSystems(groups).map((group) => group.system), ['salesplan', 'tax', 'sahamit', 'master', 'mgmt']);
});

test('settings surfaces use the global settings context instead of a business system', () => {
  const settingsRoutes = [
    '/settings',
    '/settings/company',
    '/settings/workflow-templates',
    '/settings/holidays',
    '/users',
    '/audit',
  ];

  for (const route of settingsRoutes) {
    assert.equal(isSettingsPathname(route), true);
    assert.equal(systemForPathname(route), 'settings');
  }

  assert.equal(isSettingsPathname('/settings-extra'), false);
  assert.equal(systemForPathname('/database/products'), 'master');
});

// 🐞 คำร้องย้ายออกจาก `/sa` ตั้งแต่ P0b แต่กฎ systemForPathname ไม่ได้ตามไป
// ⇒ ตกไปที่ `return 'tax'` ท้ายฟังก์ชัน ⇒ **ทั้งโมดูลขึ้นเมนูของระบบภาษีสรรพสามิต**
// และเมนู "คำร้อง" (อยู่ในกลุ่ม salesplan) กดเข้าไม่ได้จากเปลือกนั้นเลย
//
// ⚠️ build/เทสต์เดิมจับไม่ได้ เพราะหน้าเรนเดอร์ปกติทุกอย่าง — ผิดแค่เปลือกที่ครอบมัน
test('ทุกเส้นทางของคำร้องอยู่ระบบสายงานขาย ไม่ใช่ระบบภาษี', () => {
  for (const p of ['/requests', '/requests/new', '/requests/DR-1']) {
    assert.equal(systemForPathname(p), 'salesplan', p);
  }
});

test('เส้นทางที่ไม่ได้ประกาศไว้ยังตกไปที่ระบบภาษีตามเดิม', () => {
  // ค่าตั้งต้นนี้คือสิ่งที่ทำให้บั๊กข้างบน "เงียบ" — เก็บไว้แต่ต้องรู้ว่ามันมีอยู่
  assert.equal(systemForPathname('/'), 'tax');
  assert.equal(systemForPathname('/excise-registrations'), 'tax');
});

test('⭐ กล่องแจ้งเตือนไม่ใช่ของระบบไหน — ต้องคืน null เพื่อคงเปลือกเมนูเดิมไว้', () => {
  // รวมของทุกระบบไว้ในกองเดียว จะสวมเมนูของระบบใดระบบหนึ่งไม่ได้ · `null` ทำให้
  // AppLayout ข้าม setActiveSystem (กดกระดิ่งจากงานขายแล้วกลับออกมา เมนูยังเป็น
  // ของงานขาย) ⚠️ ถ้าใครลบกฎนี้ทิ้ง มันจะตกไป `return 'tax'` เงียบ ๆ แบบเดียวกับ
  // ที่ `/requests` เคยเจอ — หน้าเรนเดอร์ปกติ ผิดแค่เปลือก
  assert.equal(systemForPathname('/notifications'), null);
});

// 🐞 `/account` หลุดจากทุกกฎมาตลอด ⇒ ตกไปที่ `return 'tax'` ⇒ กด "บัญชีของฉัน"
// จากเมนูอวตาร (ซึ่งมีอยู่ทุกหน้า) เมนูสลับเป็นภาษีสรรพสามิตทันทีไม่ว่ามาจากระบบไหน
// และ AppLayout ยังเขียน `ss:last-system=tax` ทับค่าที่จำไว้ ⇒ กดกระดิ่งต่อ
// หน้าแจ้งเตือนก็ถอยมาสวมเมนูภาษีตามไปอีกทอด
test('⭐ หน้าบัญชีของฉันต้องคงเปลือกเมนูของระบบที่ยืนอยู่ ไม่สลับเป็นระบบภาษี', () => {
  assert.equal(systemForPathname('/account'), null);
  // ⚠️ ห้ามแก้เป็น settings — เปลือกตั้งค่า `viewer` เข้าไม่ได้ แต่ทุก role
  // ต้องเปิดหน้าบัญชีตัวเองได้ (เหตุผลเดียวกับ `/support`)
  assert.equal(isSettingsPathname('/account'), false);
});

// 🐞 `/go/<รหัส>` ก็หลุดจากทุกกฎเหมือนกัน — ตอน redirect สำเร็จแทบไม่เห็นอาการ
// แต่หน้า "ไม่พบเอกสาร" ของมัน (รหัสผิดรูป · ไม่มีเลขนี้ · อ่านทะเบียนไม่สำเร็จ)
// เป็นหน้าจริงที่ค้างอยู่บนจอ ⇒ เดิมสวมเมนูภาษีสรรพสามิตเต็ม ๆ
test('⭐ เส้นทางกลาง /go คงเปลือกของระบบที่คนกำลังยืนอยู่ ไม่สลับเป็นระบบภาษี', () => {
  for (const p of ['/go', '/go/QT-26070028-0', '/go/SO-26080001', '/go/ไม่มีรหัสนี้']) {
    assert.equal(systemForPathname(p), null, p);
  }
  // ⚠️ ปลายทางของมันเป็นได้ทั้ง QT/SO/ดีล ซึ่งคนละระบบกัน — ตรึงเป็นระบบใดระบบหนึ่งไม่ได้
  assert.equal(systemForPathname('/sales-planning/quotations/1'), 'salesplan');
});

test('⭐ เปลือกไร้แถบเมนูเหลือบัญชีของฉันหน้าเดียว', () => {
  // มติผู้ใช้ 2026-08-14: หน้าบัญชีไม่ยืมเมนูของระบบที่เพิ่งเดินออกมา — หัวบอกชื่อหน้า
  // แถบเมนูหายทั้งแถบ รวมแถบล่างบนมือถือ
  assert.equal(isBareShellPathname('/account'), true);

  // 📌 ล้มมติเดิมส่วนของตั้งค่า (มติผู้ใช้ 2026-08-22): `/settings` `/users` `/audit`
  // ใช้แถบข้าง/แถบล่างชุดเดียวกับทุกระบบแล้ว รายการมาจาก config/settingsNav
  // ⇒ **ไม่ใช่เปลือกไร้เมนู** แม้จะยังเป็นบริบทตั้งค่าเดียวกันอยู่
  for (const p of ['/settings', '/settings/company', '/users', '/audit']) {
    assert.equal(isBareShellPathname(p), false, p);
  }
  // หน้าของระบบต้องมีแถบเมนูตามเดิม · `/notifications` ก็ยังมี เพราะมันคงเปลือก
  // ของระบบที่คนกำลังยืนอยู่ไว้ (คนละกติกากับหน้าบัญชี)
  for (const p of ['/sa/deals', '/finance/payments', '/notifications', '/support']) {
    assert.equal(isBareShellPathname(p), false, p);
  }
});

test('โมดูลของฝ่ายเป็นระบบของตัวเอง — /rd ต้องไม่ตกไปอยู่เปลือกของฝ่ายขาย', () => {
  // 🐞 บทเรียนเดิม: `/requests` เคยหลุดจากทุกกฎแล้วตกไปที่ `return 'tax'` ⇒ ทั้งโมดูล
  // ขึ้นเมนูของระบบสรรพสามิต · หน้าเรนเดอร์ปกติทุกอย่าง ผิดแค่เปลือกที่ครอบมัน
  assert.equal(systemForPathname('/rd'), 'rd');
  assert.equal(systemForPathname('/rd/requests'), 'rd');
  // ⚠️ ตัวใบยังอยู่ใต้บริหารงานขาย (ม-31 ใบเดียวจอเดียว) — เปิดจากคิวไหนก็เป็นใบเดียวกัน
  assert.equal(systemForPathname('/requests/DR-1'), 'salesplan');
});
