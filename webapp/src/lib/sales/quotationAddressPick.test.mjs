import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── หน้าสร้างใบเสนอราคา: ไม่เลือกที่อยู่ให้ล่วงหน้า (มติผู้ใช้ 2026-08-27) ──
   เดิมตั้งต้นเป็น "ที่อยู่หลัก" ให้เลย ⇒ คนทำใบเห็นช่องที่กรอกไว้แล้วก็ผ่านไปโดยไม่ได้อ่าน
   ⇒ ใบออกไปที่อยู่ผิดโดยไม่มีใครรู้ตัว (สาขา/คลังคนละที่กัน) ซึ่งขึ้นบนใบกำกับภาษีด้วย

   ⚠️ ด่านอยู่ฝั่งจอเท่านั้นโดยตั้งใจ — ฝั่ง server ยังถอยไปที่อยู่หลักเมื่อไม่ส่ง id มา
   เพราะสายที่ไม่มีหน้าจอให้เลือก (ยืนยัน PO สหมิตร → ออก QT) ต้องออกใบได้ต่อ */
const src = readFileSync(new URL('../../app/sales-planning/quotations/new/page.js', import.meta.url), 'utf8');

test('มีที่อยู่ให้เลือกมากกว่าหนึ่ง = ไม่เลือกให้ล่วงหน้า · มีอันเดียว = เลือกให้', () => {
  assert.match(src, /setBillingAddressId\(onlyBilling\.length === 1 \? onlyBilling\[0\]\.id : ""\)/);
  assert.match(src, /setShippingAddressId\(onlyShipping\.length === 1 \? onlyShipping\[0\]\.id : ""\)/);
  // ⚠️ ห้ามกลับไปตั้งต้นจาก pickDocumentAddresses ตอนโหลดลูกค้า (นั่นคือ "ที่อยู่หลัก")
  assert.doesNotMatch(src, /setBillingAddressId\(picked\./);
});

test('ดรอปดาวน์มีตัวเลือกว่างให้เห็นว่ายังไม่ได้เลือก', () => {
  assert.match(src, /<option value="">— เลือกที่อยู่ออกบิล —<\/option>/);
  // ที่อยู่จัดส่งว่างได้ — ความหมายเดิมคือ "ใช้ที่อยู่ออกบิล" เขียนให้เห็นตรง ๆ
  assert.match(src, /<option value="">— ใช้ที่อยู่ออกบิล —<\/option>/);
});

test('กดสร้างโดยยังไม่เลือกที่อยู่ออกบิล = ถูกบล็อกพร้อมเหตุผล', () => {
  assert.match(src, /if \(billingOptions\.length && !billingAddressId\) \{/);
  assert.match(src, /setError\("เลือกที่อยู่ออกบิลก่อน/);
  // ด่านต้องอยู่ **ก่อน** ยิง POST ไม่ใช่หลัง
  const guard = src.indexOf('billingOptions.length && !billingAddressId');
  const post = src.indexOf('method: "POST"', guard);
  assert.ok(guard > 0 && post > guard, 'ด่านต้องมาก่อนการยิง POST');
});
