// ── ด่านซอร์สของหน้าแรก (ADR 0016) ─────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const PAGE = read('./page.js');
const SHEET = read('../../components/home/SystemMenuSheet.js');
const WRAPPER = read('../../components/LayoutWrapper.js');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('⭐ หน้าแรกอยู่ในเปลือก — ไม่มีสาขาที่คืน children เปล่า', () => {
  assert.doesNotMatch(codeOnly(WRAPPER), /'\/home'/, 'LayoutWrapper ต้องไม่รู้จัก /home เป็นกรณีพิเศษอีก');
  assert.match(codeOnly(WRAPPER), /<AppLayout>\{children\}<\/AppLayout>/);
});

test('⭐ หน้าแรกเลิกทำงานที่เปลือกทำอยู่แล้ว', () => {
  const both = codeOnly(PAGE) + codeOnly(SHEET);
  for (const banned of [
    'useNavCounts(',          // ตัวดึงตัวเลขรอบที่สอง
    'createClient',           // อ่าน session เอง
    'devBypassUser',
    'ChangePasswordModal',
    '<main',                  // เปลือกมี <main> อยู่แล้ว
    'recentSystemForUser',
    'localStorage',
    'history.pushState',
    'location.hash =',
    '99+',                    // หน้านี้เลขเต็มหลักเสมอ
  ]) {
    assert.ok(!both.includes(banned), `หน้าแรกต้องไม่มี ${banned}`);
  }
});

test('หน้าแรกอ่านทะเบียนเมนู ตัวเลข และขอบเขต จากของกลางทั้งหมด', () => {
  assert.match(SHEET, /from '@\/config\/menuRegistry'/);
  assert.match(SHEET, /useNavCountsState/);
  assert.match(SHEET, /from '@\/lib\/nav\/countScope'/);
  assert.match(PAGE, /from '@\/lib\/roleContext'/);
});

/* 🔴 ข้อห้ามของ ADR 0016 — ยอดของทั้งฝ่าย/ทั้งบริษัทห้ามอ่านว่า "รอคุณ"
   (หน้าอื่นยังมีคำนี้อยู่ใน aria-label ของเมนู · เป็นงานตามหลัง ไม่ใช่ของใบนี้) */
test('⭐ ไม่มีคำว่า "รอคุณ" บนหน้าแรกทั้งบนจอและใน aria-label', () => {
  // ดูเฉพาะโค้ด — คอมเมนต์ที่อธิบายว่าทำไมห้ามใช้คำนี้ ต้องพูดคำนั้นได้
  assert.ok(!codeOnly(SHEET).includes('รอคุณ'));
  assert.ok(!codeOnly(PAGE).includes('รอคุณ'));
});

test('ตัวแปรตำแหน่งของกริดผ่าน inline style ได้ไม่เกิน 5 จุด', () => {
  // ตำแหน่งมาจากข้อมูล ⇒ ต้องส่งผ่าน style · แต่ต้องไม่บานปลายเป็นสไตล์ล้วน
  const points = SHEET.match(/style=\{/g) || [];
  assert.ok(points.length <= 5, `inline style ${points.length} จุด — เกินที่ตกลงไว้`);
});

test('ความสูงแถวคงที่ทุกสถานะ — ช่องป้ายถูกจองตั้งแต่เรนเดอร์แรก', () => {
  const css = read('../../components/home/SystemMenuSheet.module.css');
  assert.match(css, /\.row \{[^}]*height: var\(--row\)/, 'แถวสูงตายตัวหนึ่งแถว');
  assert.match(css, /\.row\.lane \.slot \{ min-width:/, 'แถวที่ได้ตัวเลขต้องจองช่องไว้ก่อน');
  assert.match(css, /grid-auto-rows: var\(--row\)/, 'กริดเดินทีละแถว ⇒ ทุกคอลัมน์ตรงแนวกัน');
});

test('สารบัญมือถือไม่เขียนประวัติเบราว์เซอร์ — ปุ่มย้อนกลับครั้งเดียวต้องออกจากหน้าแรกได้', () => {
  assert.match(SHEET, /event\.preventDefault\(\)/);
  assert.match(SHEET, /scrollIntoView\(/);
  assert.ok(!SHEET.includes('pushState'));
});
