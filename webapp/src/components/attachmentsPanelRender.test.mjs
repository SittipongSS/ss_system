import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/* ── แผงไฟล์แนบห้ามประกาศ component ข้างในฟังก์ชันของตัวเอง ────────────────
   🐞 2026-09-22 ช่องคำบรรยายภาพของใบสเปคสินค้า (FM-SA-04) พิมพ์ได้ทีละตัวแล้วเคอร์เซอร์หลุด ·
   `PhotoRows` เคยเป็น `const PhotoRows = (...) => …` ข้างใน `AttachmentsPanel` แล้วถูกวาดเป็น
   `<PhotoRows />` ⇒ ทุกการวาดใหม่ได้ "ชนิด component ใหม่" React ทิ้งทั้งกิ่งแล้วสร้างใหม่
   ⇒ ช่องกรอกที่ผู้เรียกฝากมาผ่าน `photoRows` หลุดโฟกัสทุกตัวอักษร
   ด่านนี้: ของที่ประกาศข้างในต้องเป็นฟังก์ชันวาดชื่อตัวเล็ก (`renderX`) และเรียกเป็นฟังก์ชัน */
const FILE = path.join(process.cwd(), 'src/components/AttachmentsPanel.js');

test('AttachmentsPanel ไม่ประกาศ component ชื่อตัวใหญ่ข้างในตัวเอง (ประกาศแล้ว = remount ทุกการวาด)', () => {
  const source = fs.readFileSync(FILE, 'utf8');
  // ⚠️ นับเฉพาะบรรทัดที่เยื้อง — ระดับไฟล์ (ไม่เยื้อง) ประกาศ component ได้ปกติ
  const nested = [...source.matchAll(/^[ \t]+const ([A-Z][A-Za-z0-9]*)\s*=\s*\(\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(nested, [], `component ที่ประกาศข้างใน AttachmentsPanel: ${nested.join(', ')}`);
});

test('ฟังก์ชันวาดของแผงไม่ถูกใช้เป็น JSX tag', () => {
  const source = fs.readFileSync(FILE, 'utf8');
  const asTag = [...source.matchAll(/<(render[A-Z][A-Za-z0-9]*|PhotoRows|PhotoTile|PhotoGrid|FileRow|IssuedDateRow)\b/g)].map((m) => m[1]);
  assert.deepEqual(asTag, [], `ใช้เป็น tag: ${asTag.join(', ')}`);
});
