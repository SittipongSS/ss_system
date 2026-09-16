import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADOPTED_SHARED_PATHS, adoptsPathname, sharedItemBelongsInGroup, isBareShellPathname, isSettingsPathname, shellFlagsFor, sortSystems, systemForPathname } from './navigation.js';

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


/* ── เปลือกของเอกสารร่วมเดินตาม "คนดู" ไม่ใช่ตาม URL (มติผู้ใช้ 2026-08-22) ──
   *"วิจัยและพัฒนา กับ การเงินและบัญชี พอกดเข้าไป บ้างอย่างมันรูทเข้าไปที่
   บริหารงานขาย ซึ่งอยากให้แต่ละฝ่ายทำงานเฉพาะของโมดูลตัวเอง"*

   🐞 อาการเดิม: FN กดใบสั่งขายจากทะเบียนการชำระ → เปลือกสลับเป็น "บริหารงานขาย"
   → เมนู `/finance/payments` หายจากจอ → ต้องไปกดตัวสลับระบบกลับเอง
   และ `ss:last-system` ถูกเขียนทับเป็น salesplan ถาวร */
const FN = { role: 'finance', department: 'FN', team: null, extraCaps: [] };
const RD = { role: 'rd', department: 'RD', team: null, extraCaps: [] };
const AE = { role: 'ae', department: 'SA', team: 'SV', extraCaps: [] };
const ADMIN = { role: 'admin', department: 'AD', team: null, extraCaps: [] };

test('⭐ เอกสารร่วม: FN ยืนอยู่ในบ้านตัวเองตลอด ไม่ถูกลากไปเปลือกงานขาย', () => {
  for (const p of ['/sa/sales-orders', '/sa/sales-orders/1', '/sa/quotations/9',
    '/sa/contracts', '/requests', '/requests/DR-1', '/sales-planning/sales-orders/2']) {
    assert.equal(systemForPathname(p, FN), 'finance', p);
  }
});

test('⭐ RD รับใบคำร้อง + ใบสั่งขาย — ดีล/โครงการยังเป็นเปลือกงานขายตามเดิม', () => {
  assert.equal(systemForPathname('/requests/DR-1', RD), 'rd');
  assert.equal(systemForPathname('/rd/requests', RD), 'rd');
  /* ⭐ **ใบสั่งขายถูกรับเข้าบ้าน RD 2026-08-29** (กลับมติเดิมที่เคยล็อกไว้ตรงนี้) —
     ฝ่ายไม่มีเมนู "บริหารงานขาย" อีกแล้ว ⇒ ถ้าไม่รับเส้นนี้ กดใบสั่งขายจากคิวตัวเอง
     จะได้เปลือกของระบบที่เขาไม่มีกลุ่มเมนู = แถบว่าง (เจอจริงตอน UAT)
     ⚠️ ต้องมาคู่กับเมนู `/rd/sales-orders` ใน AppLayout เสมอ — เทสต์ข้างล่างล็อกคู่นี้ */
  assert.equal(systemForPathname('/sa/sales-orders/1', RD), 'rd');
  assert.equal(systemForPathname('/sales-planning/sales-orders/2', RD), 'rd');
  // ⚠️ ดีล/โครงการ **ไม่ได้ถูกรับ** — RD เปิดดูเพื่อบริบทตอนตอบคำร้อง ไม่ใช่งานประจำ
  // ⇒ ยังอ่านในเปลือกงานขายตามเดิม (กดจากลิงก์บนใบได้เหมือนเดิมทุกอย่าง)
  assert.equal(systemForPathname('/sa/deals/1', RD), 'salesplan');
  assert.equal(systemForPathname('/sa/projects/1', RD), 'salesplan');
});

test('⭐ ฝ่ายขาย · admin · และการเรียกแบบไม่ส่ง user = พฤติกรรมเดิมทุกประการ', () => {
  for (const p of ['/sa/sales-orders/1', '/requests/DR-1', '/sa/deals/1']) {
    assert.equal(systemForPathname(p), 'salesplan', p);
    assert.equal(systemForPathname(p, AE), 'salesplan', p);
    assert.equal(systemForPathname(p, ADMIN), 'salesplan', p);
  }
});

test('⭐ ดีล/โครงการ/แดชบอร์ด ไม่ถูกรับไปบ้านใคร — กฎข้อ 7 ตัดสินแล้วว่าไม่ใช่เมนูของ FN', () => {
  for (const p of ['/sa/deals/1', '/sa/projects/1', '/sa/dashboard', '/sa/tasks', '/pm/projects/1']) {
    assert.equal(systemForPathname(p, FN), 'salesplan', p);
  }
});

test('บ้านของตัวเองยังชนะเสมอ — ลิสต์รับเอกสารต้องไม่กลืนเส้นทางของโมดูลอื่น', () => {
  assert.equal(systemForPathname('/finance/payments', FN), 'finance');
  assert.equal(systemForPathname('/database/products', FN), 'master');
  assert.equal(systemForPathname('/support', FN), 'support');
  assert.equal(systemForPathname('/notifications', FN), null);
  assert.equal(systemForPathname('/database/scents', RD), 'master');
});

/* 🔴 **ratchet คู่ของกฎข้อ 8** — เส้นทางที่ฝ่ายหนึ่งรับไปแล้วต้องมีเมนูคู่กันในกลุ่ม
   ของฝ่ายนั้น ไม่งั้นเขายืนอยู่บนหน้าที่แถบเมนูไม่ไฮไลต์อะไรเลย · บั๊กแบบนี้
   build/eslint จับไม่ได้เลยเพราะหน้าเรนเดอร์ปกติ ผิดแค่เปลือกที่ครอบมัน
   (อ่านซอร์สตรง ๆ เพราะ AppLayout เป็น client component ที่ import มารันไม่ได้ —
    ท่าเดียวกับ components/navMenuNames.test.mjs) */
test('⭐ ทุกเส้นทางที่ถูกรับไป ต้องมีเมนูคู่กันในกลุ่มของฝ่ายนั้น', async () => {
  /* 📌 ADR 0016 (PR1): ทะเบียนเมนูย้ายไป `config/menuRegistry.js` แล้ว ⇒ อ่านข้อมูลตรง ๆ
     แทนการเฉือนซอร์สด้วยการย่อหน้า · ของเดิมหาท้ายกลุ่มด้วย `indexOf('\n    },')`
     ซึ่งได้ −1 ทันทีที่การย่อหน้าเปลี่ยน แล้ว slice ยาวถึงท้ายไฟล์ = เทสต์ผ่านทั้งที่ควรตก */
  const { MENU_GROUPS } = await import('./menuRegistry.js');

  for (const [system, prefixes] of Object.entries(ADOPTED_SHARED_PATHS)) {
    const group = MENU_GROUPS.find((g) => g.system === system);
    assert.ok(group, `ไม่พบกลุ่มเมนูของระบบ ${system}`);
    for (const prefix of prefixes) {
      // เส้นทางเก่า `/sales-planning/*` เป็นแค่ลิงก์ค้าง ไม่ต้องมีเมนูของตัวเอง
      if (prefix.startsWith('/sales-planning')) continue;
      /* เมนูหนึ่งตัว "ครอบ" เส้นทางได้สองท่า — เป็นรายการเอกสารร่วมตรง ๆ
         (`SHARED_DOC_ITEMS.x` ซึ่ง href ตรงกับเส้นนั้น) หรือเป็นเมนูของฝ่ายเองที่
         `match` กินเส้นนั้นด้วย (เช่น "คิวคำร้อง" ของ RD/FN ซึ่งกินใบ `/requests/[id]`
         — มติ 2026-08-22 ที่ว่าสองฝ่ายนี้ไม่เปิดคำร้องเอง จึงไม่มีเมนูคิวรวมในโมดูล) */
      const covered = group.items.some((item) => item.href === prefix || item.match?.(prefix));
      assert.ok(covered, `ระบบ ${system} รับ ${prefix} มาแล้วแต่ไม่มีเมนูคู่กัน`);
    }
  }
});

/* ⚠️ RD/FN **ไม่มีเมนูคิวรวม "คำร้อง" ในโมดูลตัวเอง** (มติผู้ใช้ 2026-08-22:
   *"บัญชี กับ RD ไม่มีที่ต้องเปิดเอง มีแต่ SA ที่ต้องเปิดมาหา"*) ⇒ แท็บ "ที่ฉันเปิด"
   ของคิวรวมว่างเปล่าตลอดกาลสำหรับเขา · ใบที่เปิดจากคิวฝ่ายจึงต้องไฮไลต์ที่ "คิวคำร้อง" */
test('⭐ ใบคำร้องของ RD/FN ไฮไลต์ที่คิวของฝ่าย ไม่ใช่เมนูคิวรวม', async () => {
  const { MENU_GROUPS, SHARED_DOC_ITEMS } = await import('./menuRegistry.js');
  for (const [system, own] of [['rd', '/rd/requests'], ['finance', '/finance/requests']]) {
    const group = MENU_GROUPS.find((g) => g.system === system);
    assert.ok(group, `ไม่พบกลุ่มเมนูของระบบ ${system}`);
    const queue = group.items.find((item) => item.href === own);
    assert.ok(queue?.match?.('/requests/DR-1'), `เมนูคิวของ ${system} ต้อง match ใบ /requests/[id] ด้วย`);
    assert.ok(!group.items.includes(SHARED_DOC_ITEMS.requests),
      `${system} ต้องไม่มีเมนูคิวรวม — ฝ่ายนี้ไม่เปิดคำร้องเอง`);
  }
});

test('adoptsPathname ไม่จับครึ่งคำ — /requests ต้องไม่กลืน /requests-archive', () => {
  assert.ok(adoptsPathname('rd', '/requests'));
  assert.ok(adoptsPathname('rd', '/requests/DR-1'));
  assert.equal(adoptsPathname('rd', '/requests-archive'), false);
  // ⭐ ใบสั่งขายถูกรับเข้าบ้าน RD แล้ว (2026-08-29) — แต่ยังต้องไม่จับครึ่งคำเหมือนกัน
  assert.ok(adoptsPathname('rd', '/sa/sales-orders/1'));
  assert.equal(adoptsPathname('rd', '/sa/sales-orders-archive'), false);
  assert.equal(adoptsPathname('rd', '/sa/deals/1'), false);
  assert.equal(adoptsPathname('salesplan', '/requests'), false);
  assert.equal(adoptsPathname(null, '/requests'), false);
});

/* 🐞 กับดักที่เทสต์นี้กันไว้: เมนูเอกสารร่วมโผล่ **สองกลุ่มพร้อมกัน** ให้คนคนเดียว
   แล้วกดคนละตัวได้เปลือกคนละอัน — เกิดกับ admin ซึ่งเห็นทุกกลุ่ม */
test('⭐ เมนูเอกสารร่วมขึ้นได้กลุ่มเดียวต่อคนเสมอ', () => {
  const cases = [
    ['/sa/sales-orders', FN, { salesplan: false, finance: true, rd: false }],
    /* RD/FN: คิวรวมถูก "รับ" ไปแล้ว ⇒ **ตัดออกจากเมนูงานขาย**
       ⚠️ ค่า `true` ของกลุ่มบ้านตัวเองเป็นคำตอบเชิงสมมติ ("ถ้าประกาศรายการนี้ไว้
       ในกลุ่มนั้น ควรโชว์ไหม") — ของจริงทั้งสองโมดูล **ไม่ได้ประกาศ** เพราะสองฝ่ายนี้
       ไม่เปิดคำร้องเอง · เทสต์ "ใบคำร้องของ RD/FN ไฮไลต์ที่คิวของฝ่าย" คุมข้อนั้นไว้ */
    ['/requests', RD, { salesplan: false, finance: false, rd: true }],
    ['/requests', FN, { salesplan: false, finance: true, rd: false }],
    // ⭐ RD รับใบสั่งขายแล้ว ⇒ ตัดออกจากเมนูงานขายเหมือนที่ FN เป็น (2026-08-29)
    ['/sa/sales-orders', RD, { salesplan: false, finance: false, rd: true }],
    ['/sa/sales-orders', AE, { salesplan: true, finance: false, rd: false }],
    ['/requests', ADMIN, { salesplan: true, finance: false, rd: false }],
  ];
  for (const [href, user, want] of cases) {
    for (const [system, expected] of Object.entries(want)) {
      assert.equal(sharedItemBelongsInGroup(href, system, user), expected, `${href} · ${user.role} · ${system}`);
    }
    assert.ok(Object.values(want).filter(Boolean).length <= 1, `${href} · ${user.role} ต้องไม่ขึ้นเกินหนึ่งกลุ่ม`);
  }
});

/* ── เปลือกของหน้าแรก (ADR 0016) ─────────────────────────────────────────── */
test('⭐ /home ไม่ใช่ของระบบไหน — ไม่งั้นเขียน ss:last-system ทับระบบที่เพิ่งออกมา', () => {
  assert.equal(systemForPathname('/home'), null);
  assert.equal(systemForPathname('/home', { role: 'finance', department: 'FN' }), null);
});

test('shellFlagsFor: หน้าแรกไม่มีเมนูของระบบ ไม่มีตัวสลับระบบ และไม่มีตัวเลขบนหัว', () => {
  const home = shellFlagsFor('/home');
  assert.deepEqual(home, { bareShell: false, homeHub: true, hideSystemMenu: true, hideSystemSwitcher: true });

  // บัญชีของฉัน: ไม่มีเมนูของระบบ **แต่ยังมีตัวสลับระบบ** — ต้องมีทางกลับเข้าระบบ
  const account = shellFlagsFor('/account');
  assert.deepEqual(account, { bareShell: true, homeHub: false, hideSystemMenu: true, hideSystemSwitcher: false });

  for (const p of ['/sa/deals', '/settings', '/notifications', '/support']) {
    assert.deepEqual(shellFlagsFor(p),
      { bareShell: false, homeHub: false, hideSystemMenu: false, hideSystemSwitcher: false }, p);
  }
});
