import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── หน้าสร้างใบเสนอราคา: ไม่เลือกที่อยู่ให้ล่วงหน้า (มติผู้ใช้ 2026-08-27) ──
   เดิมตั้งต้นเป็น "ที่อยู่หลัก" ให้เลย ⇒ คนทำใบเห็นช่องที่กรอกไว้แล้วก็ผ่านไปโดยไม่ได้อ่าน
   ⇒ ใบออกไปที่อยู่ผิดโดยไม่มีใครรู้ตัว (สาขา/คลังคนละที่กัน) ซึ่งขึ้นบนใบกำกับภาษีด้วย

   ⚠️ ด่านอยู่ฝั่งจอเท่านั้นโดยตั้งใจ — ฝั่ง server ยังถอยไปที่อยู่หลักเมื่อไม่ส่ง id มา
   เพราะสายที่ไม่มีหน้าจอให้เลือก (ยืนยัน PO สหมิตร → ออก QT) ต้องออกใบได้ต่อ */
const src = readFileSync(new URL('../../app/sales-planning/quotations/new/page.js', import.meta.url), 'utf8');

test('โหลดลูกค้าแล้วทุกช่องกลับไป "ยังไม่เลือก" — ไม่ยกเว้นแม้มีตัวเลือกเดียว', () => {
  assert.match(src, /setContactIndex\(""\);\s*\n\s*setBillingAddressId\(""\);\s*\n\s*setShippingAddressId\(""\);/);
  // ⚠️ ห้ามกลับไปตั้งต้นจาก pickDocumentAddresses ตอนโหลดลูกค้า (นั่นคือ "ที่อยู่หลัก")
  assert.doesNotMatch(src, /setBillingAddressId\(picked\./);
  // ผู้ติดต่อเริ่มที่ "" ไม่ใช่ 0 — 0 คือผู้ติดต่อคนแรกที่ใช้ได้จริง แยกจาก "ยังไม่เลือก" ไม่ออก
  assert.match(src, /useState\(""\);/);
  assert.doesNotMatch(src, /const \[contactIndex, setContactIndex\] = useState\(0\)/);
});

test('ทั้งสามช่องมีตัวเลือกว่างให้เห็นว่ายังไม่ได้เลือก', () => {
  for (const label of ['เลือกที่อยู่ออกบิล', 'เลือกที่อยู่จัดส่ง', 'เลือกผู้ติดต่อ']) {
    assert.match(src, new RegExp(`<option value="">— ${label} —</option>`), label);
  }
});

test('กดสร้างโดยยังไม่เลือกครบ = ถูกบล็อกพร้อมบอกว่าขาดช่องไหน', () => {
  assert.match(src, /const unpicked = \[/);
  for (const field of ['ที่อยู่ออกบิล', 'ที่อยู่จัดส่ง', 'ผู้ติดต่อ']) {
    assert.ok(src.includes(`? "${field}" : null`), `ด่านต้องครอบ ${field}`);
  }
  // ด่านต้องอยู่ **ก่อน** ยิง POST ไม่ใช่หลัง
  const guard = src.indexOf('const unpicked = [');
  const post = src.indexOf('method: "POST"', guard);
  assert.ok(guard > 0 && post > guard, 'ด่านต้องมาก่อนการยิง POST');
});

test('ช่องสาขาไม่โชว์ค่าของที่อยู่ที่ยังไม่ได้เลือก', () => {
  // pickDocumentAddresses ถอยไปที่อยู่หลักเสมอ ⇒ ถ้าไม่กั้น ช่องสาขาจะโชว์เลขของ
  // ที่อยู่ที่คนทำใบยังไม่ได้เลือก ซึ่งคือการเดาให้แบบเดิมในรูปอื่น
  assert.match(src, /billingAddressId \? branchValue\(pickedAddresses\.snapshot\.branchCode\) : naText\(""\)/);
});

test('ยังไม่เลือกผู้ติดต่อ = ไม่ส่ง contactIndex ไป server', () => {
  // server มีค่าตั้งต้นของตัวเองสำหรับสายที่ไม่มีหน้าจอให้เลือก (ยืนยัน PO สหมิตร)
  assert.match(src, /\.\.\.\(contactIndex === "" \? \{\} : \{ contactIndex \}\)/);
});
