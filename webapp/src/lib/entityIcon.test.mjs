// ── "ดีล" กับ "โครงการ" ต้องใช้ไอคอนคนละตัว และตัวเดียวกันทั้งระบบ ──────────
//
// รอบแรก (2026-08-05) ผู้ใช้ทักว่าปุ่มสร้างดีลใช้ไอคอนคนละตัวกับดีล ตอนนั้นแก้ด้วยการ
// บังคับให้ทุกหน้าที่พูดถึง "ดีล" ใช้ FolderKanban เหมือนเมนู
//
// รอบสอง (2026-08-14) ผู้ใช้ทักซ้ำ — คราวนี้เป็นคนละปัญหา: FolderKanban ถูกใช้แทน
// **ทั้งดีลและโครงการ** พร้อมกัน (เมนูโครงการใช้ Boxes ซึ่งซ้ำกับทะเบียนวัสดุอีกต่อ)
// สองสิ่งที่คนละของกันจึงหน้าตาเหมือนกันทุกหน้า มติ: ดีล = Handshake · โครงการ =
// FolderKanban (ตามการ์ดบริบทของหน้าคำร้องที่ผู้ใช้ชี้มา)
//
// เทสต์นี้ไม่ hardcode ชื่อไอคอนไว้ที่เดียว แต่ **อ่านจากเมนูหลัก** ซึ่งเป็นที่ที่ผู้ใช้เห็น
// คำว่า "ดีล"/"โครงการ" ครั้งแรก แล้วบังคับให้หน้าอื่นใช้ตัวเดียวกัน — เปลี่ยนที่เมนู
// ทีเดียวแล้วเทสต์จะชี้เองว่าต้องตามแก้ที่ไหนบ้าง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** ไอคอนที่เมนูหลักประกาศไว้สำหรับ href นั้น = ตัวจริงที่ทั้งระบบต้องยึด */
function navIcon(href) {
  const nav = read('src/components/AppLayout.js');
  const line = nav.split('\n').find((l) => l.includes(`href: '${href}'`));
  assert.ok(line, `หาเมนู ${href} ใน AppLayout ไม่เจอ — เทสต์นี้จะกลายเป็นเทสต์เปล่า`);
  const icon = line.match(/icon:\s*(\w+)/)?.[1];
  assert.ok(icon, `อ่านไอคอนจากบรรทัดเมนู ${href} ไม่ได้: ${line.trim()}`);
  return icon;
}

const dealIcon = () => navIcon('/sa/deals');
const projectIcon = () => navIcon('/sa/projects');

test('เมนูดีลกับเมนูโครงการประกาศไอคอนไว้ชัดเจนและไม่ซ้ำกัน', () => {
  assert.equal(dealIcon(), 'Handshake');
  assert.equal(projectIcon(), 'FolderKanban');
  assert.notEqual(dealIcon(), projectIcon());
});

/* หน้าที่แสดง "ดีล" — รวมหน้าของดีลเอง และดีลที่โผล่ในบริบทของ entity อื่น
   (ลีด / โครงการ / ใบสั่งขาย / งาน) ซึ่งเป็นจุดที่ไอคอนเคยแตกออกไป */
const DEAL_SURFACES = [
  'src/app/sales-planning/deals/page.js',            // หัวหน้ารวมดีล + การ์ดสรุป + ตัวกรองประเภทดีล
  'src/app/sales-planning/deals/[id]/page.js',       // หัวหน้ารายละเอียดดีล
  'src/app/sales-planning/leads/[id]/page.js',       // การ์ด "ดีลจากลีดนี้" + ปุ่มเปิดดีล
  'src/app/sales-planning/leads/page.js',            // ปุ่มเปิดดีลในแถวคิวลีด
  'src/app/sales-planning/quotations/page.js',       // ตัวกรอง "ประเภทดีล"
  'src/app/sales-planning/sales-orders/[id]/page.js',// การ์ดบริบท "ดีล"
  'src/app/sa/projects/[id]/page.js',                // แถบ facts "จำนวนดีล"
  'src/app/pm/tasks/page.js',                        // ชิปดีลบนแถวงาน
  'src/app/pm/tasks/[id]/page.js',                   // การ์ดบริบท "ดีล"
  // เดิมชี้ที่ src/app/sa/projects/[id]/page.js (การ์ด "ดีลในโครงการ" บนแท็บภาพรวม)
  // — การ์ดชุดนั้นถูกถอดออกเพราะซ้ำกับตารางดีล (2026-08-05) พื้นผิว "ดีลในโครงการ"
  // ของหน้าโครงการจึงย้ายมาอยู่ที่หัวตารางในคอมโพเนนต์นี้
  'src/components/pm/ProjectDealsHub.js',            // ตาราง "ดีลในโครงการ"
  'src/components/pm/DealPicker.js',                 // ถังรวมดีลของตัวเลือกดีล
];

/* หน้าที่แสดง "โครงการ" — โครงการเองและโครงการที่โผล่ในบริบทของ entity อื่น */
const PROJECT_SURFACES = [
  'src/app/sa/projects/page.js',                     // หัวหน้ารวมโครงการ + ทะเบียนโครงการ
  'src/app/sales-planning/deals/page.js',            // เมนู "เปิดโครงการที่ผูกไว้" ในแถวดีล
  'src/app/sales-planning/deals/[id]/page.js',       // ปุ่ม "ไปโครงการ" + การ์ดโครงการที่เชื่อมอยู่
  'src/app/sales-planning/sales-orders/[id]/page.js',// การ์ดบริบท "โครงการ"
  'src/app/requests/[id]/page.js',                   // การ์ดบริบท "โครงการ" ของใบคำร้อง
  'src/app/database/customers/[id]/page.js',         // แถบ facts "โครงการ"
  'src/app/database/products/[id]/page.js',          // แถบ facts + หัวข้อ "โครงการที่เกี่ยวข้อง"
  'src/app/pm/tasks/[id]/page.js',                   // การ์ดบริบท "โครงการ"
  'src/components/requests/RequestQueuePanel.js',    // ตัวกรอง "โครงการ" ของคิวคำร้อง
  'src/components/pm/DealPicker.js',                 // ถังซ้าย = โครงการ
];

test('ทุกหน้าที่พูดถึงดีล ใช้ไอคอนเดียวกับเมนูดีล', () => {
  const icon = dealIcon();
  for (const rel of DEAL_SURFACES) {
    assert.match(read(rel), new RegExp(`\\b${icon}\\b`), `${rel} ต้องใช้ ${icon}`);
  }
});

test('ทุกหน้าที่พูดถึงโครงการ ใช้ไอคอนเดียวกับเมนูโครงการ', () => {
  const icon = projectIcon();
  for (const rel of PROJECT_SURFACES) {
    assert.match(read(rel), new RegExp(`\\b${icon}\\b`), `${rel} ต้องใช้ ${icon}`);
  }
});

// ratchet: ไอคอนดีลรุ่นเก่าต้องไม่กลับมา — ถ้าวันหลังมีคนอยากใช้ Briefcase กับ
// *เรื่องอื่นที่ไม่ใช่ดีล* ให้ลบไฟล์นั้นออกจากลิสต์พร้อมเขียนเหตุผลกำกับ ไม่ใช่แอบใส่กลับ
test('ไม่มีไอคอนดีลรุ่นเก่าหลงเหลือ', () => {
  for (const rel of DEAL_SURFACES) {
    assert.doesNotMatch(read(rel), /Briefcase/,
      `${rel} ยังใช้ไอคอนดีลตัวเก่าอยู่ — ดีลต้องมีไอคอนเดียว`);
  }
});

/* ไฟล์ที่พูดถึง "ดีล" อย่างเดียว ห้ามมีไอคอนโครงการโผล่ — เป็นด่านกันการถอยกลับไป
   ใช้ไอคอนตัวเดียวแทนสองสิ่ง (บั๊กรอบ 2026-08-14) ไฟล์ที่มีทั้งสอง entity เช่น
   หน้ารายละเอียดดีลหรือใบสั่งขาย ไม่อยู่ในลิสต์นี้เพราะมันต้องมีทั้งคู่จริง ๆ */
const DEAL_ONLY_FILES = [
  'src/app/sales-planning/leads/page.js',
  'src/app/sales-planning/leads/[id]/page.js',
  'src/app/sales-planning/quotations/page.js',
  'src/components/pm/ProjectDealsHub.js',
];

test('ไฟล์ที่พูดถึงดีลอย่างเดียว ไม่มีไอคอนโครงการปน', () => {
  const icon = projectIcon();
  for (const rel of DEAL_ONLY_FILES) {
    assert.doesNotMatch(read(rel), new RegExp(`\\b${icon}\\b`),
      `${rel} พูดถึงดีลอย่างเดียวแต่ใช้ ${icon} ซึ่งเป็นไอคอนของโครงการ`);
  }
});

// ปุ่มสลับมุมมอง "บอร์ด" ไม่ใช่ entity — ถ้ามันหยิบไอคอนโครงการไปใช้ ผู้ใช้จะเห็น
// ไอคอนโครงการบนแถบที่ไม่เกี่ยวกับโครงการเลย
test('ตัวสลับมุมมองไม่ยืมไอคอนของโครงการ', () => {
  assert.doesNotMatch(read('src/components/ui/ViewSwitcher.js'), new RegExp(`\\b${projectIcon()}\\b`),
    'ViewSwitcher ต้องไม่ใช้ไอคอนโครงการกับมุมมองบอร์ด');
});
