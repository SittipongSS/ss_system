import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exciseFilingChecklist, exciseTaxPreview, formTaxBase, productExciseStatus } from "./productExciseStatus.js";
import { productExciseFields } from "./productExcise.js";

/* ฟอร์มสินค้าหัวข้อ ④ "ราคาขายปลีกและสรรพสามิต" (มติเจ้าของ 11/11/2026 F1–F5 · docs/product-form-rework.md) */

const TYPES = [
  { mainCategoryCode: "01", typeCode: "002", isExcise: true, nameTh: "น้ำหอมสำหรับผิวกาย" },
  { mainCategoryCode: "01", typeCode: "020", isExcise: true, nameTh: "บอดี้มิสต์" },
  { mainCategoryCode: "01", typeCode: "003", isExcise: false, nameTh: "เทียนหอม" },
  { mainCategoryCode: "01", typeCode: "037", isExcise: false, nameTh: "ชุดของขวัญ" },
  { mainCategoryCode: "02", typeCode: "020", isExcise: false, nameTh: "หัวน้ำหอม" },
];
const perfume = { categoryCode: "01-002", formulaId: "F1", retailPriceIncVat: 590, pieceQty: 1 };
const candle = { categoryCode: "01-003", formulaId: "F3", retailPriceIncVat: null, pieceQty: 1 };

test("สถานะตามกติกาเดียวกับตอนบันทึก: หมวด · สูตรในชุด · RA รายตัวชนะ — บอกเหตุเสมอ", () => {
  const fg = productExciseStatus({ categoryCode: "01-002", productTypes: TYPES });
  assert.deepEqual([fg.taxable, fg.source], [true, "category"]);
  assert.match(fg.reason, /^หมวด 01-002 น้ำหอมสำหรับผิวกาย ติ๊กเสียสรรพสามิต$/);
  const oil = productExciseStatus({ categoryCode: "02-020", productTypes: TYPES });
  assert.deepEqual([oil.taxable, oil.reason], [false, "หมวด 02-020 หัวน้ำหอม ไม่ได้ติ๊กเสียสรรพสามิต"]);
  const gift = productExciseStatus({ categoryCode: "01-037", productTypes: TYPES, giftSetRows: [perfume, candle], priceMode: "set" });
  assert.deepEqual([gift.taxable, gift.source, gift.gift.mode], [true, "gift", "set"]);
  assert.match(gift.reason, /^ชุดคละประเภท — ในชุดมีสูตรหมวด 01-002 น้ำหอมสำหรับผิวกาย ซึ่งเสียสรรพสามิต$/);
  const giftNone = productExciseStatus({ categoryCode: "01-037", productTypes: TYPES, giftSetRows: [candle] });
  assert.deepEqual([giftNone.taxable, giftNone.reason], [false, "ไม่มีสูตรหมวดที่เสียสรรพสามิตในชุด"]);
  assert.deepEqual(
    [productExciseStatus({ categoryCode: "01-003", productTypes: TYPES, taxableOverride: true }).reason],
    ["ฝ่าย RA ตั้งให้สินค้าตัวนี้เสียสรรพสามิตรายตัว"],
  );
  const exempt = productExciseStatus({ categoryCode: "01-037", productTypes: TYPES, giftSetRows: [perfume], taxableOverride: false });
  assert.deepEqual([exempt.taxable, exempt.reason], [false, "ฝ่าย RA ยกเว้นสินค้าตัวนี้รายตัว"]);
  assert.equal(productExciseStatus({ categoryCode: "", productTypes: TYPES }).reason, "เลือกหมวดสินค้าก่อน");
});

test("F4: ภาษีต่อหน่วยในฟอร์ม = ตัวคิดเดียวกับระบบ (ถอด VAT × 8.8% ปัดครั้งเดียว) · ฐานว่าง/0 = ไม่โชว์", () => {
  assert.deepEqual(exciseTaxPreview(890), { taxPerUnit: 73.2, retailPriceExVat: 890 / 1.07 });
  assert.equal(exciseTaxPreview(970).taxPerUnit, 79.78);
  assert.equal(exciseTaxPreview(""), null);
  assert.equal(exciseTaxPreview(0), null);
});

test("🐞 RA ยกเว้นรายตัวบนชุดที่มีน้ำหอม: บันทึกไม่ถูกตีกลับเรื่องวิธีแจ้งราคา (ไม่เสียภาษี = ไม่มีโหมด)", async () => {
  const deps = { flagsOf: async () => ({ isExcise: false }), loadTypes: async () => TYPES };
  const saved = await productExciseFields({ categoryCode: "01-037", retailPriceIncVat: 990, taxableOverride: false, giftSetRows: [perfume] }, deps);
  assert.deepEqual([saved.isExciseTaxable, saved.exciseTaxBase, saved.exciseBasePriceIncVat, saved.exciseTax], [false, null, null, 0]);
  const exempt = productExciseStatus({ categoryCode: "01-037", productTypes: TYPES, giftSetRows: [perfume], taxableOverride: false });
  assert.deepEqual(exciseFilingChecklist({ status: exempt, giftSet: true, giftSetRows: [perfume] }), [], "ไม่เสียภาษี = ไม่มีของต้องมีก่อนยื่น");
});

test("F1–F5 รูปฟอร์ม: 4 หัวข้อตามลำดับ · หัวข้อ ④ ทุกสินค้า · ปุ่มรวมชุด/รายชิ้นอยู่ ④ ไม่อยู่แถวสูตร · ราคาผลิตอยู่ ③", () => {
  const form = readFileSync(new URL("../../components/database/ProductForm.js", import.meta.url), "utf8");
  const heads = ["1. สินค้าคืออะไร", "2. ข้างในมีอะไร", "3. บรรจุและหน่วยขาย", "4. ราคาขายปลีกและสรรพสามิต"].map((h) => form.indexOf(h));
  assert.ok(heads.every((i) => i > 0), "มีครบ 4 หัวข้อ");
  assert.deepEqual([...heads].sort((a, b) => a - b), heads, "เรียงตามลำดับ");
  assert.ok(form.indexOf("<label>ราคาผลิต (บาท)</label>") > heads[2] && form.indexOf("<label>ราคาผลิต (บาท)</label>") < heads[3], "F2 ราคาผลิตอยู่หัวข้อ ③");
  assert.match(form, /<ProductRetailExcise\n/, "หัวข้อ ④ ใช้ component เดียว");
  assert.doesNotMatch(form.slice(heads[3]), /\{showRetail && \(/, "F5 หัวข้อ ④ ไม่หายทั้งก้อน");
  const rows = readFileSync(new URL("../../components/database/GiftSetFormulaRows.js", import.meta.url), "utf8");
  assert.doesNotMatch(rows, /OptionTiles|MoneyInput|priceMode/, "แถวสูตรไม่พูดเรื่องราคาแล้ว");
  assert.match(rows, /aria-label=\{`จำนวนชิ้นของแถวที่ \$\{index \+ 1\}`\}/, "F3 จำนวนชิ้นทุกแถว");
  const section4 = readFileSync(new URL("../../components/database/ProductRetailExcise.js", import.meta.url), "utf8");
  assert.match(section4, /<OptionTiles[\s\S]{0,200}options=\{GIFT_SET_PRICE_MODE_OPTIONS\}/);
  assert.match(section4, /productExciseStatus\(\{/);
  const modal = readFileSync(new URL("../../components/EditProductModal.js", import.meta.url), "utf8");
  assert.match(modal, /taxableOverride=\{typeof product\.taxableOverride === "boolean" \? product\.taxableOverride : null\}/);
});

test("R1: กล่องต้องมีก่อนยื่นขึ้นทะเบียน — กติกาเดียวกับด่านยื่น อ่านค่าบนฟอร์ม · ทุกสินค้าไม่บังคับตอนบันทึก", () => {
  const status = (input) => productExciseStatus({ productTypes: TYPES, ...input });
  const fg = status({ categoryCode: "01-002" });
  assert.deepEqual(exciseFilingChecklist({ status: fg, retailPriceIncVat: "" }), [{ key: "price", text: "ราคาขายปลีก (รวม VAT)", ok: false }]);
  assert.equal(exciseFilingChecklist({ status: fg, retailPriceIncVat: "890" })[0].ok, true);
  assert.equal(formTaxBase({ status: fg, retailPriceIncVat: "890" }), 890);
  assert.deepEqual(exciseFilingChecklist({ status: status({ categoryCode: "01-006" }), retailPriceIncVat: "" }), [], "ไม่เสียภาษี = ไม่มีกล่อง");

  const rows = [{ ...perfume, retailPriceIncVat: "" }, { ...candle, retailPriceIncVat: 390 }];
  const none = exciseFilingChecklist({ status: status({ categoryCode: "01-037", giftSetRows: rows }), giftSet: true, giftSetRows: rows });
  assert.deepEqual(none.map((i) => [i.key, i.ok]), [["mode", false], ["price", false]], "ยังไม่เลือกโหมด = ขาดสองอย่าง");
  const piecesStatus = status({ categoryCode: "01-037", giftSetRows: rows, priceMode: "pieces" });
  const pieces = exciseFilingChecklist({ status: piecesStatus, giftSet: true, giftSetRows: rows, priceMode: "pieces" });
  assert.deepEqual(pieces.map((i) => [i.key, i.ok]), [["mode", true], ["pieces", false]]);
  assert.match(pieces[1].text, /แถวที่เสียภาษี \(1 แถว\)/, "นับแค่แถวหมวดเสียภาษี — ราคาเทียนไม่เกี่ยว");
  const filled = [{ ...perfume, retailPriceIncVat: 890 }, { ...candle, retailPriceIncVat: "" }];
  const filledStatus = status({ categoryCode: "01-037", giftSetRows: filled, priceMode: "pieces" });
  assert.equal(exciseFilingChecklist({ status: filledStatus, giftSet: true, giftSetRows: filled, priceMode: "pieces" })[1].ok, true,
    "ยื่นได้เมื่อแถวที่เสียภาษีครบ แม้ของชิ้นอื่นยังไม่มีราคา");
  assert.equal(formTaxBase({ status: filledStatus, giftSet: true, giftSetRows: filled, priceMode: "pieces" }), 890);
  const setStatus = status({ categoryCode: "01-037", giftSetRows: rows, priceMode: "set" });
  assert.deepEqual(exciseFilingChecklist({ status: setStatus, giftSet: true, giftSetRows: rows, priceMode: "set", retailPriceIncVat: 1490 })
    .map((i) => i.ok), [true, true]);
  assert.equal(formTaxBase({ status: setStatus, giftSet: true, priceMode: "set", retailPriceIncVat: 1490 }), 1490);

  // RA ตั้งเสียรายตัวบนชุดที่ไม่มีของเสียภาษี — ฐาน = ราคาทั้งชุด (รายชิ้น = ผลรวมทุกชิ้น) ไม่ต้องเลือกโหมด
  const forced = status({ categoryCode: "01-037", giftSetRows: [{ ...candle, retailPriceIncVat: 390 }], taxableOverride: true, priceMode: "pieces" });
  assert.deepEqual(exciseFilingChecklist({ status: forced, giftSet: true, giftSetRows: [{ ...candle, retailPriceIncVat: 390 }], priceMode: "pieces" })
    .map((i) => [i.key, i.ok]), [["price", true]]);
});

test("R1/R3 รูปฟอร์ม: ไม่มีดอกจัน/กรอบแดงเรื่องราคา · ป้ายไม่บังคับตอนบันทึก · ปุ่มรวมชุด/รายชิ้นทุกชุด · ตารางรายชิ้นทุกแถว · สูตรในชุดไม่บังคับ", () => {
  const section4 = readFileSync(new URL("../../components/database/ProductRetailExcise.js", import.meta.url), "utf8");
  assert.doesNotMatch(section4, /text-\[var\(--red\)\]|invalid=\{/, "ไม่บังคับตอนบันทึก = ไม่มีดอกจัน/กรอบแดง");
  assert.match(section4, /label="ไม่บังคับตอนบันทึก"/);
  assert.match(section4, /<FilingChecklist items=\{checklist\} \/>/);
  assert.match(section4, /if \(giftSet\) \{/, "ชุดของขวัญทุกชุดเข้ากิ่งรวมชุด/รายชิ้น (ไม่ใช่เฉพาะชุดที่มีน้ำหอม)");
  assert.match(section4, /onChange=\{\(next\) => onForm\(\{ giftSetPriceMode: next \}\)\}/);
  assert.match(section4, /\{rows\.map\(\(row, index\) => \{/, "ตารางรายชิ้นมีทุกแถว");
  const modal = readFileSync(new URL("../../components/EditProductModal.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../app/database/products/page.js", import.meta.url), "utf8");
  for (const src of [modal, page]) assert.doesNotMatch(src, /giftSetPriceModeError/, "R1: ฟอร์มไม่ตีกลับเรื่องโหมด");
  const rowsSrc = readFileSync(new URL("../../components/database/GiftSetFormulaRows.js", import.meta.url), "utf8");
  assert.match(rowsSrc, /const NO_FORMULA = "— ยังไม่เลือกสูตร \(เลือกก่อนส่งลง BOM\) —";/);
});
