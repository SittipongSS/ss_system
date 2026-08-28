import test from 'node:test';
import assert from 'node:assert/strict';
import { apiWriteAllowed, bypassesSessionGate, lockedOut } from './proxy.js';
import { can } from '@/lib/permissions';

/* 🐞 ของจริงที่หลุด prod: proxy ตอบ 401 ให้ทุก request ที่ไม่มี cookie session รวม
   Vercel Cron ซึ่งยืนยันตัวด้วย `Authorization: Bearer $CRON_SECRET` เท่านั้น
   ⇒ cron ทั้งสองตัวโดนปิดประตูตั้งแต่ 2026-07-15 โดยไม่มีอะไรฟ้อง (log production
   2026-08-12: 01:30:34Z daily-digest 401 · 02:00:02Z close-resolved-issues 401
   ตรงเวลาที่ตั้งไว้เป๊ะ) — ทวงลีดค้าง SLA จึงไม่เคยเด้งสักแถว */
test('⭐ เส้น cron ต้องข้ามด่าน session — ผู้เรียกเป็นเครื่อง ไม่มีวันมี cookie', () => {
  assert.equal(bypassesSessionGate('/api/cron/daily-digest'), true);
  assert.equal(bypassesSessionGate('/api/cron/close-resolved-issues'), true);
});

/* เส้นบอกคอมมิตที่ production รันอยู่ — ผู้เรียกคือ deploy workflow ซึ่งเป็นเครื่อง
   เหมือน cron · มีไว้เพื่อจับเคส "build success แต่ไฟล์ที่เสิร์ฟเป็นของเก่า" ที่
   deployment record ของ GitHub มองไม่เห็น (turbopack build cache 20–21/08/69) */
test('⭐ เส้นบอกเวอร์ชันต้องข้ามด่าน session — GitHub Actions ไม่มี cookie', () => {
  assert.equal(bypassesSessionGate('/api/version'), true);
});

test('ด่านที่ข้ามได้ต้องแคบ — เปิดเฉพาะใต้ /api/cron/ กับ /api/version เป๊ะ ๆ', () => {
  // ⚠️ ถ้าเผลอเขียนเป็น startsWith('/api/cron') เปล่า ๆ สองเส้นล่างจะหลุดตามไปด้วย
  // ⚠️ /api/version ต้องเทียบเต็มเส้น — เขียนเป็น startsWith แล้วชื่อคล้ายกันหลุดตาม
  for (const path of [
    '/api/cron', '/api/crontab', '/api/cronjobs/run', '/api/notifications', '/home', '/',
    '/api/versions', '/api/version-history', '/api/version/secret',
  ]) {
    assert.equal(bypassesSessionGate(path), false, `${path} ต้องไม่ข้ามด่าน session`);
  }
});

/* 🐞 ผู้ใช้แจ้งเอง: กด "ดูทั้งหมด" ในกระดิ่งแล้วเด้งกลับหน้าแรก — `/notifications`
   ตกจาก OPEN_PAGES ตอนส่ง #1193 ⇒ ด่าน default-deny เด้ง non-admin ทุกคน
   ⚠️ ทดสอบด้วย admin ไม่มีวันเห็น (ผ่านตั้งแต่บรรทัดแรกของ lockedOut) — ต้องไล่ role จริง */
test('⭐ กล่องแจ้งเตือนของตัวเองต้องเปิดได้ทุก role ที่ล็อกอิน', () => {
  for (const role of ['ae', 'ac', 'senior_ae', 'ae_supervisor', 'rd', 'ra', 'staff', 'viewer', 'secretary', 'marketing', 'executive']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/notifications', 'GET', false),
      false,
      `${role} เปิด /notifications ไม่ได้`,
    );
  }
  // API ของกล่องก็ต้องเปิดคู่กัน ไม่งั้นหน้าโหลดขึ้นแต่ข้อมูลไม่มา
  for (const role of ['ae', 'viewer', 'marketing']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/api/notifications', 'GET', true), false, role);
    assert.equal(lockedOut({ role, extraCaps: [] }, '/api/notifications', 'PATCH', true), false, `${role} PATCH`);
  }
});

test('every signed-in role can open its own account page', () => {
  const roles = ['ae', 'ac', 'rd', 'ra', 'staff', 'viewer', 'secretary'];

  for (const role of roles) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/account', 'GET', false),
      false,
      `${role} should reach /account`,
    );
  }
});

test('account and central settings hub are open without broadening restricted child pages', () => {
  const viewer = { role: 'viewer', extraCaps: [] };

  assert.equal(lockedOut(viewer, '/account', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings', 'GET', false), false);
  assert.equal(lockedOut(viewer, '/settings/document-standards', 'GET', false), true);
  assert.equal(lockedOut(viewer, '/api/account/signature', 'POST', true), false);
});

test('holidays keeps its open-page access after moving under /settings', () => {
  // เดิมสองหน้านี้อยู่ /database/* ซึ่งเปิดผ่าน OPEN_PAGES ให้ทุก role ที่ล็อกอิน —
  // ย้าย URL แล้วสิทธิ์ต้องเท่าเดิม (ปฏิทินวันหยุดเป็นข้อมูลอ้างอิงของไทม์ไลน์)
  for (const role of ['ae', 'ac', 'rd', 'ra', 'staff', 'viewer', 'secretary', 'ae_supervisor']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/settings/holidays', 'GET', false), false, `${role} /settings/holidays`);
  }
  // เปิดเฉพาะสอง path นี้ ไม่ใช่ /settings/* ทั้งชุด
  assert.equal(lockedOut({ role: 'viewer', extraCaps: [] }, '/settings/company', 'GET', false), true);
});

test('ต้นแบบดีไซน์ระบบเปิดให้ทุก role — หน้าตั้งค่าลิงก์ให้ทุกคนอยู่แล้ว', () => {
  /* 🐞 ของเดิม proxy ไม่ได้เปิด path นี้ ⇒ คนที่ไม่ใช่แอดมินกดจากหน้าตั้งค่าแล้วเด้ง
     ไป /home เงียบ ๆ (ผู้ใช้รายงาน 2026-08-21) · หน้านี้ไม่มีข้อมูลจริง ไม่ยิง API เลย */
  for (const role of ['ae', 'ac', 'rd', 'ra', 'staff', 'viewer', 'secretary', 'ae_supervisor']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/settings/design-preview', 'GET', false), false, `${role} /settings/design-preview`);
  }
  // เปิดเฉพาะหน้านี้ ไม่ใช่ /settings/* ทั้งชุด
  assert.equal(lockedOut({ role: 'viewer', extraCaps: [] }, '/settings/cost-templates', 'GET', false), true);
});

test('คำร้องย้าย /sa/requests → /requests แล้วยังเปิดได้เท่าเดิม (P0b)', () => {
  // ⚠️ proxy เป็น allowlist แบบ default-deny — prefix ใหม่ที่ไม่ลงทะเบียนจะ 403 **เงียบ**
  // build ผ่าน เทสต์อื่นผ่าน และทดสอบด้วย admin ก็ผ่าน เพราะ admin ข้ามด่านนี้ไปเลย
  // ⇒ ต้องยึดด้วยเทสต์ที่ไล่ role จริงของคนที่ใช้หน้านี้ (ฝ่ายขายเปิด · RD/PC ตอบ)
  for (const role of ['ae', 'ac', 'senior_ae', 'ae_supervisor', 'rd', 'staff', 'secretary']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/requests', 'GET', false), false, `${role} /requests`);
    assert.equal(lockedOut({ role, extraCaps: [] }, '/requests/DR-1', 'GET', false), false, `${role} /requests/DR-1`);
  }
  // เส้นเก่ายังผ่าน proxy ได้ เพื่อให้ redirect ของ next.config ทำงาน — ถ้าโดนบล็อก
  // ตั้งแต่ proxy ผู้ใช้ที่กด bookmark เก่าจะเจอ 403 แทนที่จะถูกพาไปหน้าใหม่
  assert.equal(lockedOut({ role: 'ae', extraCaps: [] }, '/sa/requests', 'GET', false), false);
});

test('AE Supervisor can open document standards while other business roles cannot', () => {
  assert.equal(
    lockedOut({ role: 'ae_supervisor', extraCaps: [] }, '/settings/document-standards', 'GET', false),
    false,
  );
  for (const role of ['senior_ae', 'ae', 'ac', 'ra', 'viewer', 'staff']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/settings/document-standards', 'GET', false),
      true,
      role,
    );
  }
});

test('AE Supervisor can open commercial presets while other business roles cannot', () => {
  assert.equal(
    lockedOut({ role: 'ae_supervisor', extraCaps: [] }, '/settings/commercial-presets', 'GET', false),
    false,
  );
  for (const role of ['senior_ae', 'ae', 'ac', 'ra', 'viewer', 'staff']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/settings/commercial-presets', 'GET', false),
      true,
      role,
    );
  }
});

test('ae_supervisor สามารถเขียน /api/product-types ได้ (จัดการหมวดสินค้า Phase 2) — regression #587', () => {
  const sup = { role: 'ae_supervisor', extraCaps: [] };
  // เดิม /api/product-types ไม่อยู่ใน OPEN_WRITE_APIS → lockedOut คืน true ก่อนถึง
  // apiWriteAllowed ทำให้ ae_supervisor โดน 403 ทั้งที่ canManageProductCategories อนุญาต
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal(lockedOut(sup, '/api/product-types', method, true), false, `product-types ${method}`);
    assert.equal(lockedOut(sup, '/api/product-types/import/commit', method, true), false, `import ${method}`);
  }
  // role ที่ไม่ควรจัดการหมวด: lockdown ปล่อยผ่าน แต่ apiWriteAllowed (ชั้นถัดไป) ยังบล็อก
  // — ตรงนี้ทดสอบแค่ว่า lockdown ไม่ได้บล็อก ae_supervisor อีกต่อไป
});

test('รายงานความพร้อมลายเซ็นเปิดด้วย users:view และเป็นอ่านอย่างเดียว', () => {
  // grant users:view เป็น cap อ่านอย่างเดียว (เหมือนที่ใช้เปิด /users อยู่แล้ว)
  const granted = { role: 'ae_supervisor', extraCaps: ['users:view'] };
  assert.equal(lockedOut(granted, '/settings/signature-coverage', 'GET', false), false);
  assert.equal(lockedOut(granted, '/api/admin/signature-coverage', 'GET', true), false);

  // ไม่มี grant = เข้าไม่ได้ทั้งหน้าและ API
  const plain = { role: 'ae_supervisor', extraCaps: [] };
  assert.equal(lockedOut(plain, '/settings/signature-coverage', 'GET', false), true);
  assert.equal(lockedOut(plain, '/api/admin/signature-coverage', 'GET', true), true);

  // อ่านอย่างเดียวจริง — เขียนไม่หลุดผ่าน lockdown แม้จะมี grant
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal(lockedOut(granted, '/api/admin/signature-coverage', method, true), true, method);
  }
  // และ /api/admin อื่น ๆ ต้องไม่ถูกเปิดตามไปด้วย
  assert.equal(lockedOut(granted, '/api/admin/users', 'GET', true), true);
});

test('บล็อกข้อมูลบริษัทที่เผยแพร่อ่านได้ทุก role — เอกสารที่ AE พิมพ์ต้องไม่ตกไปใช้ค่าสำรอง', () => {
  // เกิดจากบั๊กจริง: PR #693 เปิด /api/company-profile โดยไม่ลงทะเบียนใน proxy ด่าน
  // lockdown เป็น allowlist (default deny) ทุก role ที่ไม่ใช่ admin จึงได้ 403 แล้ว
  // getCompanyProfileForPrint กลืน error ไปใช้ constant สำรองเงียบ ๆ
  for (const role of ['ae_supervisor', 'ae', 'ac', 'rd', 'ra', 'secretary', 'marketing', 'executive', 'pc', 'sa']) {
    const user = { role, extraCaps: [] };
    assert.equal(lockedOut(user, '/api/company-profile', 'GET', true), false, `${role} อ่านบล็อกบริษัทไม่ได้`);
    // อ่านอย่างเดียว — ไม่มี route เขียนอยู่แล้ว และ lockdown ต้องไม่เปิดเผื่อไว้
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      assert.equal(lockedOut(user, '/api/company-profile', method, true), true, `${role} ${method}`);
    }
    // ทางเขียนจริงของข้อมูลบริษัทยังปิดสนิทสำหรับ non-admin (master:manage เท่านั้น)
    assert.equal(lockedOut(user, '/api/organization-settings', 'GET', true), true, `${role} organization-settings`);
    assert.equal(lockedOut(user, '/settings/company', 'GET', false), true, `${role} หน้าตั้งค่าบริษัท`);
  }
});

test('มาตรฐานเอกสารที่เผยแพร่อ่านได้ทุก role — เอกสารที่พิมพ์สดต้องได้รหัสแบบฟอร์มจริง', () => {
  // /api/document-standards/active = ค่าที่พิมพ์บนใบถึงลูกค้า (formCode/Revision/accent)
  // ต้องเปิดอ่านให้คนออกเอกสาร ไม่งั้นใบร่างจะตกไปใช้ค่าสำรองใน documentBrand เงียบ ๆ
  // แบบเดียวกับที่ /api/company-profile เคยหลุด (PR #694)
  for (const role of ['ae_supervisor', 'ae', 'ac', 'rd', 'ra', 'secretary', 'pc', 'sa']) {
    const user = { role, extraCaps: [] };
    assert.equal(lockedOut(user, '/api/document-standards/active', 'GET', true), false, `${role} อ่านมาตรฐานไม่ได้`);
  }
  // หน้าจัดการ (เห็นร่าง + ประวัติ) ยังเป็นของหัวหน้าฝ่ายขาย/แอดมินตามเดิม
  assert.equal(lockedOut({ role: 'ae', extraCaps: [] }, '/settings/document-standards', 'GET', false), true);
});

test('secretary/marketing เปิดหน้ารายการสินค้าและอ่าน API สินค้าได้ (มติ 2026-07-20)', () => {
  // ทั้งสอง role ได้ products:view อ่านอย่างเดียว — ชั้น lockdown ต้องไม่บล็อก
  for (const role of ['secretary', 'marketing']) {
    const user = { role, extraCaps: [] };
    assert.equal(lockedOut(user, '/database/products', 'GET', false), false, `${role} page`);
    assert.equal(lockedOut(user, '/api/products', 'GET', true), false, `${role} api`);
    assert.equal(lockedOut(user, '/api/master/products', 'GET', true), false, `${role} api alias`);
  }
});

test('ทะเบียนวัสดุ: RD/PC เขียนได้ทั้งที่ไม่มี costing:edit (regression บั๊ก 403)', () => {
  // บั๊กเดิม: /api/sa/materials กั้นด้วย costing:edit อย่างเดียว แต่ RD/PC ถือแค่
  // costing:quote → กด "แก้ราคา" ในทะเบียนแล้ว 403 ทุกครั้ง ทั้งที่เป็นเจ้าของราคา
  for (const role of ['rd', 'staff']) {
    assert.equal(apiWriteAllowed('POST', '/api/sa/materials', role, []), true, `${role} เพิ่มวัสดุ`);
    assert.equal(apiWriteAllowed('POST', '/api/sa/materials/MAT-1/revisions', role, []), true, `${role} ออกราคา`);
    assert.equal(apiWriteAllowed('PATCH', '/api/sa/materials/MAT-1', role, []), true, `${role} รับวัสดุร่าง`);
  }
  // ฝ่ายขายยังเปิดคำขอ/เสนอวัสดุร่างได้เหมือนเดิม (costing:edit)
  assert.equal(apiWriteAllowed('POST', '/api/sa/materials', 'ae', []), true);
  // role ที่ไม่เกี่ยวกับระบบขอราคาเลยยังเข้าไม่ได้
  for (const role of ['secretary', 'marketing', 'viewer']) {
    assert.equal(apiWriteAllowed('POST', '/api/sa/materials', role, []), false, `${role} ต้องไม่ผ่าน`);
  }
  // อ่านไม่ถูกกั้นที่ชั้นนี้ (ด่านจริงคือ canViewCosting ใน handler)
  assert.equal(apiWriteAllowed('GET', '/api/sa/materials', 'viewer', []), true);
});

test('ทะเบียนกลิ่น/สูตร (mig 0171): ลงทะเบียนใน allowlist แล้ว — non-admin ต้องไม่ 403 เงียบ', () => {
  // บทเรียนจาก /api/company-profile: endpoint ที่ไม่อยู่ใน OPEN_*_APIS จะโดน
  // lockdown ปัดตกทั้งที่ handler เขียนสิทธิ์ไว้ถูก แล้วหน้าจอเงียบ ๆ ใช้ค่าสำรอง
  // ⚠️ เข้าถึงจริงผ่าน /api/master/* ซึ่ง normalizeMaster ตัดเหลือ /api/scents
  for (const path of ['/api/scents', '/api/formulas', '/api/master/scents', '/api/master/formulas']) {
    assert.equal(lockedOut({ role: 'rd', extraCaps: [] }, path, 'GET', true), false, `rd อ่าน ${path}`);
    assert.equal(lockedOut({ role: 'ae', extraCaps: [] }, path, 'POST', true), false, `ae เขียน ${path}`);
  }
});

test('ทะเบียนกลิ่น/สูตร: RD เขียนได้ทั้งที่ไม่มี products:edit', () => {
  // RD เป็นเจ้าของทะเบียน (รับเข้าทะเบียน/ใส่รหัส/ส่ง Rev) แต่ไม่มี products:edit
  // ถ้ากั้นด้วย cap เดียวเหมือนแคตตาล็อกสินค้า จะซ้ำรอยบั๊ก 403 ของทะเบียนวัสดุ
  for (const path of ['/api/master/scents', '/api/master/formulas']) {
    assert.equal(apiWriteAllowed('POST', path, 'rd', []), true, `rd สร้าง ${path}`);
    assert.equal(apiWriteAllowed('PATCH', `${path}/X-1`, 'rd', []), true, `rd รับเข้าทะเบียน ${path}`);
    // ฝ่ายขายเสนอร่างได้ (products:edit) — ด่านจริงว่าใครรับเข้าทะเบียนอยู่ใน handler
    assert.equal(apiWriteAllowed('POST', path, 'ae', []), true, `ae เสนอร่าง ${path}`);
    // read-only observer และ role ที่ไม่เกี่ยวยังเขียนไม่ได้
    for (const role of ['viewer', 'executive', 'marketing', 'secretary']) {
      assert.equal(apiWriteAllowed('POST', path, role, []), false, `${role} ต้องไม่ผ่าน ${path}`);
    }
  }
});

test('ทะเบียนกลิ่น/สูตร: Rev + จัดระเบียบ ใช้กฎเดียวกับตัวทะเบียน', () => {
  assert.equal(apiWriteAllowed('POST', '/api/master/scents/SCT-1/revisions', 'rd', []), true);
  assert.equal(apiWriteAllowed('PATCH', '/api/master/scents/SCT-1/revisions/SREV-1', 'ae', []), true);
  assert.equal(apiWriteAllowed('POST', '/api/master/formulas/unsorted', 'rd', []), true);
  assert.equal(apiWriteAllowed('POST', '/api/master/formulas/unsorted', 'viewer', []), false);
});

// 🐞 บั๊กจริง 2026-07-30: `/api/tax/*` ไม่ตรงกับ OPEN_WRITE_APIS สักตัว (ในลิสต์มีแต่
// `/api/orders` กับ `/api/excise-registrations`) → **ทุก role ที่ไม่ใช่แอดมินโดน 403**
// เมื่อ POST /api/tax/orders/from-sales-order ซึ่งเป็นทางเดียวที่ปุ่ม "สร้างใบยื่นจาก
// Sale Order" ใช้ · GET ผ่านเพราะ OPEN_READ_APIS มี `/api/tax` จึงเห็นรายการ SO ครบ
// แต่กดสร้างแล้วเด้ง — ดูเหมือนระบบพังทั้งที่ handler ถูกทุกบรรทัด
test('ทางสร้างใบยื่นจาก Sale Order เปิดให้ฝ่ายขาย ไม่ใช่แอดมินคนเดียว', () => {
  for (const role of ['ae_supervisor', 'senior_ae', 'ac', 'ae']) {
    assert.equal(
      lockedOut({ role, extraCaps: [] }, '/api/tax/orders/from-sales-order', 'POST', true),
      false,
      `${role} ต้องสร้างใบยื่นจาก SO ได้`,
    );
    assert.equal(apiWriteAllowed('POST', '/api/tax/orders/from-sales-order', role, []), true, role);
  }
  // role ที่ไม่ได้ทำงานขายยังเขียนไม่ได้ (ด่าน cap ต้องยังทำงาน ไม่ใช่เปิดหมด)
  for (const role of ['viewer', 'executive', 'marketing', 'secretary', 'rd', 'staff']) {
    const open = !lockedOut({ role, extraCaps: [] }, '/api/tax/orders/from-sales-order', 'POST', true)
      && apiWriteAllowed('POST', '/api/tax/orders/from-sales-order', role, []);
    assert.equal(open, false, `${role} ต้องไม่ผ่าน`);
  }
});

// alias /api/tax/{registrations,orders} re-export handler ตัวเดียวกับชื่อเดิม และไฟล์
// alias เขียนกำกับไว้ว่า "behaves identically" — สิทธิ์จึงต้องเท่ากันทุกเมธอด/ทุก role
// ไม่งั้นชื่อที่เรียกตัดสินสิทธิ์ ซึ่งเป็นบั๊กที่หาต้นตอยากมาก
test('alias /api/tax/* ได้สิทธิ์เท่ากับชื่อเดิมเป๊ะ ทุกเมธอด', () => {
  const ROLES_ALL = ['admin', 'ae_supervisor', 'senior_ae', 'ac', 'ae', 'ra', 'rd', 'staff', 'secretary', 'marketing', 'executive', 'viewer'];
  const pairs = [
    ['/api/tax/registrations', '/api/excise-registrations'],
    ['/api/tax/registrations/REG-1', '/api/excise-registrations/REG-1'],
    ['/api/tax/registrations/REG-1/requirements', '/api/excise-registrations/REG-1/requirements'],
    ['/api/tax/orders', '/api/orders'],
    ['/api/tax/orders/PO-1', '/api/orders/PO-1'],
  ];
  for (const [alias, canonical] of pairs) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      for (const role of ROLES_ALL) {
        const u = { role, extraCaps: [] };
        assert.equal(
          lockedOut(u, alias, method, true), lockedOut(u, canonical, method, true),
          `lockedOut ${method} ${alias} (${role})`,
        );
        assert.equal(
          apiWriteAllowed(method, alias, role, []), apiWriteAllowed(method, canonical, role, []),
          `apiWriteAllowed ${method} ${alias} (${role})`,
        );
      }
    }
  }
});

// /api/tax/reports เป็นรายงาน (อ่านอย่างเดียว) ไม่ใช่ alias — ห้ามถูกยุบไปเป็น
// /api/orders ไม่งั้นจะได้สิทธิ์เขียนใบยื่นติดมาโดยไม่มีใครสั่ง
test('/api/tax/reports ไม่ถูกยุบเป็น alias — อ่านได้ทุก role เขียนไม่ได้', () => {
  for (const role of ['ae', 'ra', 'viewer', 'staff']) {
    assert.equal(lockedOut({ role, extraCaps: [] }, '/api/tax/reports', 'GET', true), false, `${role} อ่านรายงาน`);
    assert.equal(lockedOut({ role, extraCaps: [] }, '/api/tax/reports', 'POST', true), true, `${role} เขียนรายงานไม่ได้`);
  }
});

// ── ด่านไฟล์แนบต้องไม่ตัดฝ่ายที่ handler ให้สิทธิ์รายแถวไว้ ─────────────────
//
// 🐞 บั๊กจริง: ลิสต์ cap ของ `/api/attachments` มีแต่ของฝ่ายขาย/master data/mgmt
// ⇒ **RD และ staff (PC/PD/WH/QC/TS) แนบไฟล์ไม่ได้เลยทั้งระบบ** · /api/upload
// ปล่อยผ่าน (ตกท้าย apiWriteAllowed = ทุกคนที่ล็อกอิน) ไฟล์จึงขึ้น Drive จริงก่อน
// แล้วมาตายตอนบันทึกแถว ⇒ ระบบลบไฟล์ทิ้งแล้วเด้งคำว่า "forbidden" ดิบ ๆ
//
// กระทบหนักสุดที่ "คำร้องข้ามฝ่าย" ซึ่งสร้างที่แนบไฟล์ขึ้นมาเพื่อฝ่ายเหล่านี้โดยเฉพาะ
// (บรีฟกลิ่น/Mock-up ต้องมีรูปอ้างอิง) — ที่ผ่านมาเลยยังต้องส่งกันทาง LINE เหมือนเดิม
test('⭐ RD/staff ต้องแนบและลบไฟล์แนบได้ — ด่านหยาบห้ามตัดคนที่มีสิทธิ์จริงรายแถว', () => {
  for (const role of ['rd', 'staff']) {
    assert.equal(apiWriteAllowed('POST', '/api/attachments', role, []), true, `${role} แนบไฟล์`);
    assert.equal(apiWriteAllowed('DELETE', '/api/attachments/ATT-1', role, []), true, `${role} ลบไฟล์`);
    // หน้าจอยิงผ่าน namespace /api/master ซึ่ง normalizePath ตัดเป็นชื่อเดียวกัน
    assert.equal(apiWriteAllowed('POST', '/api/master/attachments', role, []), true, `${role} แนบผ่าน /api/master`);
  }
});

// ผูกด่านไฟล์แนบเข้ากับด่านคำร้อง: ใครตอบคำร้อง/ตอบราคาได้ ย่อมต้องแนบรูปประกอบได้
// — ไม่งั้นเพิ่ม role ผู้ตอบใหม่แล้วจะเสียความสามารถนี้ไปเงียบ ๆ อีกรอบ
test('ทุก role ที่รับ/ตอบคำร้องได้ ต้องผ่านด่านไฟล์แนบด้วย', () => {
  const answerers = ['rd', 'staff', 'ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin'];
  for (const role of answerers) {
    assert.equal(
      apiWriteAllowed('POST', '/api/sa/requests/DR-1/items', role, []),
      apiWriteAllowed('POST', '/api/attachments', role, []),
      `${role}: ตอบคำร้องได้แต่แนบไฟล์ไม่ได้ (หรือกลับกัน) = คนละมาตรฐานกันเงียบ ๆ`,
    );
  }
});

// การเปิดทางให้ RD/staff ต้องไม่พลอยเปิดให้ผู้สังเกตการณ์ — costing:view เป็นของ
// executive ด้วย จึงต้องใช้ costing:edit/quote เป็นเงื่อนไข ไม่ใช่ costing:view
test('ผู้สังเกตการณ์อ่านอย่างเดียวยังแนบ/ลบไฟล์ไม่ได้', () => {
  for (const role of ['viewer', 'executive', 'marketing']) {
    assert.equal(apiWriteAllowed('POST', '/api/attachments', role, []), false, `${role} ต้องแนบไม่ได้`);
    assert.equal(apiWriteAllowed('DELETE', '/api/attachments/ATT-1', role, []), false, `${role} ต้องลบไม่ได้`);
    // อ่านยังได้ตามเดิม (ด่านนี้ปล่อย GET เสมอ — ตัวกั้นจริงอยู่ใน handler)
    assert.equal(apiWriteAllowed('GET', '/api/attachments', role, []), true, `${role} อ่านได้`);
  }
});

test('ทะเบียนจังหวัด/อำเภอ/ตำบล อ่านได้ทุก role — ไม่งั้น dropdown ที่อยู่ว่างเปล่าเงียบ ๆ', () => {
  // default-deny: prefix ใหม่ที่ลืมลง OPEN_READ_APIS จะทำให้ non-admin โดน 403
  // แล้วช่องจังหวัดว่างโดยไม่มีข้อความบอกสาเหตุ (บทเรียนเดียวกับ /api/company-profile)
  for (const role of ['ae', 'ac', 'rd', 'pc', 'staff']) {
    const user = { role, extraCaps: [] };
    assert.equal(lockedOut(user, '/api/thai-address', 'GET', true), false, role);
    // เข้าถึงจริงผ่าน /api/master/* ซึ่ง normalizeMaster ตัดเป็นชื่อข้างบน
    assert.equal(lockedOut(user, '/api/master/thai-address', 'GET', true), false, `master ${role}`);
  }
  // อ่านอย่างเดียว — ไม่มีทางเขียน (ข้อมูลมาจากไฟล์ในรีโป ไม่ใช่จากฐานข้อมูล)
  assert.equal(lockedOut({ role: 'ae', extraCaps: [] }, '/api/thai-address', 'POST', true), true);
});

// ⭐ **ตัวกันโมดูลใหม่ตกลิสต์** — เทสต์ตัวนี้เกิดจากบั๊กจริงที่ผู้ใช้แจ้งเข้ามาเอง
// ผ่านระบบแจ้งปัญหา ("เข้าหน้าวิจัยและพัฒนาไม่ได้"): `/rd` ถูกสร้างพร้อมการ์ดใน
// SYSTEM_CATALOG และเมนูใน AppLayout ครบ แต่ตกจาก OPEN_PAGES ⇒ ฝ่าย RD เห็นเมนู
// แล้วกดเข้าไม่ได้เลยสักคน · admin ไม่มีทางเจอเพราะผ่านตั้งแต่บรรทัดแรกของ lockedOut
// และ build/เทสต์เดิมก็ไม่มีอะไรจับ
//
// ต่อจากนี้ ระบบใหม่ที่ลืมลง OPEN_PAGES จะทำให้เทสต์นี้แดงทันทีตั้งแต่ก่อน merge
test('ทุกระบบใน SYSTEM_CATALOG ต้องเปิดหน้า landing ของตัวเองได้ (default-deny)', async () => {
  const { SYSTEM_CATALOG } = await import('./config/systems.js');
  // role ที่ **ไม่ใช่ admin** — admin ผ่านทุกอย่างจึงพิสูจน์อะไรไม่ได้
  const user = { role: 'rd', extraCaps: [] };

  for (const system of SYSTEM_CATALOG) {
    const landing = system.landing(user);
    assert.ok(landing, `${system.key} ไม่มี landing`);
    assert.equal(
      lockedOut(user, landing, 'GET', false),
      false,
      `${system.key}: ${landing} ไม่อยู่ใน OPEN_PAGES — คนที่เห็นการ์ดจะกดเข้าไม่ได้`,
    );
  }
});

test('ฝ่าย R&D เปิดโมดูลของตัวเองได้ทั้งหน้าภาพรวมและหน้าลูก', () => {
  for (const role of ['rd', 'ae', 'staff', 'viewer']) {
    const user = { role, extraCaps: [] };
    assert.equal(lockedOut(user, '/rd', 'GET', false), false, `${role} /rd`);
    assert.equal(lockedOut(user, '/rd/requests', 'GET', false), false, `${role} /rd/requests`);
  }
});

/* ── ขั้นของฝ่ายบัญชีบนใบสั่งขาย ────────────────────────────────────────────
   🐞 บั๊กจริง 2026-08-13: ฝ่ายบัญชี **ไม่มี `salesplan:edit`** โดยเจตนา ⇒ กฎรวม
   `/api/sales-planning` ตัด PATCH ของเขาทิ้งที่ proxy **ก่อนถึง handler**
   ปุ่มขึ้นบนจอปกติแต่กดแล้วไม่สำเร็จ · ผู้ใช้แจ้งเข้ามาเองหลังมีบัญชีฝ่าย FN คนแรก
   เทสต์เดิมจับไม่ได้เพราะทดสอบด้วย admin ซึ่งผ่านตั้งแต่บรรทัดแรกของ lockedOut */
test('ฝ่ายบัญชีคอนเฟิร์มงวดและตรวจใบได้ ทั้งที่ไม่มี salesplan:edit', () => {
  const FN = 'finance';
  assert.equal(can(FN, 'salesplan:edit'), false, 'บัญชีต้องไม่มีสิทธิ์แก้งานขาย');

  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/sales-orders/SOR-1/installments', FN, []), true);
  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/sales-orders/SOR-1', FN, []), true);
  // คน FN ที่ยังถือ role `staff` (ยังไม่ย้าย role) ต้องผ่านด้วย — ถือ payments:confirm เหมือนกัน
  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/sales-orders/SOR-1', 'staff', []), true);
});

/* ⚠️ ด่านนี้หยาบโดยตั้งใจ แต่ต้อง **ไม่หยาบเกินขอบเขต** — เปิดแค่ PATCH ของใบเดียว
   ไม่ใช่ทั้ง namespace งานขาย */
test('ช่องที่เปิดให้บัญชีต้องแคบแค่ PATCH ของใบสั่งขาย ไม่ลามไปเส้นอื่น', () => {
  const FN = 'finance';
  assert.equal(apiWriteAllowed('POST', '/api/sales-planning/sales-orders', FN, []), false, 'สร้างใบไม่ได้');
  assert.equal(apiWriteAllowed('DELETE', '/api/sales-planning/sales-orders/SOR-1', FN, []), false, 'ลบใบไม่ได้');
  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/deals/D1', FN, []), false, 'แก้ดีลไม่ได้');
  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/quotations/Q1', FN, []), false, 'แก้ใบเสนอราคาไม่ได้');
  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/sales-orders/SOR-1/issued', FN, []), false, 'เส้นลูกอื่นไม่เปิด');
  // role ที่ไม่มี payments:confirm เลย ต้องไม่ได้อะไรเพิ่มจากบรรทัดใหม่นี้
  assert.equal(apiWriteAllowed('PATCH', '/api/sales-planning/sales-orders/SOR-1', 'marketing', []), false);
});
