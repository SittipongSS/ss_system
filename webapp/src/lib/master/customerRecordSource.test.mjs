import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// ลิสต์ /api/customers กรองด้วยทีมที่ดูแล + เฉพาะที่อนุมัติ + ซ่อนลูกค้าพัก (คงไว้ตาม
// มติ 2026-07-26) → ใช้ได้แค่ตอน "เลือก" · หน้าที่แสดง/พิมพ์ลูกค้าของเอกสารที่ผูกแล้ว
// ต้องอ่านรายตัว ไม่งั้นข้อมูลหายเงียบตามสิทธิ์ของคนเปิด
const DOCUMENT_PAGES = [
  ["ใบยื่นชำระภาษี", "../../app/tax/filings/[id]/page.js"],
  ["ทะเบียนสรรพสามิต", "../../app/tax/registrations/[id]/page.js"],
];

for (const [label, path] of DOCUMENT_PAGES) {
  test(`${label}: ลูกค้าของเอกสารอ่านรายตัวผ่าน useCustomerRecord`, () => {
    const source = read(path);
    assert.match(source, /useCustomerRecord\(/);
    assert.doesNotMatch(
      source,
      /const customer = customers\.find/,
      "ห้ามกลับไป find จากลิสต์ที่กรองทีม",
    );
  });
}

test("useCustomerRecord ยิง /api/customers/[id] และมี fallback ระหว่างโหลด", () => {
  const hook = read("./useCustomerRecord.js");
  assert.match(hook, /fetch\(`\/api\/customers\/\$\{encodeURIComponent\(customerId\)\}`\)/);
  assert.match(hook, /return record \|\| fallback \|\| \{\}/);
});

test("picker ลูกค้าทุกจุดใช้ข้อความอธิบายชุดเดียวกันเมื่อค้นไม่เจอ", () => {
  assert.match(read("../uiLabels.js"), /CUSTOMER_PICKER_EMPTY_HINT/);
  for (const path of [
    "../../components/salesPlanning/DealFormFields.js",
    "../../components/pm/ProjectFormModal.js",
    "../../components/pm/SalesProjectCreateModal.js",
  ]) {
    assert.match(read(path), /emptyText=\{CUSTOMER_PICKER_EMPTY_HINT\}/, path);
  }
});
