// ── ใครเป็นเจ้าของ "วันเริ่ม" ของงาน (มติผู้ใช้ 2026-08-12) ───────────────────
//
//   โครงการยังไม่มีดีล → โครงการเป็นเจ้าของ กรอกวันเองได้
//   โครงการมีดีลแล้ว   → วันของแต่ละ segment เป็นของดีล · ช่องบนโครงการล็อก ชี้ไปที่ดีล
//
// เหตุผล: ตอนดีลถูกผูกเข้าโครงการ ราก segment ถูกปักหมุด (`startLocked`) หมุดชนะ anchor
// เสมอ ⇒ ช่อง "วันเริ่มโครงการ" ที่เปิดให้แก้ค้างไว้คือปุ่มที่กดแล้วไม่เกิดอะไรกับ segment
// `projects.startDate` ไม่ตาย — ยังเป็น anchor ของ **งานกลาง** (ขั้นตอนที่ไม่มี dealId)
// และของโครงการที่ไม่มีดีลเลย (สร้างตรง / PO สหมิตร) จึงห้ามลบคอลัมน์
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { projectDateRange } from './derived.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

/* ยามซอร์สสี่ตัวของเส้นผูก/สร้าง/แก้โครงการ (dealProjectLink · create-project · ProjectDealsHub ·
   SalesProjectCreateModal · หน้ารวม/หน้ารายละเอียดโครงการ) ถูกถอดใน P3a — ยุบโครงการ 16/11 ลบทุกทางสร้าง/ผูก/ดูโครงการ
   เหลือยามกันโมดัลสร้างโครงการไหลกลับหน้าดีล + ตัวคำนวณช่วงวัน (derived.js ยังอยู่) */
test('หน้าดีลไม่มีทางสร้างโครงการ (ถอดใน P2d · ไฟล์โมดัลลบใน P3a) — ห้ามไหลกลับ', () => {
  assert.doesNotMatch(read('app/sales-planning/deals/[id]/page.js'), /SalesProjectCreateModal/);
});

test('projectDateRange: อ่านจากขั้นตอนจริง ครอบทุก segment + งานกลาง', () => {
  const project = {
    startDate: '2026-01-01', // คอลัมน์สำเนา — ต้องไม่ชนะของจริง
    dueDate: '2026-09-30',
    tasks: [
      { dealId: 'DL-1', startDate: '2026-08-17', finishDate: '2026-08-21' },
      { dealId: 'DL-2', startDate: '2026-08-03', finishDate: '2026-09-04' },
      { dealId: null, startDate: '2026-08-10', finishDate: '2026-08-12' }, // งานกลาง
    ],
  };
  assert.deepEqual(projectDateRange(project), {
    start: '2026-08-03',
    finish: '2026-09-04',
    target: '2026-09-30',
  });
});

test('projectDateRange: ยังไม่มีขั้นตอน → ตกมาที่คอลัมน์ของโครงการ (สร้างตรง/PO สหมิตร)', () => {
  assert.deepEqual(
    projectDateRange({ startDate: '2026-08-12', dueDate: null, tasks: [] }),
    { start: '2026-08-12', finish: null, target: null },
  );
  assert.deepEqual(projectDateRange(null), { start: null, finish: null, target: null });
});
// (ยาม "หัวโครงการต้องโชว์ช่วงที่คำนวณ" ถอดใน P3a พร้อมหน้ารายละเอียดโครงการ)
