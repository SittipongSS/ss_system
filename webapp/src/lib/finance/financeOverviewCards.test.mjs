// ── หน้าภาพรวมบัญชี (/finance): การ์ด "ใบรอปิด N ใบ" พาไปชุดที่นับเป๊ะทุกคนดู (ตรวจตัวเลข L18d · 26/10/2026) ─────────
// 🐞 เดิมการ์ดกด `router.push("/sa/sales-orders")` — คิวบนสุดของหน้านั้นเดินตามเปลือกของคนดู (มติ 2026-08-25):
//    ฝ่าย FN ได้ "รอบัญชีปิด" (ชุดเดียวกับเลข) แต่แอดมินที่เข้า /finance ได้ไม่มีเปลือก finance ⇒ ลงที่ "รอฉันอนุมัติ" = คนละชุด
// ⭐ ปลายทางใหม่คือแผง "ใบที่รอบัญชีปิด" ของหน้าเดียวกัน ซึ่งวาด `awaitingReview` ตัวเดียวกับเลขบนการ์ด
// ⚠️ ยามอ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) — พิสูจน์ว่าเลขกับแถวมาจากลิสต์ตัวเดียวกัน และการ์ดไม่พาออกไปหน้าอื่น
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end >= 0, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return text.slice(start, end);
}

const PAGE = code('app/finance/page.js');

test('การ์ด "ใบรอปิด" ไม่พาไป /sa/sales-orders แล้ว — เลื่อนลงแผงของหน้านี้', () => {
  const card = slice(PAGE, 'label="ใบรอปิด"', '/>');
  assert.match(card, /onClick=\{showAwaitingClose\}/);
  assert.doesNotMatch(card, /router\.push/, 'พาไปหน้ารายการ SO = คิวของหน้านั้นเดินตามเปลือกคนดู (แอดมินได้คนละชุด)');
  assert.doesNotMatch(PAGE, /router\.push\("\/sa\/sales-orders"\)/);
});

test('เลขบนการ์ด · ป้ายจำนวนของแผง · แถวในแผง มาจาก `awaitingReview` ตัวเดียวกัน · แผงมี id ที่การ์ดเลื่อนไปหา', () => {
  assert.match(PAGE, /const AWAITING_CLOSE_ID = "finance-awaiting-close";/);
  assert.match(slice(PAGE, 'label="ใบรอปิด"', '/>'), /value=\{`\$\{awaitingReview\.length\} ใบ`\}/);
  const panel = slice(PAGE, '<ListPanel', '</ListPanel>');
  assert.match(panel, /id=\{AWAITING_CLOSE_ID\}/);
  assert.match(panel, /title="ใบที่รอบัญชีปิด"/);
  assert.match(panel, /count=\{loading \|\| error \? null : `\$\{awaitingReview\.length\} ใบ`\}/);
  assert.match(panel, /\{awaitingReview\.map\(\(row\) => \(/);
  // แผงเดียวบนหน้า — ถ้ามีแผงที่สองที่ id ซ้ำ/ลิสต์อื่น ยามนี้ต้องแก้ตามรูปใหม่
  assert.equal((PAGE.match(/<ListPanel\b/g) || []).length, 1);
});

test('showAwaitingClose: หาแผงด้วย id · เลื่อนให้หัวแผงอยู่บน · ย้ายโฟกัสไปหัวแผง (คีย์บอร์ด/โปรแกรมอ่านจอรู้ว่าหน้าเลื่อนไปไหน)', () => {
  const fn = slice(PAGE, 'const showAwaitingClose = useCallback(', '}, []);');
  assert.match(fn, /document\.getElementById\(AWAITING_CLOSE_ID\)/);
  assert.match(fn, /scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(fn, /querySelector\("h2"\)/);
  assert.match(fn, /heading\.tabIndex = -1;/);
  assert.match(fn, /heading\.focus\(\{ preventScroll: true \}\)/);
});
