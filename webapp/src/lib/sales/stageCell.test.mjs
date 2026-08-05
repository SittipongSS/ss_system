// ── ช่อง "สถานะ" ที่กดแก้ได้ในแถวตารางดีล ─────────────────────────────────
//
// มติผู้ใช้ 2026-08-05: การขยับขั้นเป็นงานที่ AE ทำถี่ที่สุด แต่เดิมต้องเปิดโมดัลแก้ดีล
// ทั้งใบ (12 ช่อง) เพื่อเปลี่ยนดรอปดาวน์เดียว
//
// ⚠️ ของแบบนี้ทำหลวมได้ง่ายมาก — เทสต์ชุดนี้ล็อกสามเรื่องที่พลาดแล้วเจ็บ:
//   1. ต้องส่งเฉพาะ `stage` (PATCH เป็น partial update · FC% เป็นของ server)
//   2. ดรอปดาวน์ต้องไม่มีขั้นที่มีเส้นทางบังคับของตัวเอง (Won / Lost)
//   3. ต้องมีปุ่มบันทึก ไม่ auto-save (การเปลี่ยนขั้นเขียนประวัติหนึ่งแถว)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEAL_STAGES } from '@/lib/salesPlanning';
import { ROW_EDITABLE_STAGES } from './dealLifecycle.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = readFileSync(join(ROOT, 'src/components/salesPlanning/StageCell.js'), 'utf8');
const page = readFileSync(join(ROOT, 'src/app/sales-planning/deals/page.js'), 'utf8');

test('ส่งเฉพาะ stage — ห้ามส่ง FC% หรือทั้งฟอร์มจากตาราง', () => {
  assert.match(src, /JSON\.stringify\(\{ stage: value \}\)/);
  assert.doesNotMatch(src, /probability:/, 'FC% เป็นของ server (dealProbability.js)');
});

/* ⭐ ปิดดีลต้องกรอกเหตุผล (dealLifecycle: reason "required") — ถ้า Lost อยู่ในดรอปดาวน์นี้
   จะปิดดีลได้โดยไม่มีเหตุผลเลย = UI หลวมกว่ากติกาของตัวเอง
   ส่วน Won ทางเดียวคือรับใบเสนอราคา (API ตอบ 400 ถ้าส่ง stage:'won' มาตรง ๆ) */
test('ดรอปดาวน์ไม่มี Won / Lost / in_project', () => {
  for (const stage of ['won', 'lost', 'in_project']) {
    assert.ok(!ROW_EDITABLE_STAGES.includes(stage), `${stage} ต้องไม่อยู่ในตัวเลือกของแถว`);
  }
});

test('ขั้นที่เหลือมีครบ — ไม่ได้พิมพ์รายชื่อทิ้งไว้จนตกรุ่น', () => {
  const expected = DEAL_STAGES.filter((stage) => !['won', 'lost', 'in_project'].includes(stage));
  assert.deepEqual(ROW_EDITABLE_STAGES, expected);
  assert.ok(ROW_EDITABLE_STAGES.includes('quotation'), 'ขั้นที่ดัน FC เป็น 50% ต้องเลือกได้');
});

test('มีปุ่มบันทึก ไม่เซฟทันทีที่เลือก', () => {
  assert.match(src, /onClick=\{save\}/);
  assert.doesNotMatch(src, /onChange=\{\(e\) => \{[\s\S]*save\(\)/, 'ห้าม auto-save');
});

/* ดีลที่ปิดแล้วไม่มีขั้นถัดไปให้เลือก และ API ก็ปฏิเสธ — ต้องกลับเป็นป้ายเฉย ๆ
   (ไม่ใช่ปุ่มที่กดแล้วเจอ error) */
test('ดีลที่ปิดแล้ว / คนที่แก้ไม่ได้ เห็นเป็นป้ายเหมือนเดิม', () => {
  assert.match(src, /if \(!canEdit \|\| isClosedStage\(deal\.stage\)\) return badge;/);
  assert.match(page, /canEdit=\{!!deal\.canEdit\}/, 'สิทธิ์มาจาก API ต่อแถว ไม่คำนวณเอง');
});

/* แถวทั้งแถวเป็นลิงก์ไปหน้ารายละเอียด — ถ้าไม่กันคลิกไว้ กดดรอปดาวน์แล้วเด้งออกจากหน้า */
test('คลิกในช่องนี้ต้องไม่พาออกจากหน้า (แถวเป็นลิงก์)', () => {
  assert.match(page, /<td onClick=\{\(event\) => event\.stopPropagation\(\)\}>\s*<StageCell/);
});

test('บันทึกแล้วโหลดรายการใหม่ — FC% ในแถวเดียวกันขยับตามด้วย', () => {
  assert.match(page, /<StageCell[\s\S]*?onSaved=\{load\}/);
});
