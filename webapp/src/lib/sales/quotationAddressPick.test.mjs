import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── หน้าสร้างใบเสนอราคา: ไม่เลือกที่อยู่ให้ล่วงหน้า (มติผู้ใช้ 2026-08-27) ──
   เดิมตั้งต้นเป็น "ที่อยู่หลัก" ให้เลย ⇒ คนทำใบเห็นช่องที่กรอกไว้แล้วก็ผ่านไปโดยไม่ได้อ่าน
   ⇒ ใบออกไปที่อยู่ผิดโดยไม่มีใครรู้ตัว (สาขา/คลังคนละที่กัน) ซึ่งขึ้นบนใบกำกับภาษีด้วย

   ⚠️ ด่านอยู่ฝั่งจอเท่านั้นโดยตั้งใจ — ฝั่ง server ยังถอยไปที่อยู่หลักเมื่อไม่ส่ง id มา
   เพราะสายที่ไม่มีหน้าจอให้เลือก (ยืนยัน PO สหมิตร → ออก QT) ต้องออกใบได้ต่อ */
const src = readFileSync(new URL('../../app/sales-planning/quotations/new/page.js', import.meta.url), 'utf8');
/* ⭐ 2026-08-27: บล็อก "ข้อมูลลูกค้าในเอกสาร" ถูกยกออกมาเป็น component เดียวให้สองหน้า
   ใช้ร่วมกันตามกฎใน AGENTS.md — JSX ของช่องต่าง ๆ จึงย้ายมาอยู่ที่นี่ */
const fieldsSrc = readFileSync(new URL('../../components/salesPlanning/QuotationCustomerFields.js', import.meta.url), 'utf8');

test('โหลดลูกค้าแล้วทุกช่องกลับไป "ยังไม่เลือก" — ไม่ยกเว้นแม้มีตัวเลือกเดียว', () => {
  assert.match(src, /setContactIndex\(""\);\s*\n\s*setBillingAddressId\(""\);\s*\n\s*setShippingAddressId\(""\);/);
  // ⚠️ ห้ามกลับไปตั้งต้นจาก pickDocumentAddresses ตอนโหลดลูกค้า (นั่นคือ "ที่อยู่หลัก")
  assert.doesNotMatch(src, /setBillingAddressId\(picked\./);
  // ผู้ติดต่อเริ่มที่ "" ไม่ใช่ 0 — 0 คือผู้ติดต่อคนแรกที่ใช้ได้จริง แยกจาก "ยังไม่เลือก" ไม่ออก
  assert.match(src, /useState\(""\);/);
  assert.doesNotMatch(src, /const \[contactIndex, setContactIndex\] = useState\(0\)/);
});

test('หน้าสร้าง: ทั้งสามช่องมีตัวเลือกว่างให้เห็นว่ายังไม่ได้เลือก', () => {
  // โหมด create เท่านั้นที่ตัวเลือกว่างแปลว่า "ยังไม่เลือก" — โหมด edit แปลว่า "คงเดิม"
  assert.match(fieldsSrc, /`— เลือก\$\{what\} —`/);
  assert.match(fieldsSrc, /"— เลือกผู้ติดต่อ —"/);
  assert.match(fieldsSrc, /const blankOption = \(what, current\) => \(isEdit \? keepLabel\(current\) : /);
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
  assert.match(fieldsSrc, /\(billingAddressId \|\| isEdit\) \? branchValue\(picked\?\.snapshot\?\.branchCode\) : ""/);
});

test('ยังไม่เลือกผู้ติดต่อ = ไม่ส่ง contactIndex ไป server', () => {
  // server มีค่าตั้งต้นของตัวเองสำหรับสายที่ไม่มีหน้าจอให้เลือก (ยืนยัน PO สหมิตร)
  assert.match(src, /\.\.\.\(contactIndex === "" \? \{\} : \{ contactIndex \}\)/);
});

/* ── ผู้ติดต่อบนใบต้องแก้ได้ระหว่างยังเป็นร่าง (มติผู้ใช้ 2026-08-27) ────────
   เดิมเลือกได้เฉพาะตอน **สร้าง** ใบ พอกลายเป็นร่างแล้วแก้ไม่ได้เลย ทั้งที่ที่อยู่ใน
   บล็อกเดียวกันแก้ได้ — คนทำใบต้องลบร่างทิ้งแล้วสร้างใหม่เพียงเพื่อเปลี่ยนผู้ติดต่อ */
const detailSrc = readFileSync(new URL('../../app/sales-planning/quotations/[id]/page.js', import.meta.url), 'utf8');
const routeSrc = readFileSync(new URL('../../app/api/sales-planning/quotations/[id]/route.js', import.meta.url), 'utf8');

test('ร่างที่แก้ได้มีช่องเลือกผู้ติดต่อ · ใบที่ปิดแล้วเป็นอ่านอย่างเดียว', () => {
  assert.match(fieldsSrc, /aria-label="เลือกผู้ติดต่อ"/);
  assert.match(fieldsSrc, /if \(isEdit && !editable\) \{/);
});

/* ── กฎ AGENTS.md: ฟอร์มสร้างกับฟอร์มแก้ต้องเป็น component เดียวกัน ────────
   บล็อกนี้เคยเป็น JSX คนละชุด แล้วเพี้ยนกันจริงภายในวันเดียว (ตัวเลือกว่าง · ด่าน
   บังคับเลือก · branchValue vs branchLabel · แม้แต่ชื่อคลาส CSS) */
test('ทั้งสองหน้าเรียก component ตัวเดียวกัน ไม่มีใครวาดกริดเอง', () => {
  for (const [name, page] of [['หน้าสร้าง', src], ['หน้าแก้', detailSrc]]) {
    assert.match(page, /<QuotationCustomerFields/, `${name} ต้องเรียก component กลาง`);
    assert.doesNotMatch(page, /styles\.customerGrid/, `${name} ห้ามวาดกริดเอง`);
    assert.doesNotMatch(page, /aria-label="เลือกที่อยู่ออกบิล"/, `${name} ห้ามวาดช่องเอง`);
  }
  assert.match(src, /mode="create"/);
  assert.match(detailSrc, /mode="edit"/);
});

test('โหมดอ่านอย่างเดียวต้องวาดจากค่าที่ตรึงไว้ ห้ามอ่านทะเบียนสด', () => {
  const readOnly = fieldsSrc.slice(fieldsSrc.indexOf('if (isEdit && !editable)'), fieldsSrc.indexOf('const keepLabel'));
  assert.ok(readOnly.length > 100, 'หาบล็อกอ่านอย่างเดียวไม่เจอ');
  // ใบที่ปิดแล้วคือหลักฐานการค้า — ทะเบียนอาจถูกแก้ไปหลังออกใบ
  for (const live of ['customerAddresses', 'billingOptions', 'shippingOptions', 'contacts', 'picked']) {
    assert.ok(!readOnly.includes(live), `โหมดอ่านอย่างเดียวห้ามแตะ ${live}`);
  }
  assert.match(readOnly, /snapshot\?\.billingAddress/);
  assert.match(readOnly, /branchValue\(snapshot\?\.branchCode\)/);
});

test('ยังไม่แตะช่องผู้ติดต่อ = ไม่ส่ง contactIndex ⇒ ค่าบนใบไม่ขยับ', () => {
  assert.match(detailSrc, /\.\.\.\(form\.contactIndex === "" \? \{\} : \{ contactIndex: form\.contactIndex \}\)/);
  // ตัวเลือกแรกคือ "คงเดิม" ไม่ใช่เด้งไปผู้ติดต่อคนแรกของทะเบียน — อยู่ใน component แล้ว
  assert.match(fieldsSrc, /\(คงเดิม\)/);
  assert.match(fieldsSrc, /const keepLabel = \(current\) =>/);
});

test('PATCH รับ contactIndex แล้วอ่านชื่อ/เบอร์สดจากทะเบียน ไม่เชื่อ client', () => {
  assert.match(routeSrc, /const contactPicked = 'contactIndex' in body;/);
  // ต้องเขียนจาก contact ที่อ่านมาจากตาราง customers เท่านั้น
  assert.match(routeSrc, /patch\.contactName = contact\.name \|\| null;/);
  assert.match(routeSrc, /patch\.contactPhone = contact\.phone \|\| null;/);
  // ⚠️ ห้ามรับชื่อ/เบอร์ที่ client ส่งมาตรง ๆ
  assert.doesNotMatch(routeSrc, /patch\.contactName = body\./);
  assert.doesNotMatch(routeSrc, /patch\.contactPhone = body\./);
  // index นอกลิสต์ต้องถูกปฏิเสธ ไม่ใช่เขียน undefined ลงใบ
  assert.match(routeSrc, /ผู้ติดต่อที่เลือกไม่อยู่ในทะเบียนลูกค้ารายนี้/);
});
