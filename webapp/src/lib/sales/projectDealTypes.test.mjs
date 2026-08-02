import test from "node:test";
import assert from "node:assert/strict";
import { dealTypeTooltip, summarizeProjectDealTypes } from "./projectDealTypes.js";
import { DEAL_TYPES } from "../salesPlanning.js";

/* คอลัมน์ "ดีล" ของหน้ารายการโครงการ — ของเดิมโชว์ชื่อดีล **ใบแรกใบเดียว** แล้วต่อท้าย
   ว่า "N ดีล" · โครงการที่สั่งซ้ำมา 3 รอบจึงดูเหมือนโครงการที่เพิ่งเริ่ม
   (มติผู้ใช้ 2026-08-02: โชว์เป็นป้ายชนิด + จำนวน) */

const deal = (dealType, over = {}) => ({ id: `D-${dealType}-${over.n || 1}`, dealType, title: `ดีล ${dealType}`, ...over });

test("เรียงตามลำดับเส้นทางจริง ไม่ใช่ตามที่เจอในอาร์เรย์", () => {
  const out = summarizeProjectDealTypes([
    deal("RE-ORDER", { n: 1 }), deal("SCENT"), deal("NPD"), deal("RE-ORDER", { n: 2 }),
  ]);
  assert.deepEqual(out.map((row) => row.type), ["SCENT", "NPD", "RE-ORDER"],
    "ต้องเรียง SCENT → NPD → RE-ORDER เสมอ ทุกแถวจะได้อ่านตำแหน่งเดียวกัน");
});

test("นับจำนวนต่อชนิด — สั่งซ้ำ 3 รอบต้องอ่านออกว่า 3", () => {
  const out = summarizeProjectDealTypes([
    deal("SCENT"), deal("RE-ORDER", { n: 1 }), deal("RE-ORDER", { n: 2 }), deal("RE-ORDER", { n: 3 }),
  ]);
  assert.deepEqual(out.map((row) => [row.type, row.count]), [["SCENT", 1], ["RE-ORDER", 3]]);
});

test("จำนวนชิปไม่มีทางเกินจำนวนชนิดที่ระบบมี — ไม่ต้องมีกติกาตัดทิ้ง", () => {
  const many = [];
  for (let i = 0; i < 40; i += 1) many.push(deal(DEAL_TYPES[i % DEAL_TYPES.length], { n: i }));
  const out = summarizeProjectDealTypes(many);
  assert.equal(out.length, DEAL_TYPES.length);
  assert.equal(out.reduce((sum, row) => sum + row.count, 0), 40, "ผลรวมต้องเท่าจำนวนดีลจริง");
});

test("ชนิดที่ระบบไม่รู้จักต้องไม่หายไปเงียบ ๆ", () => {
  const out = summarizeProjectDealTypes([deal("SCENT"), { id: "X", dealType: "ของเก่าพิลึก" }]);
  assert.equal(out.reduce((sum, row) => sum + row.count, 0), 2,
    "ผลรวมชิปต้องเท่าจำนวนดีลเสมอ ไม่งั้นตารางโกหก");
  assert.equal(out[0].type, "SCENT", "ชนิดที่รู้จักมาก่อน");
});

test("ดีลที่ไม่ระบุชนิดถูกจัดเข้าชนิดตั้งต้น ไม่ใช่ถูกทิ้ง", () => {
  const out = summarizeProjectDealTypes([{ id: "D1" }, { id: "D2", metadata: { projectType: "NPD" } }]);
  assert.equal(out.reduce((sum, row) => sum + row.count, 0), 2);
  assert.ok(out.some((row) => row.type === "NPD"), "ต้องอ่าน metadata.projectType ของข้อมูลเก่าด้วย");
});

test("ไม่มีดีลเลย = ไม่มีชิป", () => {
  assert.deepEqual(summarizeProjectDealTypes([]), []);
  assert.deepEqual(summarizeProjectDealTypes(undefined), []);
  assert.deepEqual(summarizeProjectDealTypes(null), []);
});

test("tooltip บอกชื่อดีลครบทุกใบ ไม่ตัดทิ้ง", () => {
  const row = summarizeProjectDealTypes([
    deal("RE-ORDER", { n: 1, code: "DL-0001" }),
    deal("RE-ORDER", { n: 2, code: "DL-0002" }),
  ])[0];
  const tip = dealTypeTooltip(row);
  assert.match(tip, /DL-0001/);
  assert.match(tip, /DL-0002/);
});

test("tooltip ยังอ่านได้แม้ดีลไม่มีทั้งรหัสและชื่อ", () => {
  assert.equal(dealTypeTooltip({ type: "NPD", deals: [{ id: "x" }, { id: "y" }] }), "NPD 2 ดีล");
});

/* ⚠️ ทุกชนิดซ้ำได้หมด ไม่ใช่แค่ RE-ORDER — โครงการเดียวอาจพัฒนากลิ่นหลายตัว
   หรือพัฒนาสินค้าหลายรายการ (ผู้ใช้ทัก 2026-08-02)
   เทสต์นี้กันคนมาใส่เงื่อนไขพิเศษให้ RE-ORDER ทีหลัง */
test("นับซ้ำได้ทุกชนิด ไม่ใช่แค่ RE-ORDER", () => {
  for (const type of DEAL_TYPES) {
    const out = summarizeProjectDealTypes([deal(type, { n: 1 }), deal(type, { n: 2 })]);
    assert.deepEqual(out.map((row) => [row.type, row.count]), [[type, 2]],
      `${type} ซ้ำ 2 ใบต้องนับได้เหมือนกัน`);
  }
});

test("ซ้ำหลายชนิดพร้อมกันในโครงการเดียว", () => {
  const out = summarizeProjectDealTypes([
    ...Array.from({ length: 2 }, (_, i) => deal("SCENT", { n: i })),
    ...Array.from({ length: 3 }, (_, i) => deal("NPD", { n: i })),
    ...Array.from({ length: 5 }, (_, i) => deal("RE-ORDER", { n: i })),
  ]);
  assert.deepEqual(out.map((row) => [row.type, row.count]),
    [["SCENT", 2], ["NPD", 3], ["RE-ORDER", 5]]);
  assert.equal(out.length, 3, "ยังยาว 3 ชิปเท่าเดิม ไม่ว่าจะซ้ำกี่รอบ");
});

test("ชนิดที่มีใบเดียวต้องไม่ขึ้น ×1 — ตัวเลขมีความหมายเมื่อมากกว่าหนึ่งเท่านั้น", () => {
  const mixed = summarizeProjectDealTypes([deal("SCENT", { n: 1 }), deal("SCENT", { n: 2 }), deal("NPD")]);
  assert.equal(mixed.find((row) => row.type === "SCENT").count, 2);
  assert.equal(mixed.find((row) => row.type === "NPD").count, 1,
    "ฝั่ง UI ซ่อน ×N เมื่อ count === 1 — ค่าที่คืนต้องยังเป็น 1 ไม่ใช่ 0/undefined");
});
