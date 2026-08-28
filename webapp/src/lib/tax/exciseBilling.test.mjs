import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXCISE_VAT_RATE, billedTaxLine, billedTaxTotals, orderAmountToCollect,
  exciseTaxLine, exciseTaxLineForRegistration, exciseTaxTotals, resolveProductTaxable, round2,
  EXCISE_RATE, LOCAL_TAX_RATE_OF_EXCISE, EXCISE_TOTAL_RATE, productTaxRates,
} from "./exciseBilling.js";
import { buildBillPrintHTML } from "./billPrint.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ยอดที่เรียกเก็บ = ค่าภาษี + VAT 7% (มติผู้ใช้ 2026-07-26)", () => {
  assert.equal(EXCISE_VAT_RATE, 0.07);
  const totals = billedTaxTotals([{ quantity: 100, totalTax: 880 }]);
  assert.deepEqual(totals, { totalTax: 880, vat: 61.6, amountToCollect: 941.6 });
});

// ปัดต่อหน่วยก่อนแล้วคูณจำนวน — เอกสารต้องกระทบยอดด้วยมือได้ (ภาษี/ชิ้น × จำนวน = รวม)
test("ปัดเศษภาษีต่อหน่วยก่อนคูณจำนวน", () => {
  const line = billedTaxLine({ quantity: 3, totalTax: 10 });
  assert.equal(line.perUnit, 3.33);
  assert.equal(line.tax, 9.99);
  assert.equal(billedTaxTotals([{ quantity: 3, totalTax: 10 }]).amountToCollect, 10.69);
});

test("จำนวน 0 หรือไม่มีรายการ ไม่ระเบิดและไม่คิด VAT ลอย ๆ", () => {
  assert.deepEqual(billedTaxLine({ quantity: 0, totalTax: 500 }), { quantity: 0, perUnit: 0, tax: 0 });
  assert.deepEqual(billedTaxTotals([]), { totalTax: 0, vat: 0, amountToCollect: 0 });
  assert.equal(orderAmountToCollect(null), 0);
});

// ใบที่สร้างก่อนมติ (เก็บยอดไม่รวม VAT ไว้) ต้องแสดงยอดตรงกับเอกสาร ไม่ใช่ยอดที่เก็บไว้
test("ใบเก่าคิดใหม่จากรายการ — ยอดที่เก็บไว้ก่อนมติไม่ทำให้จอเพี้ยน", () => {
  const legacy = { amountToCollect: 880, totalTax: 880, items: [{ quantity: 100, totalTax: 880 }] };
  assert.equal(orderAmountToCollect(legacy), 941.6);
  // ไม่มีรายการติดมา (payload แบบ slim) → ใช้ค่าที่เก็บ แล้วถ้าไม่มีค่อยคิดจาก totalTax
  assert.equal(orderAmountToCollect({ amountToCollect: 941.6, totalTax: 880 }), 941.6);
  assert.equal(orderAmountToCollect({ totalTax: 880 }), 941.6);
});

// จุดสำคัญ: เลขบนจอ = เลขบนเอกสารที่ส่งลูกค้า ห้ามเดินหนีกัน
test("ยอดสุทธิบนใบแจ้งชำระที่พิมพ์ = ยอดที่เรียกเก็บที่ระบบคิด", () => {
  const items = [
    { id: "1", quantity: 100, totalTax: 880, product: { fgCode: "FG-1", retailPriceExVat: 100 } },
    { id: "2", quantity: 7, totalTax: 61.6, product: { fgCode: "FG-2", retailPriceExVat: 50 } },
  ];
  const expected = billedTaxTotals(items);
  const html = buildBillPrintHTML({ id: "TAX-1", items, customerName: "ลูกค้า" }, {});
  // แถวยอดสุทธิใช้โครง .grandTotal ของเปลือกเอกสารกลาง (span ป้าย + strong ตัวเลข + " บาท")
  // ชุดเดียวกับใบเสนอราคา — ของเดิมเป็น <span><span> ที่ billPrint เขียนเอง
  const printed = html.match(/ยอดแจ้งชำระสุทธิ \(รวม VAT\)<\/span><strong>([\d,.]+) บาท</);
  assert.ok(printed, "หาแถวยอดสุทธิบนเอกสารไม่เจอ");
  assert.equal(
    printed[1],
    expected.amountToCollect.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
});

// เอกสารทุกชนิด (QT / SO / TAX / ไทม์ไลน์) ต้องเรียกโครงการด้วยคำและลำดับเดียวกัน
// ไม่งั้นลูกค้าได้ชุดเอกสารที่อ้างอิงของอย่างเดียวกันคนละชื่อ (มติผู้ใช้ 2026-08-05)
test("ใบแจ้งชำระอ้างอิงโครงการด้วยคำชุดเดียวกับใบเสนอราคา/ใบสั่งขาย", () => {
  const html = buildBillPrintHTML({
    id: "TAX-1", items: [], customerName: "ลูกค้า",
    projectCode: "PJ-26070038", dealTitle: "ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026", dealType: "SCENT",
    quotationRef: "QT-26070028-0", poReference: "SO-26070028-0",
  }, {});
  // ตัดจากหัวข้อภาษาอังกฤษ — คำไทยไปโผล่ใน aria-label ของ .partyGrid ก่อนถึงกล่องจริง
  const ref = html.slice(html.indexOf("/ REFERENCE"));
  const labels = [...ref.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(labels.slice(0, 3), ["เลขที่โครงการ", "โครงการ", "ประเภทโครงการ"]);
  // คำเก่าที่เลิกใช้แล้วต้องไม่หลงเหลือ
  assert.ok(!labels.includes("โครงการหลัก"));
  assert.ok(!labels.includes("โครงการย่อย"));
  // ค่าต้องมาจากค่าที่ตรึงบนใบ ไม่ใช่ข้อความรวม "รหัส · ชื่อ" แบบเดิม
  assert.ok(ref.includes("PJ-26070038") && ref.includes("ผลิตภัณฑ์น้ำหอมปรับอากาศ 2026"));
  assert.ok(!ref.includes(" · "));
});

test("ทางสร้างใบยื่นทั้งสองทางตรึงยอดรวม VAT ลงใบ ไม่ใช่ยอดภาษีเปล่า", () => {
  const fromSo = read("../../app/api/tax/orders/from-sales-order/route.js");
  const manual = read("../../app/api/orders/route.js");
  assert.match(fromSo, /amountToCollect: billedTaxTotals\(resolved\.lines\)\.amountToCollect/);
  assert.match(manual, /amountToCollect: billedTaxTotals\(itemRows\)\.amountToCollect/);
});

test("VAT คิดที่ lib เดียว — ห้ามฮาร์ดโค้ด 0.07 ในโมดูลภาษีอีก", () => {
  for (const path of [
    "./billPrint.js",
    "../excise/soFiling.js",
    "../../app/api/tax/orders/from-sales-order/route.js",
    "../../app/api/orders/route.js",
    "../../app/tax/filings/[id]/page.js",
  ]) {
    assert.doesNotMatch(read(path), /0\.07/, path);
  }
});

// ── ตัวคิดบรรทัดภาษี: ทางเดียวของทั้งระบบ (มติผู้ใช้ 2026-07-29) ────────────────
// อัตรามาจากราคาขายปลีกของ FG ซึ่งเก็บที่ products.exciseTax/localTax — ราคาใน SO
// เป็นราคาผลิต ใช้คิดภาษีไม่ได้ ทุกทางจึงต้องอ้างเลข FG กลับไปดึงอัตราจากสินค้า
test('exciseTaxLine: ปัดอัตราต่อหน่วยก่อน แล้วคูณจำนวน (ภาษี/ชิ้น × จำนวน = ยอดรวม)', () => {
  const line = exciseTaxLine({ exciseRatePerUnit: 8.044, localTaxRatePerUnit: 0.8044, quantity: 10 });
  assert.equal(line.exciseRatePerUnit, 8.04);
  assert.equal(line.localTaxRatePerUnit, 0.8);
  assert.equal(line.totalExciseTax, 80.4);
  assert.equal(line.totalLocalTax, 8);
  assert.equal(line.totalTax, 88.4);
  // กระทบยอดด้วยมือได้: อัตรา/ชิ้น × จำนวน ต้องเท่ากับยอดรวมของบรรทัดเป๊ะ
  assert.equal(round2(line.exciseRatePerUnit * line.quantity), line.totalExciseTax);
  assert.equal(round2(line.localTaxRatePerUnit * line.quantity), line.totalLocalTax);
});

// 🐞 สูตรเดิมของใบยื่นที่สร้างด้วยมือ: ปัด "ผลรวมต่อหน่วย" แล้วแตกกลับด้วยสัดส่วน
// คงที่ excise:local = 10:1 — ยอดรวมเท่ากัน แต่ **ยอดแยกผิด** ทันทีที่สินค้ามีอัตรา
// ไม่เป็น 10:1 ซึ่งแก้มือได้ · สองยอดนี้ต้องกรอกแบบฟอร์มสรรพสามิตคนละช่อง
test('ยอดแยก excise/local ต้องตามอัตราจริงของสินค้า ไม่ใช่บังคับสัดส่วน 10:1', () => {
  const line = exciseTaxLine({ exciseRatePerUnit: 10, localTaxRatePerUnit: 5, quantity: 4 });
  assert.equal(line.totalExciseTax, 40);
  assert.equal(line.totalLocalTax, 20);
  assert.equal(line.totalTax, 60);
  // สูตรเก่าจะได้ perUnit=15 → itemTax=60 → excise=60*10/11=54.55 · local=5.45 (ผิด)
  const legacyExcise = round2(round2(round2(10 + 5) * 4) * 10 / 11);
  assert.notEqual(line.totalExciseTax, legacyExcise, 'ต้องไม่กลับไปใช้สัดส่วน 10:1');
});

test('exciseTaxTotals: รวมหลายบรรทัดแล้วยังปัดสองตำแหน่ง', () => {
  const lines = [
    exciseTaxLine({ exciseRatePerUnit: 8.04, localTaxRatePerUnit: 0.8, quantity: 3 }),
    exciseTaxLine({ exciseRatePerUnit: 1.11, localTaxRatePerUnit: 0.11, quantity: 7 }),
  ];
  const totals = exciseTaxTotals(lines);
  assert.equal(totals.totalExciseTax, round2(24.12 + 7.77));
  assert.equal(totals.totalLocalTax, round2(2.4 + 0.77));
  assert.equal(totals.totalTax, round2(totals.totalExciseTax + totals.totalLocalTax));
});

// ทะเบียนตัดสินว่า "เสียภาษีไหม" (RA override) · สินค้าให้ "ตัวเลขอัตรา"
// ⚠️ ถ้าอ่านอัตราจากสินค้าอย่างเดียวโดยไม่ดูธงของทะเบียน override ของ RA จะหายเงียบ ๆ
test('taxableOverride ของฝ่าย RA ชนะอัตราของสินค้า', () => {
  const product = { exciseTax: 8.04, localTax: 0.8 };
  const taxed = exciseTaxLineForRegistration({
    registration: { isExciseTaxable: true }, product, quantity: 10,
  });
  assert.equal(taxed.totalTax, 88.4);
  const exempt = exciseTaxLineForRegistration({
    registration: { isExciseTaxable: false }, product, quantity: 10,
  });
  assert.deepEqual(
    { e: exempt.totalExciseTax, l: exempt.totalLocalTax, t: exempt.totalTax, rate: exempt.exciseRatePerUnit },
    { e: 0, l: 0, t: 0, rate: 0 },
    'ยกเว้นภาษีแล้วต้องเป็น 0 ทุกช่อง',
  );
  // ทะเบียนที่ไม่ได้ระบุธง = เสียภาษีตามปกติ (ค่าตั้งต้นเดิมของระบบ)
  assert.equal(exciseTaxLineForRegistration({ registration: {}, product, quantity: 1 }).totalTax, 8.84);
});

// ล็อกว่าทุกทางเรียกตัวคิดกลาง ไม่มีใครคิดสูตรเองอีก
test('ทุกทางที่สร้างบรรทัดภาษีต้องเรียกตัวคิดกลาง และอ่านอัตราจากสินค้า', () => {
  const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // จาก Sale Order: ไม่มีทะเบียนเสมอ (บรรทัดที่ยังไม่ขึ้นทะเบียนก็คิดยอดให้ดู) จึงเรียก
  // ตัวคิดฐานตรง ๆ โดยส่งอัตราของสินค้าเข้าไป
  const soFiling = codeOnly(read('../excise/soFiling.js'));
  assert.match(soFiling, /exciseTaxLine\(\{/);
  assert.match(soFiling, /exciseRatePerUnit: product\.exciseTax/);

  // ทางที่อ้างทะเบียน (สร้างมือ + แก้ใบ + ฟอร์มฝั่งจอ) ต้องผ่านตัวที่เคารพ override
  for (const path of [
    '../../app/api/orders/route.js',
    '../../app/api/orders/[id]/route.js',
    '../../components/excise/OrderFormModal.js',
  ]) {
    const code = codeOnly(read(path));
    assert.match(code, /exciseTaxLineForRegistration\(\{/, `${path} ต้องเรียกตัวคิดกลาง`);
    assert.doesNotMatch(code, /reg\.exciseTax|r\.exciseTax/, `${path} ห้ามอ่านอัตราจาก snapshot บนทะเบียน`);
    assert.doesNotMatch(code, /10 \/ 11/, `${path} ห้ามแตกยอดด้วยสัดส่วนคงที่`);
  }
});

// ── การยกเว้นรายตัวของฝ่าย RA ต้องอยู่รอดการแก้สเปค ────────────────────
test('ไม่มี override = ใช้ธงของหมวด', () => {
  assert.equal(resolveProductTaxable({ taxableOverride: null, autoTaxable: true }), true);
  assert.equal(resolveProductTaxable({ taxableOverride: undefined, autoTaxable: false }), false);
  assert.equal(resolveProductTaxable(), false);
});

test('override ของฝ่าย RA ชนะธงของหมวดทั้งสองทาง', () => {
  // ยกเว้นสินค้าในหมวดที่ต้องเสียภาษี
  assert.equal(resolveProductTaxable({ taxableOverride: false, autoTaxable: true }), false);
  // บังคับให้เสียภาษีทั้งที่หมวดไม่ได้ติ๊ก
  assert.equal(resolveProductTaxable({ taxableOverride: true, autoTaxable: false }), true);
});

// ── อัตราภาษี: ที่เดียวของระบบ (แก้ 2026-08-16) ─────────────────────────────
test('อัตราต้องเป็นค่าที่ธุรกิจยืนยัน — 8% + 10% ของ 8% = 8.8% · VAT 7%', () => {
  // 🪤 ล็อกค่าไว้เหมือน ADMIN_LOCKDOWN: เปลี่ยนอัตราต้องมาแก้เทสต์ด้วย = มีร่องรอยใน PR
  assert.equal(EXCISE_RATE, 0.08);
  assert.equal(LOCAL_TAX_RATE_OF_EXCISE, 0.1);
  assert.equal(EXCISE_VAT_RATE, 0.07);
  assert.equal(round2(EXCISE_TOTAL_RATE * 100), 8.8);
});

test('productTaxRates: เดินเลขตามตัวอย่างที่ผู้ใช้ยืนยัน 107 → 8.80 → 9.42', () => {
  const r = productTaxRates(107);
  assert.equal(round2(r.retailPriceExVat), 100);
  assert.equal(round2(r.exciseTax), 8);
  assert.equal(round2(r.localTax), 0.8);
  assert.equal(round2(r.exciseTax + r.localTax), 8.8);
  // ยอดที่เก็บจากลูกค้า = ภาษี + VAT 7%
  const { amountToCollect } = billedTaxTotals([{ quantity: 1, totalTax: round2(r.exciseTax + r.localTax) }]);
  assert.equal(amountToCollect, 9.42);
});

test('productTaxRates: ไม่มีราคา / ยกเว้นภาษี → 0 ทั้งชุด ไม่ใช่ NaN', () => {
  for (const v of [null, undefined, 0, '', -1]) {
    assert.deepEqual(productTaxRates(v), { retailPriceExVat: 0, exciseTax: 0, localTax: 0 });
  }
  assert.deepEqual(productTaxRates(107, { taxable: false }), { retailPriceExVat: 0, exciseTax: 0, localTax: 0 });
});
