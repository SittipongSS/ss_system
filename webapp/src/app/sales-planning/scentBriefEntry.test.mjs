// ── ทางเข้าคำร้องพัฒนากลิ่นจากหน้าใบสั่งขาย ──────────────────────────────
//
// งานพัฒนากลิ่นเริ่มที่ SO ไม่ใช่ที่หน้าคำร้อง (มติผู้ใช้ 2026-08-08) — คนที่เพิ่ง
// อนุมัติใบเสร็จต้องกดต่อได้เลย ไม่ต้องจำเลขที่แล้วไปไล่หาใน dropdown
//
// สามชิ้นที่ต้องตรงกันตลอด และไม่มีอะไรจับได้ถ้าหลุด (build ผ่าน · หน้าเรนเดอร์ปกติ
// · ผิดแค่ปุ่มที่หายไปหรือกดแล้วไปตายที่ DB):
//   1 route ของ SO ต้องถามหาคำร้องด้วยเงื่อนไข **เดียวกับ unique index** ของ 0219
//   2 หน้า SO ต้องส่งใบที่เจอเข้า `scentDesignOrderError` ไม่ใช่ตัดสินเอง
//   3 หน้าเปิดคำร้องต้องอ่าน `?salesOrderId=` และงอกบล็อกบรีฟให้เอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(HERE, rel), 'utf8');

const ORDER_ROUTE = read('../api/sales-planning/sales-orders/[id]/route.js');
const ORDER_PAGE = read('./sales-orders/[id]/page.js');
/* ทางเข้าย้ายจากการ์ด "บรีฟกลิ่น" มาอยู่ในช่วงแรกของ **เส้นเดินงาน** (2026-08-13)
   หน้ายังตัดสินด้วย `scentDesignOrderError` เหมือนเดิม แต่ลิงก์ถูกประกอบในลิบนี้ */
const WORK_TRACK = read('../../lib/sales/salesOrderWorkTrack.js');
const NEW_REQUEST_PAGE = read('../requests/new/page.js');
const MIGRATION = read('../../../supabase/migrations/0219_rd_requests_structure.sql');

test('⭐ route ของ SO ถามหาคำร้องด้วยเงื่อนไขเดียวกับ unique index ของ 0219', () => {
  // ของจริงที่ DB บังคับ: salesOrderId IS NOT NULL AND kind = 'scent_dev' AND status <> 'cancelled'
  assert.match(MIGRATION, /kind = 'scent_dev'/);
  assert.match(MIGRATION, /status <> 'cancelled'/);

  // หลวมกว่านี้ = ปุ่มหายทั้งที่ใบเก่าถูกยกเลิกไปแล้วและเปิดใหม่ได้
  // แคบกว่านี้ = กดแล้วชน unique violation ที่ DB หลังกรอก PDR จนจบ
  assert.match(ORDER_ROUTE, /from\('dept_requests'\)/);
  assert.match(ORDER_ROUTE, /\.eq\('kind', 'scent_dev'\)/);
  assert.match(ORDER_ROUTE, /\.neq\('status', 'cancelled'\)/);
  assert.match(ORDER_ROUTE, /scentRequest/);
});

test('⭐ หน้า SO ตัดสินด้วย scentDesignOrderError ตัวเดียวกับ server — ปุ่มกับ API ขัดกันไม่ได้', () => {
  assert.match(ORDER_PAGE, /scentDesignOrderError/);
  // ต้องส่งใบที่เปิดไปแล้วเข้าไปด้วย ไม่งั้นด่าน "1 SO : 1 PDR" (ม-37) ไม่ทำงานฝั่งจอ
  assert.match(ORDER_PAGE, /usedByRequestNo/);
  // การ์ดผูกกับ "มีบรรทัดออกแบบกลิ่นไหม" ไม่ใช่ "นับจำนวนได้ไหม" — ใบที่มีบรรทัด
  // แต่ qty อ่านไม่ออกคือเคสที่ต้องบอกผู้ใช้มากที่สุด ผูกกับตัวนับแล้วมันจะเงียบหาย
  assert.match(ORDER_PAGE, /hasDesignLines/);
  assert.match(ORDER_PAGE, /scentDesignLines/);
});

test('⭐ ปุ่มพาไปหน้าเปิดคำร้องพร้อมหัวข้อและใบสั่งขาย — ไม่ใช่หน้าเปล่า', () => {
  assert.match(WORK_TRACK, /\/requests\/new\?kind=scent_dev&salesOrderId=/);
  // กลับมาที่ใบเดิมหลังบันทึกร่าง — ไม่ใช่โยนไปหน้าคิวรวม
  assert.match(WORK_TRACK, /returnTo=/);
  // หน้า SO ต้องส่ง orderId เข้าไปจริง ไม่งั้นลิงก์ประกอบมาแล้วไม่มีใบติดไปด้วย
  assert.match(ORDER_PAGE, /orderId:/);
});

/* 🔴 ใบที่เปิดคำร้องไม่ได้ต้องขึ้น **เหตุผล** ไม่ใช่ปุ่มจาง — ปุ่มจางไม่บอกว่าต้องทำอะไรต่อ
   (กฎเดียวกับหน้าเปิดคำร้อง) ⇒ ไม่มี href ให้กดเมื่อ blocked */
test('⭐ ใบที่ยังเปิดคำร้องไม่ได้ ต้องไม่มีปุ่มให้กด', () => {
  assert.match(WORK_TRACK, /actionLabel: scent\.blocked \? null :/);
  assert.match(WORK_TRACK, /href: scent\.blocked \|\| !orderId/);
});

test('⭐ หน้าเปิดคำร้องอ่าน ?salesOrderId= และงอกบล็อกบรีฟให้เอง', () => {
  assert.match(NEW_REQUEST_PAGE, /searchParams\.get\("salesOrderId"\)/);
  // 🐞 ไม่งอกบล็อกบรีฟ = ฟอร์มเปิดมาพร้อมใบที่เลือกไว้แล้วแต่ไม่มีบล็อกสักก้อน
  // ⇒ กรอกต่อไม่ได้เลย และไม่มีอะไรบอกว่าทำไม
  assert.match(NEW_REQUEST_PAGE, /scentCountForOrder/);
  assert.match(NEW_REQUEST_PAGE, /briefs/);
});
