import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXCISE_TAX_BASE_PIECES, GIFT_SET_EXCISE_KIND, exciseBaseLabel, exciseBasePriceIncVat, giftSetExcise,
  giftSetExciseFields, giftSetExciseSummary, usesPieceTaxBase,
} from "./giftSetExcise.js";
import { productExciseFields } from "./productExcise.js";
import { orderHasExciseLines } from "./exciseListStage.js";
import { dealHasExciseFg } from "../salesPlanningLifecycle.js";
import { missingRetailPriceEntry } from "../tax/requirements.js";
import { isMissingRetailPrice } from "../tax/taxableProducts.js";
import { registrationProductFacts } from "../tax/registrationQueue.js";
import { filingTableLine } from "./raFilingTable.js";

/* ชุดของขวัญ 01-037 ที่มีน้ำหอม เข้าระบบสรรพสามิต (มติเจ้าของ 11/11/2026 · แผนรื้อสรรพสามิต หมวด 14 · mig 0430)
   G1 ดูจากสูตรที่ผูก · G2 น้ำหอมล้วน = ราคาทั้งชุด / คละ = เฉพาะน้ำหอม · G3 ราคารายชิ้น × จำนวนชิ้น */

const TYPES = [
  { mainCategoryCode: "01", typeCode: "002", isExcise: true },   // น้ำหอมสำหรับผิวกาย
  { mainCategoryCode: "01", typeCode: "020", isExcise: true },   // บอดี้มิสต์
  { mainCategoryCode: "01", typeCode: "003", isExcise: false },  // เทียนหอม
  { mainCategoryCode: "01", typeCode: "006", isExcise: false },  // ก้านหอม
  { mainCategoryCode: "01", typeCode: "037", isExcise: false },  // ชุดของขวัญ
];
const perfume = (price, qty) => ({ categoryCode: "01-002", formulaId: "F1", retailPriceIncVat: price, pieceQty: qty });
const mist = (price, qty) => ({ categoryCode: "01-020", formulaId: "F2", retailPriceIncVat: price, pieceQty: qty });
const candle = { categoryCode: "01-003", formulaId: "F3", retailPriceIncVat: null, pieceQty: 1 };

test("G1: ไม่มีแถวหมวดเสียภาษี / ไม่ผูกสูตร = none · ระบบไม่เดาจากชื่อชุด", () => {
  assert.equal(giftSetExcise([], TYPES).kind, GIFT_SET_EXCISE_KIND.none);
  assert.equal(giftSetExcise([candle, { categoryCode: "01-006", formulaId: "F4" }], TYPES).taxable, false);
  assert.equal(giftSetExcise([perfume(590, 1)], []).kind, GIFT_SET_EXCISE_KIND.none, "ไม่มีทะเบียนหมวด = ไม่รู้ว่าเสียภาษี");
  assert.equal(giftSetExcise([{ categoryCode: "", formulaId: "" }], TYPES).kind, GIFT_SET_EXCISE_KIND.none, "แถวว่างไม่นับ");
});

test("G2: ทุกแถวเป็นหมวดเสียภาษี = น้ำหอมล้วน คิดจากราคาทั้งชุด (ไม่ต้องกรอกราคาต่อชิ้น)", () => {
  const pure = giftSetExcise([perfume(null, 1), mist(null, 2)], TYPES);
  assert.equal(pure.kind, GIFT_SET_EXCISE_KIND.pure);
  assert.equal(pure.taxable, true);
  assert.equal(pure.basePriceIncVat, null, "ฐานคือราคาขายปลีกของตัวชุด ไม่ใช่ผลรวมรายชิ้น");
  assert.deepEqual(giftSetExciseFields([perfume(null, 1)], TYPES), { autoTaxable: true, exciseTaxBase: null, exciseBasePriceIncVat: null });
});

test("G2/G3: ชุดคละ = Σ ราคาต่อชิ้น × จำนวนชิ้น ของแถวเสียภาษีเท่านั้น · ขาดราคาแถวเดียว = ฐานว่าง (ไม่รวมเท่าที่มี)", () => {
  const mixed = giftSetExcise([perfume(590, 1), mist(290, 2), candle], TYPES);
  assert.equal(mixed.kind, GIFT_SET_EXCISE_KIND.mixed);
  assert.equal(mixed.basePriceIncVat, 1170);
  assert.deepEqual(giftSetExciseFields([perfume(590, 1), candle], TYPES), { autoTaxable: true, exciseTaxBase: EXCISE_TAX_BASE_PIECES, exciseBasePriceIncVat: 590 });
  assert.equal(giftSetExcise([perfume("590", ""), candle], TYPES).basePriceIncVat, 590, "จำนวนว่าง = 1 · ราคาจากฟอร์มเป็นข้อความได้");
  const missing = giftSetExcise([perfume(590, 1), mist(null, 1), candle], TYPES);
  assert.equal(missing.basePriceIncVat, null);
  assert.equal(missing.missingPriceRows.length, 1);
  assert.equal(giftSetExcise([perfume(0, 1), candle], TYPES).basePriceIncVat, null, "ราคา 0 = ยังไม่มีฐาน");
  assert.equal(giftSetExcise([perfume(199.995, 3), candle], TYPES).basePriceIncVat, 599.99, "ปัดสองตำแหน่งด้วยตัวปัดกลาง");
});

test("ฐานภาษีของสินค้า: ชุดคละอ่านคอลัมน์ฐาน · อื่น ๆ อ่านราคาขายปลีก · ว่าง/0 = null", () => {
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990 }), 990);
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990, exciseTaxBase: "pieces", exciseBasePriceIncVat: 880 }), 880);
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990, exciseTaxBase: "pieces", exciseBasePriceIncVat: null }), null, "ไม่ถอยไปใช้ราคาทั้งชุด");
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 0 }), null);
  assert.equal(exciseBasePriceIncVat(null), null);
  assert.equal(usesPieceTaxBase({ exciseTaxBase: "pieces" }), true);
  assert.match(exciseBaseLabel({ exciseTaxBase: "pieces" }), /ส่วนน้ำหอมในชุด/);
  assert.equal(exciseBaseLabel({}), "ราคาขายปลีก (รวม VAT)");
});

test("ข้อความสรุปใต้รายการสูตรบอกแบบของชุด + ฐาน", () => {
  assert.match(giftSetExciseSummary(giftSetExcise([candle], TYPES)), /ไม่เข้าระบบสรรพสามิต/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(null, 1)], TYPES)), /น้ำหอมล้วน — เสียสรรพสามิต คิดจากราคาขายปลีกทั้งชุด/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(590, 1), candle], TYPES)), /ชุดคละประเภท .* ฐานภาษี ฿590\.00 \(รวม VAT\)/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(null, 1), candle], TYPES)), /ยังไม่ได้กรอกราคาต่อชิ้น 1 แถว/);
});

test("บันทึกสินค้า: ชุดของขวัญตั้งต้นจากสูตร · คละคิดภาษีจากฐาน แต่ราคาก่อน VAT ยังเป็นของทั้งชุด · override ของ RA ชนะ", async () => {
  const deps = { flagsOf: async () => ({ isExcise: false }), loadTypes: async () => TYPES };
  const mixed = await productExciseFields({ categoryCode: "01-037", retailPriceIncVat: 1070, giftSetRows: [perfume(535, 1), candle] }, deps);
  assert.equal(mixed.isExciseTaxable, true);
  assert.equal(mixed.exciseTaxBase, "pieces");
  assert.equal(mixed.exciseBasePriceIncVat, 535);
  assert.equal(Math.round(mixed.retailPriceExVat * 100) / 100, 1000, "ราคาก่อน VAT = ของทั้งชุด");
  assert.equal(Math.round(mixed.exciseTax * 100) / 100, 40, "สรรพสามิต 8% ของ 500 (535 ถอด VAT)");
  const pure = await productExciseFields({ categoryCode: "01-037", retailPriceIncVat: 1070, giftSetRows: [perfume(null, 1)] }, deps);
  assert.equal(pure.exciseTaxBase, null);
  assert.equal(Math.round(pure.exciseTax * 100) / 100, 80, "น้ำหอมล้วน = 8% ของราคาทั้งชุดถอด VAT");
  const none = await productExciseFields({ categoryCode: "01-037", retailPriceIncVat: 1070, giftSetRows: [] }, deps);
  assert.deepEqual([none.isExciseTaxable, none.exciseTax, none.exciseTaxBase], [false, 0, null]);
  const exempt = await productExciseFields({ categoryCode: "01-037", retailPriceIncVat: 1070, taxableOverride: false, giftSetRows: [perfume(535, 1), candle] }, deps);
  assert.deepEqual([exempt.isExciseTaxable, exempt.exciseTax], [false, 0], "RA ยกเว้นรายตัวชนะสูตร");
  const other = await productExciseFields({ categoryCode: "01-002", retailPriceIncVat: 1070, giftSetRows: [candle] }, { ...deps, flagsOf: async () => ({ isExcise: true }) });
  assert.deepEqual([other.isExciseTaxable, other.exciseTaxBase], [true, null], "หมวดอื่นตามธงหมวด ไม่ดูแถวสูตร");
  let loaded = false;
  await productExciseFields({ categoryCode: "01-002", retailPriceIncVat: 100 }, { flagsOf: async () => ({ isExcise: true }), loadTypes: async () => { loaded = true; return []; } });
  assert.equal(loaded, false, "หมวดอื่นไม่อ่านทะเบียนหมวดทั้งชุด");
});

test("ปลายทางที่ใช้ราคาขายปลีกเป็นฐานภาษี อ่านฐานของชุดคละ", () => {
  const giftMissing = { fgCode: "FG-1-01-037-1", retailPriceIncVat: 990, exciseTaxBase: "pieces", exciseBasePriceIncVat: null, isExciseTaxable: true, categoryCode: "01-037" };
  const gift = { ...giftMissing, exciseBasePriceIncVat: 880, retailPriceExVat: 925.23 };
  assert.match(missingRetailPriceEntry({ productId: "P1" }, giftMissing).label, /ส่วนน้ำหอมในชุด/, "ด่านยื่นทะเบียน: มีราคาทั้งชุดแต่ขาดราคาน้ำหอม = ยังยื่นไม่ได้");
  assert.equal(missingRetailPriceEntry({ productId: "P1" }, gift), null);
  assert.equal(isMissingRetailPrice(giftMissing, TYPES), true);
  assert.equal(isMissingRetailPrice(gift, TYPES), false);
  const facts = registrationProductFacts(gift, { vatRate: 0.07 });
  assert.equal(facts.retailPriceIncVat, 880);
  assert.equal(Math.round(facts.retailPriceExVat * 100) / 100, 822.43, "ถอดจากฐาน ไม่ใช่ช่องก่อน VAT ของราคาทั้งชุด");
  assert.equal(facts.taxBasis, "pieces");
  assert.equal(registrationProductFacts({ retailPriceIncVat: 990 }, { vatRate: 0.07 }).taxBasis, null);
  const line = filingTableLine(gift, { quantity: 1, totalTax: 72.37, taxPerUnit: 72.37 }); // 880 ÷ 1.07 × 8.8% = 72.37
  assert.equal(line.retailPriceIncVat, 880);
  assert.equal(line.taxCheck.ok, true, "รีเช็คภาษี/หน่วยของตาราง RA ตรงกับฐานของชุดคละ");
});

test("เข้าข่ายสรรพสามิตจากธงบนสินค้า: ทะเบียน SO + ดีล/โครงการ (ชุดของขวัญอยู่หมวดที่ไม่ติ๊ก isExcise)", () => {
  const giftLine = { fgCode: "FG-1-01-037-1", productId: "P-GIFT" };
  assert.equal(orderHasExciseLines([giftLine], TYPES), false);
  assert.equal(orderHasExciseLines([giftLine], TYPES, new Set(["P-GIFT"])), true);
  assert.equal(orderHasExciseLines([{ fgCode: "FG-1-01-002-1" }], TYPES), true, "หมวดเสียภาษียังนับเหมือนเดิม");
  const deal = { metadata: { fgCodes: [] } };
  assert.equal(dealHasExciseFg(deal, [{ productId: "P-GIFT", product: { fgCode: "FG-1-01-037-1", isExciseTaxable: false } }], TYPES), false);
  assert.equal(dealHasExciseFg(deal, [{ productId: "P-GIFT", product: { fgCode: "FG-1-01-037-1", isExciseTaxable: true } }], TYPES), true);
  assert.equal(dealHasExciseFg(deal, [{ productId: "P", product: { fgCode: "FG-1-01-002-1", isExciseTaxable: false } }], TYPES), true, "RA ยกเว้นในหมวดสรรพสามิต = ยังเข้าข่าย (มีทะเบียนยกเว้น)");
});

test("mig 0430: RPC รับคีย์ราคา/จำนวนชิ้นที่ตัวเขียนส่ง (คีย์ที่ไม่ประกาศใน jsonb_to_recordset ถูกทิ้งเงียบ)", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/0430_gift_set_excise_base.sql", import.meta.url), "utf8");
  const store = readFileSync(new URL("../master/giftSetFormulasStore.js", import.meta.url), "utf8");
  for (const key of ["retailPriceIncVat", "pieceQty"]) {
    assert.match(sql, new RegExp(`"${key}"\\s+(numeric|integer),?\\n`), `jsonb_to_recordset ประกาศ ${key}`);
    assert.match(store, new RegExp(`${key}: row\\.${key} \\?\\?`), `replaceProductFormulas ส่ง ${key}`);
  }
  assert.match(sql, /"exciseTaxBase" IS NULL OR "exciseTaxBase" = 'pieces'/);
  for (const route of ["../../app/api/products/route.js", "../../app/api/products/[id]/route.js"]) {
    assert.match(readFileSync(new URL(route, import.meta.url), "utf8"), /giftSetRows,\n\s+\}\)/, `${route} ส่งแถวสูตรของชุดเข้าตัวคิดกลาง`);
  }
});
