// ── สัญญาของ DealPicker: อาร์กิวเมนต์ที่สองต้องเป็น "ดีลตัวจริง" ───────────
//
// 🐞 บั๊กที่เทสต์นี้กันไว้ (เจอ 2026-08-07 ตอนเดินฟอร์มเปิดคำร้องบนจอจริง):
// `DealPicker` เคยส่ง `onChange` ต่อให้ `TwoPanePicker` ตรง ๆ ซึ่งคืน
// `(value, item)` โดย `item` เป็น **ตัวบรรยายรายการของแผง** ไม่ใช่ดีล
// ⇒ ผู้เรียกที่อ่าน `deal.projectId` ได้ `undefined` เสมอ ⇒ เลือกดีลที่ผูก
// โครงการอยู่แล้วก็ยังขึ้นว่า "ดีลนี้ยังไม่ผูกโครงการ" ⇒ หัวข้อที่บังคับผูก
// โครงการเปิดคำร้องไม่ได้เลยสักใบ · หน้าใบเสนอราคาใหม่ได้ projectId ว่างด้วย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/pm/DealPicker.js', 'utf8');
// ตัดคอมเมนต์ทิ้งก่อนเทียบ — ข้อความที่เล่าว่าเคยผิดยังไงต้องไม่ทำเทสต์เขียวหรือแดงเอง
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('🔴 ห้ามส่ง onChange ต่อให้ TwoPanePicker ตรง ๆ', () => {
  assert.ok(
    !/onChange=\{onChange\}/.test(CODE),
    'ส่งตรงแปลว่าผู้เรียกจะได้ตัวบรรยายรายการของแผงแทนดีล',
  );
});

test('🔴 อาร์กิวเมนต์ที่สองต้องหาจากถังดีลจริง ไม่ใช่ของที่แผงส่งมา', () => {
  assert.match(CODE, /deals\.find\(\(\w+\) => \w+\.id === dealId\)/);
});

// ── ผู้เรียกที่พึ่งสัญญานี้ — ถ้าใครเลิกใช้ ให้ลบชื่อออกจากลิสต์ ไม่ใช่ลบเทสต์ ──
const CALLERS = [
  'src/components/requests/RequestForm.js',
  'src/app/sales-planning/quotations/new/page.js',
];

test('ผู้เรียกที่อ่าน projectId จากดีลยังเรียกผ่าน DealPicker อยู่', () => {
  for (const path of CALLERS) {
    const src = readFileSync(path, 'utf8');
    assert.match(src, /<DealPicker/, path);
    assert.match(src, /projectId/, path);
  }
});
