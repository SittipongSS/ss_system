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

test('เซลล์ที่กลายเป็นการ์ด (stacked) ไม่โดนเพดาน', () => {
  assert.match(
    tableCss,
    /\.scroll\[data-cells="stacked"\] :global\(td\)[^{]*\{[^}]*max-width: none/s,
    'stacked = การ์ดเต็มความกว้าง เพดาน 220px บีบทั้งการ์ดจนคอนโทรลถูกตัด',
  );
});

test('เซลล์ที่ข้างในเป็นคอนโทรล ไม่โดนเพดาน (ตัดด้วยจุดไข่ปลาไม่ได้)', () => {
  assert.match(
    tableCss,
    /td:has\(input, select, textarea, button, \[contenteditable="true"\]\)[^{]*\{[^}]*max-width: none/s,
    'ช่องกรอก/ปุ่มที่ถูกตัดขาดครึ่งตัวคือของที่กดใช้งานไม่ได้จริง',
  );
});

test('ข้อยกเว้นต้องอยู่หลังกฎเพดาน — specificity เท่ากัน ลำดับในไฟล์เป็นตัวตัดสิน', () => {
  const capAt = tableCss.indexOf('max-width: var(--cell-text-max)');
  const stackedAt = tableCss.indexOf('.scroll[data-cells="stacked"] :global(td),');
  assert.ok(capAt > 0 && stackedAt > 0);
  assert.ok(stackedAt > capAt, 'ย้ายข้อยกเว้นขึ้นไปก่อนกฎเพดาน = กลับไปพังเหมือนเดิมแบบเงียบ ๆ');
});
