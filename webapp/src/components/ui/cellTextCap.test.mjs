import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tableCss = readFileSync(join(HERE, 'Table.module.css'), 'utf8');
const globals = readFileSync(join(HERE, '..', '..', 'app', 'globals.css'), 'utf8');

/* ── เพดานความกว้างช่องข้อความในตาราง (#1386 · โทเคน --cell-text-max) ────────
   กติกา: เพดานเป็นของ **ช่องข้อความในตารางลิสต์** เท่านั้น
   🪤 ผู้ใช้ส่งภาพมา 2026-08-24: การ์ดรายการสินค้าของใบเสนอราคา (cells="stacked")
   ถูกบีบเหลือ 220px แล้ว overflow:hidden ตัดดรอปดาวน์ "ส่วนลดรายการ" ขาดกลางตัว
   ⇒ เทสต์นี้ล็อกข้อยกเว้นสองข้อไว้ ไม่ให้ใครถอดออกโดยไม่รู้ว่ามันแก้อะไร */

test('เพดาน 220px ยังอยู่กับช่องข้อความของตารางลิสต์', () => {
  assert.match(globals, /--cell-text-max:\s*220px/, 'โทเคนเพดานต้องยังอยู่');
  assert.match(
    tableCss,
    /\.scroll\[data-family\] :global\(td\) \{\s*\n\s*max-width: var\(--cell-text-max\);/,
    'ตารางกลางยังต้องมีเพดานให้ช่องข้อความ',
  );
});

test('เซลล์ที่กลายเป็นการ์ดในตารางแก้ไขได้ (editable + stacked) ไม่โดนเพดาน', () => {
  assert.match(
    tableCss,
    /\.scroll\[data-family="editable"\]\[data-cells="stacked"\] :global\(td\)[^{]*\{[^}]*max-width: none/s,
    'การ์ดเต็มความกว้างที่ข้างในเป็นคอนโทรล — เพดาน 220px บีบจนคอนโทรลถูกตัด',
  );
});

/* 🐞 วัดจริง 2026-08-25: ข้อยกเว้นข้างบนเคยเขียนเป็น `[data-cells="stacked"]` เปล่า ๆ
   ⇒ ถอดเพดานให้ **ตารางลิสต์** ที่ใช้ stacked ด้วย (คิวคำร้อง · ทะเบียนกลิ่น ·
   ใบสั่งขาย · การเงิน · ทะเบียนชำระ) · คิวคำร้องกว้าง 2136px ในกรอบ 1338 ทันที
   ซึ่งล้ม #1389 ที่เพิ่งทำให้ตารางนั้นลงกรอบพอดี */
test('ตารางลิสต์ที่ใช้ stacked ยังต้องได้เพดาน', () => {
  assert.doesNotMatch(
    tableCss,
    /^\.scroll\[data-cells="stacked"\] :global\(td\),/m,
    'ข้อยกเว้นต้องผูกกับ family="editable" ไม่ใช่ stacked ทั้งชุด',
  );
});

test('เซลล์ที่ข้างในเป็นคอนโทรล ไม่โดนเพดาน (ตัดด้วยจุดไข่ปลาไม่ได้)', () => {
  assert.match(
    tableCss,
    /td:has\(input, select, textarea, button:not\(\.readable-text-toggle\), \[contenteditable="true"\]\)[^{]*\{[^}]*max-width: none/s,
    'ช่องกรอก/ปุ่มที่ถูกตัดขาดครึ่งตัวคือของที่กดใช้งานไม่ได้จริง',
  );
});

/* 🐞 ผู้ใช้ส่งวิดีโอมา 2026-08-24: ตารางหน้า "งานของฉัน" สั่นทั้งตารางไม่หยุด
   ปุ่ม "อ่านทั้งหมด" ของ ReadableText โผล่ตามผลการวัดว่าข้อความล้นไหม ⇒ พอกฎข้างบน
   มองเห็นปุ่มแล้วถอดเพดานให้ ช่องกว้างขึ้น ข้อความเลิกล้น ปุ่มถูกถอด เพดานกลับมา
   วนสลับทุกเฟรม · วัดจริงในเบราว์เซอร์: กวาดความกว้างกล่อง 620–1400px เจอ 104 ค่า
   ที่ติดวง หลังยกเว้นปุ่มนี้เหลือ 0 */
test('ปุ่ม "อ่านทั้งหมด" ไม่นับเป็นคอนโทรล — ไม่งั้นเพดานกับปุ่มป้อนกันเป็นวง', () => {
  assert.match(
    tableCss,
    /button:not\(\.readable-text-toggle\)/,
    'ปุ่มที่ "มีอยู่ก็ต่อเมื่อช่องแคบ" ห้ามเป็นเงื่อนไขที่ทำให้ช่องกว้าง',
  );
});

test('ข้อยกเว้นต้องอยู่หลังกฎเพดาน — specificity เท่ากัน ลำดับในไฟล์เป็นตัวตัดสิน', () => {
  const capAt = tableCss.indexOf('max-width: var(--cell-text-max)');
  const stackedAt = tableCss.indexOf('.scroll[data-family="editable"][data-cells="stacked"] :global(td),');
  assert.ok(capAt > 0 && stackedAt > 0);
  assert.ok(stackedAt > capAt, 'ย้ายข้อยกเว้นขึ้นไปก่อนกฎเพดาน = กลับไปพังเหมือนเดิมแบบเงียบ ๆ');
});
