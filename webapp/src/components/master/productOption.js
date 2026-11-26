import { createElement } from "react";
import { productOptionParts, productOwnerTag } from "@/lib/master/productIdentity";
import { naText } from "@/lib/format";

// มาตรฐาน dropdown สินค้าทั้งระบบ:
// รหัส · แบรนด์ (รอง) / ชื่อสินค้า · ปริมาตร (หลัก)
// ใช้ได้ทั้ง product master (/api/products: productDescription/brandName/volume)
// และ shape อื่นที่มี fgCode+name (เช่น /api/sahamit/products, ทะเบียนสรรพสามิต).
// ตัวประกอบประโยคอยู่ที่ `productOptionParts` (lib — server ใช้ตัวเดียวกันตอนเก็บ snapshot)

// ย้ายไปอยู่ lib แล้ว (server ต้องใช้) — ส่งต่อจากที่เดิมให้คนที่ import จากที่นี่
export { productOwnerTag };

/* `withCategory` — ต่อชื่อหมวดสินค้าท้ายรหัส · แบรนด์ · opt-in: ใบเสนอราคา (มติผู้ใช้ 2026-09-22)
   และทุกช่องที่เลือก FG ในคำร้อง (มติผู้ใช้ 2026-11-26)
   ⚠️ ชื่อหมวดมาจาก `categoryName` ที่ `GET /api/products` แปะมา — ลิสต์จากแหล่งอื่นไม่มี
   ก็แค่ไม่ขึ้น ไม่พัง */
export function productOptionDisplay(p, display = {}) {
  const { meta, detail, text, search } = productOptionParts(p, display);
  return {
    // native <option>, trigger และ aria ใช้บรรทัดเดียว; menu ที่รองรับ render ใช้ 2 ชั้น.
    text,
    search,
    render: productOptionRender(meta, detail),
  };
}

/** สองชั้นบนจอ (ชั้นบนรอง · ชั้นล่างหลัก) — คลาสอยู่ใน globals.css ใช้ได้ทั้งในเมนูและนอกเมนู */
function productOptionRender(meta, detail) {
  return createElement(
    "span",
    { className: "product-option-label" },
    meta
      ? createElement("span", { className: "product-option-meta" }, meta)
      : null,
    createElement("span", { className: "product-option-name" }, naText(detail)),
  );
}

// สร้าง options ให้ SearchableSelect: เรียงตามรหัส FG (ตัวไม่มีรหัสไปท้ายลิสต์)
// getValue กำหนดค่า value ต่อระบบ (default = product.id; สหมิตรใช้ fgCode)
// display = ตัวเลือกของ productOptionDisplay (เช่น { withCategory: true })
export function productSelectOptions(products = [], getValue = (p) => p.id, display = {}) {
  return products
    .map((p) => {
      const d = productOptionDisplay(p, display);
      return { value: getValue(p), fgCode: p?.fgCode || "", label: d.text, search: d.search, render: d.render };
    })
    .sort((a, b) => (a.fgCode || "￿").localeCompare(b.fgCode || "￿", "en")
      || a.label.localeCompare(b.label, "th"));
}
