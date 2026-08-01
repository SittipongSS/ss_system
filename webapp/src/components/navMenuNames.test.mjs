// ── ชื่อเมนู "คิวงานของตัวเอง" ห้ามซ้ำข้ามระบบ ────────────────────────────
//
// 🐞 เคยเกิดจริง 2026-07-31: ระบบบริหารงานขายมี "งานของฉัน" (/sa/tasks = งานติดตาม
// ส่วนบุคคล) อยู่ก่อน แล้วระบบธุรกิจบริการเพิ่ม "งานของฉัน" อีกตัว (/service/my-visits
// = นัดเข้าไซต์) ชื่อเดียวกันเป๊ะทั้งที่คนละเรื่องกันคนละระบบ — คนที่ทำงานสองระบบ
// จำไม่ได้ว่าของตัวเองอยู่เมนูไหน แล้วเปิดผิดหน้าประจำ
//
// เทสต์นี้อ่านนิยามเมนูจากซอร์สตรง ๆ เพราะ AppLayout เป็น client component ที่มี hook
// เต็มไปหมด import มารันในเทสต์ไม่ได้ · ตรวจแค่คู่ที่ชนกันมาแล้วจริง ไม่ใช่ห้ามซ้ำทั้งไฟล์
// (ชื่ออย่าง "ภาพรวม" ซ้ำได้ตามระบบ — บริบทชัดเพราะเป็นเมนูแรกของแต่ละระบบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AppLayout.js'), 'utf8');

// ดึงชื่อเมนูของ href ที่ระบุ จากบรรทัดนิยามเมนูในซอร์ส
function menuNameFor(href) {
  const line = SOURCE.split(/\r?\n/).find((row) => row.includes(`href: '${href}'`));
  assert.ok(line, `ไม่พบเมนู ${href} ใน AppLayout — ถ้าย้าย/ลบเมนู ให้แก้เทสต์นี้ด้วย`);
  const match = /name: '([^']+)'/.exec(line);
  assert.ok(match, `เมนู ${href} ไม่มี name`);
  return match[1];
}

test('⭐ คิวงานของตัวเองสองระบบต้องใช้คนละชื่อ — ชื่อซ้ำข้ามระบบทำให้คนเปิดผิดหน้าประจำ', () => {
  const sales = menuNameFor('/sa/tasks');              // บริหารงานขาย — งานติดตามส่วนบุคคล
  const service = menuNameFor('/service/my-visits');   // ธุรกิจบริการ — นัดเข้าไซต์

  assert.notEqual(sales, service);
  assert.equal(sales, 'งานของฉัน');
  assert.equal(service, 'นัดของฉัน');
});

test('⭐ X-1: สองระบบมีหน้าภาพรวมของตัวเอง คนละเส้นทาง — ไม่ใช่ปฏิทินรวม', () => {
  // มติผู้ใช้ 2026-08-01: เลิกทำหน้ารวมสองโมดูล เพราะเป็นคนละทีมปฏิบัติงาน
  // ถ้าวันไหนมีคนยุบสองเมนูนี้ให้ชี้ที่เดียวกัน เทสต์นี้จะดับ
  assert.equal(menuNameFor('/production'), 'ภาพรวม');
  assert.equal(menuNameFor('/service'), 'ภาพรวม');
  assert.ok(!SOURCE.includes("href: '/schedule'"), 'ห้ามมีปฏิทินรวมสองระบบ');
});

test('⭐ ทุกเมนูของธุรกิจบริการต้องแคบด้วยฝ่าย ไม่ใช่แค่ cap', () => {
  // cap `service:view` อยู่ที่ role `staff` ซึ่ง PC/PD/WH/QC/TS ใช้ร่วมกัน —
  // ตัวกั้นจริงคือ canViewService ที่แคบเหลือฝ่าย TS · เมนูที่เช็คแค่ cap จะโผล่
  // ให้ฝ่ายโรงงานเห็น ซึ่งขัดมติแยกทีม (ดู lib/pm/teamSeparation.test.mjs)
  const lines = SOURCE.split(/\r?\n/).filter((row) => /href: '\/service(\/|')/.test(row));
  assert.ok(lines.length >= 4, 'ควรเจอเมนูของระบบธุรกิจบริการอย่างน้อย 4 รายการ');
  for (const line of lines) {
    assert.match(line, /visible: canViewService|visible: canEditService/, line.trim());
  }
});

test('เมนูของแต่ละระบบอยู่ใต้เส้นทางของระบบตัวเอง — ไม่ยืมเส้นทางข้ามระบบ', () => {
  // /sa/tasks อยู่ในกลุ่ม salesplan · /service/* อยู่ในกลุ่ม service
  // ถ้าวันไหนมีคนย้าย my-visits ไปไว้ใต้ /sa หรือ /pm ระบบธุรกิจบริการจะกลายเป็น
  // เมนูของฝ่ายขายอีกครั้ง ซึ่งเป็นเรื่องที่ตั้งใจแยกออกมาตั้งแต่ต้น (มติ 2026-07-30)
  assert.ok(SOURCE.includes("href: '/service/my-visits'"));
  assert.ok(!SOURCE.includes("href: '/sa/my-visits'"));
  assert.ok(!SOURCE.includes("href: '/pm/my-visits'"));
});
