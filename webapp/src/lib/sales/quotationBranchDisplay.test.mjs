import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pickDocumentAddresses } from '@/lib/master/addresses';
import { branchLabel } from '@/lib/master/thaiAddress';

/* จอ "ข้อมูลลูกค้าในเอกสาร" ต้องบอกเรื่องเดียวกับกระดาษที่พิมพ์ออกมา
   ─────────────────────────────────────────────────────────────────
   `customers.branchCode` เป็น **กระจกของที่อยู่ออกบิลหลัก** (ดูหัวไฟล์ lib/master/addresses.js)
   ไม่ใช่สาขาของใบ · ใบเก็บ `branchCode` ของ **ที่อยู่ที่ใบนั้นเลือก** ซึ่ง server ตรึงให้
   ผ่าน pickDocumentAddresses ⇒ จอที่อ่านช่องระดับลูกค้าจะค้างที่ "สำนักงานใหญ่" ตลอด
   แม้คนทำใบจะสลับไปที่อยู่สาขาแล้ว = จอบอกคนละเรื่องกับใบที่บันทึกไป */

const CUSTOMER = {
  // ลูกค้าจริงในระบบ: กระจกระดับลูกค้าเป็น '00000' แต่ที่อยู่ใบที่สองเป็นสาขา 00001
  branchCode: '00000',
  addresses: [
    { id: 'ADR-head', label: 'สำนักงานใหญ่', useFor: 'both', address: '507 ถนนประเสริฐมนูกิจ กรุงเทพมหานคร 10230' },
    { id: 'ADR-branch', label: 'สาขาพรอมานาด', useFor: 'both', branchCode: '00001', address: '589/7-9 ถนนรามอินทรา กรุงเทพมหานคร 10230' },
  ],
};

test('เลือกที่อยู่ออกบิลคนละตัว → ทั้งที่อยู่และเลขสาขาบนใบเปลี่ยนตาม', () => {
  const primary = pickDocumentAddresses(CUSTOMER, {}).snapshot;
  assert.match(primary.billingAddress, /^507 /);
  assert.equal(primary.branchCode, '00000');
  assert.equal(primary.billingAddressId, 'ADR-head');

  const branch = pickDocumentAddresses(CUSTOMER, { billingAddressId: 'ADR-branch' }).snapshot;
  assert.match(branch.billingAddress, /^589\/7-9 /);
  assert.equal(branch.branchCode, '00001');
  assert.equal(branch.billingAddressId, 'ADR-branch');

  // ค่าที่คนอ่านบนจอต้องต่างกันจริง ไม่ใช่ "สำนักงานใหญ่" ทั้งคู่
  assert.equal(branchLabel(primary.branchCode), 'สำนักงานใหญ่');
  assert.equal(branchLabel(branch.branchCode), 'สาขาที่ 00001');
});

/* 🐞 ที่เคยผิด: ทั้งสองหน้าวาดช่องสาขาจาก `customer.branchCode` / `quote.branchCode`
   ทั้งที่ข้อความที่อยู่ข้าง ๆ วาดจาก pickedAddresses แล้ว — ข้อนี้กันไม่ให้ย้อนกลับไป */
const pageSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

/* ⭐ 2026-08-27: ช่องสาขาย้ายไปอยู่ใน component กลาง QuotationCustomerFields ที่หน้าสร้าง
   กับหน้าแก้ใช้ร่วมกัน (กฎ AGENTS.md) — ข้อนี้จึงตรวจที่ component ตัวเดียว ไม่ต้องไล่สองหน้า */
test('ช่องสาขาอ่านจากที่อยู่ที่เลือกอยู่ ไม่ใช่ช่องระดับลูกค้า', () => {
  const src = pageSource('../../components/salesPlanning/QuotationCustomerFields.js');
  /* ป้าย "สาขา" มีอยู่แล้ว ⇒ ใช้ branchValue (เลขเปล่า) ไม่ใช่ branchLabel ที่เติม "สาขาที่"
     ⚠️ ตอนสร้างใบต้องกั้นด้วย billingAddressId — ยังไม่เลือกที่อยู่ก็ยังไม่มีสาขาให้โชว์ */
  assert.match(src, /\(billingAddressId \|\| isEdit\) \? branchValue\(picked\?\.snapshot\?\.branchCode\) : ""/);
  assert.doesNotMatch(src, /branchLabel\(/);
  // ใบที่ปิดแล้วอ่านจากค่าที่ตรึงไว้ ไม่ใช่คำนวณสดจากทะเบียน
  assert.match(src, /branchValue\(snapshot\?\.branchCode\)/);
});
