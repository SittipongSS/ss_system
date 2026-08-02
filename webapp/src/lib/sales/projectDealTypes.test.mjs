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
