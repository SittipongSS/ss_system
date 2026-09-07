import { createElement } from "react";
import { productIdentity } from "@/lib/master/productIdentity";
import { naText } from "@/lib/format";

// มาตรฐาน dropdown สินค้าทั้งระบบ:
// รหัส · แบรนด์ (รอง) / ชื่อสินค้า · ปริมาตร (หลัก)
// ใช้ได้ทั้ง product master (/api/products: productDescription/brandName/volume)
// และ shape อื่นที่มี fgCode+name (เช่น /api/sahamit/products, ทะเบียนสรรพสามิต).

/* ป้ายเจ้าของ — ขึ้นเฉพาะ FG ที่ไม่ได้อยู่ใต้ใบลูกค้าที่กำลังออกเอกสารให้ แต่เป็นของ
   ใบอื่นในนิติบุคคลเดียวกัน (`GET /api/products?taxSiblings=1` เป็นคนแนบมา)
   ⇒ **มีป้าย = ของอีกใบ · ไม่มีป้าย = ของใบนี้เอง** ซึ่งเป็นสัญญาณเดียวที่คนเลือกมี
   เพราะลิสต์เรียงตามรหัส FG ปนกันทุกเจ้าของ */
export function productOwnerTag(p) {
  if (!p?.ownerArCode && !p?.ownerName) return "";
  const who = p.ownerArCode || p.ownerName;
  return p.ownerBranchCode ? `${who} · สาขา ${p.ownerBranchCode}` : String(who);
}

export function productOptionDisplay(p) {
  const identity = productIdentity(p);
  const ownerTag = productOwnerTag(p);
  const meta = [identity.meta, ownerTag].filter(Boolean).join(" · ");
  return {
    // native <option>, trigger และ aria ใช้บรรทัดเดียว; menu ที่รองรับ render ใช้ 2 ชั้น.
    text: [meta, identity.detail].filter(Boolean).join(" · ") || identity.text,
    // ตาเห็นบนแถว = ต้องค้นเจอ — ชื่อบริษัทเจ้าของก็ต้องค้นเจอแม้ป้ายจะโชว์แค่รหัส AR
    search: [identity.search, ownerTag, p?.ownerName].filter(Boolean).join(" "),
    render: createElement(
      "span",
      { className: "product-option-label" },
      meta
        ? createElement("span", { className: "product-option-meta" }, meta)
        : null,
      createElement("span", { className: "product-option-name" }, naText(identity.detail)),
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
