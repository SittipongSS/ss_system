// เส้นทาง `/support` ต้องเข้าถึงได้จริงสำหรับ **ทุกคนที่ล็อกอิน**
//
// 🐞 ชุดนี้ดักบั๊กที่ build ผ่าน เทสต์ผ่าน แต่ผู้ใช้จริงเข้าไม่ได้ — ทุกข้อเคยเกิด
// กับโมดูลอื่นมาแล้ว และไม่มีอะไรจับได้เลยถ้าทดสอบด้วยบัญชี admin อย่างเดียว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { can, capsFor, ROLES } from '../permissions.js';

const here = dirname(fileURLToPath(import.meta.url));
const proxySrc = readFileSync(join(here, '../../proxy.js'), 'utf8');
// อ่านซอร์ส ไม่ import — `config/navigation.js` ลาก `config/systems.js` ซึ่ง
// import `lucide-react` เข้ามาด้วย (คนละ runtime กับเทสต์)
const navSrc = readFileSync(join(here, '../../config/navigation.js'), 'utf8');

// 🐞 `/requests` เคยหลุดกฎนี้ ⇒ ตกไปที่ `return 'tax'` ท้ายฟังก์ชัน ⇒ ทั้งโมดูล
// ไปโผล่ใต้เปลือกเมนูระบบภาษี และเมนูของมันเองกดเข้าไม่ได้เลย
test('/support เป็นระบบของตัวเอง และกฎอยู่เหนือ fallback ของระบบภาษี', () => {
  // lastIndexOf — คำว่า `return 'tax'` โผล่ในคอมเมนต์เตือนด้วย ตัวจริงคือตัวท้ายสุด
  const branch = navSrc.indexOf("return 'support'");
  const fallback = navSrc.lastIndexOf("return 'tax'");
  assert.ok(branch > 0, "systemForPathname ต้องรู้จัก '/support'");
  assert.ok(fallback > branch, "กฎ '/support' ต้องอยู่เหนือ return 'tax'");
  assert.match(navSrc, /pathname === '\/support' \|\| pathname\.startsWith\('\/support\/'\)/);
});

// ⚠️ เปลือกตั้งค่า `viewer` เข้าไม่ได้ แต่ viewer คือคนที่ต้องแจ้งได้ (มติ Q2/Q14)
test('/support ไม่อยู่ในเปลือกตั้งค่า', () => {
  const paths = navSrc.match(/const SETTINGS_PATHS = \[([^\]]+)\]/);
  assert.ok(paths, 'อ่าน SETTINGS_PATHS ไม่ได้');
  assert.ok(!paths[1].includes('/support'), '/support ต้องไม่อยู่ใน SETTINGS_PATHS');
});

// ⚠️ default-deny: หน้าที่ไม่อยู่ใน OPEN_PAGES = non-admin เจอ 403 เงียบ ๆ
test('proxy เปิดหน้า /support และทางเขียน /api/issues ให้ non-admin', () => {
  const pages = proxySrc.match(/const OPEN_PAGES = \[([^\]]+)\]/s);
  assert.ok(pages, 'อ่าน OPEN_PAGES ไม่ได้');
  assert.match(pages[1], /'\/support'/, '/support ต้องอยู่ใน OPEN_PAGES');

  const writes = proxySrc.match(/const OPEN_WRITE_APIS = \[([^\]]+)\]/s);
  assert.ok(writes, 'อ่าน OPEN_WRITE_APIS ไม่ได้');
  assert.match(writes[1], /'\/api\/issues'/, '/api/issues ต้องอยู่ใน OPEN_WRITE_APIS');
});

// ⭐ เมนูของระบบกรองด้วย cap — cap ที่ไม่มีใครถือ = เมนูไม่ขึ้นเลยสักคน
// (เมนูหายเงียบ ไม่มี error ให้เห็น)
test('ทุก role ถือ issues:report รวม viewer และ role ที่ไม่รู้จัก', () => {
  for (const role of ROLES) {
    assert.ok(can(role, 'issues:report'), `${role} ต้องแจ้งปัญหาได้`);
  }
  assert.ok(capsFor('ไม่รู้จัก').includes('issues:report'), 'role ที่ไม่รู้จักก็ต้องแจ้งได้');
  assert.ok(can('viewer', 'issues:report'));
  assert.ok(can('executive', 'issues:report'));
});

// cap สากลต้องไม่แอบแจกสิทธิ์อื่นติดมาด้วย
test('cap สากลมีตัวเดียว ไม่แจกสิทธิ์อื่นข้ามมา', () => {
  const src = readFileSync(join(here, '../permissions.js'), 'utf8');
  const block = src.match(/const UNIVERSAL_CAPS = \[([^\]]*)\]/);
  assert.ok(block, 'ไม่พบ UNIVERSAL_CAPS');
  assert.deepEqual(block[1].match(/'[^']+'/g), ["'issues:report'"]);
  // viewer ต้องยังเป็นผู้สังเกตการณ์อ่านอย่างเดียวเหมือนเดิมทุกประการ
  assert.equal(can('viewer', 'customers:edit'), false);
  assert.equal(can('viewer', 'pm:edit'), false);
});

// ระบบ `support` ต้องมีทั้งใน SYSTEM_CATALOG (สลับระบบ/หน้าแรก) และในเมนูของ
// AppLayout — มีอย่างใดอย่างหนึ่งแล้วเปลือกจะว่างเปล่าโดยไม่มี error
test('ระบบ support ประกาศครบทั้งสองที่ และเปิดให้ทุกคน', () => {
  const systemsSrc = readFileSync(join(here, '../../config/systems.js'), 'utf8');
  const entry = systemsSrc.slice(systemsSrc.indexOf("key: 'support'"));
  assert.match(entry, /isVisible: \(\) => true/, 'ระบบนี้ต้องเห็นได้ทุกคน ไม่มีเงื่อนไข cap');
  assert.match(entry, /landing: \(\) => '\/support'/);

  const layoutSrc = readFileSync(join(here, '../../components/AppLayout.js'), 'utf8');
  assert.match(layoutSrc, /system: 'support'/, 'AppLayout ต้องมีกลุ่มเมนูของระบบนี้');
  assert.match(layoutSrc, /cap: 'issues:report'/);
});

// ⭐ ทางเดียวที่เปิดเรื่องได้คือโมดัลตัวเดียว — กฎของ repo ห้ามมีฟอร์มสร้างชุดที่สอง
test('มีฟอร์มแจ้งเรื่องชุดเดียว ทุกที่เรียก component เดียวกัน', () => {
  const callers = ['../../components/AppLayout.js', '../../app/support/page.js']
    .map((rel) => readFileSync(join(here, rel), 'utf8'));
  for (const src of callers) {
    assert.match(src, /import ReportIssueModal from "?'?@\/components\/issues\/ReportIssueModal'?"?/);
  }
});

// ⚠️ ไฟล์แนบไปทางเธรด ไม่ใช่ตาราง attachments — ด่านหยาบของ /api/attachments
// ไล่ตาม cap ของ role ซึ่ง viewer ไม่มีสักตัว
test('โมดัลแนบไฟล์ผ่านเส้นเธรด ไม่ใช่ /api/attachments', () => {
  const modal = readFileSync(join(here, '../../components/issues/ReportIssueModal.js'), 'utf8');
  assert.match(modal, /fetch\("\/api\/updates"/);
  // มองหา "การเรียก" ไม่ใช่คำในคอมเมนต์ (เหตุผลที่ไม่ใช้เส้นนั้นเขียนอยู่ในไฟล์)
  assert.ok(!/fetch\(["'`]\/api\/attachments/.test(modal), 'ห้ามใช้เส้นไฟล์แนบที่ viewer ผ่านไม่ได้');
  // ไฟล์ขึ้นที่เก็บผ่านท่อกลาง (uploadFileForEntity) โดยประกาศ entityType ตัวนี้ —
  // ตัว entityType เป็นสิ่งที่ตัดสินว่าไฟล์ไปโฟลเดอร์ไหนบน Drive
  assert.match(modal, /entityType: "system_issue"/);

  const types = readFileSync(join(here, '../master/attachmentTypes.js'), 'utf8');
  assert.ok(!/^\s+system_issue: \[/m.test(types),
    'ห้ามประกาศ system_issue ใน ATTACHMENT_TYPES — จะชวนให้เข้าใจผิดว่า AttachmentsPanel ใช้ได้');
});
