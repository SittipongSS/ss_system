import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { REQUEST_KINDS } from '@/lib/requests/kinds/registry';
import { requestNeeds } from '@/lib/master/requestTypes';

/* ── "บังคับกรอก" ต้องมีช่องให้กรอกจริง ───────────────────────────────────
 *
 * 🐞 **ของจริงที่หลุดขึ้น main (พบ 2026-08-24)**: #1385 ถอด `'project'` ออกจาก
 * `needs` ของ ขอเอกสาร · พัฒนาสูตร · สอบถามข้อมูล (ดีลลอยเปิดคำร้องได้แล้ว) แต่
 * `RequestForm` ยังเปิดบล็อกดีลด้วยธงเก่า `requestNeedsRef(kind, 'project')`
 * ⇒ **สามหัวข้อนั้นไม่มีช่องดีลบนจอเลย** ขณะที่:
 *   · เกจแท็บ "งาน" ขึ้น "ยังขาด: ดีล"
 *   · ปุ่ม "บันทึกร่าง" จาง พร้อมข้อความ "ต้องเลือกดีลที่เกี่ยวข้อง"
 * = สั่งให้ทำสิ่งที่หน้าจอไม่มีให้ทำ · เปิดใบสามหัวข้อนี้ไม่ได้เลยสักใบ
 *
 * ⭐ รูปของบั๊กคือ **ธงของช่องกับธงของด่านเป็นคนละคำ** — ตราบใดที่ทั้งคู่อ่าน
 * `needs` ตัวเดียวกัน มันขัดกันไม่ได้เชิงโครงสร้าง · เทสต์นี้จึงคุมที่ "ทุกคำใน
 * `needs` ต้องมีธงของตัวเองในฟอร์ม" ไม่ใช่ไล่เช็คทีละหัวข้อ
 */
const FORM = readFileSync('src/components/requests/RequestForm.js', 'utf8');

// คำใน `needs` → ธงที่ฟอร์มต้องประกาศเพื่อเปิดช่องของมัน
// ⚠️ `project` ไม่อยู่ในลิสต์โดยตั้งใจ — โครงการไม่มีช่องให้เลือก มันมาจากดีล
// (ดู REQUEST_NEEDS.project.derivedFrom) ⇒ หัวข้อที่ประกาศ `project` ต้องประกาศ
// `deal` ด้วยเสมอ ซึ่งเทสต์ข้างล่างคุมไว้
const FLAG_FOR = {
  deal: 'needsDeal',
  salesOrder: 'needsSalesOrder',
  quotation: 'needsQuotation',
  scent: 'needsScent',
  formula: 'needsFormula',
};

test('⭐ ทุกอย่างที่หัวข้อ "ต้องอ้าง" ต้องมีธงเปิดช่องของตัวเองในฟอร์ม', () => {
  const wanted = new Set();
  for (const kind of Object.keys(REQUEST_KINDS)) {
    for (const ref of requestNeeds(kind)) wanted.add(ref);
  }
  for (const ref of wanted) {
    if (ref === 'project') continue;   // ไม่มีช่อง — derive จากดีล
    const flag = FLAG_FOR[ref];
    assert.ok(flag, `ยังไม่มีธงของ "${ref}" ในลิสต์ของเทสต์ — เพิ่ม needs ใหม่ต้องเพิ่มที่นี่ด้วย`);
    assert.match(
      FORM, new RegExp(`const ${flag} = requestNeedsRef\\(kind, "${ref}"\\)`),
      `RequestForm ไม่มีธง ${flag} ที่ถาม "${ref}" — ช่องบังคับที่ไม่มีช่องให้กรอก`,
    );
    assert.match(
      FORM, new RegExp(`\\{${flag} &&`),
      `RequestForm ประกาศ ${flag} แต่ไม่ได้ใช้เปิดบล็อกไหนเลย`,
    );
  }
});

test('⭐ หัวข้อที่ต้องมีโครงการ ต้องต้องมีดีลด้วย — โครงการไม่มีช่องของตัวเอง', () => {
  for (const kind of Object.keys(REQUEST_KINDS)) {
    const needs = requestNeeds(kind);
    if (!needs.includes('project')) continue;
    assert.ok(
      needs.includes('deal'),
      `${kind}: ประกาศ needs 'project' โดยไม่มี 'deal' — โครงการมาจากดีล `
      + 'ไม่มีช่องให้เลือกเอง ⇒ ใบนี้จะบล็อกโดยไม่มีทางแก้บนจอ',
    );
  }
});

test('⭐ ธงเก่าที่ถาม "project" ต้องไม่กลับมาเปิดบล็อกช่อง', () => {
  // 🐞 นี่คือรูปเป๊ะ ๆ ของบั๊กที่หลุดขึ้น main
  assert.doesNotMatch(
    FORM, /const needs\w* = requestNeedsRef\(kind, "project"\)/,
    'RequestForm กลับไปเปิดช่องด้วยธง "project" — มันไม่มีช่องบนจอ ใช้ "deal" แทน',
  );
});
