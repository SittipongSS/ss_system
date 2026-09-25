// ── ช่องวันที่กลาง (`DateInput`) — โหมดวันในสัปดาห์ (รีวิว UAT 24/09 · โมดัลจัดคิวแบบ A) ─────────
//
// ⭐ pain 10 ของแบบ A: ช่องวันโชว์ "01/10/2026" แต่ทุกที่อื่นพูด "พฤ. 1 ต.ค." ⇒ คนจัดคิวต้องแปลงเลขเป็นวันเอง
//    ⇒ `weekday` (opt-in) โชว์ "พฤ. 1 ต.ค. 2026" ตอนไม่ได้พิมพ์ · โฟกัสแล้วเป็นตัวเลขให้พิมพ์ตามเดิม
// ⚠️ ข้อความตัดสินที่ `dateFieldText` (lib/format.js · เทสต์ค่าจริงที่ format.test.mjs) — ไฟล์นี้ล็อกว่า
//    ช่องเรียกตัวนั้นทุกจังหวะ และไม่ส่ง = หน้าตาเดิมทุกหน้า (repo ไม่มีตัวเรนเดอร์ React ในเทสต์)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('./DateInput.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('weekday เป็น opt-in (ค่าตั้งต้น false) — ทุกหน้าเดิมยังเห็นตัวเลข', () => {
  assert.match(code, /era = "CE", weekday = false, invalid = false \}\)/);
  /* `invalid` (ฟอร์มคีย์ใบย้อนหลัง 25/09) ก็ opt-in — ขอบแดงตกที่ช่องกรอกจริง ไม่ใช่กล่องห่อ */
  assert.match(code, /className=\{`premium-input date-input-text\$\{invalid \? " is-invalid" : ""\}`\}/);
  assert.match(code, /import \{ BUDDHIST_YEAR_OFFSET, dateFieldText, displayDateToIso \} from "@\/lib\/format";/);
});

test('ทุกจังหวะที่ตั้งข้อความในช่องถาม dateFieldText — ไม่ได้พิมพ์ = วันไทย · โฟกัส = ตัวเลข', () => {
  // ไม่มี isoDateToDisplay ตรง ๆ เหลือในช่อง (จุดที่ลืมเปลี่ยน = ช่องกระพริบกลับเป็นตัวเลข)
  assert.doesNotMatch(code, /isoDateToDisplay\(/);
  assert.match(code, /const shown = \(iso, typing = false\) => dateFieldText\(iso, \{ era, weekday, typing \}\);/);
  assert.match(code, /useState\(\(\) => shown\(value\)\)/);
  assert.match(code, /if \(!focused\) setText\(dateFieldText\(value, \{ era, weekday \}\)\);\s*\}, \[value, focused, era, weekday\]\);/);
  // โฟกัส ⇒ ตัวเลขของค่าปัจจุบัน (คนพิมพ์ต่อจากของเดิมได้)
  assert.match(code, /onFocus=\{\(\) => \{\s*setFocused\(true\);\s*setText\(shown\(value, true\)\);\s*\}\}/);
  // ออกจากช่อง ⇒ กลับเป็นวันไทยของค่าที่พิมพ์ (หรือค่าเดิมเมื่อพิมพ์ผิด)
  assert.match(code, /setText\(iso \? shown\(iso\) : shown\(value\)\);/);
  // เลือกจากปฏิทิน (ปุ่มเปิดปฏิทินทำให้ช่องหลุดโฟกัสแล้ว) ⇒ วันไทย
  assert.match(code, /setText\(shown\(iso\)\);\s*setOpen\(false\);/);
});
