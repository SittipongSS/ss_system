import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* การ์ด KPI ต้องย่อตัวเลขจาก **ความกว้างจริงของการ์ด** ไม่ใช่การนับตัวอักษร
   วัดจริงบนแดชบอร์ดผลงานขาย 2026-08-12 (จอ 1280px แถบ KPI 6 ใบ = การ์ดละ 158px):
     ฿78,553,913.00   ยาว 14 → ไม่เข้าเงื่อนไข `length > 14` → 27px → กว้าง 201px ❌
     -฿3,066,087.00   ยาว 14 → เหมือนกัน                     → 27px → กว้าง 196px ❌
     ฿14,699,021.75   ยาว 14 → เหมือนกัน                     → 27px → กว้าง 201px ❌
     ฿137,350,000.00  ยาว 15 → ย่อเป็น 20px แล้ว **ยังล้น**   → 20px → กว้าง 161px ❌
   `.ui-kpi-value` ไม่มี text-overflow ⇒ เลขไม่ได้ถูกย่อ แต่ถูกกรอบการ์ดตัดหายไปดื้อ ๆ
   สี่ใบใน 6 อ่านยอดเงินไม่ครบ — จำนวนตัวอักษรไม่เคยรู้ว่าการ์ดกว้างเท่าไร

   เทสต์นี้ล็อกรูปแบบของทางแก้ไว้ ไม่ให้ใครเผลอถอยกลับไปนับตัวอักษร */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const KPI_CARD = read("./KpiCard.js");

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** body ของบล็อกแรกที่ selector ตรงเป๊ะ */
function ruleBody(css, selector) {
  for (const chunk of stripComments(css).split("}")) {
    const open = chunk.indexOf("{");
    if (open === -1) continue;
    const found = chunk.slice(0, open).split("\n").filter(Boolean).join(" ").trim();
    if (found === selector) return chunk.slice(open + 1);
  }
  return null;
}

test("การ์ด KPI เป็น container ให้ตัวเลขวัดความกว้างจากการ์ดได้", () => {
  const card = ruleBody(GLOBALS, ".ui-kpi-card");
  assert.ok(card, "ไม่พบกฎ .ui-kpi-card");
  assert.match(card, /container-type:\s*inline-size/, "ไม่มี container-type ⇒ หน่วย cq* ในตัวเลขจะอ้างอิงจอทั้งจอแทนการ์ด");
});

test("⭐ ขนาดตัวเลขคิดจากความกว้างการ์ดหารความยาวค่า ไม่ใช่ขั้นตายตัว", () => {
  const value = ruleBody(GLOBALS, ".ui-kpi-value");
  assert.ok(value, "ไม่พบกฎ .ui-kpi-value");
  const fontSize = value.match(/font-size:\s*([^;]+);/);
  assert.ok(fontSize, "ไม่พบ font-size ของ .ui-kpi-value");
  assert.match(fontSize[1], /var\(--kpi-fit\)/, "ต้องอ้างความกว้างที่มีจริงของแถว");
  assert.match(fontSize[1], /--kpi-len/, "ต้องหารด้วยความยาวค่า ไม่งั้นค่าสั้นจะถูกย่อไปด้วย");

  // --kpi-fit คือความกว้างที่มีจริง ต้องผูกกับ container ของการ์ด ไม่ใช่ขนาดจอ
  const row = ruleBody(GLOBALS, ".ui-kpi-value-row");
  assert.ok(row, "ไม่พบกฎ .ui-kpi-value-row");
  assert.match(row, /--kpi-fit:\s*\d+cq[iwbh]\b/, "ต้องวัดด้วยหน่วย container query (cqi) ไม่ใช่ vw/px");
  assert.match(fontSize[1], /clamp\(\s*var\(--fs-/, "ปลายล่างต้องเป็นโทเคนขั้นพิมพ์");
  assert.match(fontSize[1], /var\(--fs-metric\)\s*\)/, "ปลายบนต้องไม่เกินขั้น metric เดิม — ค่าสั้นต้องหน้าตาเท่าเดิม");
});

test("KpiCard ส่งความยาวค่าให้ CSS และเลิกตัดสินขนาดเอง", () => {
  assert.match(KPI_CARD, /"--kpi-len":/, "ต้องส่ง --kpi-len ให้ CSS");
  assert.doesNotMatch(
    stripComments(KPI_CARD),
    /\.length\s*>\s*\d+/,
    "ห้ามกลับไปตัดสินขนาดฟอนต์ด้วยการนับตัวอักษร — มันไม่รู้ว่าการ์ดกว้างเท่าไร",
  );
  assert.doesNotMatch(stripComments(KPI_CARD), /\bcompact\b/, "คลาส .compact ถูกยกเลิกแล้ว");
});

test("ค่าที่ไม่ใช่ข้อความ (React element) ต้องไม่ถูกวัดความยาว", () => {
  // String(<element>) = "[object Object]" ยาว 15 — เคยทำให้การ์ดที่ใส่ node ย่อฟอนต์มั่ว
  assert.match(KPI_CARD, /typeof displayValue === "string" \|\| typeof displayValue === "number"/);
});

test("แถวที่มียอดภาษีต่อท้ายต้องกันที่ให้ค่าที่สอง", () => {
  const reserved = ruleBody(GLOBALS, ".ui-kpi-value-row:has(.ui-kpi-tax)");
  assert.ok(reserved, "ไม่พบกฎกันที่ของแถวที่มี .ui-kpi-tax (หน้าภาษีสรรพสามิตใช้อยู่)");
  assert.match(reserved, /--kpi-fit:/);
});
