// ── ลิสต์ลูกค้าของ picker ไม่ต้องพกที่อยู่/ผู้ติดต่อ ──────────────────────────
//
// วัด 2026-08-27 บน 191 ราย: `addresses` 136 KB + `contacts` 17 KB = ครึ่งหนึ่ง
// ของทั้งลิสต์ (395 KB) ทั้งที่ picker อ่านแค่ชื่อ/รหัส · ตัดแล้วเหลือ 232 KB (−41%)
//
// ⭐ ปลอดภัยเพราะทุกจอที่ใช้ที่อยู่/ผู้ติดต่อ **จริง ๆ** อ่านรายตัวจาก
// GET /api/customers/[id] อยู่แล้ว ด้วยเหตุผลที่เขียนไว้ใน useCustomerRecord.js
// (ลิสต์กรอง 3 ชั้น ⇒ ใช้ได้แค่ตอน "เลือก" ไม่ใช่ตอน "อ่านของเอกสารที่ผูกแล้ว")
//
// 🪤 `?manage=1` = หน้าทะเบียนลูกค้า ต้องได้ทั้งแถวเสมอ — จอนั้นแก้ของจริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const route = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'route.js'), 'utf8');
const pickerList = route.slice(
  route.indexOf('const CUSTOMER_PICKER_COLUMNS'),
  route.indexOf("].join(',')", route.indexOf('const CUSTOMER_PICKER_COLUMNS')),
);

test('customers: manage ได้ทั้งแถว · picker ได้ชุดที่ระบุไว้', () => {
  assert.match(route, /select\(manage \? '\*' : CUSTOMER_PICKER_COLUMNS\)/,
    'หน้าทะเบียน (?manage=1) ต้องยังได้ทุกคอลัมน์');
});

test('customers picker: ห้ามมี addresses/contacts ในชุดคอลัมน์', () => {
  assert.ok(pickerList.length > 0, 'หา CUSTOMER_PICKER_COLUMNS ไม่เจอ');
  for (const col of ['addresses', 'contacts']) {
    assert.doesNotMatch(pickerList, new RegExp(`'${col}'`),
      `${col} เป็น JSON ก้อนโตที่ picker ไม่ได้อ่าน — อ่านรายตัวจาก /api/customers/[id] แทน`);
  }
});

test('customers picker: คอลัมน์ที่ทุก dropdown ในระบบต้องใช้ต้องอยู่ครบ', () => {
  // ชื่อ/รหัสไว้แสดง · ทีม/เจ้าของไว้ให้ด่านขอบเขตกรอง · สถานะอนุมัติ+isActive
  // ไว้ให้ตัวกรองของ route เอง (ตัดของที่ยังไม่อนุมัติ/พักใช้ออกจาก picker)
  for (const col of ['id', 'arCode', 'name', 'nameEn', 'team', 'teams', 'ownerId',
    'approvalStatus', 'isActive']) {
    assert.match(pickerList, new RegExp(`'${col}'`), `ขาดคอลัมน์ ${col}`);
  }
});
