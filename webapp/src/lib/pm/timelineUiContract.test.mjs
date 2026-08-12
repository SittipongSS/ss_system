// ── ข้อตกลงหน้าตาของตารางไทม์ไลน์ (เฟส 4 · ผลตรวจ 2026-08-12) ────────────────
//
// ของจริงอยู่ใน JSX ที่ต้องมี DOM ถึงจะ assert ได้ — โปรเจกต์นี้ยังไม่มีชุดเทสต์ที่เรนเดอร์
// React จึงล็อกเป็น ratchet อ่าน source แบบเดียวกับ dealStageIntegrity / stepDateSync
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const TABLE = 'components/salesPlanning/DealTimelineTable.js';
const PROJECT_PAGE = 'app/sa/projects/[id]/page.js';
const STEP_FORM = 'components/pm/StepFormFields.js';

test('คอลัมน์วันที่ชิดขวาเหมือนตัวเลข (UI_DESIGN_SYSTEM §ป้ายในตาราง กฎ 3-4)', () => {
  const src = read(TABLE);
  assert.match(
    src,
    /<th className="num">เริ่ม<\/th><th className="num">เสร็จ<\/th><th className="num">วัน<\/th>/,
    'หัวตารางต้องชิดตามเนื้อข้างล่าง — วันที่ที่คนเทียบข้ามแถวต้องเป็น .num',
  );
  // เซลล์ทั้งสองต้องเป็น num ด้วย ไม่ใช่แค่หัว
  assert.equal(
    (src.match(/<td className="num" style=\{\{ whiteSpace: "nowrap" \}\}>/g) || []).length,
    2,
    'เซลล์วันเริ่ม/วันจบต้องเป็น .num ทั้งคู่',
  );
});

test('ปุ่มเลื่อนลำดับใช้ไอคอนชุดเดียวกับที่อื่น ไม่ใช่อักขระข้อความ', () => {
  const src = read(TABLE);
  assert.doesNotMatch(src, /[▴▾]/, 'อักขระ ▴ ▾ ไม่ใช่ภาษาไอคอนของระบบ (ที่อื่นใช้ ArrowUp/ArrowDown)');
  assert.match(src, /<ArrowUp size=\{\d+\} aria-hidden="true" \/>/);
  assert.match(src, /<ArrowDown size=\{\d+\} aria-hidden="true" \/>/);
});

test('ฟอร์มขั้นตอนไม่มี dueDate อีก — ช่องผีที่ไม่มี input และไม่มีคนอ่าน', () => {
  const src = read(STEP_FORM);
  // ดูเฉพาะรูปข้อมูลของฟอร์ม ไม่ใช่ทั้งไฟล์ — คอมเมนต์อธิบายเหตุผลมีคำว่า dueDate อยู่
  // (ตัวสแกนไม่แยกโค้ดกับคอมเมนต์ · กับดักเดิมของ dealStageIntegrity)
  const emptyForm = src.match(/export const EMPTY_STEP_FORM = \{[\s\S]*?\};/)?.[0] || '';
  const toForm = src.match(/export const stepToForm = \(task\) => \(\{[\s\S]*?\}\);/)?.[0] || '';
  assert.ok(emptyForm && toForm, 'หารูปข้อมูลของฟอร์มไม่เจอ — เทสต์นี้ต้องอัปเดตตามโครงใหม่');
  assert.doesNotMatch(emptyForm, /dueDate/, 'ขั้นตอนไทม์ไลน์ไม่มี "กำหนดเสร็จ" แยกจากวันจบตามแผน');
  assert.doesNotMatch(toForm, /dueDate/, 'โหลดค่าเข้าฟอร์มก็ต้องไม่พา dueDate มาด้วย');
});

test('ออก Rev ตอนมีการแก้ค้าง = ต้องถูกกัน พร้อมบอกเหตุผล', () => {
  const table = read(TABLE);
  assert.match(table, /onDirtyChange\?\.\(dirtyCount\)/, 'TimelineWorkspace ต้องรายงานของค้างขึ้นหน้าแม่');

  const page = read(PROJECT_PAGE);
  assert.match(page, /onDirtyChange=\{setTimelineDirty\}/, 'หน้าโครงการต้องรับค่านั้นไว้');
  assert.match(
    page,
    /if \(timelineDirty > 0\) \{[\s\S]{0,200}?return;/,
    'openIssueRev ต้องหยุดเมื่อมีของค้าง — Rev คือ snapshot ของ task ทั้งชุด',
  );
  // จางเฉย ๆ ไม่พอ ต้องบอกว่าทำไมกดไม่ได้ (form-design-rules §2)
  assert.match(page, /มีการแก้ไขไทม์ไลน์ค้างอยู่/, 'ต้องบอกเหตุผลที่กดไม่ได้ ไม่ใช่เงียบ');
});
