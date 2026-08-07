// ── ขั้นราคาเลือกชนิดวัสดุตามสายที่เดินมา (Q38 ก · 2026-08-07) ────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/app/api/sa/requests/[id]/items/[itemId]/price/route.js', 'utf8');

test('🐞 แถวพัฒนาสูตรต้องใส่ราคาได้ — ไม่ใช่ค้างที่ awaiting_price ถาวร', () => {
  // เดิมบังคับ `producedScentId` อย่างเดียว ⇒ แถวที่ผูก `producedFormulaId`
  // (พัฒนาสูตร) ได้ 400 ตลอดกาล ⇒ ลูกค้าคอนเฟิร์มแล้วปิดใบไม่ได้
  assert.ok(SRC.includes('row.producedFormulaId'), 'ต้องรู้จักแถวที่ผูกสูตร');
  assert.ok(SRC.includes("kind: 'RM_FB'"), 'สูตร = เนื้อสาร FB');
  assert.ok(SRC.includes("kind: 'RM_F'"), 'กลิ่น = หัวน้ำหอม F');
});

test('ประทับตัวตนกลับทะเบียนคนละคอลัมน์ตามชนิด', () => {
  // ⚠️ `material_prices.formulaId` มีมาตั้งแต่ mig 0171 แต่ไม่เคยมีใครเขียนลงไป
  assert.ok(SRC.includes("stampColumn: 'formulaId'"));
  assert.ok(SRC.includes("stampColumn: 'scentId'"));
});

test('🔴 ห้ามเหลือตัวแปร `scent` ที่ไม่มีอยู่แล้วในข้อความ audit/เธรด', () => {
  // ⚠️ build กับ lint จับไม่ได้ — มันพังตอน **รันจริงหลังบันทึกราคาสำเร็จไปแล้ว**
  // ซึ่งเป็นจังหวะที่แย่ที่สุด (ราคาเข้าทะเบียนแล้วแต่ API ตอบ 500)
  assert.ok(!/\bscent\.(code|name)/.test(SRC), 'ต้องใช้ `source` ตัวเดียวทั้งสองสาย');
});
