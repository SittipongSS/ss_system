// ── ลิสต์สินค้าของ picker ไม่ต้องพกต้นทุน/ร่องรอยอนุมัติ/ของหน้ารายละเอียด ──────
//
// วัด 2026-08-27 บน 341 แถว: 492 KB -> 318 KB (-35%) ต่อการโหลดหนึ่งครั้ง
// (ทุกจอที่มี dropdown สินค้าโหลดทั้งแคตตาล็อก ไม่ใช่หน้าละแถวสองแถว)
//
// ⭐ ช่องต้นทุนที่ตัดออก `redactProductMargin` ตัดทิ้งให้ role ส่วนใหญ่อยู่แล้ว —
// ดึงมาแล้วโยนทิ้งทุกครั้ง · ฝั่ง server ที่ต้องใช้จริง (soFiling · tax/reports ·
// PATCH ของ products) query ตาราง `products` เอง ไม่ได้กิน endpoint นี้
//
// 🪤 `?manage=1` = หน้าทะเบียนสินค้า ต้องได้ทั้งแถวเสมอ — จอนั้นแก้ของจริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const route = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'route.js'), 'utf8');
const start = route.indexOf('const PRODUCT_PICKER_COLUMNS');
const pickerList = route.slice(start, route.indexOf("].join(',')", start));

test('products: manage ได้ทั้งแถว · picker ได้ชุดที่ระบุไว้', () => {
  assert.match(route, /select\(manage \? '\*' : PRODUCT_PICKER_COLUMNS\)/,
    'หน้าทะเบียน (?manage=1) ต้องยังได้ทุกคอลัมน์');
});

test('products picker: ห้ามพกช่องต้นทุนที่ถูก redact อยู่แล้ว', () => {
  assert.ok(pickerList.length > 0, 'หา PRODUCT_PICKER_COLUMNS ไม่เจอ');
  for (const col of ['materialCost', 'laborCost', 'shippingCost', 'factoryProfit',
    'retailPriceExVat']) {
    assert.doesNotMatch(pickerList, new RegExp(`'${col}'`),
      `${col} ถูก redactProductMargin ตัดทิ้งอยู่แล้ว — ไม่ต้องดึงมา`);
  }
});

// 🔴 regression #1474: ตัดสองช่องนี้ออกแล้วคอลัมน์ "ภาษี/ชิ้น" บนหน้าทะเบียน
// สรรพสามิตกลายเป็น ฿0.00 ทั้งตารางเงียบ ๆ — จอไม่ได้เขียนชื่อช่องตรง ๆ แต่ส่งแถว
// เข้า `exciseTaxLineForRegistration()` ซึ่งอ่าน product.exciseTax/localTax ข้างใน
test('products picker: ต้องมี exciseTax/localTax — หน้าทะเบียนสรรพสามิตคิดภาษี/ชิ้นจากตรงนี้', () => {
  for (const col of ['exciseTax', 'localTax']) {
    assert.match(pickerList, new RegExp(`'${col}'`),
      `ขาด ${col} — /tax/registrations จะโชว์ภาษี/ชิ้นเป็น ฿0.00 ทั้งตาราง`);
  }
});

test('products picker: ช่องที่ dropdown กับด่านของ route เองต้องใช้ ต้องอยู่ครบ', () => {
  // แสดงในตัวเลือก · ผูกลูกค้า (ตัวกรอง ?customerId=) · สถานะให้ route กรองเอง
  // (approvalStatus + isActive) · quoteLines อ่านราคา/หน่วย/ชื่อสองภาษา
  for (const col of ['id', 'fgCode', 'productDescription', 'productDescriptionEn',
    'brandName', 'brandNameEn', 'customerId', 'customerName', 'volume', 'volumeUnit',
    'saleUnit', 'costPrice', 'retailPriceIncVat', 'approvalStatus', 'isActive',
    'isExciseTaxable', 'categoryCode', 'metadata']) {
    assert.match(pickerList, new RegExp(`'${col}'`), `ขาดคอลัมน์ ${col}`);
  }
});
