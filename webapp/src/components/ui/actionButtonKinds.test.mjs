import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// อ่านเป็นข้อความแทนการ import — ActionButtons.js เป็น client component ที่ import
// lucide-react ซึ่ง unit test แบบ raw Node ยังโหลดไม่ได้ (ดูหมายเหตุใน AGENTS)
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const ACTION_BUTTONS = src('./ActionButtons.js');
const QT_PAGE = src('../../app/sales-planning/quotations/[id]/page.js');
const SO_PAGE = src('../../app/sales-planning/sales-orders/[id]/page.js');
const COSTING_PAGE = src('../../app/sa/costing/[id]/page.js');

// B1 (2026-07-26): ทั้งสองหน้าส่ง kind ที่ไม่มีใน KINDS แล้วตกลง fallback btn-secondary
// เงียบ ๆ — ปุ่ม "ถอนการยื่น" เลยเป็นสีแดงบน QT (ยืม kind:"reject") และสีเทาบน SO
// (ยืม kind:"restore") ส่วน "ออก Revision" ที่ QT ส่ง kind:"copy" ก็ไม่มีไอคอน
test('document workflow buttons are declared in KINDS, not silently falling back', () => {
  assert.match(ACTION_BUTTONS, /withdraw: \{ tone: "neutral", Icon: Undo2/);
  assert.match(ACTION_BUTTONS, /revise: \{ tone: "neutral", Icon: Copy/);
  assert.match(ACTION_BUTTONS, /^import \{[\s\S]*?\bCopy\b[\s\S]*?\} from "lucide-react";/m);

  // ถอนการยื่น ≠ ตีกลับ — ห้ามกลับไปเป็นปุ่มทำลาย
  assert.doesNotMatch(ACTION_BUTTONS, /withdraw: \{ tone: "danger"/);
});

test('QT and SO use the same kind for the same button', () => {
  for (const [name, page] of [['QT', QT_PAGE], ['SO', SO_PAGE]]) {
    assert.match(page, /id: "withdraw",?\s*\n?\s*kind: "withdraw"/, `${name}: ปุ่มถอนการยื่นต้องใช้ kind "withdraw"`);
    assert.match(page, /id: "revise",?\s*\n?\s*kind: "revise"/, `${name}: ปุ่มออก Revision ต้องใช้ kind "revise"`);
    // "copy" ไม่เคยเป็น kind จริง — เคยถูกส่งเข้าไปแล้วเงียบหาย
    assert.doesNotMatch(page, /kind: "copy"/, `${name}: kind "copy" ไม่มีอยู่จริงใน KINDS`);
  }

  // B8: restore เหลือความหมายเดียว (กู้ SO ที่ยกเลิก) จึงต้องมี label ของตัวเอง
  assert.match(SO_PAGE, /id: "restore", kind: "restore", label: "/);
});

// B5 (2026-07-28): ใบขอราคาผลิตได้ปุ่มดึงกลับด้วย — ต้องใช้ kind เดียวกับอีกสองหน้า
// ไม่งั้นปุ่มเดียวกันจะคนละสี/คนละไอคอนอีกรอบ (บั๊กเดิมของ QT/SO)
test('costing request uses the same withdraw kind as QT and SO', () => {
  assert.match(COSTING_PAGE, /id: "withdraw",?\s*\n?\s*kind: "withdraw"/);
  assert.doesNotMatch(COSTING_PAGE, /kind: "copy"/);
});
