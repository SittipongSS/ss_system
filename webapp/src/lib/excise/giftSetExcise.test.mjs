import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXCISE_TAX_BASE_PIECES, GIFT_SET_EXCISE_KIND, GIFT_SET_PRICE_MODE_REQUIRED, exciseBaseLabel, exciseBaseMissingText,
  exciseBasePriceIncVat, giftSetExcise, giftSetExciseFields, giftSetExciseSummary, giftSetPriceMode, giftSetPriceModeError,
  hasOwnTaxBase, usesPieceTaxBase,
} from "./giftSetExcise.js";
import { productExciseFields } from "./productExcise.js";
import { orderHasExciseLines } from "./exciseListStage.js";
import { dealHasExciseFg } from "../salesPlanningLifecycle.js";
import { missingRetailPriceEntry } from "../tax/requirements.js";
import { isMissingRetailPrice } from "../tax/taxableProducts.js";
import { registrationProductFacts } from "../tax/registrationQueue.js";
import { filingTableLine } from "./raFilingTable.js";

/* ชุดของขวัญ 01-037 ที่มีน้ำหอม เข้าระบบสรรพสามิต (มติเจ้าของ 11/11/2026 · แผนรื้อสรรพสามิต หมวด 14 · mig 0430 + 0431)
   G1 ดูจากสูตรที่ผูก · G5 ฝ่ายขายเลือก "รวมชุด / รายชิ้น" เอง ไม่มีค่าตั้งต้น · G3 รายชิ้น = ราคาต่อชิ้น × จำนวนชิ้น */

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
const PIECES = { mode: "pieces" };

test("G1: ไม่มีแถวหมวดเสียภาษี / ไม่ผูกสูตร = none · ระบบไม่เดาจากชื่อชุด", () => {
  assert.equal(giftSetExcise([], TYPES).kind, GIFT_SET_EXCISE_KIND.none);
  assert.equal(giftSetExcise([candle, { categoryCode: "01-006", formulaId: "F4" }], TYPES).taxable, false);
  assert.equal(giftSetExcise([perfume(590, 1)], []).kind, GIFT_SET_EXCISE_KIND.none, "ไม่มีทะเบียนหมวด = ไม่รู้ว่าเสียภาษี");
  assert.equal(giftSetExcise([{ categoryCode: "", formulaId: "" }], TYPES).kind, GIFT_SET_EXCISE_KIND.none, "แถวว่างไม่นับ");
  assert.deepEqual(giftSetExciseFields([candle], TYPES, "set"), { autoTaxable: false, exciseTaxBase: null, exciseBasePriceIncVat: null },
    "ชุดไม่มีน้ำหอม = ไม่เก็บโหมด แม้ฟอร์มส่งมา");
});

test("G5: ไม่มีค่าตั้งต้น — ทั้งชุดล้วนและชุดคละ ยังไม่เลือก = unchosen (ไม่มีฐาน) · ฟอร์ม/API ตีกลับด้วยข้อความเดียวกัน", () => {
  for (const rows of [[perfume(null, 1), mist(null, 2)], [perfume(590, 1), candle]]) {
    const profile = giftSetExcise(rows, TYPES);
    assert.equal(profile.taxable, true);
    assert.equal(profile.mode, null);
    assert.deepEqual(giftSetExciseFields(rows, TYPES, ""), { autoTaxable: true, exciseTaxBase: "unchosen", exciseBasePriceIncVat: null });
    assert.equal(giftSetPriceModeError(rows, TYPES, ""), GIFT_SET_PRICE_MODE_REQUIRED);
    assert.equal(giftSetPriceModeError(rows, TYPES, "unchosen"), GIFT_SET_PRICE_MODE_REQUIRED, "ค่าที่เก็บว่ายังไม่เลือก ไม่นับเป็นการเลือก");
    assert.equal(giftSetPriceModeError(rows, TYPES, "set"), "");
  }
  assert.equal(giftSetPriceModeError([candle], TYPES, ""), "", "ชุดไม่มีน้ำหอม ไม่ต้องเลือก");
  assert.equal(giftSetPriceMode("pieces"), "pieces");
  assert.equal(giftSetPriceMode("unchosen"), null);
  assert.equal(giftSetPriceMode("PIECES"), null);
});

test("G5: เลือกรวมชุด = คิดจากราคาทั้งชุด ทั้งชุดล้วนและชุดคละ (ไม่ต้องกรอกราคาต่อชิ้น)", () => {
  for (const rows of [[perfume(null, 1)], [perfume(null, 1), candle]]) {
    assert.deepEqual(giftSetExciseFields(rows, TYPES, "set"), { autoTaxable: true, exciseTaxBase: "set", exciseBasePriceIncVat: null });
    assert.equal(giftSetExcise(rows, TYPES, { mode: "set" }).missingPriceRows.length, 0);
  }
});

test("G5/G3: เลือกรายชิ้น = Σ ราคาต่อชิ้น × จำนวนชิ้น ของแถวเสียภาษีเท่านั้น (ชุดล้วนก็ได้) · ขาดราคาแถวเดียว = ฐานว่าง", () => {
  const mixed = giftSetExcise([perfume(590, 1), mist(290, 2), candle], TYPES, PIECES);
  assert.equal(mixed.kind, GIFT_SET_EXCISE_KIND.mixed);
  assert.equal(mixed.basePriceIncVat, 1170);
  assert.deepEqual(giftSetExciseFields([perfume(590, 1), candle], TYPES, "pieces"), { autoTaxable: true, exciseTaxBase: EXCISE_TAX_BASE_PIECES, exciseBasePriceIncVat: 590 });
  assert.equal(giftSetExcise([perfume(590, 1), mist(290, 1)], TYPES, PIECES).basePriceIncVat, 880, "ชุดล้วนเลือกรายชิ้นได้");
  assert.equal(giftSetExcise([perfume("590", ""), candle], TYPES, PIECES).basePriceIncVat, 590, "จำนวนว่าง = 1 · ราคาจากฟอร์มเป็นข้อความได้");
  const missing = giftSetExcise([perfume(590, 1), mist(null, 1), candle], TYPES, PIECES);
  assert.equal(missing.basePriceIncVat, null);
  assert.equal(missing.missingPriceRows.length, 1);
  assert.equal(giftSetExcise([perfume(0, 1), candle], TYPES, PIECES).basePriceIncVat, null, "ราคา 0 = ยังไม่มีฐาน");
  assert.equal(giftSetExcise([perfume(199.995, 3), candle], TYPES, PIECES).basePriceIncVat, 599.99, "ปัดสองตำแหน่งด้วยตัวปัดกลาง");
});

test("ฐานภาษีของสินค้า: รายชิ้นอ่านคอลัมน์ฐาน · ยังไม่เลือก = null · รวมชุด/ทั่วไปอ่านราคาขายปลีก", () => {
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990 }), 990);
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990, exciseTaxBase: "set" }), 990);
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990, exciseTaxBase: "pieces", exciseBasePriceIncVat: 880 }), 880);
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990, exciseTaxBase: "pieces", exciseBasePriceIncVat: null }), null, "ไม่ถอยไปใช้ราคาทั้งชุด");
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 990, exciseTaxBase: "unchosen" }), null, "ยังไม่เลือก = ไม่มีฐาน แม้มีราคาทั้งชุด");
  assert.equal(exciseBasePriceIncVat({ retailPriceIncVat: 0 }), null);
  assert.equal(exciseBasePriceIncVat(null), null);
  assert.equal(usesPieceTaxBase({ exciseTaxBase: "pieces" }), true);
  assert.equal(hasOwnTaxBase({ exciseTaxBase: "unchosen" }), true);
  assert.equal(hasOwnTaxBase({ exciseTaxBase: "set" }), false);
  assert.match(exciseBaseLabel({ exciseTaxBase: "pieces" }), /ส่วนน้ำหอมในชุด/);
  assert.match(exciseBaseLabel({ exciseTaxBase: "unchosen" }), /รวมชุด \/ รายชิ้น/);
  assert.equal(exciseBaseLabel({ exciseTaxBase: "set" }), "ราคาขายปลีก (รวม VAT)");
  assert.match(exciseBaseMissingText({ exciseTaxBase: "unchosen", retailPriceIncVat: 990 }), /ยังไม่ได้เลือกวิธีแจ้งราคาขายปลีก/);
  assert.equal(exciseBaseMissingText({ retailPriceIncVat: 990 }), null);
});

test("ข้อความสรุปใต้รายการสูตรบอกแบบของชุด + โหมด + ฐาน", () => {
  assert.match(giftSetExciseSummary(giftSetExcise([candle], TYPES)), /ไม่เข้าระบบสรรพสามิต/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(null, 1)], TYPES)), /น้ำหอมล้วน — เสียสรรพสามิต · ยังไม่ได้เลือกวิธีแจ้งราคาขายปลีก/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(null, 1)], TYPES, { mode: "set" })), /แจ้งราคารวมชุด — คิดจากราคาขายปลีกทั้งชุด/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(590, 1), candle], TYPES, PIECES)), /ชุดคละประเภท .* แจ้งราคารายชิ้น — ฐานภาษี ฿590\.00 \(รวม VAT\)/);
  assert.match(giftSetExciseSummary(giftSetExcise([perfume(null, 1), candle], TYPES, PIECES)), /ยังไม่ได้กรอกราคาต่อชิ้น 1 แถว/);
});

test("บันทึกสินค้า: ชุดตั้งต้นจากสูตร · คิดภาษีตามโหมดที่เลือก · ราคาก่อน VAT ยังเป็นของทั้งชุด · override ของ RA ชนะ", async () => {
  const deps = { flagsOf: async () => ({ isExcise: false }), loadTypes: async () => TYPES };
  const base = { categoryCode: "01-037", retailPriceIncVat: 1070 };
  const pieces = await productExciseFields({ ...base, giftSetRows: [perfume(535, 1), candle], priceMode: "pieces" }, deps);
  assert.equal(pieces.isExciseTaxable, true);
  assert.equal(pieces.exciseTaxBase, "pieces");
  assert.equal(pieces.exciseBasePriceIncVat, 535);
  assert.equal(Math.round(pieces.retailPriceExVat * 100) / 100, 1000, "ราคาก่อน VAT = ของทั้งชุด");
  assert.equal(Math.round(pieces.exciseTax * 100) / 100, 40, "สรรพสามิต 8% ของ 500 (535 ถอด VAT)");
  const set = await productExciseFields({ ...base, giftSetRows: [perfume(535, 1), candle], priceMode: "set" }, deps);
  assert.deepEqual([set.exciseTaxBase, Math.round(set.exciseTax * 100) / 100], ["set", 80], "รวมชุด = 8% ของราคาทั้งชุดถอด VAT (ชุดคละก็ได้)");
  const unchosen = await productExciseFields({ ...base, giftSetRows: [perfume(535, 1)] }, deps);
  assert.deepEqual([unchosen.isExciseTaxable, unchosen.exciseTaxBase, unchosen.exciseTax], [true, "unchosen", 0], "ยังไม่เลือก = เสียภาษีแต่ไม่มีฐาน");
  const none = await productExciseFields({ ...base, giftSetRows: [], priceMode: "set" }, deps);
  assert.deepEqual([none.isExciseTaxable, none.exciseTax, none.exciseTaxBase], [false, 0, null]);
  const exempt = await productExciseFields({ ...base, taxableOverride: false, giftSetRows: [perfume(535, 1), candle], priceMode: "pieces" }, deps);
  assert.deepEqual([exempt.isExciseTaxable, exempt.exciseTax], [false, 0], "RA ยกเว้นรายตัวชนะสูตร");
  const other = await productExciseFields({ categoryCode: "01-002", retailPriceIncVat: 1070, giftSetRows: [candle], priceMode: "pieces" }, { ...deps, flagsOf: async () => ({ isExcise: true }) });
  assert.deepEqual([other.isExciseTaxable, other.exciseTaxBase], [true, null], "หมวดอื่นตามธงหมวด ไม่ดูแถวสูตร/โหมด");
  let loaded = false;
  await productExciseFields({ categoryCode: "01-002", retailPriceIncVat: 100 }, { flagsOf: async () => ({ isExcise: true }), loadTypes: async () => { loaded = true; return []; } });
  assert.equal(loaded, false, "หมวดอื่นไม่อ่านทะเบียนหมวดทั้งชุด");
});

test("route: ฟอร์มที่ไม่เลือกโหมดถูกตีกลับ 400 · PATCH ปุ่มอื่นใช้ค่าที่เก็บไว้ ไม่ถูกกัน", () => {
  const post = readFileSync(new URL("../../app/api/products/route.js", import.meta.url), "utf8");
  const patch = readFileSync(new URL("../../app/api/products/[id]/route.js", import.meta.url), "utf8");
  assert.match(post, /priceMode: body\.exciseTaxBase,/);
  assert.match(post, /if \(exciseTaxBase === EXCISE_TAX_BASE\.unchosen\) \{\n\s+return Response\.json\(\{ error: GIFT_SET_PRICE_MODE_REQUIRED \}, \{ status: 400 \}\);/);
  assert.match(patch, /priceMode: body\.formulaComponents !== undefined \? body\.exciseTaxBase : product\.exciseTaxBase,/);
  assert.match(patch, /if \(body\.formulaComponents !== undefined && updated\.exciseTaxBase === EXCISE_TAX_BASE\.unchosen\)/);
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
    assert.match(readFileSync(new URL(route, import.meta.url), "utf8"), /giftSetRows,\n\s+(\/\*[\s\S]*?\*\/\n\s+)?priceMode: /, `${route} ส่งแถวสูตรของชุดเข้าตัวคิดกลาง`);
  }
});
