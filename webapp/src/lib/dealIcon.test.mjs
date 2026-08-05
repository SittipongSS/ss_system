// ── "ดีล" ต้องใช้ไอคอนเดียวทั้งระบบ ────────────────────────────────────────
//
// ผู้ใช้ทัก 2026-08-05: ปุ่มสร้างดีลใช้ไอคอนคนละตัวกับดีล
//
// ตรวจแล้วพบว่ามีไอคอนของ "ดีล" อยู่ **สองตัว** มาตั้งแต่ต้น:
//   FolderKanban      — เมนู · หน้ารวมดีล · หน้ารายละเอียดดีล · แดชบอร์ด (10+ ไฟล์)
//   BriefcaseBusiness — หน้าลีด + หน้าโครงการ ("ดีลจาก Lead" / "ดีลในโครงการ")
// ทั้งคู่หมายถึงสิ่งเดียวกันเป๊ะ คนอ่านจึงเห็นดีลเป็นคนละของกันคนละหน้า
//
// เทสต์นี้ไม่ได้ hardcode ชื่อไอคอน แต่ **อ่านจากเมนูหลัก** ซึ่งเป็นที่ที่ผู้ใช้เห็น
// คำว่า "ดีล" ครั้งแรก แล้วบังคับให้หน้าอื่นใช้ตัวเดียวกัน — เปลี่ยนไอคอนที่เมนู
// ทีเดียวแล้วเทสต์จะชี้เองว่าต้องตามแก้ที่ไหนบ้าง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** ไอคอนของเมนู "ดีล" ใน AppLayout = ตัวจริงที่ทั้งระบบต้องยึด */
function navDealIcon() {
  const nav = read('src/components/AppLayout.js');
  const line = nav.split('\n').find((l) => l.includes("href: '/sa/deals'"));
  assert.ok(line, 'หาเมนูดีลใน AppLayout ไม่เจอ — เทสต์นี้จะกลายเป็นเทสต์เปล่า');
  const icon = line.match(/icon:\s*(\w+)/)?.[1];
  assert.ok(icon, `อ่านไอคอนจากบรรทัดเมนูดีลไม่ได้: ${line.trim()}`);
  return icon;
}

test('เมนูดีลประกาศไอคอนไว้ชัดเจน', () => {
  assert.equal(navDealIcon(), 'FolderKanban');
});

/* หน้าที่แสดง "ดีล" ในบริบทของ entity อื่น (ลีด/โครงการ) — จุดที่ไอคอนเคยแตกออกไป */
const DEAL_SURFACES = [
  'src/app/sales-planning/leads/[id]/page.js',   // การ์ด "ดีลจากลีดนี้" + ปุ่มเปิดดีล
  'src/app/sales-planning/leads/page.js',        // ปุ่มเปิดดีลในแถวคิวลีด
  // เดิมชี้ที่ src/app/sa/projects/[id]/page.js (การ์ด "ดีลในโครงการ" บนแท็บภาพรวม)
  // — การ์ดชุดนั้นถูกถอดออกเพราะซ้ำกับตารางดีล (2026-08-05) พื้นผิว "ดีลในโครงการ"
  // ของหน้าโครงการจึงย้ายมาอยู่ที่หัวตารางในคอมโพเนนต์นี้
  'src/components/pm/ProjectDealsHub.js',        // ตาราง "ดีลในโครงการ"
];

test('ทุกหน้าที่พูดถึงดีล ใช้ไอคอนเดียวกับเมนู', () => {
  const icon = navDealIcon();
  for (const rel of DEAL_SURFACES) {
    assert.match(read(rel), new RegExp(`\\b${icon}\\b`), `${rel} ต้องใช้ ${icon}`);
  }
});

// ratchet: ไอคอนตัวที่สองต้องไม่กลับมา — ถ้าวันหลังมีคนอยากใช้ BriefcaseBusiness
// กับ *เรื่องอื่นที่ไม่ใช่ดีล* ให้ลบเทสต์นี้ทิ้งพร้อมเขียนเหตุผลกำกับ ไม่ใช่แอบใส่กลับ
test('ไม่มีไอคอนตัวที่สองของดีลหลงเหลือ', () => {
  for (const rel of DEAL_SURFACES) {
    assert.doesNotMatch(read(rel), /BriefcaseBusiness/,
      `${rel} ยังใช้ไอคอนดีลตัวที่สองอยู่ — ดีลต้องมีไอคอนเดียว`);
  }
});
