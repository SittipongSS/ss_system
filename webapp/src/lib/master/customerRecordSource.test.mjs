import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/* ลิสต์ /api/customers กรองด้วยทีมที่ดูแล + เฉพาะที่อนุมัติ + ซ่อนลูกค้าพัก (คงไว้ตาม
   มติ 2026-07-26) → ใช้ได้แค่ตอน "เลือก" · หน้าที่แสดง/พิมพ์ลูกค้าของเอกสารที่ผูกแล้ว
   ต้องอ่าน **รายตัว** ไม่งั้นข้อมูลหายเงียบตามสิทธิ์ของคนเปิด

   ⭐ "รายตัว" มีสองท่าที่ยอมรับได้ ทั้งคู่เลี่ยงลิสต์ที่กรองทีมเหมือนกัน:
     · `useCustomerRecord(...)` — จอยิง `/api/customers/[id]` เอง
     · endpoint ของเอกสารแนบลูกค้ามาให้ในคำขอเดียว (อ่านด้วย admin client ฝั่ง
       server) แล้วจออ่านจากระเบียน — ท่านี้ประหยัดกว่าเพราะไม่ต้องยิงรอบสอง
       (ทะเบียนสรรพสามิตย้ายมาใช้ท่านี้ 2026-08-28 ผ่าน `?full=1`)

   ⚠️ สิ่งที่ห้ามเหมือนเดิมคือ **find จากลิสต์** ซึ่งเป็นต้นเหตุจริงของอาการ */
const DOCUMENT_PAGES = [
  ["ใบยื่นชำระภาษี", "../../app/tax/filings/[id]/page.js"],
  ["ทะเบียนสรรพสามิต", "../../app/tax/registrations/[id]/page.js"],
];

for (const [label, path] of DOCUMENT_PAGES) {
  test(`${label}: ลูกค้าของเอกสารอ่านรายตัว ไม่ใช่ find จากลิสต์ที่กรองทีม`, () => {
    const source = read(path);
    assert.ok(
      /useCustomerRecord\(/.test(source) || /const customer = s\?\.customer/.test(source),
      "ลูกค้าของเอกสารต้องมาจาก useCustomerRecord หรือจากระเบียนที่ server แนบมาให้",
    );
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
  // ProjectFormModal (ฟอร์มโครงการยุค 1:1) ถูกลบแล้ว — ฟอร์มโครงการเหลือตัวเดียว
  // คือ SalesProjectCreateModal (มติ 2026-08-08: โครงการ = ภาชนะรวมดีล)
  for (const path of [
    "../../components/salesPlanning/DealFormFields.js",
    "../../components/pm/SalesProjectCreateModal.js",
  ]) {
    assert.match(read(path), /emptyText=\{CUSTOMER_PICKER_EMPTY_HINT\}/, path);
  }
});
