import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  QUOTATION_DEAL_EXCLUDED_STAGES,
  blockedQuotationCustomers,
  eligibleQuotationDeals,
} from "./quotationSourcePicker.js";

const customers = [
  { id: "C-OK", name: "บริษัท ทิพย์นที (2005) จำกัด", arCode: "AR-001" },
  { id: "C-NOPROJ", name: "บริษัท อุตสาหกรรมไหมไทย จำกัด", arCode: "AR-002" },
  { id: "C-WON", name: "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด", arCode: "AR-000" },
  { id: "C-OTHERTEAM", name: "บริษัท ลิกซิล (ประเทศไทย) จำกัด", arCode: "AR-003" },
  { id: "C-NODEAL", name: "บริษัท ไพรไทย 1960 จำกัด", arCode: "AR-004" },
];
const deals = [
  { id: "D-1", title: "ODM_ok", customerId: "C-OK", projectId: "PRJ-1", stage: "quotation", canEdit: true },
  { id: "D-2", title: "KA_Jim Thompson", customerId: "C-NOPROJ", projectId: null, stage: "qualified", canEdit: true },
  { id: "D-3", title: "TEST_Deal", customerId: "C-WON", projectId: "PRJ-3", stage: "won", canEdit: true },
  { id: "D-4", title: "ทีมอื่น", customerId: "C-OTHERTEAM", projectId: "PRJ-4", stage: "qualified", canEdit: false },
];

test("ดีลที่ออกใบได้ = ผูกโครงการ + มีลูกค้า + stage เปิด + แก้ไขได้", () => {
  assert.deepEqual(eligibleQuotationDeals(deals).map((d) => d.id), ["D-1"]);
  assert.deepEqual(QUOTATION_DEAL_EXCLUDED_STAGES, ["won", "in_project", "lost"]);
  assert.deepEqual(eligibleQuotationDeals(), []);
});

// เคสจริง 2026-07-26: ผู้ใช้ค้น "เซนท์ แอนด์ เซนส์" ไม่เจอ ทั้งที่ลูกค้า/โครงการ/ดีลมีครบ
// — เพราะดีลถูกปิดเป็น Won ต้องบอกให้รู้ตรงนั้น ไม่ใช่หายเงียบ
test("ค้นเจอลูกค้าที่ดีลปิดเป็น Won → บอกเหตุ + ชี้ไปหน้าดีล", () => {
  const [row] = blockedQuotationCustomers({ search: "เซนท์ แอนด์", customers, deals });
  assert.equal(row.customerId, "C-WON");
  assert.equal(row.reasonCode, "closed_stage");
  assert.match(row.reason, /ปิดแล้ว/);
  assert.equal(row.dealTitle, "TEST_Deal");
  assert.equal(row.href, "/sa/deals/D-3");
});

test("ดีลยังไม่ผูกโครงการ → ชี้ไปผูกโครงการที่ดีลใบนั้น", () => {
  const [row] = blockedQuotationCustomers({ search: "ไหมไทย", customers, deals });
  assert.equal(row.reasonCode, "no_project");
  assert.equal(row.href, "/sa/deals/D-2");
  assert.match(row.actionLabel, /ผูกโครงการ/);
});

test("ดีลของทีมอื่น (แก้ไขไม่ได้) แยกจากกรณีไม่มีโครงการ", () => {
  const [row] = blockedQuotationCustomers({ search: "ลิกซิล", customers, deals });
  assert.equal(row.reasonCode, "not_editable");
});

test("ไม่มีดีลเลย → ชี้ไปหน้าดีลให้สร้างก่อน", () => {
  const [row] = blockedQuotationCustomers({ search: "ไพรไทย", customers, deals });
  assert.equal(row.reasonCode, "no_deal");
  assert.equal(row.dealId, null);
  assert.equal(row.href, "/sa/deals");
});

test("ลูกค้าที่ออกใบได้อยู่แล้วไม่ต้องอธิบาย + ค้นสั้นเกินไม่กวน", () => {
  assert.deepEqual(blockedQuotationCustomers({ search: "ทิพย์นที", customers, deals }), []);
  assert.deepEqual(blockedQuotationCustomers({ search: "ท", customers, deals }), []);
  assert.deepEqual(blockedQuotationCustomers({ search: "", customers, deals }), []);
});

test("ค้นด้วยรหัสลูกค้าได้ และจำกัดจำนวนที่แสดง", () => {
  const [byCode] = blockedQuotationCustomers({ search: "AR-002", customers, deals });
  assert.equal(byCode.customerId, "C-NOPROJ");
  const many = blockedQuotationCustomers({ search: "บริษัท", customers, deals, limit: 2 });
  assert.equal(many.length, 2);
});

// หน้าเว็บกับตัวบอกเหตุต้องใช้เงื่อนไขชุดเดียวกัน ไม่งั้นลิสต์กับคำอธิบายเถียงกันเอง
test("หน้าสร้างใบเสนอราคาเรียกเงื่อนไขจาก lib ไม่ได้ก๊อปไปเขียนเอง", () => {
  const page = readFileSync(
    new URL("../../app/sales-planning/quotations/new/page.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /eligibleQuotationDeals\(deals\)/);
  assert.match(page, /blockedQuotationCustomers\(\{ search, customers, deals \}\)/);
  assert.doesNotMatch(page, /EXCLUDE_STAGES/);
});
