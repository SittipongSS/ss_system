import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, 'ReadableText.js'), 'utf8');

/* ── ตาข่ายรับของ ReadableText — ห้ามหายไปเงียบ ๆ ────────────────────────────
   บล็อกนี้วัดว่าข้อความล้นไหม แล้ววาด **ปุ่ม** ตามคำตอบ · ปุ่มนั้นอยู่ใน layout
   เดียวกับที่ตัวมันวัด ⇒ กฎ CSS ข้อไหนก็ตามที่มองเห็นปุ่มแล้วเปลี่ยนความกว้างให้
   จะปิดวงทันที และภาพจะสั่นทุกเฟรม (ของจริง 2026-08-24: `td:has(… button …)`
   ของตารางลิสต์ — เหตุแก้ไปแล้วที่ Table.module.css)

   ⚠️ ใช้อยู่ 102 จุดทั้งระบบ · ตัวตัดวงคือของที่ทำให้กฎ CSS ข้อถัดไปที่บังเอิญ
   มองเห็นปุ่ม ไม่กลายเป็นจอสั่นอีกรอบโดยไม่มีใครรู้ว่ามาจากไหน */

test('มีเพดานจำนวนการสลับ + หน้าต่างเวลา', () => {
  assert.match(source, /const FLIP_LIMIT = \d+;/, 'ต้องมีเพดานจำนวนการสลับ');
  assert.match(source, /const FLIP_WINDOW_MS = \d+;/, 'ต้องนับเป็นช่วงเวลา ไม่ใช่นับสะสม');
});

test('ครบเพดานแล้วต้องหยุดเฝ้า ไม่ใช่วัดต่อไปเรื่อย ๆ', () => {
  assert.match(
    source,
    /flips\.length >= FLIP_LIMIT[\s\S]{0,200}observer\?\.disconnect\(\)/,
    'ถึงเพดานแล้วต้อง disconnect ตัวเฝ้า ไม่งั้นวงยังหมุนต่อ',
  );
});

test('ค้างที่ "มีปุ่ม" — ปุ่มที่หายไปคือข้อความที่เปิดอ่านไม่ได้อีกเลย', () => {
  assert.match(
    source,
    /observer\?\.disconnect\(\)[\s\S]{0,300}setCanExpand\(true\)/,
    'ตอนตัดวงต้องค้างที่ true; ค้างที่ false = ผู้ใช้เปิดอ่านข้อความเต็มไม่ได้',
  );
});

test('นับเฉพาะตอนคำตอบ "พลิก" ไม่ใช่ทุกครั้งที่วัด', () => {
  assert.match(
    source,
    /if \(last !== null && next !== last\)/,
    'วัดซ้ำได้คำตอบเดิมไม่ใช่การวน — นับรวมด้วยจะไปตัดวงของหน้าที่ปกติดี',
  );
});
