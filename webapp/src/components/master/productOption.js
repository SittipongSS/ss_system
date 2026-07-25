import { createElement } from "react";
import { productIdentity } from "@/lib/master/productIdentity";

// มาตรฐาน dropdown สินค้าทั้งระบบ:
// รหัส · แบรนด์ (รอง) / ชื่อสินค้า · ปริมาตร (หลัก)
// ใช้ได้ทั้ง product master (/api/products: productDescription/brandName/volume)
// และ shape อื่นที่มี fgCode+name (เช่น /api/sahamit/products, ทะเบียนสรรพสามิต).

export function productOptionDisplay(p) {
  const identity = productIdentity(p);
  return {
    // native <option>, trigger และ aria ใช้บรรทัดเดียว; menu ที่รองรับ render ใช้ 2 ชั้น.
    text: identity.text,
    search: identity.search,
    render: createElement(
      "span",
      { className: "product-option-label" },
      identity.meta
        ? createElement("span", { className: "product-option-meta" }, identity.meta)
        : null,
      createElement("span", { className: "product-option-name" }, identity.detail || "-"),
    ),
  };
}

// สร้าง options ให้ SearchableSelect: เรียงตามรหัส FG (ตัวไม่มีรหัสไปท้ายลิสต์)
// getValue กำหนดค่า value ต่อระบบ (default = product.id; สหมิตรใช้ fgCode)
export function productSelectOptions(products = [], getValue = (p) => p.id) {
  return products
    .map((p) => {
      const d = productOptionDisplay(p);
      return { value: getValue(p), fgCode: p?.fgCode || "", label: d.text, search: d.search, render: d.render };
    })
    .sort((a, b) => (a.fgCode || "￿").localeCompare(b.fgCode || "￿", "en")
      || a.label.localeCompare(b.label, "th"));
}
