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

test('ผูกดีลเข้าโครงการ: วัน segment ต้องตกมาที่วันเริ่มของดีลก่อนถึงจะเป็นวันนี้', () => {
  const src = read('lib/sales/dealProjectLink.js');
  assert.match(
    src,
    /startDateInput \|\| deal\.startDate \|\| todayStr\(\)/,
    'ลำดับต้องเท่ากับ create-project — ข้าม deal.startDate ไปคือ segment เริ่มนับจากวันนี้',
  );
  // เส้นทางสร้างโครงการจากดีลใช้ลำดับเดียวกันอยู่แล้ว — ล็อกไว้ไม่ให้เดินหนีกันอีก
  assert.match(
    read('app/api/sales-planning/deals/[id]/create-project/route.js'),
    /body\.startDate \|\| deal\.startDate \|\| todayStr\(\)/,
  );
});

test('แผงผูกดีล: เลือกดีลแล้วช่องวันต้องตั้งตามวันของดีลนั้น ไม่ใช่วันนี้', () => {
  const src = read('components/pm/ProjectDealsHub.js');
  assert.match(src, /setStartDate\(deal\?\.startDate \|\| localToday\(\)\)/, 'เลือกดีล = ได้วันของดีลมาเป็นค่าตั้งต้น');
  assert.match(src, /onChange=\{pickDeal\}/, 'ตัวเลือกดีลต้องผ่าน pickDeal ไม่ใช่ setDealId ตรง ๆ');
});

test('ฟอร์มโครงการ: วันเริ่มที่มาจากดีลเป็นช่องเส้นประอ่านอย่างเดียว และไม่ใช่ช่องบังคับ', () => {
  const src = read('components/pm/SalesProjectCreateModal.js');
  assert.match(src, /startDateFrom = null/, 'ต้องมีโหมดผ่าน props ไม่ใช่ฟอร์มคนละไฟล์ (AGENTS.md)');
  assert.match(src, /startDateFrom \? \(\s*<>\s*<div className="deal-derived">/, 'ค่าที่ระบบรู้แล้วต้องเป็นช่องเส้นประ ไม่ใช่ดรอปดาวน์จาง');
  assert.match(
    src,
    /\[!startDateFrom && !form\.startDate, "วันที่เริ่มโครงการ"\]/,
    'ช่องที่คนกรอกไม่ได้ ห้ามอยู่ในด่านตรวจช่องบังคับ',
  );
});

test('ทางเรียกทั้งสามส่งเจ้าของวันมาถูกตัว', () => {
  // สร้างจากดีล = ของดีลเสมอ
  assert.match(
    read('app/sales-planning/deals/[id]/page.js'),
    /startDateFrom=\{deal \? `ดีล \$\{deal\.code \|\| deal\.id\}` : "ดีลก่อตั้ง"\}/,
  );
  // แก้โครงการ = ขึ้นกับว่ามีดีลไหม
  assert.match(
    read('app/sa/projects/[id]/page.js'),
    /startDateFrom=\{\(p\.deals \|\| \[\]\)\.length \? "ดีลในโครงการ" : null\}/,
  );
  // สร้างตรงจากหน้ารวมโครงการ = โครงการเป็นเจ้าของ ห้ามส่ง prop นี้
  assert.doesNotMatch(read('app/sa/projects/page.js'), /startDateFrom/);
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

test('หัวโครงการต้องโชว์ช่วงที่คำนวณ ไม่ใช่คอลัมน์สำเนา', () => {
  const src = read('app/sa/projects/[id]/page.js');
  /* ⚠️ เดิมเช็ค `|| "-"` — เปลี่ยนเป็น naText() ตอนรวมค่าว่างทั้งระบบเป็น N/A
     (มติผู้ใช้ 2026-08-14) · เจตนาของด่านนี้เท่าเดิม: หัวโครงการต้องอ่านจาก
     `dateRange` ที่คำนวณ ไม่ใช่คอลัมน์สำเนาใน `p` */
  assert.match(src, /value: naText\(dateRange\.start\)/);
  assert.match(src, /value: naText\(dateRange\.finish\)/);
  assert.doesNotMatch(src, /label: "วันเริ่ม", value: p\.startDate/, 'ห้ามกลับไปอ่านคอลัมน์สำเนา');
});
